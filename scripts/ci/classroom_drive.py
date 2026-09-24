#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/classroom_drive.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-CLASSROOM-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     tests/upgrade/test_classroom_native.py, apps/pocketbase/pb_hooks/classrooms.js,
#              apps/pocketbase/pb_hooks/classrooms.pb.js, apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
# EnumType:    Verifier
# EnumEdges:   VERIFIES the classroom command surface end to end without a browser, a fleet box,
#              a CitadelKey or any network credential
# Intent:      Make the classroom drivable and testable by an agent. One entry point that either
#              issues a single arbitrary command or runs a full multi-participant scenario against a
#              real PocketBase, and reports what the server actually said.
# ─────────────────────────────────────────────────────────────────────────────
"""classroom_drive.py - drive the BuildAndDo classroom as an agent, headless and offline.

    classroom_drive.py scenario [--json]
    classroom_drive.py command --action room.create --payload '{...}' [--revision N] [--as alice]
    classroom_drive.py actions
    classroom_drive.py selftest

WHY THIS EXISTS. Until now the classroom could only be exercised two ways: a browser, or
scripts/ci/ocn_room_probe.py running ON a fleet box with a CitadelKey that never leaves that box.
Neither is available to an agent working from anywhere else, so the room system could be configured
but not driven or tested. This drives the real hooks and the real migrations against a real
PocketBase binary, with four real accounts, and needs no network, no browser and no secret.

WHAT "PASS" MEANS HERE. A run in which every step returns 200 has NOT demonstrated a working
classroom - it has demonstrated an open one. The scenario therefore carries CONTROLS that must be
REFUSED, and the run fails if a control is accepted:

  * an outsider with no workspace membership must not read or join the room
  * a viewer must not host, start or end a class
  * a command carrying a stale revision must be refused, not silently applied
  * replaying one request_key must return the first receipt rather than acting twice

Every check records the HTTP status and the server's own message. Nothing is retried into success and
nothing is reported healthy because it was not reached.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
HARNESS = ROOT / "tests" / "upgrade"
# No hardcoded workstation path: this file is published to the public mirror, and an absolute
# path describes the operator's disk layout to anyone who reads it. BUILDANDDO_TEST_POCKETBASE
# was already the documented way to supply this - the three "set BUILDANDDO_TEST_POCKETBASE"
# messages below prove the code expected to run without a default - so the literal was only
# ever masking the case those messages exist to report.
DEFAULT_BINARY = ""
ACTIONS = ("room.create", "room.chat", "room.update", "room.start", "room.end", "room.lesson",
           "room.join", "room.leave", "room.message")
SCHEMA = "buildanddo.classroom-drive/v1"


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def binary() -> str:
    """The declared disposable runtime. Never downloads; reports its absence plainly."""
    return os.environ.get("BUILDANDDO_TEST_POCKETBASE") or DEFAULT_BINARY


def harness():
    """Import the native classroom fixture without importing the unittest runner's side effects."""
    if str(HARNESS) not in sys.path:
        sys.path.insert(0, str(HARNESS))
    argv = sys.argv
    sys.argv = [argv[0]]          # the fixture reads sys.argv for --require-binary
    try:
        import test_classroom_native as native
    finally:
        sys.argv = argv
    return native


class Driver:
    """One live classroom backend plus the four accounts the fixture provisions."""

    def __init__(self, native) -> None:
        self.native = native
        self.server = native.ClassroomServer(binary())
        self.tokens = {name: self.server.login(name)
                       for name in ("alice", "bravo", "viewer", "guest")}
        self.path = f"/api/buildanddo/workspaces/{native.WORKSPACE}/classrooms"
        self.sequence = 0

    def close(self) -> None:
        try:
            self.server.close()
        except Exception:                                  # noqa: BLE001 - teardown is not a verdict
            pass

    def command(self, action: str, payload: dict[str, Any], revision: int,
                actor: str = "alice", key: str = "") -> tuple[int, dict[str, Any]]:
        """Issue one bounded classroom command as one named account."""
        self.sequence += 1
        return self.server.request("POST", self.path, {
            "action": action,
            "payload": payload,
            "revision": revision,
            # The hook requires a retry key of 16..80 characters.
            "request_key": key or f"classroom-drive-{self.sequence:06}",
        }, token=self.tokens[actor])

    def detail(self, room: str, actor: str = "alice") -> tuple[int, dict[str, Any]]:
        return self.server.request("GET", f"{self.path}/{room}", token=self.tokens[actor])

    def lesson_id(self) -> str:
        return self.server.lesson["id"]

    def room_revision(self, room: str, actor: str = "alice") -> int:
        """Ask the server which revision the class is on.

        Counting locally drifts: join, leave and message are participation and do NOT bump the
        room's revision, so an optimistic counter runs ahead and every later host command is
        refused with 409. Reading it back is also what a real client does.
        """
        _, body = self.detail(room, actor)
        room_body = body.get("room") or body
        return int(room_body.get("revision") or 0)

    def membership_revision(self, room: str, actor: str) -> int:
        """This account's own membership revision, which room.leave must carry."""
        _, body = self.detail(room, actor)
        return int((body.get("membership") or {}).get("revision") or 0)


