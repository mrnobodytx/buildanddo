# CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        services/buildanddo_visual_substrate/__main__.py
# Stage:       09_RUNTIME
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     services/buildanddo_visual_substrate/server.py,
#              services/buildanddo_visual_substrate/bridge_client.py,
#              services/buildanddo_visual_substrate/citadelkey.py
# EnumType:    Service
# EnumEdges:   CONSUMES services/buildanddo_visual_substrate/server.py;
#              VERIFIED_BY python -m services.buildanddo_visual_substrate --selftest
# Intent:      Entry point: --serve runs the sidecar, --health prints custody without
#              secrets, --selftest proves every negative control offline against an
#              in-process verifier that checks envelopes exactly as Citadel Nexus does,
#              plus the OCN login verify route (valid / unknown / replay / audience / revoked).
# ───────────────────────────────────────────────────────────────
"""``python -m services.buildanddo_visual_substrate {--serve|--selftest|--health}``

The selftest never opens a network socket to anything but 127.0.0.1 (the sidecar
under test). Citadel Nexus is replaced by ``FakeCitadelNexus``: a verifier that
rebuilds the signed object, checks the Ed25519 signature, the payload hash, the
audience, single-use nonces and the tenant policy in the same order the real
bridge does (``authorize`` before ``verify``). Its keys are EPHEMERAL: generated in
memory for this run, written only to a temp file to exercise the loader, deleted
on exit. No tenant key is created or touched.

Selftest results are simulated evidence. They prove the contract shape and the
fail-closed paths; they say nothing about the real Citadel Nexus deployment.
"""
from __future__ import annotations

import argparse
import http.client
import json
import os
import sys
import tempfile
import threading
import time
from pathlib import Path
from typing import Any

from .bridge_client import BridgeClient, UpstreamResponse
from .citadelkey import (AUDIENCE, HAVE_CRYPTO, KEY_FILE_ENV, LOGIN_AUDIENCE, Identity,
                         NonceStore, PeerRegistry, Signer, b64u_decode, custody_status,
                         load_private_key, payload_bytes, pubkey_fp, sha256_hex,
                         signed_message, signed_obj)
from .server import RoomsState, build_state, make_server, serve_forever


