# CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        services/buildanddo_visual_substrate/citadelkey.py
# Stage:       09_RUNTIME
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     cryptography (Ed25519)
# EnumType:    Service
# EnumEdges:   PRODUCES X-Citadel-Key envelope;
#              VERIFIED_BY services/buildanddo_visual_substrate/__main__.py --selftest
# Intent:      Sign one CitadelKey envelope per outbound request with the BuildAndDo
#              tenant's private seed, matching Citadel Nexus canonicalisation byte for
#              byte, without ever importing Citadel Nexus code or exposing the seed.
# ───────────────────────────────────────────────────────────────
"""Minimal CitadelKey (CK) signer for the BuildAndDo tenant.

This is a vendored, signing-only subset of the Citadel Nexus `CitadelKeyAuth`
primitive. It reproduces the exact canonical form the verifier rebuilds:

    signed = {seat_id, rig, agent_id, env, audience, payload_sha256, nonce, ts, ver}
    msg    = json.dumps(signed, sort_keys=True, separators=(",", ":")).encode()
    sig    = Ed25519(seed).sign(msg)

and the exact envelope shape the wire carries (`X-Citadel-Key` =
unpadded base64url of the compact envelope JSON).

Custody rules enforced here, not documented elsewhere and hoped for:

  * The private seed is read ONLY from the file named by the environment variable
    ``BUILDANDDO_CK_PRIVATE_KEY_FILE``. The seed is never accepted as an env VALUE,
    never logged, never included in any error message or health report.
  * On POSIX the key file must not be group- or world-readable; a loose mode is a
    custody HOLD, not a warning.
  * Only the public fingerprint (sha256(pub_raw)[:16], the same derivation Citadel
    Nexus uses) ever leaves this module.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import stat
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    HAVE_CRYPTO = True
except Exception:  # pragma: no cover - reported as a custody HOLD, never hidden
    HAVE_CRYPTO = False

CK_VERSION = "ck-auth-0.1"
KEY_FILE_ENV = "BUILDANDDO_CK_PRIVATE_KEY_FILE"
EXPECTED_FP_ENV = "BUILDANDDO_CK_EXPECTED_PUBKEY_FP"
# Public fingerprint of the buildanddo seat as registered in Citadel Nexus on
# 2026-09-11. A fingerprint is not a secret; a key that does not match it is HOLD.
EXPECTED_PUBKEY_FP_DEFAULT = "2e1bad8142642379"
AUDIENCE = "citadel-nexus-rooms"
SEAT_ID = "buildanddo"
RIG = "buildanddo"
AGENT_ID = "buildanddo-platform"
ENV_FINGERPRINT = None  # this tenant is registered with env=null in Citadel Nexus


# ── canonical helpers (byte-identical to the Citadel Nexus verifier) ─────────
def b64u(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64u_decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sha256_hex(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def payload_bytes(payload: Any) -> bytes:
    if payload is None:
        return b""
    if isinstance(payload, (bytes, bytearray)):
        return bytes(payload)
    if isinstance(payload, str):
        return payload.encode("utf-8")
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


def signed_obj(seat_id: str, rig: str, agent_id: str, env: str | None, audience: str,
               payload_hash: str, nonce: str, ts: str) -> dict[str, Any]:
    return {"seat_id": seat_id, "rig": rig, "agent_id": agent_id, "env": env,
            "audience": audience, "payload_sha256": payload_hash,
            "nonce": nonce, "ts": ts, "ver": CK_VERSION}


def signed_message(signed: dict[str, Any]) -> bytes:
    return json.dumps(signed, sort_keys=True, separators=(",", ":")).encode("utf-8")


def pubkey_fp(pub_raw: bytes) -> str:
    return sha256_hex(pub_raw)[:16]


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ── custody ──────────────────────────────────────────────────────────────────
class CustodyError(RuntimeError):
    """The private seed is absent, unreadable, malformed or held too loosely.

    The message names the env VARIABLE and the failure class only; it never
    carries the path contents or any seed material.
    """


def _mode_is_private(path: Path) -> bool:
    if os.name != "posix":
        return True  # NTFS ACLs are not expressible as a mode; measured elsewhere
    mode = stat.S_IMODE(path.stat().st_mode)
    return not (mode & (stat.S_IRWXG | stat.S_IRWXO))


def load_private_key(path_text: str | None = None) -> Ed25519PrivateKey:
    """Load the Ed25519 seed from the file named by ``BUILDANDDO_CK_PRIVATE_KEY_FILE``.

    ``path_text`` exists only so the selftest can point at a temp file without
    touching the process environment; production callers pass nothing.
    """
    if not HAVE_CRYPTO:
        raise CustodyError("cryptography (Ed25519) is not installed in this interpreter")
    path_text = path_text if path_text is not None else os.environ.get(KEY_FILE_ENV)
    if not path_text:
        raise CustodyError(f"{KEY_FILE_ENV} is not set; the sidecar cannot sign")
    path = Path(path_text)
    if not path.is_file():
        raise CustodyError(f"{KEY_FILE_ENV} does not name a readable file")
    if not _mode_is_private(path):
        raise CustodyError(f"{KEY_FILE_ENV} file is group/world accessible; refuse to load")
    try:
        seed = bytes.fromhex(path.read_text(encoding="utf-8").strip())
    except ValueError as exc:
        raise CustodyError(f"{KEY_FILE_ENV} file is not a hex seed") from exc
    if len(seed) != 32:
        raise CustodyError(f"{KEY_FILE_ENV} file is not a 32-byte Ed25519 seed")
    return Ed25519PrivateKey.from_private_bytes(seed)


# ── signer ───────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Identity:
    seat_id: str = SEAT_ID
    rig: str = RIG
    agent_id: str = AGENT_ID
    env_fingerprint: str | None = ENV_FINGERPRINT


class Signer:
    """Holds one loaded private key and signs fresh envelopes on demand."""

    def __init__(self, private_key: Ed25519PrivateKey, identity: Identity | None = None):
        self._priv = private_key
        self.identity = identity or Identity()
        self._pub_raw = private_key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.pubkey_fp = pubkey_fp(self._pub_raw)

    @classmethod
    def from_env(cls, identity: Identity | None = None) -> "Signer":
        return cls(load_private_key(), identity)

    @property
    def pubkey_hex(self) -> str:
        return self._pub_raw.hex()

    def sign(self, payload: Any = None, audience: str = AUDIENCE) -> dict[str, Any]:
        ident = self.identity
        nonce = os.urandom(16).hex()
        ts = now_iso()
        payload_hash = sha256_hex(payload_bytes(payload))
        signed = signed_obj(ident.seat_id, ident.rig, ident.agent_id, ident.env_fingerprint, audience,
                            payload_hash, nonce, ts)
        sig = self._priv.sign(signed_message(signed))
        env_short = (ident.env_fingerprint or "")[7:19]
        return {
            "id": "CK-" + sha256_hex(nonce.encode())[:16],
            "version": CK_VERSION,
            "string": (f"CK:{ident.seat_id}|{ident.rig}|env:{env_short}"
                       f"|aud:{audience}|sha256:{payload_hash[:12]}|nonce:{nonce[:8]}|{ts}"),
            **signed,
            "hash": "sha256:" + payload_hash,
            "sig": "ed25519:" + sig.hex(),
            "pubkey_fp": self.pubkey_fp,
        }

    def header(self, payload: Any = None, audience: str = AUDIENCE) -> str:
        return b64u(json.dumps(self.sign(payload, audience),
                               separators=(",", ":")).encode("utf-8"))


# ── custody report ───────────────────────────────────────────────────────────
def custody_status(path_text: str | None = None,
                   expected_fp: str | None = None) -> dict[str, Any]:
    """PASS / HOLD / UNMEASURED custody verdict with no secret material.

    PASS       key file loads AND fingerprint matches the expected one.
    UNMEASURED key file loads but the expected fingerprint was cleared
               (``BUILDANDDO_CK_EXPECTED_PUBKEY_FP=""``).
    HOLD       anything else; ``reason`` names the env variable, never the path.
    """
    expected = expected_fp if expected_fp is not None else os.environ.get(
        EXPECTED_FP_ENV, EXPECTED_PUBKEY_FP_DEFAULT)
    try:
        signer = Signer(load_private_key(path_text))
    except CustodyError as exc:
        return {"custody": "HOLD", "reason": str(exc), "pubkey_fp": None,
                "expected_pubkey_fp": expected or None}
    if not expected:
        return {"custody": "UNMEASURED", "reason": f"{EXPECTED_FP_ENV} not set",
                "pubkey_fp": signer.pubkey_fp, "expected_pubkey_fp": None}
    if signer.pubkey_fp != expected:
        return {"custody": "HOLD", "reason": "key fingerprint does not match expected",
                "pubkey_fp": signer.pubkey_fp, "expected_pubkey_fp": expected}
    return {"custody": "PASS", "reason": "key loaded and fingerprint matches",
            "pubkey_fp": signer.pubkey_fp, "expected_pubkey_fp": expected}
