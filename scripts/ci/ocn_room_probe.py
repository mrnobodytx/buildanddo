#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_room_probe.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/pocketbase/pb_hooks/classrooms.pb.js, classrooms.js,
#              apps/pocketbase/pb_hooks/classroom-presence.pb.js, classroom-realtime.pb.js
# EnumType:    Verifier
# EnumEdges:   VERIFIES the classroom command surface as one real seat from one real machine
# Intent:      Issue ONE classroom command as this seat, so a multi-seat room can be assembled from
#              commands that each came from a different machine - which is the only way to find out
#              whether a shared room is actually shared.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_room_probe.py - issue one classroom command as this seat, from this box.

    ocn_room_probe.py <seat> <workspace> <action> --payload JSON [--revision N]
                      [--request-key KEY] [--env staging] [--raw PATH]

    actions: room.create room.update room.start room.end room.lesson room.join room.leave room.message
    also:    list  (GET the workspace's classrooms)  |  lessons  (GET installed tutorials)
             presence-health  |  realtime-health

ONE COMMAND PER INVOCATION. A shared room is only shared if the commands come from different
machines; running them from one process would prove that one process can talk to itself. Each call
signs in with the CitadelKey only this box holds, so the host, the joiner and the refused outsider
are genuinely different principals on genuinely different hardware.

THE SURFACE IS COMMAND-SHAPED, not REST: POST {action, payload, revision, request_key} and the hook
validates the payload keys EXACTLY - an extra or missing key is refused rather than ignored. That is
reported verbatim, because "which fields does this action take" is answered by the server and not by
reading the hook and hoping.

REVISION AND REQUEST KEY ARE NOT DECORATION. A new room must start at revision zero, later commands
must carry the revision they are acting on, and the request key is written into classroom_receipts -
so replaying the same key must return the same receipt rather than acting twice. A room system that
loses either one will double-join a flaky client.
"""
from __future__ import annotations
import argparse
import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.request

ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
CBF = "/opt/citadel/cbf"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-room/1.0)", "Content-Type": "application/json"}


def http(url, data=None, headers=None, method=None, timeout=30):
    head = dict(UA)
    head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head,
                                 method=method or ("POST" if data is not None else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw[:1] in b"{[" else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw[:1] in b"{[" else {})
    except Exception as exc:  # noqa: BLE001
        return 0, {"err": type(exc).__name__}


def login(seat, base):
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
    s, b = http(base + BACKEND + "/api/ocn/login", data=b"{}", headers={"X-Citadel-Key": header})
    if s != 200:
        return None, None
    return b.get("token"), (b.get("record") or {}).get("id")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("workspace")
    ap.add_argument("action")
    ap.add_argument("--payload", default="{}")
    ap.add_argument("--revision", type=int, default=None)
    ap.add_argument("--request-key", default="")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    args = ap.parse_args()
    root = ENVS[args.env] + BACKEND
    out = {"schema": "buildanddo.ocn-room-probe/v1", "seat": args.seat, "action": args.action,
           "workspace": args.workspace,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

    token, uid = login(args.seat, ENVS[args.env])
    if not token:
        out["login"] = "FAILED"
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    out["uid"] = uid
    auth = {"Authorization": token}

    if args.action == "list":
        s, b = http("%s/api/buildanddo/workspaces/%s/classrooms" % (root, args.workspace), headers=auth)
        rooms = b.get("rooms") or b.get("items") or (b if isinstance(b, list) else [])
        out["result"] = {"http": s, "count": len(rooms) if isinstance(rooms, list) else None,
                         "rooms": [{"id": r.get("id"), "title": r.get("title"), "status": r.get("status")}
                                   for r in rooms][:10] if isinstance(rooms, list) else b}
    elif args.action == "lessons":
        s, b = http("%s/api/collections/tutorials/records?perPage=3" % root, headers=auth)
        out["result"] = {"http": s, "total": b.get("totalItems"),
                         "ids": [i.get("id") for i in (b.get("items") or [])],
                         "titles": [str(i.get("title"))[:48] for i in (b.get("items") or [])]}
    elif args.action == "presence-health":
        s, b = http("%s/api/classroom/presence/health" % root, headers=auth)
        out["result"] = {"http": s, "body": b}
    elif args.action == "realtime-health":
        s, b = http("%s/api/classroom/health" % root, headers=auth)
        out["result"] = {"http": s, "body": b}
    else:
        body = {"action": args.action, "payload": json.loads(args.payload)}
        if args.revision is not None:
            body["revision"] = args.revision
        if args.request_key:
            body["request_key"] = args.request_key
        s, b = http("%s/api/buildanddo/workspaces/%s/classrooms" % (root, args.workspace),
                    data=json.dumps(body).encode(), headers=auth)
        res = {"http": s}
        if s in (200, 201):
            room = b.get("room") or b.get("result") or b
            if isinstance(room, dict):
                res["room_id"] = room.get("id")
                res["status"] = room.get("status")
                res["revision"] = room.get("revision")
                res["keys"] = sorted(room.keys())[:12]
        else:
            res["message"] = str(b.get("message") or b.get("err") or "")[:160]
            data = b.get("data") or {}
            if data:
                res["fields"] = {k: str((v or {}).get("message"))[:60] for k, v in list(data.items())[:5]}
        out["result"] = res

    print(json.dumps(out))
    return 0 if (out.get("result") or {}).get("http") in (200, 201) else 1


if __name__ == "__main__":
    raise SystemExit(main())
