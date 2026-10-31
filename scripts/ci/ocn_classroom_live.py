#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_classroom_live.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-CLASSROOM-001, SRS-BUILDANDDO-LIVE-UTILIZATION-001, SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        C-ONE, BITS-CODEGEN (the rota cast)
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/classrooms.pb.js,
#              apps/pocketbase/pb_hooks/ocn-login.pb.js, libs/guildmasters/__init__.py,
#              libs/guildmasters/rota.py
# EnumType:    Verifier
# EnumEdges:   VERIFIES a shared classroom on the LIVE staging backend held by four distinct
#              guildmaster identities, each authenticated with its own CitadelKey;
#              CONSUMES libs/guildmasters/__init__.py; CONSUMES libs/guildmasters/rota.py;
#              VERIFIED_BY tests/upgrade/test_ocn_classroom_rota.py
# Intent:      Hold one real class on staging: the rota's host teaches, its auditor and two other
#              attendees join and speak, and the room reads back carrying all four. Every refusal is
#              reported verbatim.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_classroom_live.py - hold a real class on staging with four guildmaster seats.

    ocn_classroom_live.py run  [--at ISO] [--host SEAT] [--join SEAT,SEAT,SEAT] [--json]
    ocn_classroom_live.py seats
    ocn_classroom_live.py selftest [--at ISO]

WHO TEACHES. The weekly guild class rota (libs/guildmasters/rota.py, the same rota the server's
guild_class_rota cron schedules) decides the cast. The class happening now or next names the host;
the joiners are its auditor and then the next two attendees in rota order; the first attendee left
over who is not already a member of the host's workspace is the CONTROL outsider. --at fixes the
instant, so a run can be reproduced. --host and --join
override the rota by seat id (forge, scholar, oracle, alex, sterling, muse, quill, director); there
is no Forge default, and an unknown seat or a joiner who is the host is refused before any request.

WHAT THIS PROVES, AND WHAT IT DOES NOT. Each seat signs its own CitadelKey envelope with its own
Ed25519 private key and exchanges it for its own PocketBase session, so the four participants are
four genuinely distinct authenticated principals and the server authorises each one separately.

They are signed from ONE machine. That is a weaker claim than scripts/ci/ocn_room_probe.py makes
when it is run from four different fleet boxes: this shows a room shared by four IDENTITIES, not by
four MACHINES. The distinction is stated here rather than quietly enjoyed, because a room that one
process can talk to itself in would prove nothing.

The box-named seats deliberately do NOT work from here: their private halves
live on the boxes and staging holds the box public keys, so signing them here returns
401 citadelkey_rejected:pubkey_fp mismatch. That refusal is correct and must never be "fixed" by
writing this machine's fingerprints into the staging seat registry.

CONTROLS. A run where everything succeeds has not shown a governed classroom. A seat that is not a
member of the host's workspace must be refused, and that refusal is required for a PASS. Every run
seats its joiners in the host's workspace and none removes them, so the outsider is checked against
the host's member list first: a seat an earlier run made a member is skipped, never used as the
control. A run with no outsider left to try, whose member list cannot be read, or whose outsider
cannot sign in, reports the control as not run and fails.
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

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.guildmasters import GUILDMASTERS as CANON, ORDER, by_seat  # noqa: E402
from libs.guildmasters import rota  # noqa: E402

BASE = "https://staging.buildanddo.com/hcgi/platform"
# Located by NAME, not by a literal path: this file is published to the public mirror and the
# CNWB checkout is part of the private estate's layout. The report at the bottom already emits
# `signer_present: CNWB.is_dir()`, so an unset root degrades into an honest "signer absent"
# rather than a crash.
CNWB = Path(os.environ.get("CITADEL_CNWB_ROOT", ""))
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-classroom/1.0)",
      "Content-Type": "application/json"}
SCHEMA = "buildanddo.ocn-classroom-live/v1"
# The eight guildmaster persona seats, seat id -> guild, from the canonical registry rather than a
# copy of it: an earlier copy here had seven and no Director Nexus. Box seats are excluded on
# purpose; see the module docstring.
GUILDMASTERS = {g.seat: g.guild for g in CANON}
ROTA_KEYS = ("week", "slot", "host", "auditor", "starts_at")
# The admin snapshot lists members 20 to a page; a list longer than this many pages is not read.
MEMBER_PAGES = 50


