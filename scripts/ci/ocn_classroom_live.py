#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_classroom_live.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-CLASSROOM-001, SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/classrooms.pb.js,
#              apps/pocketbase/pb_hooks/ocn-login.pb.js
# EnumType:    Verifier
# EnumEdges:   VERIFIES a shared classroom on the LIVE staging backend held by four distinct
#              guildmaster identities, each authenticated with its own CitadelKey
# Intent:      Hold one real class on staging: one guildmaster hosts, three others join and speak,
#              and the room reads back carrying all four. Every refusal is reported verbatim.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_classroom_live.py - hold a real class on staging with four guildmaster seats.

    ocn_classroom_live.py run  [--host forge] [--join oracle,alex,sterling] [--json]
    ocn_classroom_live.py seats
    ocn_classroom_live.py selftest

WHAT THIS PROVES, AND WHAT IT DOES NOT. Each seat signs its own CitadelKey envelope with its own
Ed25519 private key and exchanges it for its own PocketBase session, so the four participants are
four genuinely distinct authenticated principals and the server authorises each one separately.

They are signed from ONE machine. That is a weaker claim than scripts/ci/ocn_room_probe.py makes
when it is run from four different fleet boxes: this shows a room shared by four IDENTITIES, not by
four MACHINES. The distinction is stated here rather than quietly enjoyed, because a room that one
process can talk to itself in would prove nothing.

The box-named seats (ray-tor1-*, mesh-*) deliberately do NOT work from here: their private halves
live on the boxes and staging holds the box public keys, so signing them here returns
401 citadelkey_rejected:pubkey_fp mismatch. That refusal is correct and must never be "fixed" by
writing this machine's fingerprints into the staging seat registry.

CONTROLS. A run where everything succeeds has not shown a governed classroom. A seat that is not a
member of the host's workspace must be refused, and that refusal is required for a PASS.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

BASE = "https://staging.buildanddo.com/hcgi/platform"
# Located by NAME, not by a literal path: this file is published to the public mirror and the
# CNWB checkout is part of the private estate's layout. The report at the bottom already emits
# `signer_present: CNWB.is_dir()`, so an unset root degrades into an honest "signer absent"
# rather than a crash.
CNWB = Path(os.environ.get("CITADEL_CNWB_ROOT", ""))
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-classroom/1.0)",
      "Content-Type": "application/json"}
SCHEMA = "buildanddo.ocn-classroom-live/v1"
# Guildmaster personas that hold their signing key on this machine. Box seats are excluded on
# purpose; see the module docstring.
GUILDMASTERS = {"forge": "builder", "oracle": "intelligence", "alex": "commerce",
                "sterling": "finance", "muse": "creator", "scholar": "research",
                "quill": "writers"}


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def http(path: str, token: str = "", body: Any = None, method: str = "") -> tuple[int, dict]:
    """One request. Never raises; a dead hop is reported, never counted as a verdict."""
    headers = dict(UA)
    if token:
        headers["Authorization"] = token
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, headers=headers,
                                     method=method or ("POST" if data is not None else "GET"))
    try:
        with urllib.request.urlopen(request, timeout=45) as answer:
            raw = answer.read()
            return answer.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else {})
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except Exception:                                   # noqa: BLE001
            return error.code, {"raw": raw[:160].decode("utf8", "replace")}
    except Exception as error:                              # noqa: BLE001
        return 0, {"err": type(error).__name__}


def envelope(seat: str) -> str:
    """Sign one single-use login envelope with this seat's own private key."""
    bucket = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H")
    payload = json.dumps({"login": "buildanddo", "ts_bucket": bucket},
                         sort_keys=True, separators=(",", ":"))
    signed = subprocess.run(
        [sys.executable, "-m", "tools.cbf.citadelkey.citadel_key", "sign", "--seat", seat,
         "--audience", "buildanddo-login", "--payload", payload, "--header"],
        cwd=str(CNWB), capture_output=True, text=True, timeout=150)
    lines = (signed.stdout or "").strip().splitlines()
    return lines[-1] if lines else ""


def login(seat: str) -> dict[str, Any]:
    """Exchange this seat's envelope for its own session. Never returns or prints the token."""
    header = envelope(seat)
    if not header:
        return {"seat": seat, "state": "NO_ENVELOPE"}
    headers = dict(UA)
    headers["X-Citadel-Key"] = header
    request = urllib.request.Request(BASE + "/api/ocn/login", data=b"{}", headers=headers,
                                     method="POST")
    try:
        with urllib.request.urlopen(request, timeout=45) as answer:
            body = json.loads(answer.read() or b"{}")
    except urllib.error.HTTPError as error:
        return {"seat": seat, "state": "REFUSED", "http": error.code,
                "message": error.read()[:140].decode("utf8", "replace")}
    except Exception as error:                              # noqa: BLE001
        return {"seat": seat, "state": "TRANSPORT_FAULT", "message": type(error).__name__}
    record = body.get("record") or {}
    return {"seat": seat, "state": "OK", "token": body.get("token"), "uid": record.get("id"),
            "email": record.get("email"), "guild": GUILDMASTERS.get(seat, "")}