# ── in-process stand-in for the Citadel Nexus bridge ─────────────────────────
class FakeCitadelNexus:
    """Verifies X-Citadel-Key envelopes the way tools.cbf.visual_substrate_bridge does.

    Order of checks mirrors the real route + bridge on 2026-09-11:
      1. authorize(tenant from envelope, projection)  -> 403 reasons
      2. header present / decodable                   -> 401
      3. registry, pubkey_fp, signature, payload hash, audience, nonce -> 401
      4. verified seat == claimed tenant              -> 403 tenant_mismatch
    """

    POLICY: dict[str, set[str]] = {"buildanddo": {"rooms", "organization", "capability", "development"}}
    NEVER_EXPORT = frozenset({"systems"})
    IMPLEMENTED = frozenset({"rooms", "organization", "capability", "development"})

    def __init__(self) -> None:
        self.registry: dict[str, dict[str, Any]] = {}
        self.seen_nonces: set[str] = set()
        self.calls: list[str] = []
        self.poison_projection: str | None = None  # inject a mesh IP into one body

    def register(self, seat_id: str, pubkey_hex: str, rig: str, agent_id: str) -> None:
        raw = bytes.fromhex(pubkey_hex)
        self.registry[seat_id] = {"pubkey_hex": pubkey_hex, "pubkey_fp": pubkey_fp(raw),
                                  "rig": rig, "agent_id": agent_id, "env": None}

    def _authorize(self, tenant: str, projection: str) -> str:
        if projection in self.NEVER_EXPORT:
            return "projection_never_exportable"
        allowed = self.POLICY.get(tenant)
        if allowed is None:
            return "tenant_not_provisioned"
        if projection not in allowed:
            return "projection_not_granted"
        if projection != "rooms" and projection not in self.IMPLEMENTED:
            return "projection_not_implemented"
        return ""

    def _verify(self, ck: dict[str, Any], payload: Any) -> tuple[bool, str]:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        seat = ck.get("seat_id")
        ent = self.registry.get(seat)
        if not ent:
            return False, f"unknown seat '{seat}' (no registered public key)"
        pub_raw = bytes.fromhex(ent["pubkey_hex"])
        if ck.get("pubkey_fp") and ck["pubkey_fp"] != pubkey_fp(pub_raw):
            return False, "pubkey_fp mismatch (key rotated?)"
        signed = signed_obj(seat, ck.get("rig"), ck.get("agent_id"), ck.get("env"),
                            ck.get("audience"), ck.get("payload_sha256"),
                            ck.get("nonce"), ck.get("ts"))
        sig_hex = (ck.get("sig") or "").split(":", 1)[-1]
        try:
            Ed25519PublicKey.from_public_bytes(pub_raw).verify(bytes.fromhex(sig_hex),
                                                               signed_message(signed))
        except (InvalidSignature, ValueError):
            return False, "bad signature"
        if payload is not None and ck.get("payload_sha256") != sha256_hex(payload_bytes(payload)):
            return False, "payload hash mismatch (tampered)"
        if ck.get("audience") not in (AUDIENCE, "*"):
            return False, f"audience mismatch (for {ck.get('audience')})"
        nonce = ck.get("nonce")
        if not nonce or nonce in self.seen_nonces:
            return False, "replay (nonce already seen)"
        self.seen_nonces.add(nonce)
        return True, ""

    @staticmethod
    def _deny(status: int, detail: str) -> UpstreamResponse:
        return UpstreamResponse(status, json.dumps({"detail": detail}).encode(), "application/json")

    def _projection_body(self, tenant: str, name: str) -> bytes:
        body = {
            "srs": "SRS-BUILDANDDO-VISUAL-SUBSTRATE-001", "projection": name,
            "generated_at": "2026-09-11T00:00:00Z",
            "nodes": [{"id": "ORG:BUILDANDDO", "type": "organization", "title": "BuildAndDo",
                       "state": "DECLARED", "attributes": {}}],
            "edges": [],
            "layout": {"algorithm": "layered", "direction": "TB", "version": "rooms-v1"},
            "evidence": {"state": "MEASURED", "sources_ok": 1, "sources_total": 1},
            "tenant_id": tenant, "served_by": AUDIENCE, "cleansed": True,
        }
        if self.poison_projection == name:
            body["nodes"][0]["attributes"] = {"endpoint": "http://10.0.0.5:4222"}
        return json.dumps(body, separators=(",", ":")).encode()

    def __call__(self, url: str, headers: dict[str, str]) -> UpstreamResponse:
        self.calls.append(url)
        path = url.split("://", 1)[-1].split("/", 1)[-1]
        header = headers.get("X-Citadel-Key")
        if not header:
            return self._deny(401, "X-Citadel-Key header required")
        try:
            ck = json.loads(b64u_decode(header).decode("utf-8"))
            assert isinstance(ck, dict)
        except Exception:
            return self._deny(401, "malformed X-Citadel-Key header")
        seat = str(ck.get("seat_id") or "")
        if not seat:
            return self._deny(401, "X-Citadel-Key carries no seat_id")
        if path == "api/platform/rooms/policy":
            return UpstreamResponse(200, json.dumps({
                "tenant_id": seat, "audience": AUDIENCE,
                "allowed_projections": sorted(self.POLICY.get(seat, set())),
                "never_exportable": sorted(self.NEVER_EXPORT)}).encode(), "application/json")
        name = path.rsplit("/", 1)[-1]
        reason = self._authorize(seat, name)
        if reason:
            return self._deny(403, reason)
        ok, why = self._verify(ck, {"projection": name})
        if not ok:
            return self._deny(401, "citadelkey_rejected:" + why[:80])
        return UpstreamResponse(200, self._projection_body(seat, name), "application/json")


# ── selftest ─────────────────────────────────────────────────────────────────
def _http_get(port: int, path: str) -> tuple[int, dict[str, Any] | None, bytes]:
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("GET", path)
    resp = conn.getresponse()
    raw = resp.read()
    conn.close()
    try:
        return resp.status, json.loads(raw.decode("utf-8")), raw
    except ValueError:
        return resp.status, None, raw