def display(seat: str) -> str:
    """The canonical display name of a seat, for labels and messages."""
    entry = by_seat(seat)
    return entry.name if entry else seat


def persona(seat: str) -> str:
    """The public persona slug of a seat: director -> director-nexus."""
    entry = by_seat(seat)
    return entry.slug if entry else ""


def instant(text: str) -> dt.datetime:
    """--at: an ISO 8601 instant with a zone. A naive time is ambiguous and refused, as the rota does."""
    try:
        value = dt.datetime.fromisoformat(text.strip().replace("Z", "+00:00"))
    except ValueError:
        raise argparse.ArgumentTypeError("choose --at as an ISO 8601 instant, e.g. 2026-11-02T15:00Z") from None
    if value.tzinfo is None or value.utcoffset() is None:
        raise argparse.ArgumentTypeError("give --at a zone (Z or +hh:mm); a naive time is ambiguous")
    return value.astimezone(dt.timezone.utc)


def _shown(value: object) -> str:
    return repr(str(value)[:40])


def _pool(plan: dict[str, Any], host: str) -> list[str]:
    """Everyone but the host, in rota order: the class's attendees, then its scheduled host."""
    return [seat for seat in [*plan["attendees"], plan["host"]] if seat != host]


def participants(at: dt.datetime, host: str | None = None,
                 join: list[str] | None = None) -> tuple[str, list[str], dict[str, Any]]:
    """The cast for the rota class at `at`: (host, joiners, that rota class).

    The host defaults to the class's host. The joiners default to its auditor, then the next two
    attendees other than the auditor, in rota order. Raises ValueError, whose text starts
    'not a guildmaster seat', for an unknown seat or a joiner who is the host - before any request.
    """
    plan = rota.current(at)
    chosen = plan["host"] if host is None else host
    if not by_seat(chosen):
        raise ValueError(f"not a guildmaster seat: {_shown(chosen)}")
    pool = _pool(plan, chosen)
    if join is None:
        first = [plan["auditor"]] if plan["auditor"] != chosen else []
        return chosen, first + [s for s in pool if s not in first][:3 - len(first)], plan
    if not join:
        raise ValueError("not a guildmaster seat: --join named no seat")
    for seat in join:
        if not by_seat(seat):
            raise ValueError(f"not a guildmaster seat: {_shown(seat)}")
        if seat == chosen:
            raise ValueError(f"not a guildmaster seat to join: {seat} hosts this class")
    if len(set(join)) != len(join):
        raise ValueError("not a guildmaster seat to join twice: each joiner is one seat")
    return chosen, list(join), plan


def outsiders(plan: dict[str, Any], host: str, joiners: list[str]) -> list[str]:
    """The CONTROL candidates: every rota attendee not cast, in rota order."""
    return [seat for seat in _pool(plan, host) if seat not in joiners]


def outsider_of(plan: dict[str, Any], host: str, joiners: list[str]) -> str:
    """The first CONTROL candidate, or '' when everyone is cast. Offline, this cannot know who is
    already a member of the host's workspace; run() skips any candidate that is."""
    return next(iter(outsiders(plan, host, joiners)), "")


def members_of(admin_path: str, token: str) -> set[str] | None:
    """Every member account id of the host's workspace, from its admin snapshot.

    None when a page is refused or malformed, or the list runs past MEMBER_PAGES: a member list that
    cannot be read cannot show that an outsider is outside.
    """
    found: set[str] = set()
    for page in range(1, MEMBER_PAGES + 1):
        status, snapshot = http(f"{admin_path}?members_page={page}", token)
        members = snapshot.get("members") if status == 200 and isinstance(snapshot, dict) else None
        items = members.get("items") if isinstance(members, dict) else None
        if not isinstance(items, list) or not isinstance(members.get("has_more"), bool):
            return None
        found.update(str(item["user"]) for item in items if isinstance(item, dict) and item.get("user"))
        if not members["has_more"]:
            return found
    return None


