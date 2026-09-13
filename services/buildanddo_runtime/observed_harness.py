"""Observed provider harness — the real-run counterpart to episode_runner's selftest.

SRS-BUILDANDDO-LIVE-UTILIZATION-001 · dispatch VCC-20260911-BND-LIVE-001 (task 4)

WHAT THIS IS FOR
    episode_runner.build_episode(selftest=False) refuses to run because no provider
    harness existed. This is that harness. It contacts the real Cloudflare MoQ relay
    and reports what it OBSERVED, with no claim beyond what it measured.

THE RULE THIS MODULE EXISTS TO ENFORCE
    utilization.yaml sets `transport_success_is_not_semantic_success: true`. A QUIC
    handshake proves the edge is reachable. It proves nothing about object delivery,
    ordering or digest equality. Those are SEPARATE observations and each one that was
    not made is reported UNMEASURED — never assumed, never defaulted to true.

    The selftest path it replaces had `digest_match: True` as a hardcoded literal and
    `payload_hash_match: sent == received` where received was a copy of sent. Both were
    tautologies that could not fail. Nothing here may assert a comparison it did not run.

CREDENTIALS
    Read by NAME from the environment only, never written into a receipt (SRS req 7):
        CF_MOQ_STAGING       publish+subscribe JWT   (aud moq.cloudflare.com)
        CF_MOQ_STAGING_SUB   subscribe-only JWT
    The relay is the one those tokens are bound to; this harness NEVER creates or
    deletes a relay. operations.yaml sets rollback.delete_moq_relay=true, so a
    create/delete canary would destroy the provisioned `staging-live-stream`.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import ssl
import time
from dataclasses import dataclass, field
from typing import Any

from .contracts import EvidenceRecord, utcnow

#: Measured 2026-09-11: the MoQ relay edge. `moq.cloudflare.com` in the JWT `aud`
#: claim is an AUDIENCE string and resolves to nothing — it is not a connect host.
MOQ_HOST = os.environ.get("CF_MOQ_RELAY_HOST", "draft-16.cloudflare.mediaoverquic.com")
MOQ_PORT = int(os.environ.get("CF_MOQ_RELAY_PORT", "443"))

#: The relay these tokens are bound to (JWT `sub`). Adopted, never created.
RELAY_UID = os.environ.get("CF_MOQ_RELAY_UID", "9c88e1835a493a4f5b640762ba708cdb")

#: draft-16 per the relay hostname. ALPN order matters to the server.
MOQ_ALPN = [a for a in os.environ.get("CF_MOQ_ALPN", "moq-00,h3").split(",") if a]

UNMEASURED = "UNMEASURED"


@dataclass
class Observation:
    """One measured fact, or an explicit statement that it was not measured."""

    name: str
    measured: bool
    value: Any = None
    detail: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Returns the observation, with UNMEASURED where nothing was seen."""
        return {
            "name": self.name,
            "state": "MEASURED" if self.measured else UNMEASURED,
            "value": self.value if self.measured else None,
            "detail": self.detail,
        }


@dataclass
class MoqResult:
    """Everything one canary run actually observed."""

    reachable: bool = False
    alpn: str | None = None
    handshake_ms: int | None = None
    error: str = ""
    observations: list[Observation] = field(default_factory=list)

    def add(self, name: str, measured: bool, value: Any = None, detail: str = "") -> None:
        self.observations.append(Observation(name, measured, value, detail))

    @property
    def any_semantic_measurement(self) -> bool:
        """True only if some object-level fact was actually measured.

        Transport reachability deliberately does NOT count.
        """
        return any(o.measured for o in self.observations
                   if o.name not in ("relay_reachable", "alpn_negotiated"))


def _credentials() -> tuple[str, str, str]:
    """Returns (publish_token, subscribe_token, reason). Never logs a value."""
    pub = os.environ.get("CF_MOQ_STAGING", "")
    sub = os.environ.get("CF_MOQ_STAGING_SUB", "")
    if not pub:
        return "", "", "CF_MOQ_STAGING absent"
    if not sub:
        return "", "", "CF_MOQ_STAGING_SUB absent"
    return pub, sub, ""


async def _probe_transport(timeout: float = 20.0) -> MoqResult:
    """Establishes a QUIC session to the relay edge and reports what it saw.

    This measures REACHABILITY ONLY. Object publish/subscribe is MoQT application
    framing on top of WebTransport; until that is implemented every object-level
    observation below is reported UNMEASURED rather than assumed.
    """
    result = MoqResult()
    try:
        from aioquic.asyncio.client import connect
        from aioquic.quic.configuration import QuicConfiguration
        from aioquic.quic.connection import QuicConnectionState
    except Exception as exc:  # pragma: no cover - dependency shape varies
        result.error = f"aioquic unavailable: {type(exc).__name__}"
        return result

    cfg = QuicConfiguration(is_client=True, alpn_protocols=MOQ_ALPN)
    cfg.verify_mode = ssl.CERT_REQUIRED
    cfg.idle_timeout = timeout
    started = time.time()
    try:
        async with connect(MOQ_HOST, MOQ_PORT, configuration=cfg,
                           wait_connected=False) as client:
            deadline = time.time() + timeout
            while time.time() < deadline:
                state = client._quic._state
                if state == QuicConnectionState.CONNECTED:
                    result.reachable = True
                    result.handshake_ms = int((time.time() - started) * 1000)
                    tls = getattr(client._quic, "tls", None)
                    result.alpn = getattr(tls, "alpn_negotiated", None)
                    break
                if state in (QuicConnectionState.CLOSING,
                             QuicConnectionState.TERMINATED):
                    result.error = f"connection {state.name} during handshake"
                    break
                await asyncio.sleep(0.05)
            else:
                result.error = "handshake did not complete before deadline"
    except Exception as exc:
        result.error = f"{type(exc).__name__}: {str(exc)[:120]}"
    return result


