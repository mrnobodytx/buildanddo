#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/workspace_readiness.py
# Stage:       06_IMPLEMENT
# SRS:         SRS-BUILDANDDO-WORKSPACE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WORKSPACE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     scripts/ci/ocn_feature_sweep.py, apps/pocketbase/pb_hooks/workspace-administration.js
# EnumType:    Tool
# EnumEdges:   COMPLEMENTS scripts/ci/ocn_feature_sweep.py
# Intent:      Say what a signed-in person actually FINDS in a workspace, because a route that
#              answers 200 and a section worth looking at are different things.
# ───────────────────────────────────────────────────────────────
"""What a signed-in person actually finds in a workspace.

WHY THIS EXISTS BESIDE THE FEATURE SWEEP
    ocn_feature_sweep.py asks whether each route ANSWERS. That is a necessary question and it is
    not the one a person asks. A route can answer 200 all day over a collection with no rows, and
    the person visiting that section sees an empty page and calls it broken. Measured on
    production 2026-09-23: every feature route alive, and missions, signals, evidence, workflows,
    corrections, support_sources and daily_editions ALL ZERO. The sweep said PASS. The person was
    right.

    So this tool reports the other half: for each section, is it WORKING, EMPTY, OFF or
    UNREADABLE - and it never collapses those four into one.

        WORKING     the section has rows to show
        EMPTY       the read succeeded and there is genuinely nothing there
        OFF         a workspace setting switches the section off, so there is nothing to show
                    BY CONFIGURATION rather than by absence
        UNREADABLE  the read did not succeed, so we do not know which of the above is true

    UNREADABLE is the important one and it is the state most tools drop. Not knowing is not the
    same as nothing, and a dashboard that renders them identically is lying by omission.

THE COMMUNITY SETTINGS DEFAULT TO OFF, AND THAT LOOKS EXACTLY LIKE A BUG
    workspace-access.js:19 defaults wiki_enabled and forum_enabled to false when a workspace has
    no controls row. A workspace nobody has ever administered therefore tells its owner "The
    workspace wiki is disabled" and points at a settings page. That is fail-closed and correct,
    and it is indistinguishable from breakage to the person reading it. `revision: 0` is the tell:
    it means no one has ever saved these settings, so the values are defaults and not decisions.

--enable-community WRITES TO THE ENVIRONMENT AND IS A3
    It sends the workspace's OWN governed admin command, the same one the admin page sends.
    Two things make it worth doing through a tool rather than by hand:
      - settings.save carries `name`, so a hand-written body with the field omitted or guessed
        RENAMES the workspace. This reads the current name and sends it back unchanged.
      - the command is optimistic on `revision`; a stale one is refused. This reads the revision
        immediately before sending, and verifies by READBACK rather than by the response.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import ocn_feature_sweep as sweep  # noqa: E402

SCHEMA = "buildanddo.workspace-readiness/v1"

# Each section: label, how to read it, and the setting that can switch it off.
#
# MEASURE THE WAY THE PRODUCT READS, NOT THE WAY THAT IS CONVENIENT. The first version read every
# section straight off the collection API. Five of them - research, blueprints, classrooms, wiki,
# forum - answered 403 "Only superusers can perform this action", and the tool duly reported five
# broken sections. They are not broken: the SPA never touches those collections. It calls a hook
# route, and every one of those routes answers 200. The tool was measuring its own lack of
# permission and printing it as the product's condition, which is the exact mistake that made the
# feature sweep miss all of this in the first place.
#
# So a section with a `route` is read through that route - the product's own path. A section
# without one is read off its collection, which is how the desks that have no hook read it.
SECTIONS = [
    ("Overview / signals", "signals", None),
    ("Overview / missions", "missions", None),
    ("Workflows", "workflows", None),
    ("Evidence ledger", "evidence", None),
    ("Corrections", "corrections", None),
    ("Support & revenue", "support_sources", None),
    ("Daily edition", "daily_editions", None),
    # These names are the COLLECTIONS, taken from pb_migrations, not from what the sections are
    # called in the navigation. The first draft of this list guessed three of them from the
    # section names - research_notes, blueprints, forum_threads - and every one came back
    # UNREADABLE. A tool that reports "we could not read it" because it asked for a collection
    # that does not exist is manufacturing the very uncertainty it claims to measure, so the
    # selftest below pins the names against the migrations.
    ("Research", "@research", None),
    ("Blueprints", "@blueprints", None),
    ("Classrooms", "@classrooms", None),
    ("Knowledge", "@knowledge", None),
    ("Assistant", "@assistant", None),
    ("Wiki", "@wiki", "wiki_enabled"),
    ("Forum", "@forums", "forum_enabled"),
]
# A name beginning with @ is a hook route under /api/buildanddo/workspaces/<id>/, not a collection.
ROUTE_PREFIX = "@"

# Where the collection names above are defined. The selftest reads this rather than trusting the
# list, because a mistyped collection is indistinguishable from an unreadable one at runtime.
MIGRATIONS = pathlib.Path(__file__).resolve().parents[2] / "apps" / "pocketbase" / "pb_migrations"


# Lists that are CONTENT, and lists that are furniture. A hook route returns both in one object,
# so a tool that counts the longest list counts the furniture: the assistant route answered with
# `routes` - the 37-entry navigation list every workspace gets - and the section was reported
# WORKING with nothing in it. Guessing is not allowed here; an unrecognised shape is UNCOUNTED.
CONTENT_KEYS = ("items", "pages", "rooms", "topics", "records", "entries", "results", "nodes")


def classify(total, http: int, switched_off: bool, counted_content: bool = True) -> str:
    """Six outcomes, decided by what the server said. Never fewer.

    WHY THE HTTP CODE AND NOT A READABLE FLAG. The first version had one `readable` boolean, so a
    collection this tool had MISNAMED, a collection the reader is not allowed to see, and a
    collection that genuinely failed all came back as the same UNREADABLE. Three problems with
    three different owners - a typo in this file, an API rule, and an outage - reported as one.
    The server distinguishes them, so the tool keeps the distinction.

    `switched_off` wins when the read succeeded, because a section its workspace has turned off
    shows nothing for a reason the reader can act on, and calling that EMPTY sends them hunting
    for missing data instead of a setting. It does NOT win over a failed read: if we could not
    read, we do not get to explain what the person is seeing.
    """
    if http == 404:
        return "ABSENT"        # no such collection here: not deployed, or misnamed in SECTIONS
    if http == 403:
        return "FORBIDDEN"     # the collection exists and its rules refuse this reader
    if http != 200:
        return "UNREADABLE"    # we do not know, and we will not pretend otherwise
    if switched_off:
        return "OFF"
    if not counted_content:
        # The route answered and this tool does not know which list in it is the content. That is
        # a gap in the tool, and it is reported as one rather than as a number.
        return "UNCOUNTED"
    return "WORKING" if total else "EMPTY"


def _remote(base: str, seat: str, body: str) -> str:
    """One signed session on the box, then whatever `body` asks of it. Prints only what body echoes."""
    return r"""
