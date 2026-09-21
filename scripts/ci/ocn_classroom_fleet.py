#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_classroom_fleet.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-CLASSROOM-001, SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/ocn-login.pb.js,
#              config/master_citadel.fleet.json
# EnumType:    Verifier
# EnumEdges:   VERIFIES one shared classroom on live staging whose participants each signed on a
#              DIFFERENT physical machine
# Intent:      Hold a class where every guildmaster acts from its own box. The signing key never
#              leaves that box and this machine never holds a session token, so a shared room cannot
#              be one process talking to itself.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_classroom_fleet.py - a live class whose four guildmasters are four different machines.

    ocn_classroom_fleet.py run [--json]
    ocn_classroom_fleet.py seats
    ocn_classroom_fleet.py selftest

WHY THIS AND NOT ocn_classroom_live.py. That tool signs every seat on rig1: four identities, one
machine. This one runs each seat's signing and every one of its HTTP calls ON THAT SEAT'S OWN BOX
over SSH. The Ed25519 private half never leaves the box, the PocketBase session token is created and
used there and never returned, and rig1 only carries the orchestration and the receipts. A room that
reads back with four participants here was genuinely reached from four public IPs.

The seat<->box<->guildmaster mapping is read from config/master_citadel.fleet.json, which is the
fleet map of record, rather than restated here - an earlier pass in this repo had the personas
attached to the wrong boxes.

CONTROLS, required for a PASS. A seat that was never seated in the host's workspace must be refused
FROM ITS OWN BOX, and the finished room must read back from a JOINER's box rather than the host's.
A run where everything succeeded would only show an open room.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
FLEET = REPO.parent.parent / "config" / "master_citadel.fleet.json"
STAGING = "https://staging.buildanddo.com/hcgi/platform"
CBF = "/opt/citadel/cbf"
SCHEMA = "buildanddo.ocn-classroom-fleet/v1"
# Which private key on THIS machine opens which box. The key authorises the SSH hop only; it has
# nothing to do with the CitadelKey the box signs its own session with.
SSH_KEYS = {"mesh-control": "citadel_test_droplet", "mesh-memory": "citadel_test_droplet",
            "ray-tor1-1": "citadel_helper", "ray-tor1-2": "citadel_helper",
            "ray-tor1-3": "citadel_helper", "ray-tor1-4": "citadel_helper"}
HOST_BOX = "mesh-control"
JOIN_BOXES = ["mesh-memory", "ray-tor1-1", "ray-tor1-3"]
OUTSIDER_BOX = "ray-tor1-2"

