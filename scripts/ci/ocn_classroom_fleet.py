#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_classroom_fleet.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-CLASSROOM-001, SRS-BUILDANDDO-LIVE-UTILIZATION-001, SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        C-ONE, BITS-CODEGEN (the rota cast)
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/ocn-login.pb.js,
#              config/master_citadel.fleet.json, libs/guildmasters/__init__.py,
#              libs/guildmasters/rota.py
# EnumType:    Verifier
# EnumEdges:   VERIFIES one shared classroom on live staging whose participants each signed on a
#              DIFFERENT physical machine; CONSUMES libs/guildmasters/__init__.py;
#              CONSUMES libs/guildmasters/rota.py; VERIFIED_BY tests/upgrade/test_ocn_classroom_rota.py
# Intent:      Hold the rota's class where every guildmaster acts from its own box. The signing key
#              never leaves that box and this machine never holds a session token, so a shared room
#              cannot be one process talking to itself.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_classroom_fleet.py - a live class whose four guildmasters are four different machines.

    ocn_classroom_fleet.py run [--at ISO] [--json]
    ocn_classroom_fleet.py seats
    ocn_classroom_fleet.py selftest [--at ISO]

WHY THIS AND NOT ocn_classroom_live.py. That tool signs every seat on rig1: four identities, one
machine. This one runs each seat's signing and every one of its HTTP calls ON THAT SEAT'S OWN BOX
over SSH. The Ed25519 private half never leaves the box, the PocketBase session token is created and
used there and never returned, and rig1 only carries the orchestration and the receipts. A room that
reads back with four participants here was genuinely reached from four public IPs.

The seat<->box<->guildmaster mapping is read from config/master_citadel.fleet.json, which is the
fleet map of record, rather than restated here - an earlier pass in this repo had the personas
attached to the wrong boxes. Each record's guildmaster is resolved to one of the canonical eight
(libs/guildmasters), so a spelling such as "director" or "Director Nexus" names the same persona.

WHO TEACHES. The weekly guild class rota (libs/guildmasters/rota.py) casts the class happening now
or next (--at fixes the instant). The host is the box whose guildmaster the rota names as host; if
no box carries that guildmaster the run refuses with ROTA_HOST_UNSEATED and never falls back to
another box. The joiners are the boxes of the auditor, then of the attendees in rota order, three in
all (ROTA_ATTENDEES_UNSEATED when fewer have a box). The outsider is the first remaining box whose
guildmaster is not cast.

WHICH SEAT SIGNS. A box still signs as its own box seat, with the key that lives on it; the persona
names above are what the receipt and the class show. Signing as the persona seat itself from a box
waits on SRS-BUILDANDDO-LIVE-UTILIZATION-001, which binds a signing key to each persona seat.

