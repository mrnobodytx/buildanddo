#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_rbac_probe.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/ocn_box_exercise.py (same login path);
#              apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js (the rules under test)
# EnumType:    Verifier
# EnumEdges:   VERIFIES criteria D03-2, D03-3, D05-2 with real multi-user accounts on real machines
# Intent:      Perform ONE authorization attempt as one real account on one real box, and report the
#              server's verdict verbatim, so an allow/deny matrix can be assembled from measurements
#              rather than from reading the rules.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_rbac_probe.py - make ONE authorization attempt as this box, and report what the server said.

RUNS ON A FLEET BOX. One attempt per invocation, deliberately: a matrix assembled from single,
independently-addressed attempts can be read cell by cell, and a cell that was never run is visibly
absent instead of being silently folded into a neighbour.

    ocn_rbac_probe.py <seat> whoami
    ocn_rbac_probe.py <seat> list_ws
    ocn_rbac_probe.py <seat> read_ws        <workspace>
    ocn_rbac_probe.py <seat> create_mission <workspace>
    ocn_rbac_probe.py <seat> patch_mission  <mission> <status>
    ocn_rbac_probe.py <seat> add_member     <workspace> <user_id> <role>
    ocn_rbac_probe.py <seat> delete_ws      <workspace>

WHAT COUNTS AS A RESULT. A 403 is a PASS when the matrix expects a denial - the point of an
allow/deny matrix is that roughly half of it must be refusals. A run in which everything returns 200
has not demonstrated access control, it has demonstrated its absence. So this reports the raw
status and the server's own message and makes no judgement; the orchestrator compares against
expectation.

WHY 404 IS NOT THE SAME AS 403. PocketBase answers a forbidden record READ with 404 rather than 403
(it will not confirm that an id exists to someone not allowed to see it). Both are denials for
matrix purposes, and the orchestrator treats them as such, but they are recorded distinctly because
collapsing them would hide the difference between "hidden from you" and "explicitly refused".

Never prints the token.
"""
from __future__ import annotations
import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://staging.buildanddo.com/hcgi/platform"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-rbac-probe/1.0)",
      "Content-Type": "application/json"}
CBF = "/opt/citadel/cbf"


def http(method: str, path: str, body=None, token: str | None = None, timeout: int = 25):
    headers = dict(UA)
    if token:
        headers["Authorization"] = token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw[:1] in (b"{", b"[") else {})
    except Exception as exc:  # noqa: BLE001 - a dead hop is not a verdict
        return 0, {"err": type(exc).__name__}


def login(seat: str):
    bucket = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H")
    payload = json.dumps({"login": "buildanddo", "ts_bucket": bucket},
                         sort_keys=True, separators=(",", ":"))
    signed = subprocess.run([sys.executable, "-m", "tools.cbf.citadelkey.citadel_key", "sign",
                             "--seat", seat, "--audience", "buildanddo-login",
                             "--payload", payload, "--header"],
                            cwd=CBF, capture_output=True, text=True, timeout=60)
    header = (signed.stdout or "").strip().splitlines()[-1] if signed.stdout.strip() else ""
    if not header:
        return None, None
    headers = dict(UA)
    headers["X-Citadel-Key"] = header
    req = urllib.request.Request(BASE + "/api/ocn/login", data=b"{}", headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            body = json.loads(resp.read())
    except Exception:  # noqa: BLE001
        return None, None
    return body.get("token"), (body.get("record") or {}).get("id")


def attempt(op: str, args: list[str], token: str, uid: str):
    if op == "whoami":
        return http("POST", "/api/collections/users/auth-refresh", {}, token)
    if op == "list_ws":
        return http("GET", "/api/collections/workspaces/records?perPage=50", None, token)
    if op == "read_ws":
        return http("GET", "/api/collections/workspaces/records/%s" % args[0], None, token)
    if op == "create_mission":
        return http("POST", "/api/collections/missions/records",
                    {"title": "RBAC probe", "workspace": args[0], "owner": uid,
                     "status": "proposed", "description": "Authorization attempt under test."}, token)
    if op == "patch_mission":
        return http("PATCH", "/api/collections/missions/records/%s" % args[0],
                    {"status": args[1]}, token)
    if op == "add_member":
        return http("POST", "/api/collections/workspace_members/records",
                    {"workspace": args[0], "user": args[1], "role": args[2]}, token)
    if op == "delete_ws":
        return http("DELETE", "/api/collections/workspaces/records/%s" % args[0], None, token)
    return 0, {"err": "unknown op %r" % op}


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    seat, op, args = sys.argv[1], sys.argv[2], sys.argv[3:]
    out = {"seat": seat, "op": op, "args": args,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    token, uid = login(seat)
    if not token:
        out["result"] = {"http": None, "state": "LOGIN_FAILED"}
        print(json.dumps(out))
        return 1
    out["uid"] = uid
    status, body = attempt(op, args, token, uid)
    result = {"http": status}
    if status in (200, 201):
        result["state"] = "ALLOWED"
        result["id"] = body.get("id")
        if op == "list_ws":
            result["visible"] = body.get("totalItems")
            result["ids"] = [i.get("id") for i in (body.get("items") or [])]
    elif status in (401, 403, 404):
        # 404 on a read is PocketBase declining to confirm an id exists. Still a denial.
        result["state"] = "DENIED"
        result["message"] = str(body.get("message") or "")[:100]
    elif status == 0:
        result["state"] = "TRANSPORT_FAULT"       # never counted as allow OR deny
        result["message"] = str(body.get("err"))
    else:
        result["state"] = "OTHER"
        result["message"] = str(body.get("message") or "")[:100]
    out["result"] = result
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