# Runs on the box. Signs with the box's own seat key, exchanges it for a session, makes ONE call and
# prints one JSON line. The token is never echoed and never leaves the box.
REMOTE = r"""
set -e
cd %(cbf)s
BUCKET=$(date -u +%%Y-%%m-%%dT%%H)
PAYLOAD="{\"login\":\"buildanddo\",\"ts_bucket\":\"$BUCKET\"}"
HEADER=$(python3 -m tools.cbf.citadelkey.citadel_key sign --seat %(seat)s --audience buildanddo-login --payload "$PAYLOAD" --header 2>/dev/null | tail -1)
if [ -z "$HEADER" ]; then echo "STAGE sign"; echo "HTTP 0"; exit 0; fi
curl -s -o /tmp/bdo_login.json -w "%%{http_code}" -A "Mozilla/5.0" -H "X-Citadel-Key: $HEADER" -H "Content-Type: application/json" -X POST -d "{}" %(base)s/api/ocn/login > /tmp/bdo_code
LCODE=$(cat /tmp/bdo_code)
if [ "$LCODE" != "200" ]; then echo "STAGE login"; echo "HTTP $LCODE"; exit 0; fi
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/bdo_login.json')).get('token',''))")
echo "UID $(python3 -c "import json;print((json.load(open('/tmp/bdo_login.json')).get('record') or {}).get('id',''))")"
echo "EMAIL $(python3 -c "import json;print((json.load(open('/tmp/bdo_login.json')).get('record') or {}).get('email',''))")"
if [ "%(method)s" = "WHOAMI" ]; then
  echo "IP $(curl -s -m 10 https://api.ipify.org || echo unknown)"
  echo "STAGE login"; echo "HTTP 200"; rm -f /tmp/bdo_login.json /tmp/bdo_code; exit 0
fi
if [ -n "%(b64)s" ]; then
  printf "%%s" "%(b64)s" | base64 -d > /tmp/bdo_body.json
  curl -s -o /tmp/bdo_out.json -w "%%{http_code}" -A "Mozilla/5.0" -H "Authorization: $TOKEN" -H "Content-Type: application/json" -X %(method)s -d @/tmp/bdo_body.json "%(base)s%(path)s" > /tmp/bdo_code
else
  curl -s -o /tmp/bdo_out.json -w "%%{http_code}" -A "Mozilla/5.0" -H "Authorization: $TOKEN" "%(base)s%(path)s" > /tmp/bdo_code
fi
echo "STAGE call"
echo "HTTP $(cat /tmp/bdo_code)"
echo "BODY $(base64 -w0 /tmp/bdo_out.json)"
rm -f /tmp/bdo_login.json /tmp/bdo_code /tmp/bdo_out.json /tmp/bdo_body.json
"""


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def fleet() -> dict[str, dict]:
    """Box -> record, from the fleet map of record."""
    if not FLEET.is_file():
        return {}
    boxes = json.loads(FLEET.read_text(encoding="utf-8")).get("boxes") or {}
    return {k: v for k, v in boxes.items() if isinstance(v, dict) and v.get("guildmaster")}