def record(checks: list[dict[str, Any]], name: str, status: int, body: dict[str, Any],
           expect: str, ok: bool) -> bool:
    """Append one measured check. `expect` states the contract in the run's own words."""
    checks.append({
        "check": name,
        "expect": expect,
        "http": status,
        "outcome": "AS_EXPECTED" if ok else "CONTRACT_BROKEN",
        "message": str(body.get("message") or "")[:160] or None,
    })
    return ok


def scenario() -> dict[str, Any]:
    """Drive a complete class: schedule, start, teach, join, discuss, leave, end - with controls."""
    out: dict[str, Any] = {"schema": SCHEMA, "command": "scenario", "observed_at": utc(),
                           "binary": binary(), "remote_writes": 0}
    if not Path(binary()).is_file():
        out.update({"state": "BLOCKED",
                    "reason": "Install the declared PocketBase runtime or set BUILDANDDO_TEST_POCKETBASE."})
        return out
    native = harness()
    driver = Driver(native)
    checks: list[dict[str, Any]] = []
    try:
        status, body = driver.command("room.create", {
            "title": "Agent-driven class", "description": "Driven headlessly by an agent.",
            "tutorial": driver.lesson_id(), "starts_at": "",
        }, 0)
        if not record(checks, "host schedules a class", status, body,
                      "200 - an editor may schedule", status == 200):
            out.update({"state": "FAIL", "checks": checks, "halted_at": "room.create"})
            return out
        room = body["id"]
        out["room"] = room
        revision = int(body.get("revision") or 1)

        # A replayed request_key must return the first receipt, not schedule a second class.
        again_status, again = driver.command("room.create", {
            "title": "Agent-driven class", "description": "Driven headlessly by an agent.",
            "tutorial": driver.lesson_id(), "starts_at": "",
        }, 0, key="classroom-drive-000001")
        record(checks, "CONTROL replayed request_key is idempotent", again_status, again,
               "the first room id, never a second room",
               again_status == 200 and again.get("id") == room)

        # A stale revision must be refused rather than silently applied.
        stale_status, stale = driver.command("room.start", {"id": room}, 0)
        record(checks, "CONTROL stale revision is refused", stale_status, stale,
               "not 200 - the command names a revision it is not acting on",
               stale_status != 200)

        status, body = driver.command("room.start", {"id": room}, driver.room_revision(room))
        record(checks, "host starts the class", status, body, "200", status == 200)

        status, body = driver.command("room.lesson",
                                      {"id": room, "tutorial": driver.lesson_id(), "section": 1},
                                      driver.room_revision(room))
        record(checks, "host moves the class to section 1", status, body, "200", status == 200)

        # A second real member joins. This is the point of a shared room.
        status, body = driver.command("room.join", {"id": room}, driver.room_revision(room), actor="bravo")
        record(checks, "a second member joins", status, body, "200", status == 200)

        status, body = driver.command("room.message",
                                      {"id": room, "body": "Driven by an agent, not a browser."},
                                      driver.room_revision(room), actor="bravo")
        record(checks, "a joined member speaks", status, body, "200", status == 200)

        # CONTROLS: the outsider and the viewer.
        status, body = driver.detail(room, actor="guest")
        record(checks, "CONTROL outsider cannot read the room", status, body,
               "not 200 - no workspace membership", status != 200)

        status, body = driver.command("room.end", {"id": room}, driver.room_revision(room), actor="viewer")
        record(checks, "CONTROL viewer cannot end the class", status, body,
               "not 200 - a viewer does not host", status != 200)

        status, body = driver.command("room.leave",
                                      {"id": room,
                                       "membership_revision": driver.membership_revision(room, "bravo")},
                                      driver.room_revision(room), actor="bravo")
        record(checks, "the member leaves", status, body, "200", status == 200)

        status, body = driver.command("room.end", {"id": room}, driver.room_revision(room))
        record(checks, "host ends the class", status, body, "200", status == 200)

        status, body = driver.detail(room)
        record(checks, "the finished class reads back", status, body,
               "200 with status ended",
               status == 200 and (body.get("room") or body).get("status") == "ended")
    finally:
        driver.close()

    broken = [c for c in checks if c["outcome"] != "AS_EXPECTED"]
    controls = [c for c in checks if c["check"].startswith("CONTROL")]
    out.update({
        "checks": checks,
        "summary": {
            "checks": len(checks),
            "controls": len(controls),
            "contract_broken": [c["check"] for c in broken],
        },
        "state": "PASS" if not broken else "FAIL",
    })
    return out