def rota_of(plan: dict[str, Any]) -> dict[str, Any]:
    return {key: plan[key] for key in ROTA_KEYS}


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


def refused(reason: str) -> dict[str, Any]:
    """A run that never started: the cast named something that is not a guildmaster seat."""
    return {"schema": SCHEMA, "command": "run", "observed_at": utc(), "environment": "staging",
            "identity_model": "FOUR_IDENTITIES_ONE_MACHINE", "seats": [], "checks": [],
            "state": "FAIL", "reason": reason}


def run(host_seat: str, joiners: list[str], plan: dict[str, Any]) -> dict[str, Any]:
    """Hold one class: the host schedules and starts it, the others join and speak."""
    out: dict[str, Any] = {"schema": SCHEMA, "command": "run", "observed_at": utc(),
                           "environment": "staging", "host": host_seat, "joiners": joiners,
                           "host_persona": persona(host_seat),
                           "joiner_personas": [persona(seat) for seat in joiners],
                           "rota": rota_of(plan), "outsider": None, "already_seated": [],
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
        out.update({"state": "FAIL", "reason": f"{display(host_seat)} owns no workspace to teach in"})
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
        note(checks, f"host seats {display(seat)} in the workspace", status, body,
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
        "description": f"Held by {display(host_seat)} with {', '.join(display(s) for s in joiners)}.",
        "tutorial": lesson, "starts_at": "",
    }, 0, host_seat)
    if not note(checks, f"{display(host_seat)} schedules the class", status, body, "200", status == 200):
        out.update({"state": "FAIL", "checks": checks, "halted_at": "room.create"})
        return out
    room = body["id"]
    out["room"] = room

    status, body = command("room.start", {"id": room}, room_revision(room, host_seat), host_seat)
    note(checks, f"{display(host_seat)} opens the class", status, body, "200", status == 200)

    if lesson:
        status, body = command("room.lesson", {"id": room, "tutorial": lesson, "section": 1},
                               room_revision(room, host_seat), host_seat)
        note(checks, f"{display(host_seat)} moves the class to section 1", status, body, "200", status == 200)

    for seat in joiners:
        status, body = command("room.join", {"id": room}, room_revision(room, seat), seat)
        note(checks, f"{display(seat)} joins the class", status, body, "200", status == 200)
        status, body = command("room.message",
                               {"id": room,
                                "body": f"{display(seat)} of the {GUILDMASTERS.get(seat, 'guild')} guild is present."},
                               room_revision(room, seat), seat)
        note(checks, f"{display(seat)} speaks in the class", status, body, "200", status == 200)

    # CONTROL: a guildmaster who is not a member of this workspace must be refused. Runs seat their
    # joiners here and never remove them, so a rota attendee left over may already be a member from an
    # earlier run; that seat would read the class and break a contract the server kept. The outsider
    # is the first candidate the host's member list does not hold. A control that could not run is
    # reported, never skipped.
    out["control"] = {"state": "NOT_RUN", "reason": "every guildmaster is cast"}
    candidates = outsiders(plan, host_seat, joiners)
    members = members_of(admin_path, host["token"]) if candidates else set()
    if members is None:
        out["control"] = {"state": "NOT_RUN", "reason": "the host's workspace members could not be read"}
        candidates = []
    for seat in candidates:
        guest = login(seat)
        if guest.get("state") != "OK" or not guest.get("uid"):
            out["outsider"] = seat
            out["control"] = {"state": "NOT_RUN", "persona": persona(seat),
                              "reason": f"the outsider could not sign in ({guest.get('state')})"}
            break
        if guest["uid"] in members:
            out["already_seated"].append(seat)
            continue
        out["outsider"] = seat
        status, body = http(f"{path}/{room}", guest["token"])
        note(checks, f"CONTROL unseated {display(seat)} cannot read the class", status, body,
             "not 200 - no membership in this workspace", status != 200)
        out["control"] = {"state": "RUN", "persona": persona(seat)}
        break
    else:
        if out["already_seated"]:
            out["control"] = {"state": "NOT_RUN",
                              "reason": "every guildmaster left over is already a member of the host's workspace"}

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
                      "guildmasters": len(joiners) + 1, "control": out["control"]["state"]}
    out["state"] = "PASS" if not broken and out["control"]["state"] == "RUN" else "FAIL"
    return out