CONTROLS, required for a PASS. A seat that was never seated in the host's workspace must be refused
FROM ITS OWN BOX, and the finished room must read back from a JOINER's box rather than the host's.
A run where everything succeeded would only show an open room, so a run with no outsider box left
reports the control as not run and does not pass.
"""
from __future__ import annotations

import argparse
import base64
import datetime as dt
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.guildmasters import ORDER, Guildmaster, resolve  # noqa: E402
from libs.guildmasters import rota  # noqa: E402

FLEET = ROOT.parent.parent / "config" / "master_citadel.fleet.json"
STAGING = "https://staging.buildanddo.com/hcgi/platform"
CBF = "/opt/citadel/cbf"
SCHEMA = "buildanddo.ocn-classroom-fleet/v1"
# Which private key on THIS machine opens which box. The key authorises the SSH hop only; it has
# nothing to do with the CitadelKey the box signs its own session with.
SSH_KEYS = {"mesh-control": "citadel_test_droplet", "mesh-memory": "citadel_test_droplet",
            "ray-tor1-1": "citadel_helper", "ray-tor1-2": "citadel_helper",
            "ray-tor1-3": "citadel_helper", "ray-tor1-4": "citadel_helper"}
# No box is named as host, joiner or outsider here: cast() picks them from the rota and the fleet
# map at run time. A fixed host box was the fallback this replaces.
JOINERS = 3
ROTA_KEYS = ("week", "slot", "host", "auditor", "starts_at")

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


def instant(text: str) -> dt.datetime:
    """--at: an ISO 8601 instant with a zone. A naive time is ambiguous and refused, as the rota does."""
    try:
        value = dt.datetime.fromisoformat(text.strip().replace("Z", "+00:00"))
    except ValueError:
        raise argparse.ArgumentTypeError("choose --at as an ISO 8601 instant, e.g. 2026-11-02T15:00Z") from None
    if value.tzinfo is None or value.utcoffset() is None:
        raise argparse.ArgumentTypeError("give --at a zone (Z or +hh:mm); a naive time is ambiguous")
    return value.astimezone(dt.timezone.utc)


def placed(boxes: dict[str, dict]) -> dict[str, Guildmaster]:
    """Box -> canonical guildmaster, for every record whose guildmaster resolves to one of the eight."""
    found = {box: resolve(record.get("guildmaster")) for box, record in sorted(boxes.items())}
    return {box: entry for box, entry in found.items() if entry is not None}


def cast(boxes: dict[str, dict], at: dt.datetime) -> dict[str, Any]:
    """Pick the host, joiner and outsider boxes for the rota class at `at`.

    Reads only the fleet map records passed in; no box is named in this file. Returns the rota class,
    the boxes and their guildmasters, or state FAIL with ROTA_HOST_UNSEATED / ROTA_ATTENDEES_UNSEATED
    when the rota cannot be seated. There is no fallback box.
    """
    plan = rota.current(at)
    entries = placed(boxes)
    seated: dict[str, str] = {}
    for box, entry in entries.items():
        seated.setdefault(entry.seat, box)       # the first box, in box order, of each guildmaster
    picked: dict[str, Any] = {"rota": {key: plan[key] for key in ROTA_KEYS}, "entries": entries,
                              "seated": [seat for seat in ORDER if seat in seated]}
    host = seated.get(plan["host"])
    if host is None:
        picked.update({"state": "FAIL",
                       "reason": f"ROTA_HOST_UNSEATED: {plan['name']} has no seat in the fleet map"})
        return picked
    order = [plan["auditor"], *[seat for seat in plan["attendees"] if seat != plan["auditor"]]]
    joiners = [seated[seat] for seat in order if seat in seated][:JOINERS]
    if len(joiners) < JOINERS:
        picked.update({"state": "FAIL",
                       "reason": f"ROTA_ATTENDEES_UNSEATED: {len(joiners)} of the {JOINERS} joiners "
                                 "the rota needs have a seat in the fleet map"})
        return picked
    cast_seats = {entries[box].seat for box in [host, *joiners]}
    outsider = next((seated[seat] for seat in plan["attendees"]
                     if seat in seated and seat not in cast_seats), None)
    picked.update({"state": "CAST", "host": host, "joiners": joiners, "outsider": outsider,
                   "auditor_seated": plan["auditor"] in seated})
    return picked


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
    # THE HOP IS INFRASTRUCTURE, NOT EVIDENCE. Measured 2026-09-23: three runs in a row lost one
    # step each at stage=ssh with no HTTP status, always the second consecutive hop to the same box
    # over its public address (a timed probe: 1.9 s then 8.0 s; the mesh path held 2.5-3.5 s across
    # four hops). The release workstation sits on the mesh, so the hop goes there when the fleet map
    # names a mesh address and falls back to the public one. What the run PROVES is unchanged: the
    # box signs with its own key and reaches staging from its own egress, which the WHOAMI stage
    # still measures from the box itself.
    hop = record.get("mesh_ip") or record["public_ip"]
    try:
        done = subprocess.run(
            [ssh, "-i", str(key), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
             "-o", "ConnectTimeout=15", f"root@{hop}",
             # Windows text-mode pipes rewrite LF as CRLF, so bash on the box sees a stray CR
             # script dies at line 1. The repo's VPS ops module strips it the same way.
             "tr -d '\\r' | bash -s"],
            input=script, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        return {"stage": "ssh", "http": 0, "error": "ssh timeout", "hop": "mesh" if record.get("mesh_ip") else "public"}
    answer: dict[str, Any] = {"stage": "ssh", "http": 0, "hop": "mesh" if record.get("mesh_ip") else "public"}
    if done.returncode != 0 and not (done.stdout or "").strip():
        # A hop that printed nothing is otherwise indistinguishable from a refused call.
        answer["error"] = (done.stderr or "").strip()[-160:] or f"ssh exit {done.returncode}"
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


def run(at: dt.datetime | None = None) -> dict[str, Any]:
    """One class, four boxes: the rota's host opens it, its auditor and two attendees join from their own."""
    boxes = fleet()
    out: dict[str, Any] = {"schema": SCHEMA, "command": "run", "observed_at": utc(),
                           "environment": "staging",
                           "identity_model": "FOUR_IDENTITIES_FOUR_MACHINES"}
    picked = cast(boxes, at or dt.datetime.now(dt.timezone.utc))
    out["rota"] = picked["rota"]
    if picked["state"] != "CAST":
        # Refused before any hop: the rota names who teaches, and no other box stands in.
        out.update({"state": "FAIL", "reason": picked["reason"], "checks": []})
        return out
    entries: dict[str, Guildmaster] = picked["entries"]
    host_box, join_boxes, outsider_box = picked["host"], picked["joiners"], picked["outsider"]
    out["host_persona"] = entries[host_box].slug
    out["joiner_personas"] = [entries[box].slug for box in join_boxes]
    out["auditor_seated"] = picked["auditor_seated"]
    needed = [host_box, *join_boxes]
    checks: list[dict] = []

    # Each box signs for itself and reports who it is and the IP it reached staging from.
    who: dict[str, dict] = {}
    for box in needed:
        answer = on_box(box, boxes[box], "WHOAMI")
        who[box] = answer
        note(checks, f"{entries[box].name} signs in on its own box", box, answer,
             "200 - the box's own CitadelKey", answer.get("http") == 200)
    out["seats"] = [{"box": b, "guildmaster": entries[b].name, "guild": entries[b].guild,
                     "persona": entries[b].slug,
                     "public_ip": boxes[b].get("public_ip"), "source_ip": who[b].get("ip"),
                     "email": who[b].get("email"), "uid": who[b].get("uid"),
                     "http": who[b].get("http")} for b in needed]
    if any(who[b].get("http") != 200 for b in needed):
        out.update({"state": "FAIL", "reason": "a guildmaster could not sign in on its box",
                    "checks": checks})
        return out
    out["distinct_source_ips"] = sorted({str(who[b].get("ip")) for b in needed})

    answer = on_box(host_box, boxes[host_box], "GET", "/api/collections/workspaces/records?perPage=10")
    owned = [w for w in ((answer.get("body") or {}).get("items") or [])
             if w.get("owner") == who[host_box].get("uid")]
    if not owned:
        out.update({"state": "FAIL", "reason": f"{entries[host_box].name} owns no workspace",
                    "checks": checks})
        return out
    workspace, name = owned[0]["id"], owned[0].get("name")
    out["workspace"] = {"id": workspace, "name": name}
    admin = f"/api/buildanddo/workspaces/{workspace}/admin"
    path = f"/api/buildanddo/workspaces/{workspace}/classrooms"
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")

    def admin_revision() -> int:
        got = on_box(host_box, boxes[host_box], "GET", admin)
        return int((((got.get("body") or {}).get("settings")) or {}).get("revision") or 0)

    # Membership is granted by the owner through the governed admin command. Writing
    # workspace_members directly is refused even to the owner.
    for box in join_boxes:
        answer = on_box(host_box, boxes[host_box], "POST", admin, {
            "action": "member.set",
            "payload": {"user": who[box].get("uid"), "role": "editor"},
            "revision": admin_revision(),
            "request_key": f"fleet-seat-{stamp}-{box}",
        })
        note(checks, f"host seats {entries[box].name} ({box})", host_box, answer,
             "200 - granted through the admin command", answer.get("http") == 200)

    lesson = ""
    got = on_box(host_box, boxes[host_box], "GET", "/api/collections/tutorials/records?perPage=1")
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

    host_gm = entries[host_box].name
    answer = command(host_box, "room.create", {
        "title": f"Fleet guildmaster class ({stamp})",
        # NEVER name the machine here. This string is stored in the product and shown to every
        # member; which box a guildmaster signs from is infrastructure, not classroom content.
        "description": f"Hosted by {host_gm}. Each guildmaster signs from its own seat.",
        "tutorial": lesson, "starts_at": "",
    }, 0)
    if not note(checks, f"{host_gm} schedules the class", host_box, answer, "200",
                answer.get("http") == 200):
        out.update({"state": "FAIL", "checks": checks, "halted_at": "room.create"})
        return out
    room = (answer.get("body") or {}).get("id")
    out["room"] = room

    answer = command(host_box, "room.start", {"id": room}, revision_from(host_box, room))
    note(checks, f"{host_gm} opens the class", host_box, answer, "200", answer.get("http") == 200)
    if lesson:
        answer = command(host_box, "room.lesson", {"id": room, "tutorial": lesson, "section": 1},
                         revision_from(host_box, room))
        note(checks, f"{host_gm} moves the class to section 1", host_box, answer, "200",
             answer.get("http") == 200)

    for box in join_boxes:
        gm = entries[box].name
        answer = command(box, "room.join", {"id": room}, revision_from(box, room))
        note(checks, f"{gm} joins from {box}", box, answer, "200", answer.get("http") == 200)
        answer = command(box, "room.message",
                         {"id": room,
                          "body": f"{gm} of the {entries[box].guild} guild, joining the class."},
                         revision_from(box, room))
        note(checks, f"{gm} speaks from {box}", box, answer, "200", answer.get("http") == 200)

    # CONTROL: a guildmaster with NO membership must be refused from its own box.
    # Every fleet box is already seated in this workspace, so simply reading as one of them
    # proves nothing - an earlier version of this control did exactly that and passed on a 200
    # that was correct behaviour. The host therefore revokes the outsider's membership, the
    # outsider's own box is refused, and the membership is put back. With no outsider box the
    # control is reported as not run, and the run cannot pass.
    out["control"] = {"state": "NOT_RUN",
                      "reason": "no box whose guildmaster is not cast is left in the fleet map"}
    if outsider_box is not None:
        outsider_gm = entries[outsider_box].name
        out["control"] = {"state": "RUN", "persona": entries[outsider_box].slug}
        outsider = on_box(outsider_box, boxes[outsider_box], "WHOAMI")
        revoked = on_box(host_box, boxes[host_box], "POST", admin, {
            "action": "member.remove", "payload": {"user": outsider.get("uid")},
            "revision": admin_revision(), "request_key": f"fleet-unseat-{stamp}-{outsider_box}",
        })
        note(checks, f"host unseats {outsider_gm} for the control", host_box, revoked,
             "200 - membership revoked through the admin command", revoked.get("http") == 200)
        answer = on_box(outsider_box, boxes[outsider_box], "GET", f"{path}/{room}")
        note(checks, f"CONTROL unseated {outsider_gm} refused from {outsider_box}",
             outsider_box, answer, "not 200 - membership was just revoked",
             answer.get("http") not in (200, 0))
        restored = on_box(host_box, boxes[host_box], "POST", admin, {
            "action": "member.set", "payload": {"user": outsider.get("uid"), "role": "editor"},
            "revision": admin_revision(), "request_key": f"fleet-reseat-{stamp}-{outsider_box}",
        })
        note(checks, f"{outsider_gm} is seated again afterwards", host_box, restored,
             "200 - the run leaves the workspace as it found it", restored.get("http") == 200)

    # Read the finished room back from a JOINER's box, not the host's.
    witness = join_boxes[0]
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
         and len(participants) >= len(join_boxes))

    broken = [c for c in checks if c["outcome"] != "AS_EXPECTED"]
    out["checks"] = checks
    out["summary"] = {"checks": len(checks), "machines": len(needed),
                      "distinct_source_ips": len(out.get("distinct_source_ips") or []),
                      "contract_broken": [c["check"] for c in broken],
                      "control": out["control"]["state"]}
    out["state"] = "PASS" if not broken and out["control"]["state"] == "RUN" else "FAIL"
    return out


