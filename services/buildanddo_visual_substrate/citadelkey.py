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
#              VERIFIES X-Citadel-Key envelopes against the peer PUBLIC registry copy;
#              VERIFIED_BY services/buildanddo_visual_substrate/__main__.py --selftest
# Intent:      Sign one CitadelKey envelope per outbound request with the BuildAndDo
#              tenant's private seed, matching Citadel Nexus canonicalisation byte for
#              byte, without ever importing Citadel Nexus code or exposing the seed;
#              and verify inbound seat envelopes (OCN login) with public keys only.
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

Verification (OCN login) is the public-key half. ``PeerRegistry`` loads a COPY of
the Citadel Nexus seat registry (``BUILDANDDO_CK_PEER_REGISTRY_FILE``; rows carry
``seat_id, agent_id, rig, pubkey_fp, env, revoked_at`` plus the raw public key) and
``verify_envelope`` rebuilds the signed object and checks, in this order: registry
membership, revocation, ``pubkey_fp`` against the registry, the Ed25519 signature,
the payload hash, the audience, the timestamp window, and single-use nonces held
in a ``NonceStore`` file. No private material is ever involved on this path.
"""
from __future__ import annotations

import base64
import calendar
import hashlib
import json
import os
import stat
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import (Ed25519PrivateKey,
                                                                   Ed25519PublicKey)
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
#: Audience a seat must sign for to log into BuildAndDo through /api/ocn/login.
LOGIN_AUDIENCE = "buildanddo-login"
PEER_REGISTRY_ENV = "BUILDANDDO_CK_PEER_REGISTRY_FILE"
#: Envelopes older or newer than this are refused; seen nonces are pruned past it.
REPLAY_WINDOW_S = 24 * 3600
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


# ── verifier (public keys only) ──────────────────────────────────────────────
def decode_header(header: str | None) -> dict[str, Any]:
    """Decode an ``X-Citadel-Key`` header value into its envelope dict.

    Raises ``ValueError`` for an absent, undecodable or non-object header; the
    message is safe to return to the caller (it never echoes the header).
    """
    if not header or not isinstance(header, str):
        raise ValueError("X-Citadel-Key header required")
    try:
        ck = json.loads(b64u_decode(header.strip()).decode("utf-8"))
    except Exception as exc:  # binascii.Error, UnicodeDecodeError, ValueError
        raise ValueError("malformed X-Citadel-Key header") from exc
    if not isinstance(ck, dict):
        raise ValueError("malformed X-Citadel-Key header")
    return ck


def parse_ts(text: Any) -> float | None:
    """``now_iso()`` format only (``YYYY-MM-DDTHH:MM:SSZ``); None when unparseable."""
    if not isinstance(text, str):
        return None
    try:
        return calendar.timegm(time.strptime(text, "%Y-%m-%dT%H:%M:%SZ"))
    except (ValueError, OverflowError):
        return None


def _pub_raw_from_entry(entry: dict[str, Any]) -> bytes | None:
    """Accept the raw public key as hex (``pubkey_hex``/``pubkey``/``public_key``) or base64url (``pubkey_b64u``)."""
    for key in ("pubkey_hex", "pubkey", "public_key"):
        value = entry.get(key)
        if isinstance(value, str) and len(value) == 64:
            try:
                return bytes.fromhex(value)
            except ValueError:
                pass
    value = entry.get("pubkey_b64u")
    if isinstance(value, str):
        try:
            raw = b64u_decode(value)
            return raw if len(raw) == 32 else None
        except Exception:
            return None
    return None


class PeerRegistry:
    """A read-only copy of the Citadel Nexus seat registry (public keys only).

    File shapes accepted: a JSON list of rows, ``{"seats": [rows]}``,
    ``{"seat_keypairs": [rows]}`` or ``{"<seat_id>": row}``. A row needs
    ``seat_id`` and a raw public key; ``pubkey_fp`` is derived from the key when
    absent and cross-checked when present (a mismatch marks the row unusable).
    """

    def __init__(self, rows: dict[str, dict[str, Any]], source: str | None = None):
        self.rows = rows
        self.source = source

    @classmethod
    def from_rows(cls, rows: Any, source: str | None = None) -> "PeerRegistry":
        items: list[Any]
        if isinstance(rows, dict):
            for key in ("seats", "seat_keypairs", "rows", "registry"):
                if isinstance(rows.get(key), list):
                    items = rows[key]
                    break
            else:
                items = [dict(v, seat_id=v.get("seat_id") or k) for k, v in rows.items()
                         if isinstance(v, dict)]
        elif isinstance(rows, list):
            items = rows
        else:
            items = []
        out: dict[str, dict[str, Any]] = {}
        for item in items:
            if not isinstance(item, dict) or not item.get("seat_id"):
                continue
            seat = str(item["seat_id"])
            pub_raw = _pub_raw_from_entry(item)
            fp = pubkey_fp(pub_raw) if pub_raw else None
            declared = item.get("pubkey_fp")
            out[seat] = {
                "seat_id": seat, "agent_id": item.get("agent_id"), "rig": item.get("rig"),
                "env": item.get("env"), "revoked_at": item.get("revoked_at") or None,
                "pubkey_hex": pub_raw.hex() if pub_raw else None,
                "pubkey_fp": declared or fp,
                "usable": bool(pub_raw) and (not declared or declared == fp),
            }
        return cls(out, source)

    @classmethod
    def from_env(cls, path_text: str | None = None) -> "PeerRegistry | None":
        """None when the registry file is not configured or unreadable (UNMEASURED)."""
        path_text = path_text if path_text is not None else os.environ.get(PEER_REGISTRY_ENV)
        if not path_text:
            return None
        path = Path(path_text)
        if not path.is_file():
            return None
        try:
            return cls.from_rows(json.loads(path.read_text(encoding="utf-8")), PEER_REGISTRY_ENV)
        except (OSError, ValueError):
            return None

    def get(self, seat_id: str) -> dict[str, Any] | None:
        return self.rows.get(seat_id)

    def summary(self) -> dict[str, Any]:
        """Public facts only: counts and seat ids, never key bytes."""
        return {"source": self.source, "seats": len(self.rows),
                "revoked": sum(1 for r in self.rows.values() if r["revoked_at"]),
                "unusable": sum(1 for r in self.rows.values() if not r["usable"]),
                "seat_ids": sorted(self.rows)}


class NonceStore:
    """Single-use nonces persisted as JSON lines under the state directory.

    Entries older than ``REPLAY_WINDOW_S`` are pruned on load and on each write,
    so the file is bounded by the traffic of one window. ``path=None`` keeps the
    set in memory only (selftest).
    """

    def __init__(self, path: Path | None):
        self.path = path
        self._lock = threading.Lock()
        self._seen: dict[str, float] = {}
        if path is not None and path.is_file():
            for line in path.read_text(encoding="utf-8").splitlines():
                try:
                    row = json.loads(line)
                    self._seen[str(row["nonce"])] = float(row["at"])
                except (ValueError, KeyError, TypeError):
                    continue
            self._prune(time.time())

    def _prune(self, now: float) -> None:
        stale = [n for n, at in self._seen.items() if now - at > REPLAY_WINDOW_S]
        for n in stale:
            del self._seen[n]
        if stale and self.path is not None:
            self.path.write_text("".join(json.dumps({"nonce": n, "at": at}) + "\n"
                                         for n, at in self._seen.items()), encoding="utf-8")

    def consume(self, nonce: str, now: float | None = None) -> bool:
        """True the first time a nonce is presented, False on every replay."""
        now = time.time() if now is None else now
        with self._lock:
            self._prune(now)
            if nonce in self._seen:
                return False
            self._seen[nonce] = now
            if self.path is not None:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as fh:
                    fh.write(json.dumps({"nonce": nonce, "at": now}) + "\n")
            return True

    def __len__(self) -> int:
        return len(self._seen)


def verify_envelope(ck: dict[str, Any], payload: Any, audience: str, registry: PeerRegistry,
                    nonces: NonceStore, now: float | None = None) -> tuple[bool, str]:
    """Verify one decoded envelope. Returns ``(ok, reason)``; reasons are wire-safe.

    Check order matches the Citadel Nexus verifier (registry, fingerprint,
    signature, payload hash, audience) with revocation inserted right after
    registry lookup and the timestamp window before the nonce, so a rejected
    envelope never burns its nonce.
    """
    if not HAVE_CRYPTO:
        return False, "cryptography (Ed25519) is not installed"
    seat = ck.get("seat_id")
    if not seat or not isinstance(seat, str):
        return False, "X-Citadel-Key carries no seat_id"
    ent = registry.get(seat)
    if not ent:
        return False, f"unknown seat '{seat[:40]}' (no registered public key)"
    if ent.get("revoked_at"):
        return False, f"seat '{seat[:40]}' revoked"
    if not ent.get("usable"):
        return False, f"registry row for '{seat[:40]}' is unusable (no key or fingerprint mismatch)"
    pub_raw = bytes.fromhex(ent["pubkey_hex"])
    if ck.get("pubkey_fp") and ck["pubkey_fp"] != pubkey_fp(pub_raw):
        return False, "pubkey_fp mismatch (key rotated?)"
    signed = signed_obj(seat, ck.get("rig"), ck.get("agent_id"), ck.get("env"),
                        ck.get("audience"), ck.get("payload_sha256"), ck.get("nonce"), ck.get("ts"))
    sig_hex = str(ck.get("sig") or "").split(":", 1)[-1]
    try:
        Ed25519PublicKey.from_public_bytes(pub_raw).verify(bytes.fromhex(sig_hex),
                                                           signed_message(signed))
    except (InvalidSignature, ValueError):
        return False, "bad signature"
    if ck.get("payload_sha256") != sha256_hex(payload_bytes(payload)):
        return False, "payload hash mismatch (tampered)"
    if ck.get("audience") not in (audience, "*"):
        return False, f"audience mismatch (for {str(ck.get('audience'))[:40]})"
    ts = parse_ts(ck.get("ts"))
    now = time.time() if now is None else now
    if ts is None or abs(now - ts) > REPLAY_WINDOW_S:
        return False, "timestamp outside the replay window"
    nonce = ck.get("nonce")
    if not nonce or not isinstance(nonce, str) or not nonces.consume(nonce, now):
        return False, "replay (nonce already seen)"
    return True, ""


def verify_header(header: str | None, payload: Any, audience: str, registry: PeerRegistry,
                  nonces: NonceStore) -> dict[str, Any]:
    """Decode + verify; the dict is the exact body ``POST /api/rooms/verify`` returns."""
    try:
        ck = decode_header(header)
    except ValueError as exc:
        return {"ok": False, "reason": str(exc)}
    ok, reason = verify_envelope(ck, payload, audience, registry, nonces)
    if not ok:
        return {"ok": False, "reason": reason}
    ent = registry.get(str(ck["seat_id"])) or {}
    return {"ok": True, "seat_id": ck["seat_id"], "agent_id": ck.get("agent_id"),
            "rig": ck.get("rig"), "pubkey_fp": ent.get("pubkey_fp"),
            "registry_agent_id": ent.get("agent_id"), "registry_rig": ent.get("rig")}