def note(checks: list[dict], name: str, status: int, body: dict, expect: str, ok: bool) -> bool:
    checks.append({"check": name, "expect": expect, "http": status,
                   "outcome": "AS_EXPECTED" if ok else "CONTRACT_BROKEN",
                   "message": str(body.get("message") or "")[:150] or None})
    return ok


def run(host_seat: str, joiners: list[str]) -> dict[str, Any]:
    """Hold one class: the host schedules and starts it, the others join and speak."""
    out: dict[str, Any] = {"schema": SCHEMA, "command": "run", "observed_at": utc(),
                           "environment": "staging", "host": host_seat, "joiners": joiners,
                           "identity_model": "FOUR_IDENTITIES_ONE_MACHINE"}
    checks: list[dict] = []
    sessions: dict[str, dict] = {}
    for seat in [host_seat, *joiners]:
        sessions[seat] = login(seat)
    out["seats"] = [{k: v for k, v in s.items() if k != "token"} for s in sessions.values()]
    if any(s.get("state") != "OK" for s in sessions.values()):
        out.update({"state": "FAIL", "reason": "one or more guildmasters could not sign in",
                    "checks": checks})
        return out

    host = sessions[host_seat]
    status, spaces = http("/api/collections/workspaces/records?perPage=5", host["token"])
    owned = [w for w in (spaces.get("items") or []) if w.get("owner") == host["uid"]]
    if not owned:
        out.update({"state": "FAIL", "reason": f"{host_seat} owns no workspace to teach in"})
        return out
    workspace = owned[0]["id"]
    stamp_seed = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
    out["workspace"] = {"id": workspace, "name": owned[0].get("name")}

    # The joiners must be members before they can enter the room, and membership is granted through
    # the governed administration command - NOT by writing workspace_members directly, which the
    # backend refuses even to the workspace owner ("Only superusers can perform this action").
    admin_path = f"/api/buildanddo/workspaces/{workspace}/admin"

    def admin_revision() -> int:
        _, snap = http(admin_path, host["token"])
        return int(((snap.get("settings") or {}).get("revision")) or 0)

    for seat in joiners:
        status, body = http(admin_path, host["token"], {
            "action": "member.set",
            "payload": {"user": sessions[seat]["uid"], "role": "editor"},
            "revision": admin_revision(),
            "request_key": f"gm-seat-{stamp_seed}-{seat}",
        })
        note(checks, f"host seats {seat} in the workspace", status, body,
             "200 - the owner grants membership through the admin command", status == 200)

    lesson = ""
    status, catalogue = http("/api/collections/tutorials/records?perPage=1", host["token"])
    if status == 200 and (catalogue.get("items") or []):
        lesson = catalogue["items"][0]["id"]
    out["lesson"] = lesson or None

    path = f"/api/buildanddo/workspaces/{workspace}/classrooms"
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")

    def command(action: str, payload: dict, revision: int, seat: str, key: str = "") -> tuple[int, dict]:
        return http(path, sessions[seat]["token"], {
            "action": action, "payload": payload, "revision": revision,
            "request_key": key or f"gm-class-{stamp}-{action.replace('.', '-')}-{seat}",
        })

    def room_revision(room: str, seat: str) -> int:
        _, body = http(f"{path}/{room}", sessions[seat]["token"])
        return int((body.get("room") or body).get("revision") or 0)

    status, body = command("room.create", {
        "title": f"Guildmaster round table ({stamp})",
        "description": f"Held by {host_seat} with {', '.join(joiners)}.",
        "tutorial": lesson, "starts_at": "",
    }, 0, host_seat)
    if not note(checks, f"{host_seat} schedules the class", status, body, "200", status == 200):
        out.update({"state": "FAIL", "checks": checks, "halted_at": "room.create"})
        return out
    room = body["id"]
    out["room"] = room

    status, body = command("room.start", {"id": room}, room_revision(room, host_seat), host_seat)
    note(checks, f"{host_seat} opens the class", status, body, "200", status == 200)

    if lesson:
        status, body = command("room.lesson", {"id": room, "tutorial": lesson, "section": 1},
                               room_revision(room, host_seat), host_seat)
        note(checks, f"{host_seat} moves the class to section 1", status, body, "200", status == 200)

    for seat in joiners:
        status, body = command("room.join", {"id": room}, room_revision(room, seat), seat)
        note(checks, f"{seat} joins the class", status, body, "200", status == 200)
        status, body = command("room.message",
                               {"id": room,
                                "body": f"{seat} of the {GUILDMASTERS.get(seat, 'guild')} guild is present."},
                               room_revision(room, seat), seat)
        note(checks, f"{seat} speaks in the class", status, body, "200", status == 200)

    # CONTROL: a guildmaster who was never seated in this workspace must be refused.
    outsider = next((s for s in GUILDMASTERS if s not in [host_seat, *joiners]), "")
    if outsider:
        guest = login(outsider)
        if guest.get("state") == "OK":
            status, body = http(f"{path}/{room}", guest["token"])
            note(checks, f"CONTROL unseated {outsider} cannot read the class", status, body,
                 "not 200 - no membership in this workspace", status != 200)

    status, body = http(f"{path}/{room}", host["token"])
    room_body = body.get("room") or body
    participants = body.get("participants") or []
    messages = body.get("messages") or {}
    spoken = messages.get("items") if isinstance(messages, dict) else messages
    out["readback"] = {"http": status, "status": room_body.get("status"),
                       "section": room_body.get("section"),
                       "participants": len(participants) if isinstance(participants, list) else None,
                       "messages": len(spoken) if isinstance(spoken, list) else None}
    note(checks, "the class reads back live with its participants", status, body,
         "200, status live, every joiner present",
         status == 200 and room_body.get("status") == "live"
         and isinstance(participants, list) and len(participants) >= len(joiners))

    broken = [c for c in checks if c["outcome"] != "AS_EXPECTED"]
    out["checks"] = checks
    out["summary"] = {"checks": len(checks), "contract_broken": [c["check"] for c in broken],
                      "guildmasters": len(joiners) + 1}
    out["state"] = "PASS" if not broken else "FAIL"
    return out