def seats() -> dict[str, Any]:
    boxes = fleet()
    entries = placed(boxes)
    out: dict[str, Any] = {"schema": SCHEMA, "command": "seats", "observed_at": utc(), "seats": []}
    for box, record in sorted(boxes.items()):
        if box not in SSH_KEYS:
            continue
        entry = entries.get(box)
        answer = on_box(box, record, "WHOAMI")
        out["seats"].append({"box": box, "guildmaster": entry.name if entry else None,
                             "guild": entry.guild if entry else None,
                             "persona": entry.slug if entry else None,
                             "public_ip": record.get("public_ip"),
                             "http": answer.get("http"), "email": answer.get("email"),
                             "source_ip": answer.get("ip"), "error": answer.get("error")})
    out["state"] = "PASS" if any(s["http"] == 200 for s in out["seats"]) else "FAIL"
    return out


def selftest(at: dt.datetime | None = None) -> dict[str, Any]:
    """Offline: the fleet map, the ssh keys, the eight, and whether the rota class can be seated."""
    boxes = fleet()
    picked = cast(boxes, at or dt.datetime.now(dt.timezone.utc))
    return {"schema": SCHEMA, "command": "selftest", "observed_at": utc(),
            "fleet_map": str(FLEET), "fleet_map_present": FLEET.is_file(),
            "boxes_with_guildmasters": sorted(boxes),
            "ssh_keys_present": {b: (Path.home() / ".ssh" / k).is_file()
                                 for b, k in SSH_KEYS.items()},
            "guildmasters": list(ORDER), "rota": picked["rota"], "seated": picked["seated"],
            "cast": picked["state"], "reason": picked.get("reason"),
            "state": "PASS" if boxes else "FAIL"}