def on_box(box: str, record: dict, method: str, path: str = "", body: Any = None) -> dict[str, Any]:
    """Run one signed, authenticated call ON that box. Returns what the box printed."""
    key = Path.home() / ".ssh" / SSH_KEYS.get(box, "")
    if not key.is_file():
        return {"stage": "ssh", "http": 0, "error": f"no ssh key for {box}"}
    script = REMOTE % {
        "cbf": CBF, "seat": box, "base": STAGING, "method": method, "path": path,
        "b64": base64.b64encode(json.dumps(body).encode()).decode() if body is not None else "",
    }
    ssh = shutil.which("ssh") or "ssh"
    try:
        done = subprocess.run(
            [ssh, "-i", str(key), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
             "-o", "ConnectTimeout=15", f"root@{record['public_ip']}",
             # Windows text-mode pipes rewrite LF as CRLF, so bash on the box sees a stray CR
             # script dies at line 1. The repo's VPS ops module strips it the same way.
             "tr -d '\\r' | bash -s"],
            input=script, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        return {"stage": "ssh", "http": 0, "error": "ssh timeout"}
    answer: dict[str, Any] = {"stage": "ssh", "http": 0}
    for raw in (done.stdout or "").splitlines():
        label, _, rest = raw.strip().partition(" ")
        if label == "HTTP":
            answer["http"] = int(rest or 0)
        elif label in ("STAGE", "UID", "EMAIL", "IP"):
            answer[label.lower()] = rest
        elif label == "BODY" and rest:
            try:
                answer["body"] = json.loads(base64.b64decode(rest) or b"{}")
            except Exception:                               # noqa: BLE001
                answer["body"] = {}
    if answer["http"] == 0 and "stage" not in answer:
        answer["error"] = (done.stderr or done.stdout or "")[-180:]
    return answer


def note(checks: list[dict], name: str, box: str, answer: dict, expect: str, ok: bool) -> bool:
    checks.append({"check": name, "box": box, "expect": expect,
                   "http": answer.get("http"), "stage": answer.get("stage"),
                   "outcome": "AS_EXPECTED" if ok else "CONTRACT_BROKEN",
                   "message": str((answer.get("body") or {}).get("message")
                                  or answer.get("error") or "")[:150] or None})
    return ok


def run() -> dict[str, Any]:
    """One class, four boxes: the host schedules and opens it, three others join from their own."""
    boxes = fleet()
    out: dict[str, Any] = {"schema": SCHEMA, "command": "run", "observed_at": utc(),
                           "environment": "staging",
                           "identity_model": "FOUR_IDENTITIES_FOUR_MACHINES"}
    needed = [HOST_BOX, *JOIN_BOXES]
    missing = [b for b in needed if b not in boxes]
    if missing:
        out.update({"state": "FAIL", "reason": f"not in the fleet map: {missing}"})
        return out
    checks: list[dict] = []

    # Each box signs for itself and reports who it is and the IP it reached staging from.
    who: dict[str, dict] = {}
    for box in needed:
        answer = on_box(box, boxes[box], "WHOAMI")
        who[box] = answer
        note(checks, f"{boxes[box]['guildmaster']} signs in on its own box", box, answer,
             "200 - the box's own CitadelKey", answer.get("http") == 200)
    out["seats"] = [{"box": b, "guildmaster": boxes[b]["guildmaster"], "guild": boxes[b].get("guild"),
                     "public_ip": boxes[b].get("public_ip"), "source_ip": who[b].get("ip"),
                     "email": who[b].get("email"), "uid": who[b].get("uid"),
                     "http": who[b].get("http")} for b in needed]
    if any(who[b].get("http") != 200 for b in needed):
        out.update({"state": "FAIL", "reason": "a guildmaster could not sign in on its box",
                    "checks": checks})
        return out
    out["distinct_source_ips"] = sorted({str(who[b].get("ip")) for b in needed})

    answer = on_box(HOST_BOX, boxes[HOST_BOX], "GET", "/api/collections/workspaces/records?perPage=10")
    owned = [w for w in ((answer.get("body") or {}).get("items") or [])
             if w.get("owner") == who[HOST_BOX].get("uid")]
    if not owned:
        out.update({"state": "FAIL", "reason": f"{HOST_BOX} owns no workspace", "checks": checks})
        return out
    workspace, name = owned[0]["id"], owned[0].get("name")
    out["workspace"] = {"id": workspace, "name": name}
    admin = f"/api/buildanddo/workspaces/{workspace}/admin"
    path = f"/api/buildanddo/workspaces/{workspace}/classrooms"
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")

    def admin_revision() -> int:
        got = on_box(HOST_BOX, boxes[HOST_BOX], "GET", admin)
        return int((((got.get("body") or {}).get("settings")) or {}).get("revision") or 0)

    # Membership is granted by the owner through the governed admin command. Writing
    # workspace_members directly is refused even to the owner.
    for box in JOIN_BOXES:
        answer = on_box(HOST_BOX, boxes[HOST_BOX], "POST", admin, {
            "action": "member.set",
            "payload": {"user": who[box].get("uid"), "role": "editor"},
            "revision": admin_revision(),
            "request_key": f"fleet-seat-{stamp}-{box}",
        })
        note(checks, f"host seats {boxes[box]['guildmaster']} ({box})", HOST_BOX, answer,
             "200 - granted through the admin command", answer.get("http") == 200)

    lesson = ""
    got = on_box(HOST_BOX, boxes[HOST_BOX], "GET", "/api/collections/tutorials/records?perPage=1")
    items = (got.get("body") or {}).get("items") or []
    if items:
        lesson = items[0].get("id", "")
    out["lesson"] = lesson or None

    def command(box: str, action: str, payload: dict, revision: int) -> dict:
        return on_box(box, boxes[box], "POST", path, {
            "action": action, "payload": payload, "revision": revision,
            "request_key": f"fleet-class-{stamp}-{action.replace('.', '-')}-{box}",
        })

    def revision_from(box: str, room: str) -> int:
        got = on_box(box, boxes[box], "GET", f"{path}/{room}")
        body = got.get("body") or {}
        return int((body.get("room") or body).get("revision") or 0)

    host_gm = boxes[HOST_BOX]["guildmaster"]
    answer = command(HOST_BOX, "room.create", {
        "title": f"Fleet guildmaster class ({stamp})",
        "description": f"Hosted by {host_gm} on {HOST_BOX}; each guildmaster acts from its own box.",
        "tutorial": lesson, "starts_at": "",
    }, 0)
    if not note(checks, f"{host_gm} schedules the class", HOST_BOX, answer, "200",
                answer.get("http") == 200):
        out.update({"state": "FAIL", "checks": checks, "halted_at": "room.create"})
        return out
    room = (answer.get("body") or {}).get("id")
    out["room"] = room

    answer = command(HOST_BOX, "room.start", {"id": room}, revision_from(HOST_BOX, room))
    note(checks, f"{host_gm} opens the class", HOST_BOX, answer, "200", answer.get("http") == 200)
    if lesson:
        answer = command(HOST_BOX, "room.lesson", {"id": room, "tutorial": lesson, "section": 1},
                         revision_from(HOST_BOX, room))
        note(checks, f"{host_gm} moves the class to section 1", HOST_BOX, answer, "200",
             answer.get("http") == 200)

    for box in JOIN_BOXES:
        gm = boxes[box]["guildmaster"]
        answer = command(box, "room.join", {"id": room}, revision_from(box, room))
        note(checks, f"{gm} joins from {box}", box, answer, "200", answer.get("http") == 200)
        answer = command(box, "room.message",
                         {"id": room,
                          "body": f"{gm} of the {boxes[box].get('guild')} guild, joining from {box}."},
                         revision_from(box, room))
        note(checks, f"{gm} speaks from {box}", box, answer, "200", answer.get("http") == 200)

    # CONTROL: a guildmaster with NO membership must be refused from its own box.
    # Every fleet box is already seated in this workspace, so simply reading as one of them
    # proves nothing - an earlier version of this control did exactly that and passed on a 200
    # that was correct behaviour. The host therefore revokes the outsider's membership, the
    # outsider's own box is refused, and the membership is put back.
    if OUTSIDER_BOX in boxes:
        outsider_gm = boxes[OUTSIDER_BOX]["guildmaster"]
        outsider = on_box(OUTSIDER_BOX, boxes[OUTSIDER_BOX], "WHOAMI")
        revoked = on_box(HOST_BOX, boxes[HOST_BOX], "POST", admin, {
            "action": "member.remove", "payload": {"user": outsider.get("uid")},
            "revision": admin_revision(), "request_key": f"fleet-unseat-{stamp}-{OUTSIDER_BOX}",
        })
        note(checks, f"host unseats {outsider_gm} for the control", HOST_BOX, revoked,
             "200 - membership revoked through the admin command", revoked.get("http") == 200)
        answer = on_box(OUTSIDER_BOX, boxes[OUTSIDER_BOX], "GET", f"{path}/{room}")
        note(checks, f"CONTROL unseated {outsider_gm} refused from {OUTSIDER_BOX}",
             OUTSIDER_BOX, answer, "not 200 - membership was just revoked",
             answer.get("http") not in (200, 0))
        restored = on_box(HOST_BOX, boxes[HOST_BOX], "POST", admin, {
            "action": "member.set", "payload": {"user": outsider.get("uid"), "role": "editor"},
            "revision": admin_revision(), "request_key": f"fleet-reseat-{stamp}-{OUTSIDER_BOX}",
        })
        note(checks, f"{outsider_gm} is seated again afterwards", HOST_BOX, restored,
             "200 - the run leaves the workspace as it found it", restored.get("http") == 200)

    # Read the finished room back from a JOINER's box, not the host's.
    witness = JOIN_BOXES[0]
    answer = on_box(witness, boxes[witness], "GET", f"{path}/{room}")
    body = answer.get("body") or {}
    room_body = body.get("room") or body
    participants = body.get("participants") or []
    messages = (body.get("messages") or {}).get("items") or []
    out["readback"] = {"from_box": witness, "http": answer.get("http"),
                       "status": room_body.get("status"), "section": room_body.get("section"),
                       "participants": len(participants), "messages": len(messages)}
    note(checks, f"the class reads back from {witness}, not the host", witness, answer,
         "200, live, every joiner present",
         answer.get("http") == 200 and room_body.get("status") == "live"
         and len(participants) >= len(JOIN_BOXES))

    broken = [c for c in checks if c["outcome"] != "AS_EXPECTED"]
    out["checks"] = checks
    out["summary"] = {"checks": len(checks), "machines": len(needed),
                      "distinct_source_ips": len(out.get("distinct_source_ips") or []),
                      "contract_broken": [c["check"] for c in broken]}
    out["state"] = "PASS" if not broken else "FAIL"
    return out


def seats() -> dict[str, Any]:
    boxes = fleet()
    out: dict[str, Any] = {"schema": SCHEMA, "command": "seats", "observed_at": utc(), "seats": []}
    for box, record in sorted(boxes.items()):
        if box not in SSH_KEYS:
            continue
        answer = on_box(box, record, "WHOAMI")
        out["seats"].append({"box": box, "guildmaster": record.get("guildmaster"),
                             "guild": record.get("guild"), "public_ip": record.get("public_ip"),
                             "http": answer.get("http"), "email": answer.get("email"),
                             "source_ip": answer.get("ip"), "error": answer.get("error")})
    out["state"] = "PASS" if any(s["http"] == 200 for s in out["seats"]) else "FAIL"
    return out


def selftest() -> dict[str, Any]:
    boxes = fleet()
    return {"schema": SCHEMA, "command": "selftest", "observed_at": utc(),
            "fleet_map": str(FLEET), "fleet_map_present": FLEET.is_file(),
            "boxes_with_guildmasters": sorted(boxes),
            "ssh_keys_present": {b: (Path.home() / ".ssh" / k).is_file()
                                 for b, k in SSH_KEYS.items()},
            "state": "PASS" if boxes else "FAIL"}


def table(result: dict[str, Any]) -> str:
    lines = [f"BUILDANDDO // FLEET GUILDMASTER CLASSROOM // {result.get('state')}",
             f"  staging  workspace={(result.get('workspace') or {}).get('name')}  room={result.get('room')}",
             f"  identity model: {result.get('identity_model')}   distinct source IPs: {result.get('distinct_source_ips')}"]
    for seat in result.get("seats", []):
        lines.append(f"    {str(seat.get('guildmaster')):<10} {str(seat.get('box')):<14} "
                     f"{str(seat.get('source_ip')):<16} {seat.get('email') or ''}")
    for check in result.get("checks", []):
        mark = "ok " if check["outcome"] == "AS_EXPECTED" else "BAD"
        lines.append(f"  [{mark}] {check['check']:<52} http={check['http']}")
        if check.get("message"):
            lines.append(f"         said: {check['message']}")
    readback = result.get("readback")
    if readback:
        lines.append(f"  READBACK from {readback.get('from_box')}: status={readback.get('status')} "
                     f"participants={readback.get('participants')} messages={readback.get('messages')}")
    broken = (result.get("summary") or {}).get("contract_broken")
    if broken:
        lines.append(f"  CONTRACT BROKEN: {', '.join(broken)}")
    lines.append("  RULE  each seat signed and called from its OWN box; this machine held no token")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["run", "seats", "selftest"])
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    result = {"run": run, "seats": seats, "selftest": selftest}[args.cmd]()
    if args.json or args.cmd != "run":
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(table(result))
    return {"PASS": 0, "FAIL": 1}.get(str(result.get("state")), 1)


if __name__ == "__main__":
    raise SystemExit(main())