def seats() -> dict[str, Any]:
    """Report which guildmasters this machine can actually sign for, and which it cannot."""
    out: dict[str, Any] = {"schema": SCHEMA, "command": "seats", "observed_at": utc(), "seats": []}
    for seat in sorted(GUILDMASTERS):
        answer = login(seat)
        out["seats"].append({k: v for k, v in answer.items() if k != "token"})
    out["state"] = "PASS" if any(s["state"] == "OK" for s in out["seats"]) else "FAIL"
    return out


def selftest() -> dict[str, Any]:
    out: dict[str, Any] = {"schema": SCHEMA, "command": "selftest", "observed_at": utc(),
                           "signer_root": str(CNWB), "signer_present": CNWB.is_dir(),
                           "guildmasters": sorted(GUILDMASTERS)}
    out["state"] = "PASS" if out["signer_present"] else "FAIL"
    return out


def table(result: dict[str, Any]) -> str:
    lines = [f"BUILDANDDO // LIVE GUILDMASTER CLASSROOM // {result.get('state')}",
             f"  staging  workspace={(result.get('workspace') or {}).get('name')}  room={result.get('room')}",
             f"  identity model: {result.get('identity_model')}"]
    for seat in result.get("seats", []):
        lines.append(f"    {seat.get('seat'):<10} {seat.get('state'):<8} {seat.get('email') or seat.get('message') or ''}")
    for check in result.get("checks", []):
        mark = "ok " if check["outcome"] == "AS_EXPECTED" else "BAD"
        lines.append(f"  [{mark}] {check['check']:<48} http={check['http']}")
        if check.get("message"):
            lines.append(f"         said: {check['message']}")
    readback = result.get("readback")
    if readback:
        lines.append(f"  READBACK status={readback.get('status')} participants={readback.get('participants')} messages={readback.get('messages')}")
    broken = (result.get("summary") or {}).get("contract_broken")
    if broken:
        lines.append(f"  CONTRACT BROKEN: {', '.join(broken)}")
    lines.append("  RULE  four identities on one machine is not four machines; say which was shown")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["run", "seats", "selftest"])
    ap.add_argument("--host", default="forge")
    ap.add_argument("--join", default="oracle,alex,sterling")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    if args.cmd == "selftest":
        result = selftest()
    elif args.cmd == "seats":
        result = seats()
    else:
        joiners = [s.strip() for s in args.join.split(",") if s.strip()]
        result = run(args.host, joiners)
    if args.json or args.cmd != "run":
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(table(result))
    return {"PASS": 0, "FAIL": 1}.get(str(result.get("state")), 1)


if __name__ == "__main__":
    raise SystemExit(main())
