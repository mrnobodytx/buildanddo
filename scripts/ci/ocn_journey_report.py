#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_journey_report.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/ocn_feature_sweep.py (the on-box signing hop it reuses)
# EnumType:    Verifier
# EnumEdges:   VERIFIES that a signed-in person can COMPLETE each leg of the product,
#              and writes up what they hit when they cannot
# Intent:      Report the site the way a user meets it - leg by leg, signed in, from a real box -
#              so failures, dead ends and unhelpful refusals are documented rather than inferred.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_journey_report.py - sign in as a seat and walk the product, documenting every leg.

    ocn_journey_report.py walk  [--box mesh-control] [--env staging|production] [--json]
    ocn_journey_report.py legs                  what would be walked, offline
    ocn_journey_report.py selftest              offline checks, including the grader

HOW THIS DIFFERS FROM ocn_feature_sweep.py, which is its sibling and not its replacement.
The sweep asks "is the route alive?" and a 400 counts as alive, because a route that names the
field it wanted is working software. This asks "**could a person finish what they started?**" - and
by that standard a 400 is a dead end unless the message tells them what to do next.

WHAT EACH VERDICT MEANS:
  OK          the leg completed and returned something usable
  BLOCKED     the leg could not be completed at all - a person stops here
  BROKEN      the server failed rather than refused: a 5xx, or a 4xx whose message is generic
  UNHELPFUL   it refused correctly but the message does not name a field, a reason or a next step.
              This is the UX bug class the HTTP status alone can never show.
  REFUSED     it refused on policy and SAID SO clearly - working software, not a defect

A REFUSAL IS ONLY A UX BUG IF IT DOES NOT EXPLAIN ITSELF. "Something went wrong while processing
your request." is the generic PocketBase 400 and tells a person nothing; that is graded BROKEN even
though it is a 4xx, because it is indistinguishable from a crash to whoever hit it.

THE CONTROLS RUN FIRST AND THE WALK IS VOID WITHOUT THEM: a route that cannot exist must 404, and a
real route called with no session must 401. A SPA fallback answering 200 to everything breaks both.

Legs are walked IN ORDER on the box, and later legs use ids captured from earlier ones, so this
follows a real path through the product instead of poking unrelated endpoints.
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
ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
CBF = "/opt/citadel/cbf"
SCHEMA = "buildanddo.ocn-journey-report/v1"
SSH_KEYS = {"mesh-control": "citadel_test_droplet", "mesh-memory": "citadel_test_droplet",
            "ray-tor1-1": "citadel_helper", "ray-tor1-2": "citadel_helper",
            "ray-tor1-3": "citadel_helper", "ray-tor1-4": "citadel_helper"}
WORKSPACES = {"ray-tor1-1": "v11x7qfj0mg64j7", "ray-tor1-2": "gsxc0bp3qkzvvu0",
              "ray-tor1-3": "4pkak04shs913un", "ray-tor1-4": "bdqc0ltj81t5u7d",
              "mesh-memory": "4eijifip8xhorbs", "mesh-control": "56o8prujj51dmu2"}

# A message that could have been printed by any failure tells the person nothing. PocketBase's
# default 4xx body is the worst offender, because it reads exactly like a crash.
GENERIC = ("something went wrong", "an error occurred", "internal server error",
           "unexpected error", "failed to process", "bad request")