def seats() -> dict[str, Any]:
    """Report which guildmasters this machine can actually sign for, and which it cannot."""
    out: dict[str, Any] = {"schema": SCHEMA, "command": "seats", "observed_at": utc(), "seats": []}
    for seat in ORDER:
        answer = login(seat)
        out["seats"].append({k: v for k, v in answer.items() if k != "token"})
    out["state"] = "PASS" if any(s["state"] == "OK" for s in out["seats"]) else "FAIL"
    return out


def selftest(at: dt.datetime | None = None) -> dict[str, Any]:
    """Offline: the signer root, the eight seats, and the rota class and cast a run would use now."""
    host, joiners, plan = participants(at or dt.datetime.now(dt.timezone.utc))
    out: dict[str, Any] = {"schema": SCHEMA, "command": "selftest", "observed_at": utc(),
                           "signer_root": str(CNWB), "signer_present": CNWB.is_dir(),
                           "guildmasters": list(ORDER), "rota": rota_of(plan),
                           "cast": {"host": host, "joiners": joiners,
                                    "outsider": outsider_of(plan, host, joiners) or None}}
    out["state"] = "PASS" if out["signer_present"] and len(GUILDMASTERS) == 8 else "FAIL"
    return out


def table(result: dict[str, Any]) -> str:
    lines = [f"BUILDANDDO // LIVE GUILDMASTER CLASSROOM // {result.get('state')}",
             f"  staging  workspace={(result.get('workspace') or {}).get('name')}  room={result.get('room')}",
             f"  identity model: {result.get('identity_model')}"]
    plan = result.get("rota") or {}
    if plan:
        lines.append(f"  rota {plan.get('week')} slot {plan.get('slot')}: host {display(str(plan.get('host')))}, "
                     f"auditor {display(str(plan.get('auditor')))}, starts {plan.get('starts_at')}")
    if result.get("reason"):
        lines.append(f"  reason: {result['reason']}")
    for seat in result.get("seats", []):
        lines.append(f"    {display(str(seat.get('seat'))):<15} {seat.get('state'):<8} {seat.get('email') or seat.get('message') or ''}")
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
    control = result.get("control") or {}
    if result.get("already_seated"):
        lines.append("  CONTROL skipped, already members: " + ", ".join(display(str(s)) for s in result["already_seated"]))
    if control.get("state") == "NOT_RUN":
        lines.append(f"  CONTROL NOT RUN: {control.get('reason')}")
    lines.append("  RULE  four identities on one machine is not four machines; say which was shown")
    return "\n".join(lines)


def parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["run", "seats", "selftest"])
    # No defaults: the rota decides the host and joiners unless these name seats.
    ap.add_argument("--host", default=None, help="host seat id; default: the rota class's host")
    ap.add_argument("--join", default=None,
                    help="comma-separated joiner seat ids; default: the auditor and two attendees")
    ap.add_argument("--at", default=None, type=instant,
                    help="the instant whose rota class to hold (ISO 8601 with a zone); default: now")
    ap.add_argument("--json", action="store_true")
    return ap


def main() -> int:
    args = parser().parse_args()
    at = args.at or dt.datetime.now(dt.timezone.utc)
    if args.cmd == "selftest":
        result = selftest(at)
    elif args.cmd == "seats":
        result = seats()
    else:
        join = None if args.join is None else [s.strip() for s in args.join.split(",") if s.strip()]
        try:
            host, joiners, plan = participants(at, args.host, join)
        except ValueError as error:
            result = refused(str(error))
        else:
            result = run(host, joiners, plan)
    if args.json or args.cmd != "run":
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(table(result))
    return {"PASS": 0, "FAIL": 1}.get(str(result.get("state")), 1)


if __name__ == "__main__":
    raise SystemExit(main())