def _http_post(port: int, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any] | None]:
    raw = json.dumps(body).encode("utf-8")
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.request("POST", path, body=raw, headers={"Content-Type": "application/json",
                                                  "Content-Length": str(len(raw))})
    resp = conn.getresponse()
    data = resp.read()
    conn.close()
    try:
        return resp.status, json.loads(data.decode("utf-8"))
    except ValueError:
        return resp.status, None


def _serve_in_thread(state: RoomsState) -> tuple[Any, int]:
    httpd = make_server(state, ("127.0.0.1", 0))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, httpd.server_address[1]


def _login_payload() -> dict[str, Any]:
    return {"login": "buildanddo", "ts_bucket": time.strftime("%Y-%m-%dT%H", time.gmtime())}


def selftest_ocn_login(check: Any, tmp: Path, fake: FakeCitadelNexus, tenant_signer: Signer) -> None:
    """OCN login verify route: the sidecar is now a verifier for SEAT envelopes.

    Keys are ephemeral (generated here, never written anywhere but the temp
    registry copy as PUBLIC keys). The nonce ledger is a temp file so the replay
    control also proves persistence across a NonceStore reload.
    """
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    rig1 = Signer(Ed25519PrivateKey.generate(), Identity("rig1", "rig1", "rig1-operator"))
    forge = Signer(Ed25519PrivateKey.generate(), Identity("forge", "rig2", "forge-guildmaster"))
    stranger = Signer(Ed25519PrivateKey.generate(), Identity("intruder", "nowhere", "nobody"))
    rows = [
        {"seat_id": "rig1", "agent_id": "rig1-operator", "rig": "rig1", "env": None,
         "pubkey_hex": rig1.pubkey_hex, "pubkey_fp": rig1.pubkey_fp, "revoked_at": None},
        {"seat_id": "forge", "agent_id": "forge-guildmaster", "rig": "rig2", "env": None,
         "pubkey_hex": forge.pubkey_hex, "pubkey_fp": forge.pubkey_fp,
         "revoked_at": "2026-09-01T00:00:00Z"},
    ]
    registry_file = tmp / "seat_keypairs.public.json"
    registry_file.write_text(json.dumps({"seats": rows}), encoding="utf-8")
    registry = PeerRegistry.from_env(str(registry_file))
    nonce_file = tmp / "rooms" / "seen_nonces.jsonl"
    state = build_state(client=BridgeClient(tenant_signer, "https://fake.invalid", fake),
                        custody={"custody": "PASS"}, registry=registry, nonces=NonceStore(nonce_file))
    httpd, port = _serve_in_thread(state)
    payload = _login_payload()

    def verify(header: str, aud: str = LOGIN_AUDIENCE, pl: Any = payload) -> tuple[int, dict[str, Any] | None]:
        return _http_post(port, "/api/rooms/verify", {"header": header, "payload": pl, "audience": aud})

    valid = rig1.header(payload, LOGIN_AUDIENCE)
    status, body = verify(valid)
    check("ocn verify: valid seat -> 200 ok with seat identity",
          status == 200 and (body or {}).get("ok") is True and body.get("seat_id") == "rig1"
          and body.get("pubkey_fp") == rig1.pubkey_fp and body.get("rig") == "rig1",
          {"status": status, "body": body})
    status, body = verify(valid)
    check("ocn verify: replayed envelope -> 401 replay",
          status == 401 and (body or {}).get("ok") is False and "replay" in str(body.get("reason")),
          {"status": status, "body": body})
    status, body = verify(stranger.header(payload, LOGIN_AUDIENCE))
    check("ocn verify: unknown seat -> 401 unknown seat",
          status == 401 and "unknown seat" in str((body or {}).get("reason")),
          {"status": status, "body": body})
    status, body = verify(rig1.header(payload, AUDIENCE))
    check("ocn verify: wrong audience -> 401 audience mismatch",
          status == 401 and "audience mismatch" in str((body or {}).get("reason")),
          {"status": status, "body": body})
    status, body = verify(forge.header(payload, LOGIN_AUDIENCE))
    check("ocn verify: revoked seat -> 401 revoked",
          status == 401 and "revoked" in str((body or {}).get("reason")),
          {"status": status, "body": body})
    imposter = Signer(stranger._priv, Identity("rig1", "rig1", "rig1-operator"))  # claims rig1, wrong key
    status, body = verify(imposter.header(payload, LOGIN_AUDIENCE))
    check("ocn verify: right seat, wrong private key -> 401",
          status == 401 and str((body or {}).get("reason")) in ("bad signature", "pubkey_fp mismatch (key rotated?)"),
          {"status": status, "body": body})
    status, body = verify(rig1.header({"login": "buildanddo", "ts_bucket": "1999-01-01T00"}, LOGIN_AUDIENCE))
    check("ocn verify: payload signed for another bucket -> 401 payload hash mismatch",
          status == 401 and "payload hash" in str((body or {}).get("reason")),
          {"status": status, "body": body})
    status, body = verify("not-base64url!!", LOGIN_AUDIENCE)
    check("ocn verify: malformed header -> 401 malformed",
          status == 401 and "malformed" in str((body or {}).get("reason")),
          {"status": status, "body": body})
    status, body = verify(rig1.header(payload, LOGIN_AUDIENCE), "citadel-nexus-rooms")
    check("ocn verify: audience not served -> 400", status == 400, {"status": status, "body": body})
    status, body, _ = _http_get(port, "/api/rooms/health")
    check("health reports verifier READY with public registry facts only",
          status == 200 and body["verifier"]["state"] == "READY"
          and body["verifier"]["registry"]["seats"] == 2 and body["verifier"]["registry"]["revoked"] == 1
          and rig1.pubkey_hex not in json.dumps(body),
          {"verifier": body["verifier"]})
    httpd.shutdown()

    # nonce ledger persistence: a fresh NonceStore over the same file still refuses the replay
    reloaded = NonceStore(nonce_file)
    state = build_state(client=BridgeClient(tenant_signer, "https://fake.invalid", fake),
                        custody={"custody": "PASS"}, registry=registry, nonces=reloaded)
    httpd, port = _serve_in_thread(state)
    status, body = verify(valid)
    check("ocn verify: replay refused after nonce ledger reload",
          status == 401 and "replay" in str((body or {}).get("reason")) and len(reloaded) >= 1,
          {"status": status, "body": body, "ledger": len(reloaded)})
    httpd.shutdown()

    # no registry copy: the verifier is UNMEASURED and fails closed
    state = build_state(client=BridgeClient(tenant_signer, "https://fake.invalid", fake),
                        custody={"custody": "PASS"}, registry=None, nonces=NonceStore(None))
    state.registry = None
    httpd, port = _serve_in_thread(state)
    status, body = verify(rig1.header(payload, LOGIN_AUDIENCE))
    check("ocn verify: no peer registry -> 503 peer_registry_unmeasured",
          status == 503 and (body or {}).get("reason") == "peer_registry_unmeasured",
          {"status": status, "body": body})
    status, body, _ = _http_get(port, "/api/rooms/health")
    check("health reports verifier UNMEASURED without a registry copy",
          status == 200 and body["verifier"]["state"] == "UNMEASURED",
          {"verifier": body["verifier"]})
    httpd.shutdown()