def chatroom() -> dict[str, Any]:
    """Open a chatroom and prove it is a room of a DIFFERENT kind, not a class in disguise."""
    out: dict[str, Any] = {"schema": SCHEMA, "command": "chatroom", "observed_at": utc(),
                           "binary": binary(), "remote_writes": 0}
    if not Path(binary()).is_file():
        out.update({"state": "BLOCKED",
                    "reason": "Install the declared PocketBase runtime or set BUILDANDDO_TEST_POCKETBASE."})
        return out
    native = harness()
    driver = Driver(native)
    checks: list[dict[str, Any]] = []
    try:
        status, body = driver.command("room.chat", {
            "title": "Builders' chatroom",
            "description": "An open conversation, no lesson.",
        }, 0)
        if not record(checks, "host opens a chatroom", status, body,
                      "200 - room.chat takes only a title and a description", status == 200):
            out.update({"state": "FAIL", "checks": checks, "halted_at": "room.chat"})
            return out
        room = body["id"]
        out["room"] = room

        status, body = driver.detail(room)
        room_body = body.get("room") or body
        record(checks, "the chatroom is open immediately", status, body,
               "kind chat, status live - a chatroom is not scheduled",
               status == 200 and room_body.get("kind") == "chat"
               and room_body.get("status") == "live")

        status, body = driver.command("room.join", {"id": room}, driver.room_revision(room),
                                      actor="bravo")
        record(checks, "a member joins the chatroom", status, body, "200", status == 200)
        status, body = driver.command("room.message",
                                      {"id": room, "body": "Talking, not being taught."},
                                      driver.room_revision(room), actor="bravo")
        record(checks, "a member speaks in the chatroom", status, body, "200", status == 200)

        # CONTROL: the two kinds must not be interchangeable.
        status, body = driver.command("room.lesson",
                                      {"id": room, "tutorial": driver.lesson_id(), "section": 1},
                                      driver.room_revision(room))
        record(checks, "CONTROL a chatroom refuses a lesson", status, body,
               "not 200 - teaching belongs to a classroom", status != 200)

        status, body = driver.detail(room, actor="guest")
        record(checks, "CONTROL outsider cannot read the chatroom", status, body,
               "not 200 - no workspace membership", status != 200)

        # And a classroom must still be a classroom.
        status, body = driver.command("room.create", {
            "title": "Still a class", "description": "The other kind.",
            "tutorial": driver.lesson_id(), "starts_at": "",
        }, 0)
        klass = body.get("id") if status == 200 else ""
        record(checks, "a classroom is still created as a class", status, body,
               "200 and kind class, scheduled", status == 200)
        if klass:
            status, body = driver.detail(klass)
            room_body = body.get("room") or body
            record(checks, "the classroom kind is unchanged", status, body,
                   "kind class, status scheduled",
                   status == 200 and room_body.get("kind") == "class"
                   and room_body.get("status") == "scheduled")
    finally:
        driver.close()
    broken = [c for c in checks if c["outcome"] != "AS_EXPECTED"]
    out["checks"] = checks
    out["summary"] = {"checks": len(checks), "contract_broken": [c["check"] for c in broken]}
    out["state"] = "PASS" if not broken else "FAIL"
    return out