def run_moq_canary(run_id: str, objects: int = 100) -> tuple[EvidenceRecord, MoqResult]:
    """Runs the MoQ canary against the live relay and returns honest evidence.

    Args:
        run_id: Correlates this run across evidence, episode and NATS.
        objects: How many objects the canary WOULD publish. Recorded as intent,
            never as a result.

    Returns:
        ``(EvidenceRecord, MoqResult)``. The record's state is VERIFIED only when
        object-level equality was genuinely measured; otherwise UNMEASURED.
    """
    pub, sub, reason = _credentials()
    if reason:
        result = MoqResult(error=reason)
        result.add("relay_reachable", False, detail=reason)
        return _evidence(run_id, result, objects), result

    result = asyncio.run(_probe_transport())
    result.add("relay_reachable", result.reachable,
               value=result.reachable or None,
               detail=result.error or f"{MOQ_HOST}:{MOQ_PORT}")
    result.add("alpn_negotiated", result.alpn is not None, value=result.alpn)

    # Object-level facts. MoQT draft-16 control framing (SETUP/ANNOUNCE/SUBSCRIBE)
    # is not implemented here, so none of these were measured. They are reported
    # UNMEASURED rather than defaulted -- the selftest's hardcoded digest_match=True
    # is exactly the failure this avoids.
    not_impl = "MoQT draft-16 object framing not implemented; nothing was published"
    result.add("objects_published", False, detail=not_impl)
    result.add("objects_received", False, detail=not_impl)
    result.add("sequence_complete", False, detail=not_impl)
    result.add("digest_match", False, detail=not_impl)
    return _evidence(run_id, result, objects), result


def _evidence(run_id: str, result: MoqResult, objects: int) -> EvidenceRecord:
    """Mints the evidence record. VERIFIED requires a real semantic measurement."""
    state = "VERIFIED" if result.any_semantic_measurement else UNMEASURED
    verdict = "PASS" if result.any_semantic_measurement else UNMEASURED
    payload = {
        "mode": "OBSERVED_PROVIDER",
        "classification": "EXPERIMENTAL",
        "relay_uid": RELAY_UID,
        "relay_host": MOQ_HOST,
        "objects_intended": objects,
        "transport_reachable": result.reachable,
        "handshake_ms": result.handshake_ms,
        "alpn": result.alpn,
        "error": result.error,
        "observations": [o.to_dict() for o in result.observations],
        # Stated explicitly so no consumer can read reachability as delivery.
        "transport_success_is_not_semantic_success": True,
    }
    return EvidenceRecord.create(
        evidence_id=f"EVD-{run_id}-MOQ", kind="MOQ_UTILIZATION",
        state=state, verdict=verdict, source="observed", payload=payload)


async def _publish(subject: str, payload: dict[str, Any]) -> str:
    """Publishes one message to NATS. Returns '' on success, else a reason."""
    try:
        import nats
    except Exception as exc:
        return f"nats client unavailable: {type(exc).__name__}"
    url = os.environ.get("NATS_URL", "nats://147.93.43.117:4222")
    token = os.environ.get("NATS_TOKEN", "")
    import json as _json
    try:
        nc = await nats.connect(url, token=token or None, connect_timeout=8)
        try:
            await nc.publish(subject, _json.dumps(payload).encode("utf-8"))
            await nc.flush(timeout=5)
        finally:
            await nc.close()
        return ""
    except Exception as exc:
        return f"{type(exc).__name__}: {str(exc)[:100]}"


def emit(subject: str, payload: dict[str, Any]) -> str:
    """Publishes to NATS, returning '' on success or a reason on failure.

    Never raises: a telemetry failure must not fail the canary. It is returned
    and recorded, never swallowed.
    """
    try:
        return asyncio.run(_publish(subject, payload))
    except Exception as exc:
        return f"{type(exc).__name__}: {str(exc)[:100]}"


if __name__ == "__main__":
    import json
    import sys

    rid = sys.argv[1] if len(sys.argv) > 1 else "BND-MOQ-" + utcnow()[:19].replace(":", "")
    record, res = run_moq_canary(rid)
    print(json.dumps(record.to_dict(), indent=2))
    print(f"\n  transport reachable : {res.reachable}   alpn={res.alpn}   {res.error}")
    print(f"  semantic measured   : {res.any_semantic_measurement}")
    print(f"  evidence state      : {record.state}")