def selftest() -> int:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    results: list[dict[str, Any]] = []

    def check(name: str, ok: bool, observed: Any) -> None:
        results.append({"control": name, "pass": bool(ok), "observed": observed})

    fake = FakeCitadelNexus()
    # Ephemeral keys for this run only. Not the tenant key, never persisted past exit.
    tenant_priv = Ed25519PrivateKey.generate()
    stranger_priv = Ed25519PrivateKey.generate()
    tenant_signer = Signer(tenant_priv)
    fake.register("buildanddo", tenant_signer.pubkey_hex, "buildanddo", "buildanddo-platform")
    fake.register("acme", Signer(stranger_priv).pubkey_hex, "acme", "acme-platform")

    with tempfile.TemporaryDirectory() as tmp:
        key_file = Path(tmp) / "buildanddo.key"
        key_file.write_text(tenant_priv.private_bytes(
            serialization.Encoding.Raw, serialization.PrivateFormat.Raw,
            serialization.NoEncryption()).hex(), encoding="utf-8")
        if os.name == "posix":
            key_file.chmod(0o600)

        # custody: loader round-trip through the file path, expected fp matching.
        loaded = Signer(load_private_key(str(key_file)))
        check("custody PASS with matching fingerprint",
              custody_status(str(key_file), loaded.pubkey_fp)["custody"] == "PASS",
              custody_status(str(key_file), loaded.pubkey_fp))
        hold = custody_status(str(Path(tmp) / "missing.key"), loaded.pubkey_fp)
        check("custody HOLD without key names the env variable",
              hold["custody"] == "HOLD" and KEY_FILE_ENV in hold["reason"], hold)

        # 1. no key: sidecar has no signer -> upstream 401 passed through unchanged
        state = build_state(client=BridgeClient(None, "https://fake.invalid", fake),
                            custody=hold)
        httpd, port = _serve_in_thread(state)
        status, body, _ = _http_get(port, "/api/rooms/projection/organization")
        check("no key -> 401 with upstream reason",
              status == 401 and (body or {}).get("detail") == "X-Citadel-Key header required",
              {"status": status, "body": body})
        status, body, _ = _http_get(port, "/api/rooms/health")
        check("health reports custody HOLD",
              status == 200 and body["custody"]["custody"] == "HOLD" and body["state"] == "HOLD",
              {"status": status, "custody": body["custody"]})
        httpd.shutdown()

        # 2. bad key: right seat claimed, wrong private key -> 401
        bad = Signer(stranger_priv, Identity())  # claims buildanddo with acme's key
        state = build_state(client=BridgeClient(bad, "https://fake.invalid", fake),
                            custody={"custody": "PASS"})
        httpd, port = _serve_in_thread(state)
        status, body, _ = _http_get(port, "/api/rooms/projection/organization")
        check("bad key -> 401 citadelkey_rejected",
              status == 401 and str((body or {}).get("detail", "")).startswith("citadelkey_rejected:"),
              {"status": status, "body": body})
        httpd.shutdown()

        # 3. wrong seat: registered key, unprovisioned tenant -> 403 before verification
        acme = Signer(stranger_priv, Identity(seat_id="acme", rig="acme", agent_id="acme-platform"))
        state = build_state(client=BridgeClient(acme, "https://fake.invalid", fake),
                            custody={"custody": "PASS"})
        httpd, port = _serve_in_thread(state)
        status, body, _ = _http_get(port, "/api/rooms/projection/organization")
        check("wrong seat -> 403 tenant_not_provisioned",
              status == 403 and (body or {}).get("detail") == "tenant_not_provisioned",
              {"status": status, "body": body})
        httpd.shutdown()

        # The real tenant signer for everything that follows.
        state = build_state(client=BridgeClient(tenant_signer, "https://fake.invalid", fake),
                            custody=custody_status(str(key_file), tenant_signer.pubkey_fp))
        httpd, port = _serve_in_thread(state)

        # 4. replayed nonce: present one envelope twice directly at the verifier
        replay_headers = {"X-Citadel-Key": tenant_signer.header({"projection": "organization"})}
        first = fake("https://fake.invalid/api/platform/rooms/projection/organization", replay_headers)
        second = fake("https://fake.invalid/api/platform/rooms/projection/organization", replay_headers)
        check("replayed nonce -> 401 replay",
              first.status == 200 and second.status == 401 and "replay" in second.detail(),
              {"first": first.status, "second": second.status, "detail": second.detail()})

        # 5a. wrong projection binding: envelope signed for organization, capability requested
        bound = {"X-Citadel-Key": tenant_signer.header({"projection": "organization"})}
        tampered = fake("https://fake.invalid/api/platform/rooms/projection/capability", bound)
        check("wrong payload binding -> 401 payload hash mismatch",
              tampered.status == 401 and "payload hash mismatch" in tampered.detail(),
              {"status": tampered.status, "detail": tampered.detail()})

        # 5b. projection outside the grant -> 403 (policy decides, key is valid)
        status, body, _ = _http_get(port, "/api/rooms/projection/mission")
        check("ungranted projection -> 403 projection_not_granted",
              status == 403 and (body or {}).get("detail") == "projection_not_granted",
              {"status": status, "body": body})

        # 6. systems: refused locally, upstream never sees it
        calls_before = len(fake.calls)
        status, body, _ = _http_get(port, "/api/rooms/projection/systems")
        check("systems -> 403 locally, never forwarded",
              status == 403 and (body or {}).get("detail") == "projection_never_exportable"
              and len(fake.calls) == calls_before,
              {"status": status, "body": body, "upstream_calls_delta": len(fake.calls) - calls_before})

        # 7. valid organization -> 200 cleansed:true, tenant stamped
        status, body, _ = _http_get(port, "/api/rooms/projection/organization")
        check("valid organization -> 200 cleansed:true",
              status == 200 and (body or {}).get("cleansed") is True
              and body.get("tenant_id") == "buildanddo" and body.get("served_by") == AUDIENCE,
              {"status": status, "cleansed": (body or {}).get("cleansed"),
               "tenant_id": (body or {}).get("tenant_id")})

        # 8. leak check: upstream body carrying 10.0.0.5 never reaches the caller
        fake.poison_projection = "development"
        status, body, raw = _http_get(port, "/api/rooms/projection/development")
        check("leak check blocks 10.0.0.5 -> 502, body withheld",
              status == 502 and (body or {}).get("detail") == "projection_leak_check_failed"
              and b"10.0.0.5" not in raw,
              {"status": status, "body": body})
        fake.poison_projection = None

        # 9. policy pass-through and health after traffic
        status, body, _ = _http_get(port, "/api/rooms/policy")
        check("policy -> 200 for the calling tenant only",
              status == 200 and (body or {}).get("tenant_id") == "buildanddo",
              {"status": status, "allowed": (body or {}).get("allowed_projections")})
        status, body, _ = _http_get(port, "/api/rooms/health")
        check("health reports custody PASS and last upstream verdict",
              status == 200 and body["custody"]["custody"] == "PASS"
              and body["upstream"]["last_status"] == 200,
              {"custody": body["custody"]["custody"], "upstream": body["upstream"]})
        status, body, _ = _http_get(port, "/api/rooms/projection/nope")
        check("unknown room -> 404 locally", status == 404, {"status": status, "body": body})
        httpd.shutdown()

        # 10. OCN login: the sidecar verifies SEAT envelopes with public keys only
        selftest_ocn_login(check, Path(tmp), fake, tenant_signer)

    all_pass = all(r["pass"] for r in results)
    print(json.dumps({"srs": "SRS-BUILDANDDO-LIVE-UTILIZATION-001", "selftest": "simulated",
                      "network": "loopback only; Citadel Nexus replaced by FakeCitadelNexus",
                      "interpreter": sys.executable, "controls": results,
                      "ALL_PASS": all_pass}, indent=2))
    return 0 if all_pass else 1


# ── cli ──────────────────────────────────────────────────────────────────────
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="services.buildanddo_visual_substrate",
                                 description=__doc__.split("\n")[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--serve", action="store_true", help="run the rooms sidecar")
    mode.add_argument("--selftest", action="store_true", help="offline negative-control suite")
    mode.add_argument("--health", action="store_true", help="print custody status, no secrets")
    args = ap.parse_args(argv)

    if not HAVE_CRYPTO:
        print(json.dumps({"state": "HOLD", "reason": "cryptography (Ed25519) not installed"}))
        return 2
    if args.selftest:
        return selftest()
    if args.health:
        state = build_state()
        report = {"srs": "SRS-BUILDANDDO-LIVE-UTILIZATION-001",
                  "state": "HOLD" if state.custody["custody"] == "HOLD" else "READY",
                  "custody": state.custody, "upstream": state.snapshot()}
        print(json.dumps(report, indent=2))
        return 0 if report["state"] == "READY" else 1
    serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