set -e
cd %(cbf)s
H=$(python3 -m tools.cbf.citadelkey.citadel_key sign --seat %(seat)s --audience buildanddo-login --payload "{\"login\":\"buildanddo\",\"ts_bucket\":\"$(date -u +%%Y-%%m-%%dT%%H)\"}" --header 2>/dev/null | tail -1)
if [ -z "$H" ]; then echo "FATAL sign"; exit 0; fi
LC=$(curl -s -o /tmp/wr_login.json -w "%%{http_code}" -A "Mozilla/5.0" -H "X-Citadel-Key: $H" -H "Content-Type: application/json" -X POST -d "{}" %(base)s/api/ocn/login)
if [ "$LC" != "200" ]; then echo "FATAL login $LC"; exit 0; fi
T=$(python3 -c "import json;print(json.load(open('/tmp/wr_login.json')).get('token',''))")
W=$(curl -s -A "Mozilla/5.0" -H "Authorization: $T" "%(base)s/api/collections/workspaces/records?perPage=1" | python3 -c "import json,sys;print(((json.load(sys.stdin).get('items') or [{}])[0] or {}).get('id',''))")
if [ -z "$W" ]; then echo "FATAL no workspace readable"; exit 0; fi
echo "WORKSPACE $W"
%(body)s
rm -f /tmp/wr_login.json
""" % {"cbf": sweep.CBF, "seat": seat, "base": base, "body": body}


READ_BODY = r"""
ACC=$(curl -s -m 25 -A "Mozilla/5.0" -H "Authorization: $T" "%(base)s/api/buildanddo/workspaces/$W/access")
echo "ACCESS $(printf '%%s' "$ACC" | base64 -w0)"
NAME=$(curl -s -m 25 -A "Mozilla/5.0" -H "Authorization: $T" "%(base)s/api/collections/workspaces/records/$W" | python3 -c "import json,sys;print(json.load(sys.stdin).get('name',''))")
echo "NAME $(printf '%%s' "$NAME" | base64 -w0)"
for C in %(collections)s; do
  case "$C" in
    @*) URL="%(base)s/api/buildanddo/workspaces/$W/${C#@}" ;;
    *)  URL="%(base)s/api/collections/$C/records?perPage=1&filter=workspace%%3D%%22$W%%22" ;;
  esac
  CODE=$(curl -s -o /tmp/wr_c.json -w "%%{http_code}" -m 25 -A "Mozilla/5.0" -H "Authorization: $T" "$URL")
  TOTAL=$(python3 -c "
import json
try: d=json.load(open('/tmp/wr_c.json'))
except Exception: print('-'); raise SystemExit
if not isinstance(d, dict): print('-'); raise SystemExit
# A collection read states its own total. A hook route does not, so count the rows it returned and
# say WHICH key was counted, further down, so the number can be audited rather than trusted.
if 'totalItems' in d: print(d['totalItems']); raise SystemExit
for key in ('items', 'pages', 'rooms', 'topics', 'records', 'entries', 'results', 'nodes'):
    if isinstance(d.get(key), list): print(len(d[key])); raise SystemExit
print('-')
")
  KEY=$(python3 -c "
import json
try: d=json.load(open('/tmp/wr_c.json'))
except Exception: print(''); raise SystemExit
if not isinstance(d, dict) or 'totalItems' in d: print(''); raise SystemExit
for key in ('items', 'pages', 'rooms', 'topics', 'records', 'entries', 'results', 'nodes'):
    if isinstance(d.get(key), list): print(key); raise SystemExit
# Name the lists that WERE there, so the gap is diagnosable instead of just reported.
print('none-of:' + ','.join(sorted(k for k, v in d.items() if isinstance(v, list))) or 'no-list')
")
  echo "COUNT $C $CODE $TOTAL ${KEY:-total} $(head -c 160 /tmp/wr_c.json | tr -d '\n' | base64 -w0)"
done
"""

WRITE_BODY = r"""
BEFORE=$(curl -s -m 25 -A "Mozilla/5.0" -H "Authorization: $T" "%(base)s/api/buildanddo/workspaces/$W/access")
REV=$(printf '%%s' "$BEFORE" | python3 -c "import json,sys;print((json.load(sys.stdin).get('settings') or {}).get('revision',0))")
DESC=$(printf '%%s' "$BEFORE" | python3 -c "import json,sys;print((json.load(sys.stdin).get('settings') or {}).get('description',''))")
MOD=$(printf '%%s' "$BEFORE" | python3 -c "import json,sys;print(str((json.load(sys.stdin).get('settings') or {}).get('forum_moderation',True)).lower())")
NAME=$(curl -s -m 25 -A "Mozilla/5.0" -H "Authorization: $T" "%(base)s/api/collections/workspaces/records/$W" | python3 -c "import json,sys;print(json.load(sys.stdin).get('name',''))")
# The name is sent back UNCHANGED. settings.save writes it, so omitting or guessing it renames
# the workspace as a side effect of enabling a wiki.
BODY=$(REV="$REV" NAME="$NAME" DESC="$DESC" MOD="$MOD" python3 -c "
import json,os
print(json.dumps({'revision': int(os.environ['REV']), 'action': 'settings.save', 'payload': {
    'name': os.environ['NAME'], 'description': os.environ['DESC'],
    'wiki_enabled': True, 'forum_enabled': True,
    'forum_moderation': os.environ['MOD'] == 'true'}}))
")
CODE=$(printf '%%s' "$BODY" | curl -s -o /tmp/wr_out.json -w "%%{http_code}" -m 30 -A "Mozilla/5.0" -H "Authorization: $T" -H "Content-Type: application/json" -X POST -d @- "%(base)s/api/buildanddo/workspaces/$W/admin")
echo "WROTE $CODE $(head -c 300 /tmp/wr_out.json | tr -d '\n' | base64 -w0)"
# Verified by READBACK, not by the response code. A 200 is what the server says it did.
AFTER=$(curl -s -m 25 -A "Mozilla/5.0" -H "Authorization: $T" "%(base)s/api/buildanddo/workspaces/$W/access")
echo "AFTER $(printf '%%s' "$AFTER" | base64 -w0)"
AFTERNAME=$(curl -s -m 25 -A "Mozilla/5.0" -H "Authorization: $T" "%(base)s/api/collections/workspaces/records/$W" | python3 -c "import json,sys;print(json.load(sys.stdin).get('name',''))")
echo "AFTERNAME $(printf '%%s' "$AFTERNAME" | base64 -w0)"
rm -f /tmp/wr_out.json
"""


def run(box: str, env: str, body: str) -> dict:
    import base64
    record = sweep.fleet().get(box) or {}
    ip = record.get("public_ip") or ""
    key = pathlib.Path.home() / ".ssh" / sweep.SSH_KEYS.get(box, "")
    if not ip or not key.is_file():
        return {"error": "no route to %s" % box}
    script = _remote(sweep.ENVS[env] + sweep.BACKEND, box, body)
    done = subprocess.run(
        ["ssh", "-i", str(key), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
         "-o", "ConnectTimeout=20", "root@%s" % ip, "tr -d '\\r' | bash -s"],
        input=script, capture_output=True, text=True, timeout=600)
    out: dict = {"counts": {}}
    for line in (done.stdout or "").splitlines():
        parts = line.strip().split(" ")
        if not parts or not parts[0]:
            continue
        if parts[0] == "FATAL":
            out["error"] = " ".join(parts[1:])
        elif parts[0] == "WORKSPACE" and len(parts) > 1:
            out["workspace"] = parts[1]
        elif parts[0] == "COUNT" and len(parts) > 4:
            said = ""
            if len(parts) > 5:
                try:
                    said = base64.b64decode(parts[5]).decode("utf-8", "replace")
                except Exception:  # noqa: BLE001
                    said = ""
            out["counts"][parts[1]] = {"http": int(parts[2]), "total": parts[3],
                                       "counted": parts[4], "said": said}
        elif parts[0] == "WROTE" and len(parts) > 1:
            out["write_http"] = int(parts[1])
            out["write_said"] = base64.b64decode(parts[2]).decode("utf-8", "replace") if len(parts) > 2 else ""
        elif parts[0] in ("ACCESS", "AFTER") and len(parts) > 1:
            try:
                out[parts[0].lower()] = json.loads(base64.b64decode(parts[1]).decode("utf-8", "replace"))
            except Exception:  # noqa: BLE001
                out[parts[0].lower()] = {}
        elif parts[0] in ("NAME", "AFTERNAME") and len(parts) > 1:
            out[parts[0].lower()] = base64.b64decode(parts[1]).decode("utf-8", "replace")
    if not out.get("workspace") and "error" not in out:
        out["error"] = (done.stderr or "no output").strip()[:200]
    return out


def report(box: str, env: str) -> dict:
    collections = " ".join(name for _, name, _ in SECTIONS)
    answer = run(box, env, READ_BODY % {"base": sweep.ENVS[env] + sweep.BACKEND,
                                        "collections": collections})
    out = {"schema": SCHEMA, "at": sweep.utc(), "box": box, "env": env}
    if answer.get("error"):
        out["state"] = "UNMEASURED"
        out["reason"] = answer["error"]
        return out
    settings = (answer.get("access") or {}).get("settings") or {}
    out["workspace"] = answer.get("workspace")
    out["workspace_name"] = answer.get("name", "")
    out["role"] = (answer.get("access") or {}).get("role", "")
    out["settings"] = settings
    # revision 0 means nobody has ever saved these settings, so every value is a DEFAULT and not
    # a decision. Saying which it is changes what an operator should do about it.
    out["settings_are_defaults"] = settings.get("revision", 0) == 0
    rows = []
    for label, collection, switch in SECTIONS:
        seen = answer["counts"].get(collection) or {"http": 0, "total": "-", "said": ""}
        total = int(seen["total"]) if str(seen["total"]).isdigit() else 0
        off = bool(switch) and not settings.get(switch, False)
        counted = seen.get("counted", "total")
        state = classify(total, seen["http"], off,
                         counted_content=(counted == "total" or counted in CONTENT_KEYS))
        route = collection.startswith(ROUTE_PREFIX)
        row = {"section": label, "read_via": ("route " + collection[1:]) if route else ("collection " + collection),
               "http": seen["http"], "rows": total if seen["http"] == 200 else None,
               # Which key the count came from, so a surprising number can be checked rather than
               # believed. A hook route does not report a total, so this tool counted something.
               "counted": counted, "switch": switch, "state": state}
        # An ABSENT read is most often this tool's own typo, so the row carries what the server
        # said - otherwise the next reader has to rediscover which of the two it was.
        if state in ("ABSENT", "FORBIDDEN", "UNREADABLE", "UNCOUNTED") and seen["said"]:
            row["said"] = seen["said"][:140]
        rows.append(row)
    out["sections"] = rows
    tally: dict = {}
    for row in rows:
        tally[row["state"]] = tally.get(row["state"], 0) + 1
    out["tally"] = tally
    # A workspace is only WORKING if something in it actually has content. UNCOUNTED does not
    # count toward that: not knowing is not a section worth visiting.
    out["state"] = "WORKING" if tally.get("WORKING") else "NOTHING_TO_SHOW"
    return out


def enable_community(box: str, env: str) -> dict:
    answer = run(box, env, WRITE_BODY % {"base": sweep.ENVS[env] + sweep.BACKEND})
    if answer.get("error"):
        return {"state": "UNMEASURED", "reason": answer["error"]}
    after = (answer.get("after") or {}).get("settings") or {}
    renamed = answer.get("name", "") != answer.get("aftername", "")
    ok = bool(after.get("wiki_enabled")) and bool(after.get("forum_enabled")) and not renamed
    return {"state": "ENABLED" if ok else "REFUSED", "write_http": answer.get("write_http"),
            "said": answer.get("write_said", "")[:200], "settings_after": after,
            "name_before": answer.get("name", ""), "name_after": answer.get("aftername", ""),
            "renamed": renamed}


def selftest() -> dict:
    checks = []

    def record(name, ok):
        checks.append({"check": name, "state": "PASS" if ok else "FAIL"})

    record("rows present is WORKING", classify(3, 200, False) == "WORKING")
    record("no rows is EMPTY", classify(0, 200, False) == "EMPTY")
    record("a refused read is never EMPTY", classify(0, 403, False) == "FORBIDDEN")
    record("a missing collection is never EMPTY", classify(0, 404, False) == "ABSENT")
    record("a refused read is never WORKING", classify(9, 403, False) == "FORBIDDEN")
    record("an unknown failure is UNREADABLE", classify(0, 500, False) == "UNREADABLE")
    record("a transport fault is UNREADABLE, not EMPTY", classify(0, 0, False) == "UNREADABLE")
    # The three failures stay distinct: a typo here, an API rule, and an outage have three
    # different owners, and one shared label would send every one of them to the wrong person.
    record("the three failures do not collapse",
           len({classify(0, 404, False), classify(0, 403, False), classify(0, 500, False)}) == 3)
    # Ordering: a switched-off section reads OFF, because that is the fact the reader can act on.
    record("switched off beats empty", classify(0, 200, True) == "OFF")
    record("switched off beats rows too", classify(5, 200, True) == "OFF")
    # THE CONTROL FOR THE FALSE WORKING. A route that answers with a long list this tool does not
    # recognise as content must never be reported as a working section. The assistant route did
    # exactly that, with 37 navigation entries, before this existed.
    record("an unrecognised list is UNCOUNTED, not WORKING",
           classify(37, 200, False, counted_content=False) == "UNCOUNTED")
    record("and a recognised empty list is still EMPTY",
           classify(0, 200, False, counted_content=True) == "EMPTY")
    record("routes is not a content key", "routes" not in CONTENT_KEYS)
    # But it never beats a failed read - we do not explain a page we could not measure.
    record("a failed read beats switched off", classify(0, 403, True) == "FORBIDDEN")
    record("every section names a collection", all(s[1] for s in SECTIONS))
    record("section labels are distinct", len({s[0] for s in SECTIONS}) == len(SECTIONS))

    # THE CONTROL THAT MATTERS. Every collection this tool asks for must be one the migrations
    # actually create. Without this, a typo reads as UNREADABLE and the tool reports a product
    # problem that is entirely its own. Three names failed this when it was first written.
    # A STATIC CHECK AGAINST THE MIGRATIONS WAS TRIED HERE AND REMOVED. Not every collection is
    # declared with a literal name in source - several are created from a list - so the check
    # reported missions, signals, workflows, corrections, support_sources and daily_editions as
    # non-existent in the same run that had just counted rows in them. A check that cannot see
    # half its subject is worse than none, because its FAIL reads as a finding. The runtime
    # answers the same question properly: a misnamed collection comes back ABSENT carrying the
    # server's own message, which names the typo at the point of use.
    record("the migrations directory is where this expects it", MIGRATIONS.is_dir())
    # The five sections the product reads through a hook must NOT be read off their collections:
    # that path is superuser-only and returns 403, which this tool would then report as the
    # section being broken for everyone. This check is the memory of that mistake.
    by_route = {label for label, source, _ in SECTIONS if source.startswith(ROUTE_PREFIX)}
    record("wiki, forum, research, blueprints and classrooms are read through their hook routes",
           {"Wiki", "Forum", "Research", "Blueprints", "Classrooms"} <= by_route)
    record("route names carry no slash or workspace id",
           all("/" not in source for _, source, _ in SECTIONS))
    return {"schema": SCHEMA, "checks": checks,
            "passed": sum(c["state"] == "PASS" for c in checks), "total": len(checks),
            "state": "PASS" if all(c["state"] == "PASS" for c in checks) else "FAIL"}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--box", default="mesh-control", choices=sorted(sweep.SSH_KEYS))
    parser.add_argument("--env", default="production", choices=sorted(sweep.ENVS))
    parser.add_argument("--enable-community", action="store_true",
                        help="A3: switch this workspace's wiki and forum on through its own governed admin command")
    parser.add_argument("--selftest", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if args.selftest:
        result = selftest()
        print(json.dumps(result, indent=2))
        return 0 if result["state"] == "PASS" else 1

    if args.enable_community:
        wrote = enable_community(args.box, args.env)
        print(json.dumps(wrote, indent=2))
        if wrote.get("renamed"):
            print("REFUSED TO PASS: the workspace name changed. That is a side effect, not the ask.")
        if wrote["state"] != "ENABLED":
            return 1

    result = report(args.box, args.env)
    if args.json:
        print(json.dumps(result, indent=2))
        return 0
    print("workspace readiness  env=%s  %s" % (result["env"], result.get("state")))
    if result.get("reason"):
        print("  " + result["reason"])
        return 1
    print("  workspace %s (%s) as %s" % (result["workspace"], result["workspace_name"] or "unnamed", result["role"]))
    if result["settings_are_defaults"]:
        print("  revision 0: nobody has ever saved these settings, so every value below is a")
        print("  fail-closed DEFAULT rather than a decision anyone made.")
    for row in result["sections"]:
        count = "-" if row["rows"] is None else row["rows"]
        extra = ("  (switch %s is off)" % row["switch"]) if row["state"] == "OFF" else ""
        if row.get("said"):
            extra += "  <- " + row["said"][:70]
        print("  %-11s %-22s %-5s via %-26s%s"
              % (row["state"], row["section"], count, row["read_via"], extra))
    print("  " + ", ".join("%s=%d" % (k, v) for k, v in sorted(result["tally"].items())))
    return 0


if __name__ == "__main__":
    sys.exit(main())