def single(action: str, payload: str, revision: int, actor: str) -> dict[str, Any]:
    """Issue one arbitrary command, so an agent can explore the surface rather than a fixed script."""
    out: dict[str, Any] = {"schema": SCHEMA, "command": "command", "action": action,
                           "actor": actor, "observed_at": utc(), "remote_writes": 0}
    if action not in ACTIONS:
        out.update({"state": "FAIL", "reason": f"unknown action; choose one of {', '.join(ACTIONS)}"})
        return out
    if not Path(binary()).is_file():
        out.update({"state": "BLOCKED",
                    "reason": "Install the declared PocketBase runtime or set BUILDANDDO_TEST_POCKETBASE."})
        return out
    try:
        body = json.loads(payload)
    except Exception as error:                              # noqa: BLE001
        out.update({"state": "FAIL", "reason": f"payload is not JSON: {error}"})
        return out
    native = harness()
    driver = Driver(native)
    try:
        status, answer = driver.command(action, body, revision, actor=actor)
        out.update({"http": status, "result": answer if status == 200 else None,
                    "message": str(answer.get("message") or "")[:200] or None,
                    "fields": sorted((answer.get("data") or {}).keys())[:8] or None,
                    "state": "OK" if status == 200 else "REFUSED"})
    finally:
        driver.close()
    return out


def selftest() -> dict[str, Any]:
    """Offline: the harness imports, the action list is closed and the runtime is named."""
    out: dict[str, Any] = {"schema": SCHEMA, "command": "selftest", "observed_at": utc(),
                           "remote_writes": 0, "binary": binary(),
                           "binary_present": Path(binary()).is_file()}
    try:
        native = harness()
        out["harness"] = {"imported": True, "workspace": native.WORKSPACE,
                          "has_server": hasattr(native, "ClassroomServer")}
    except Exception as error:                              # noqa: BLE001
        out.update({"state": "FAIL", "reason": f"{type(error).__name__}: {error}"})
        return out
    out["actions"] = list(ACTIONS)
    out["state"] = "PASS" if out["harness"]["has_server"] else "FAIL"
    return out


def table(result: dict[str, Any]) -> str:
    lines = [f"BUILDANDDO // CLASSROOM DRIVE // {result.get('state')}",
             f"  room {result.get('room') or '-'}   binary {result.get('binary') or '-'}"]
    for check in result.get("checks", []):
        mark = "ok " if check["outcome"] == "AS_EXPECTED" else "BAD"
        lines.append(f"  [{mark}] {check['check']:<46} http={check['http']:<4} {check['expect']}")
        if check.get("message"):
            lines.append(f"         said: {check['message']}")
    broken = (result.get("summary") or {}).get("contract_broken")
    if broken:
        lines.append(f"  CONTRACT BROKEN: {', '.join(broken)}")
    lines.append("  RULE  a run where nothing is refused has demonstrated an open classroom, not a working one")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["scenario", "chatroom", "command", "actions", "selftest"])
    ap.add_argument("--action", default="")
    ap.add_argument("--payload", default="{}")
    ap.add_argument("--revision", type=int, default=0)
    ap.add_argument("--as", dest="actor", default="alice",
                    choices=["alice", "bravo", "viewer", "guest"])
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if args.cmd == "actions":
        print(json.dumps({"schema": SCHEMA, "actions": list(ACTIONS),
                          "actors": ["alice", "bravo", "viewer", "guest"]}, indent=2))
        return 0
    if args.cmd == "selftest":
        result = selftest()
    elif args.cmd == "command":
        result = single(args.action, args.payload, args.revision, args.actor)
    elif args.cmd == "chatroom":
        result = chatroom()
    else:
        result = scenario()

    if args.json or args.cmd in ("selftest", "command"):
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(table(result))
    return {"PASS": 0, "OK": 0, "FAIL": 1, "REFUSED": 1, "BLOCKED": 2}.get(str(result.get("state")), 1)


if __name__ == "__main__":
    raise SystemExit(main())