def table(result: dict[str, Any]) -> str:
    lines = [f"BUILDANDDO // FLEET GUILDMASTER CLASSROOM // {result.get('state')}",
             f"  staging  workspace={(result.get('workspace') or {}).get('name')}  room={result.get('room')}",
             f"  identity model: {result.get('identity_model')}   distinct source IPs: {result.get('distinct_source_ips')}"]
    plan = result.get("rota") or {}
    if plan:
        host, auditor = resolve(plan.get("host")), resolve(plan.get("auditor"))
        lines.append(f"  rota {plan.get('week')} slot {plan.get('slot')}: host {host.name if host else None}, "
                     f"auditor {auditor.name if auditor else None}, starts {plan.get('starts_at')}")
    if result.get("reason"):
        lines.append(f"  reason: {result['reason']}")
    for seat in result.get("seats", []):
        lines.append(f"    {str(seat.get('guildmaster')):<15} {str(seat.get('box')):<14} "
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
    control = result.get("control") or {}
    if control.get("state") == "NOT_RUN":
        lines.append(f"  CONTROL NOT RUN: {control.get('reason')}")
    lines.append("  RULE  each seat signed and called from its OWN box; this machine held no token")
    return "\n".join(lines)


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["run", "seats", "selftest"])
    ap.add_argument("--at", default=None, type=instant,
                    help="the instant whose rota class to hold (ISO 8601 with a zone); default: now")
    ap.add_argument("--json", action="store_true")
    return ap


def main() -> int:
    args = parser().parse_args()
    if args.cmd == "seats":
        result = seats()
    else:
        result = {"run": run, "selftest": selftest}[args.cmd](args.at)
    if args.json or args.cmd != "run":
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(table(result))
    return {"PASS": 0, "FAIL": 1}.get(str(result.get("state")), 1)


if __name__ == "__main__":
    raise SystemExit(main())