# id | what a PERSON is trying to do | method | path | body | ok statuses | capture
# `{W}` is this seat's own workspace. `{lesson}` is captured from the catalogue leg.
LEGS: list[dict[str, Any]] = [
    {"id": "control.absent", "doing": "CONTROL: a route that cannot exist must 404",
     "method": "GET", "path": "/api/buildanddo/definitely-not-a-route-9f3", "ok": [404], "control": True},
    {"id": "control.anon", "doing": "CONTROL: a real route with no session must 401",
     "method": "GET", "path": "/api/buildanddo/learning", "ok": [401], "anon": True, "control": True},

    {"id": "signin", "doing": "Sign in to the platform as myself",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/access", "ok": [200]},
    {"id": "catalogue", "doing": "Open the lessons and see what I can learn",
     "method": "GET", "path": "/api/buildanddo/learning", "ok": [200], "capture": "learning"},
    {"id": "lesson.open", "doing": "Open the first lesson and read it",
     "method": "GET", "path": "/api/buildanddo/learning/{lesson}", "ok": [200]},
    {"id": "lesson.start", "doing": "Start the lesson so my progress is kept",
     "method": "POST", "path": "/api/buildanddo/learning/{lesson}",
     "body": {"action": "start", "payload": {}}, "ok": [200, 400, 409]},

    {"id": "workspace.read", "doing": "See my workspace and what is in it",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/admin", "ok": [200, 403]},
    {"id": "knowledge", "doing": "Look up what the workspace knows",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/knowledge", "ok": [200, 403]},
    {"id": "missions", "doing": "Propose a piece of work with no details, and be told what is needed",
     "method": "POST", "path": "/api/buildanddo/workspaces/{W}/suite", "body": {}, "ok": [400, 403]},
    {"id": "research", "doing": "Ask for research and be told what is needed",
     "method": "POST", "path": "/api/buildanddo/workspaces/{W}/research", "body": {}, "ok": [400, 403]},
    {"id": "blueprints", "doing": "Open the blueprints I could build from",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/blueprints", "ok": [200, 403]},
    {"id": "assistant", "doing": "Open the assistant",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/assistant", "ok": [200, 403]},
    {"id": "classrooms", "doing": "See the classes I could join",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/classrooms", "ok": [200, 403]},
    {"id": "forums", "doing": "Read the community forum",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/forums", "ok": [200, 403]},
    {"id": "business", "doing": "See the business actions available to me",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/business", "ok": [200, 403, 503]},
    {"id": "integrations", "doing": "See which services are connected",
     "method": "GET", "path": "/api/buildanddo/workspaces/{W}/integrations", "ok": [200, 403]},
]

# Runs ON the box. Signs once, walks the legs in order, carries captured ids forward,
# and prints one base64 JSON line so nothing in a body can break the transport.
REMOTE = r'''
import base64, json, subprocess, sys, urllib.request, urllib.error, datetime

PLAN = json.loads(base64.b64decode("%(plan)s").decode())
BASE, SEAT, CBF = PLAN["base"], PLAN["seat"], PLAN["cbf"]
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-journey/1.0)", "Content-Type": "application/json"}

def http(url, data=None, headers=None, method=None, timeout=40):
    head = dict(UA); head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head,
                                 method=method or ("POST" if data is not None else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return r.status, raw.decode("utf-8", "replace")[:4000]
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:4000]
    except Exception as e:
        return 0, "%%s: %%s" %% (type(e).__name__, e)

bucket = datetime.datetime.now(datetime.timezone.utc).strftime("%%Y-%%m-%%dT%%H")
payload = json.dumps({"login": "buildanddo", "ts_bucket": bucket}, sort_keys=True, separators=(",", ":"))
signed = subprocess.run([sys.executable, "-m", "tools.cbf.citadelkey.citadel_key", "sign",
                         "--seat", SEAT, "--audience", "buildanddo-login",
                         "--payload", payload, "--header"],
                        cwd=CBF, capture_output=True, text=True, timeout=60)
lines = [l for l in (signed.stdout or "").splitlines() if l.strip()]
if not lines:
    print(base64.b64encode(json.dumps({"fatal": "sign"}).encode()).decode()); sys.exit(0)
status, body = http(BASE + "/api/ocn/login", data=b"{}", headers={"X-Citadel-Key": lines[-1]})
if status != 200:
    print(base64.b64encode(json.dumps({"fatal": "login %%d" %% status}).encode()).decode()); sys.exit(0)
session = json.loads(body)
token = session.get("token", "")
out = {"uid": (session.get("record") or {}).get("id", ""), "legs": []}
try:
    out["ip"] = urllib.request.urlopen("https://api.ipify.org", timeout=10).read().decode().strip()
except Exception:
    out["ip"] = "unknown"

# The seat's workspace differs per environment, so ASK rather than carry a staging id into
# production and report a dozen 404s that are the probe's fault, not the product's.
captured = {}
wcode, wbody = http(BASE + "/api/collections/workspaces/records?perPage=5&fields=id", headers={"Authorization": token})
try:
    items = json.loads(wbody).get("items") or []
    if items:
        captured["W"] = items[0]["id"]
except Exception:
    pass
# Decide the source HERE, before any fallback can overwrite the evidence. Checking it afterwards
# reported a hardcoded staging id as "session" on production, which is precisely the kind of label
# that sends someone chasing a product defect that is really a probe artefact.
out["workspace_source"] = "session" if captured.get("W") else "none"
out["workspace_seen_by_session"] = captured.get("W", "")
if "W" not in captured and PLAN.get("fallback_workspace"):
    captured["W"] = PLAN["fallback_workspace"]
    out["workspace_source"] = "fallback"
out["workspace_discovered"] = captured.get("W", "")
# GET /api/buildanddo/learning is a PROGRESS endpoint - points, certificates, a resume pointer -
# and carries no lesson list, so a fresh account cannot discover a lesson id from it.
#
# DO NOT use the id from the bundled curriculum. The SPA does not either: it resolves each bundled
# lesson to a PERSISTED server record and only offers "Interactive tutorial" when one exists,
# otherwise showing the lesson as a readable preview. Sending a bundled id here measures the probe,
# not the product - it produced a 404 that no user can reach.
# fields=id keeps the body tiny: a tutorial carries a whole lesson blob, and the 4000-char read cap
# truncated the JSON mid-object so the parse failed and the id silently went missing.
lcode, lbody = http(BASE + "/api/collections/tutorials/records?perPage=1&fields=id", headers={"Authorization": token})
try:
    items = json.loads(lbody).get("items") or []
    if items:
        captured["lesson"] = items[0]["id"]
except Exception:
    pass
out["lesson_resolved"] = captured.get("lesson", "")
out["lesson_http"] = lcode
out["lesson_body_head"] = (lbody or "")[:160]

for leg in PLAN["legs"]:
    path = leg["path"]
    missing = None
    for key, value in captured.items():
        path = path.replace("{%%s}" %% key, value)
    if "{" in path:
        missing = path[path.index("{") + 1:path.index("}")]
        out["legs"].append({"id": leg["id"], "http": None, "body": "",
                            "unreached": "needed %%s from an earlier leg that did not provide it" %% missing})
        continue
    data = json.dumps(leg["body"]).encode() if leg.get("body") is not None else None
    headers = None if leg.get("anon") else {"Authorization": token}
    code, text = http(BASE + path, data=data, headers=headers, method=leg["method"])
    out["legs"].append({"id": leg["id"], "http": code, "body": text[:900]})
    cap = leg.get("capture")
    if cap == "learning" and code == 200:
        # the catalogue's own "resume" pointer if there is one, else the first lesson it offers
        try:
            doc = json.loads(text)
            tutorial = ((doc.get("resume") or {}) or {}).get("tutorial")
            if tutorial:
                captured["lesson"] = tutorial
        except Exception:
            pass
print(base64.b64encode(json.dumps(out).encode()).decode())
'''


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def first_lesson() -> str:
    """The lesson id the shipped SPA would already hold, since the curriculum is bundled at build."""
    data = REPO / "apps/pocketbase/pb_migrations/data/starter-tutorials.json"
    try:
        return (json.loads(data.read_text(encoding="utf-8"))["lessons"][0]["id"])
    except Exception:  # noqa: BLE001
        return ""


def fleet() -> dict[str, dict]:
    if not FLEET.is_file():
        return {}
    boxes = json.loads(FLEET.read_text(encoding="utf-8")).get("boxes") or {}
    return {k: v for k, v in boxes.items() if isinstance(v, dict)}


def message_of(body: str) -> str:
    """The words the person would actually be shown."""
    try:
        doc = json.loads(body)
    except Exception:
        return ""
    if not isinstance(doc, dict):
        return ""
    return str(doc.get("message") or doc.get("error") or doc.get("reason") or "")


def names_something(body: str) -> bool:
    """Does the refusal point at a field, a value or a next step, rather than just failing?"""
    try:
        doc = json.loads(body)
    except Exception:
        return False
    if isinstance(doc, dict) and doc.get("data"):
        return True                      # PocketBase per-field validation detail
    message = message_of(body)
    if not message:
        return False
    # A message that tells a person what to do is specific: it names a thing, or says what to do.
    return len(message.split()) >= 4 and message.lower().strip(". ") not in [g for g in GENERIC]


def grade(leg: dict[str, Any], code: int | None, body: str) -> tuple[str, str]:
    """Return (verdict, why). The HTTP status alone is never the whole answer."""
    if leg.get("control"):
        # A control asserts a STATUS. Judging its wording is a category error: "File not found."
        # is a perfectly clear 404 and graded UNHELPFUL on word count alone, which is nonsense.
        return ("OK", "") if code in leg.get("ok", []) else ("BROKEN", "control expected %s, got %s" % (leg.get("ok"), code))
    if code is None:
        return "BLOCKED", leg.get("unreached", "not reached")
    if code == 0:
        return "BROKEN", "no response: " + body[:70]
    message = message_of(body)
    generic = any(g in message.lower() for g in GENERIC)
    if code >= 500:
        return "BROKEN", "server error %d: %s" % (code, message[:70] or "no message")
    if code not in leg["ok"]:
        if generic or not message:
            return "BROKEN", "unexpected %d and the message explains nothing: %r" % (code, message[:60])
        return "BLOCKED", "unexpected %d: %s" % (code, message[:70])
    if code in (200, 201):
        return "OK", ""
    # An expected refusal. Whether it is a defect depends entirely on what it SAYS.
    if generic:
        return "BROKEN", "%d with PocketBase's generic body - reads as a crash: %r" % (code, message[:60])
    if not names_something(body):
        return "UNHELPFUL", "%d refused without naming a field or a next step: %r" % (code, message[:60])
    return "REFUSED", "%d %s" % (code, message[:70])


def plan_for(box: str) -> list[dict[str, Any]]:
    workspace = WORKSPACES.get(box, "")
    plan = []
    for leg in LEGS:
        item = dict(leg)
        plan.append(item)      # {W} is resolved ON the box from its own session
    return plan


def on_box(box: str, ip: str, base: str, legs: list[dict[str, Any]]) -> dict[str, Any]:
    key = Path.home() / ".ssh" / SSH_KEYS.get(box, "")
    if not key.is_file():
        return {"error": "no ssh key for %s" % box}
    blob = base64.b64encode(json.dumps(
        {"base": base, "seat": box, "cbf": CBF, "legs": legs,
         "fallback_workspace": WORKSPACES.get(box, ""),
         "lesson": first_lesson()}).encode()).decode()
    script = REMOTE % {"plan": blob}
    ssh = shutil.which("ssh") or "ssh"
    try:
        done = subprocess.run(
            [ssh, "-i", str(key), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
             "-o", "ConnectTimeout=15", "root@%s" % ip,
             # Windows text-mode pipes rewrite LF as CRLF; python3 on the box would see stray \r.
             "tr -d '\\r' | python3 -"],
            input=script, capture_output=True, text=True, timeout=900)
    except subprocess.TimeoutExpired:
        return {"error": "ssh timeout"}
    for line in reversed((done.stdout or "").splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            return json.loads(base64.b64decode(line).decode())
        except Exception:  # noqa: BLE001
            continue
    return {"error": (done.stderr or done.stdout or "no output").strip()[:200]}


def walk(box: str, env: str) -> dict[str, Any]:
    out: dict[str, Any] = {"schema": SCHEMA, "at": utc(), "box": box, "env": env,
                           "legs": [], "defects": []}
    record = fleet().get(box) or {}
    ip = record.get("public_ip") or ""
    if not ip:
        out["state"] = "UNMEASURED"
        out["reason"] = "%s is not in the fleet map" % box
        return out
    answer = on_box(box, ip, ENVS[env] + BACKEND, plan_for(box))
    if answer.get("error") or answer.get("fatal"):
        out["state"] = "UNMEASURED"
        out["reason"] = answer.get("error") or ("could not sign in: " + str(answer.get("fatal")))
        return out
    out["walked_from_ip"] = answer.get("ip", "")
    # Which workspace the box resolved, and whether it came from its own session or my fallback.
    # Reporting this matters: a walk against the wrong workspace measures the probe, not the product.
    out["workspace"] = answer.get("workspace_discovered", "")
    out["lesson"] = answer.get("lesson_resolved", "")
    out["lesson_http"] = answer.get("lesson_http")
    out["lesson_body_head"] = answer.get("lesson_body_head", "")
    out["workspace_source"] = answer.get("workspace_source", "unknown")
    by_id = {leg["id"]: leg for leg in plan_for(box)}
    controls: dict[str, bool] = {}
    for result in answer.get("legs", []):
        leg = dict(by_id.get(result["id"], {"id": result["id"], "ok": [], "doing": ""}))
        if result.get("unreached"):
            leg["unreached"] = result["unreached"]
        verdict, why = grade(leg, result.get("http"), result.get("body", "") or "")
        row = {"leg": result["id"], "doing": leg.get("doing", ""), "http": result.get("http"),
               "verdict": verdict}
        if why:
            row["why"] = why
        out["legs"].append(row)
        if leg.get("control"):
            controls[result["id"]] = verdict == "OK" or result.get("http") in leg.get("ok", [])
    out["controls_held"] = bool(controls) and all(controls.values())
    if not out["controls_held"]:
        out["state"] = "VOID"
        out["reason"] = "the controls did not hold, so no verdict on this walk means what it says"
        return out
    out["defects"] = [row for row in out["legs"]
                      if row["verdict"] in ("BLOCKED", "BROKEN", "UNHELPFUL")
                      and not by_id.get(row["leg"], {}).get("control")]
    out["state"] = "CLEAN" if not out["defects"] else "DEFECTS"
    return out


def table(result: dict[str, Any]) -> str:
    lines = ["OCN journey  box=%s  env=%s  %s"
             % (result["box"], result["env"], result.get("state"))]
    if result.get("walked_from_ip"):
        lines.append("  walked from %s  |  workspace %s (%s)"
                     % (result["walked_from_ip"], result.get("workspace") or "NONE",
                        result.get("workspace_source", "unknown")))
    if result.get("reason"):
        lines.append("  " + result["reason"])
    mark = {"OK": "ok  ", "REFUSED": "ok  ", "BLOCKED": "XX  ", "BROKEN": "XX  ", "UNHELPFUL": "!!  "}
    for row in result.get("legs", []):
        lines.append("  %s%-4s %-11s %s" % (mark.get(row["verdict"], "?   "),
                                            str(row["http"] or "-"), row["verdict"], row["doing"][:58]))
        if row.get("why"):
            lines.append("         " + row["why"][:104])
    if result.get("defects"):
        lines.append("")
        lines.append("  %d leg(s) a person could not finish or was not told how to:" % len(result["defects"]))
        for row in result["defects"]:
            lines.append("    - %s (%s): %s" % (row["leg"], row["verdict"], row.get("why", "")[:80]))
    return "\n".join(lines)


def selftest() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def record(name, ok, detail=""):
        checks.append({"check": name, "state": "PASS" if ok else "FAIL", "detail": detail})

    generic = json.dumps({"data": {}, "message": "Something went wrong while processing your request.",
                          "status": 400})
    helpful = json.dumps({"data": {}, "message": "Use the listed fields for this command.", "status": 400})
    fielded = json.dumps({"data": {"title": {"code": "required", "message": "Missing required value."}},
                          "message": "Failed to create record.", "status": 400})
    leg = {"id": "x", "ok": [400], "doing": ""}

    record("PocketBase's generic 400 grades BROKEN, not REFUSED",
           grade(leg, 400, generic)[0] == "BROKEN")
    record("a refusal that names the contract grades REFUSED",
           grade(leg, 400, helpful)[0] == "REFUSED")
    record("a refusal carrying per-field detail grades REFUSED",
           grade(leg, 400, fielded)[0] == "REFUSED")
    record("an empty-message refusal grades UNHELPFUL",
           grade(leg, 400, json.dumps({"message": "", "data": {}}))[0] == "UNHELPFUL")
    record("200 grades OK", grade({"id": "x", "ok": [200], "doing": ""}, 200, "{}")[0] == "OK")
    record("5xx grades BROKEN", grade({"id": "x", "ok": [200], "doing": ""}, 503, generic)[0] == "BROKEN")
    record("a leg never reached grades BLOCKED",
           grade({"id": "x", "ok": [200], "doing": "", "unreached": "no id"}, None, "")[0] == "BLOCKED")
    record("transport failure grades BROKEN", grade(leg, 0, "URLError: x")[0] == "BROKEN")
    record("both controls are present",
           {"control.absent", "control.anon"} <= {l["id"] for l in LEGS})
    record("every leg id is distinct", len({l["id"] for l in LEGS}) == len(LEGS))
    rows = plan_for("mesh-control")
    record("workspace is left for the box to resolve, not baked in here",
           any("{W}" in r["path"] for r in rows))
    record("the anonymous control carries no session",
           [r for r in rows if r["id"] == "control.anon"][0].get("anon") is True)
    record("no leg writes a machine name into the product",
           not any("mesh-" in json.dumps(l.get("body") or {}) or "ray-tor1" in json.dumps(l.get("body") or {})
                   for l in LEGS))
    return {"schema": SCHEMA, "at": utc(), "checks": checks,
            "state": "PASS" if all(c["state"] == "PASS" for c in checks) else "FAIL",
            "passed": sum(c["state"] == "PASS" for c in checks), "total": len(checks)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("walk")
    w.add_argument("--box", default="mesh-control", choices=sorted(SSH_KEYS))
    w.add_argument("--env", default="staging", choices=sorted(ENVS))
    w.add_argument("--json", action="store_true")
    sub.add_parser("legs")
    sub.add_parser("selftest")
    args = ap.parse_args()
    if args.cmd == "legs":
        print(json.dumps({"schema": SCHEMA, "legs": [
            {"id": l["id"], "doing": l["doing"], "method": l["method"], "path": l["path"],
             "ok": l["ok"]} for l in LEGS]}, indent=2))
        return 0
    if args.cmd == "selftest":
        result = selftest()
        print(json.dumps(result, indent=2))
        return 0 if result["state"] == "PASS" else 1
    result = walk(args.box, args.env)
    print(json.dumps(result, indent=2) if args.json else table(result))
    return 0 if result.get("state") == "CLEAN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
