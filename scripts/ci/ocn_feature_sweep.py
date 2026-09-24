#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_feature_sweep.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/ocn_classroom_fleet.py (the on-box signing hop it reuses)
# EnumType:    Verifier
# EnumEdges:   VERIFIES every route apps/pocketbase/pb_hooks registers, as a real OCN seat,
#              from a machine that is not rig1
# Intent:      Let the OCN network find which of this platform's features do not function, so the
#              repair list is measured rather than remembered.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_feature_sweep.py - drive the whole feature surface from a fleet box and name what is broken.

    ocn_feature_sweep.py sweep  [--box mesh-control] [--env staging] [--json]
    ocn_feature_sweep.py routes                 what would be probed, offline
    ocn_feature_sweep.py selftest               offline checks, including the classifier

ONE SSH HOP FOR THE WHOLE SWEEP. The box signs its CitadelKey once, exchanges it for a session, and
then walks every probe locally. Fifty separate hops would take ten minutes and measure the same
thing; the token never leaves the box either way.

WHAT A STATUS MEANS, because a naive checker collapses opposites:
    404  ROUTE_ABSENT         the hook is missing or failed to load - this is the repair list
    503  DEPENDENCY_MISSING   the hook loaded, its backing collection or env binding did not
    401  NEEDS_AUTH           the route exists and demands a session
    403  REFUSED_BY_POLICY    the route exists, knows who you are, and says no - working software
    400  REJECTED_PAYLOAD     the route exists and named the field it wanted - working software
    200  OK

So a POST probed with an empty body is EXPECTED to answer 400. That is the cheapest honest proof a
write route is alive without writing anything.

TWO CONTROLS RUN FIRST AND THE SWEEP IS VOID WITHOUT THEM:
    a route that cannot exist must answer 404    - else 404 does not mean absent here
    a real route called with no session must 401 - else 200 does not mean authorised here
A 200 from the SPA fallback would break both, which is exactly the failure this guards.
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
# sites/buildanddo — scripts/ci/<this file> -> scripts -> buildanddo
ROOT = Path(__file__).resolve().parents[2]
ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
CBF = "/opt/citadel/cbf"
SCHEMA = "buildanddo.ocn-feature-sweep/v1"
SSH_KEYS = {"mesh-control": "citadel_test_droplet", "mesh-memory": "citadel_test_droplet",
            "ray-tor1-1": "citadel_helper", "ray-tor1-2": "citadel_helper",
            "ray-tor1-3": "citadel_helper", "ray-tor1-4": "citadel_helper"}
# Each seat's own workspace ON STAGING, created by that seat (measured 2026-09-20). This is no
# longer substituted into probes - it is DECLARED, and every run reports whether the workspace the
# box actually signed into matches it. See plan_for for why.
WORKSPACES = {"ray-tor1-1": "v11x7qfj0mg64j7", "ray-tor1-2": "gsxc0bp3qkzvvu0",
              "ray-tor1-3": "4pkak04shs913un", "ray-tor1-4": "bdqc0ltj81t5u7d",
              "mesh-memory": "4eijifip8xhorbs", "mesh-control": "56o8prujj51dmu2"}

# feature, method, path (W = this seat's own workspace), body, what "alive" looks like.
# A GET read should answer 200. A POST with an empty body should answer 400 and name its contract.
PROBES: list[tuple[str, str, str, Any, tuple[int, ...]]] = [
    ("control.absent-route", "GET", "/api/buildanddo/definitely-not-a-route-9f3", None, (404,)),
    ("control.unauthenticated", "GET", "/api/buildanddo/learning", None, (401,)),

    ("learning.catalogue", "GET", "/api/buildanddo/learning", None, (200,)),
    ("learning.progress", "POST", "/api/buildanddo/learning/bdo25lesson0001", {}, (400, 403)),
    ("onboarding", "POST", "/api/buildanddo/onboarding", {}, (400, 403)),
    # 404 here is DELIBERATE, not absent: estate.pb.js answers 404 to any seat that is not
    # the master seat, so the route is indistinguishable from missing unless you are one.
    ("estate.fleet-status", "GET", "/api/buildanddo/estate/fleet-status", None, (200, 404)),

    ("workspace.access", "GET", "/api/buildanddo/workspaces/W/access", None, (200,)),
    ("workspace.admin", "GET", "/api/buildanddo/workspaces/W/admin", None, (200, 403)),
    ("workspace.admin.command", "POST", "/api/buildanddo/workspaces/W/admin", {}, (400, 403)),
    ("workspace.operator", "GET", "/api/buildanddo/workspaces/W/operator", None, (200, 403)),
    ("workspace.community", "POST", "/api/buildanddo/workspaces/W/community", {}, (400, 403)),

    ("missions.suite", "POST", "/api/buildanddo/workspaces/W/suite", {}, (400, 403)),
    ("workflows.run", "POST", "/api/buildanddo/workflow-runs", {}, (400, 403)),
    ("workflows.decision", "POST", "/api/buildanddo/workflow-runs/none/decisions", {}, (400, 403, 404)),
    ("decisions.read", "GET", "/api/buildanddo/workspaces/W/decisions/none", None, (400, 403, 404)),
    ("decisions.decide", "POST", "/api/buildanddo/workspaces/W/decide", {}, (400, 403)),

    ("business.read", "GET", "/api/buildanddo/workspaces/W/business", None, (200, 403, 503)),
    ("business.command", "POST", "/api/buildanddo/workspaces/W/business", {}, (400, 403, 503)),
    ("integrations.read", "GET", "/api/buildanddo/workspaces/W/integrations", None, (200, 403)),

    ("knowledge.read", "GET", "/api/buildanddo/workspaces/W/knowledge", None, (200, 403)),
    # This one ACCEPTS an empty body and assembles a default context, so 200 is alive.
    ("knowledge.context", "POST", "/api/buildanddo/workspaces/W/knowledge/context", {}, (200, 400, 403)),
    ("wiki.read", "GET", "/api/buildanddo/workspaces/W/wiki", None, (200, 403)),
    ("blueprints.read", "GET", "/api/buildanddo/workspaces/W/blueprints", None, (200, 403)),
    ("blueprints.analyze", "POST", "/api/buildanddo/workspaces/W/blueprints/analyze", {}, (400, 403)),

    ("assistant.read", "GET", "/api/buildanddo/workspaces/W/assistant", None, (200, 403)),
    ("assistant.chat", "POST", "/api/buildanddo/workspaces/W/assistant/chat", {}, (400, 403)),
    ("assistant.knowledge", "GET", "/api/buildanddo/workspaces/W/assistant/knowledge", None, (200, 403)),

    ("research.read", "GET", "/api/buildanddo/workspaces/W/research", None, (200, 403)),
    ("research.command", "POST", "/api/buildanddo/workspaces/W/research", {}, (400, 403)),
    ("research.worker-queue", "GET", "/api/buildanddo/workspaces/W/research-worker/queue", None, (200, 403)),
    ("dossier.read", "POST", "/api/buildanddo/dossier/read", {}, (400, 403)),

    ("forums.read", "GET", "/api/buildanddo/workspaces/W/forums", None, (200, 403)),
    ("classrooms.read", "GET", "/api/buildanddo/workspaces/W/classrooms", None, (200, 403)),
    ("classrooms.command", "POST", "/api/buildanddo/workspaces/W/classrooms", {}, (400, 403)),
    ("classroom.presence.health", "GET", "/api/classroom/presence/health", None, (200,)),
    ("classroom.presence.read", "GET", "/api/classroom/presence", None, (200, 400, 401)),
    ("classroom.health", "GET", "/api/classroom/health", None, (200,)),
    ("classroom.session", "POST", "/api/classroom/session", {}, (400, 401, 403)),
    ("classroom.tracks", "POST", "/api/classroom/tracks", {}, (400, 401, 403)),

    ("ocn.health", "GET", "/api/ocn/health", None, (200,)),
]

STATE = {-1: "UNMEASURABLE", 404: "ROUTE_ABSENT", 503: "DEPENDENCY_MISSING", 401: "NEEDS_AUTH",
         403: "REFUSED_BY_POLICY", 400: "REJECTED_PAYLOAD", 200: "OK", 201: "OK",
         0: "TRANSPORT_FAULT"}

# Runs on the box. Signs once, then walks every probe. Prints one line per probe and nothing else.
REMOTE = r"""
set -e
cd %(cbf)s
BUCKET=$(date -u +%%Y-%%m-%%dT%%H)
PAYLOAD="{\"login\":\"buildanddo\",\"ts_bucket\":\"$BUCKET\"}"
HEADER=$(python3 -m tools.cbf.citadelkey.citadel_key sign --seat %(seat)s --audience buildanddo-login --payload "$PAYLOAD" --header 2>/dev/null | tail -1)
if [ -z "$HEADER" ]; then echo "FATAL sign"; exit 0; fi
LCODE=$(curl -s -o /tmp/bdo_login.json -w "%%{http_code}" -A "Mozilla/5.0" -H "X-Citadel-Key: $HEADER" -H "Content-Type: application/json" -X POST -d "{}" %(base)s/api/ocn/login)
if [ "$LCODE" != "200" ]; then echo "FATAL login $LCODE"; exit 0; fi
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/bdo_login.json')).get('token',''))")
echo "UID $(python3 -c "import json;print((json.load(open('/tmp/bdo_login.json')).get('record') or {}).get('id',''))")"
echo "IP $(curl -s -m 10 https://api.ipify.org || echo unknown)"
WS=$(curl -s -m 30 -A "Mozilla/5.0" -H "Authorization: $TOKEN" "%(base)s/api/collections/workspaces/records?perPage=1&sort=created" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: print('')
else: print(((d.get('items') or [{}])[0] or {}).get('id',''))
")
echo "WS $WS"
printf "%%s" "%(plan)s" | base64 -d > /tmp/bdo_plan.txt
while IFS='|' read -r IDX METHOD PATHV BODY AUTH; do
  [ -z "$IDX" ] && continue
  case "$PATHV" in
    */W/*)
      # No workspace to read means this probe was never run. Emitting a real HTTP code here
      # would turn "we could not look" into "we looked and it was missing".
      if [ -z "$WS" ]; then echo "R $IDX -1"; continue; fi
      PATHV=$(printf "%%s" "$PATHV" | sed "s#/W/#/$WS/#") ;;
  esac
  if [ -n "$BODY" ]; then
    printf "%%s" "$BODY" | base64 -d > /tmp/bdo_body.json
    if [ "$AUTH" = "1" ]; then
      CODE=$(curl -s -o /tmp/bdo_out.json -w "%%{http_code}" -m 40 -A "Mozilla/5.0" -H "Authorization: $TOKEN" -H "Content-Type: application/json" -X "$METHOD" -d @/tmp/bdo_body.json "%(base)s$PATHV")
    else
      CODE=$(curl -s -o /tmp/bdo_out.json -w "%%{http_code}" -m 40 -A "Mozilla/5.0" -H "Content-Type: application/json" -X "$METHOD" -d @/tmp/bdo_body.json "%(base)s$PATHV")
    fi
  else
    if [ "$AUTH" = "1" ]; then
      CODE=$(curl -s -o /tmp/bdo_out.json -w "%%{http_code}" -m 40 -A "Mozilla/5.0" -H "Authorization: $TOKEN" -X "$METHOD" "%(base)s$PATHV")
    else
      CODE=$(curl -s -o /tmp/bdo_out.json -w "%%{http_code}" -m 40 -A "Mozilla/5.0" -X "$METHOD" "%(base)s$PATHV")
    fi
  fi
  CT=$(head -c 200 /tmp/bdo_out.json | tr -d '\n' | base64 -w0)
  echo "R $IDX $CODE $CT"
done < /tmp/bdo_plan.txt
rm -f /tmp/bdo_login.json /tmp/bdo_out.json /tmp/bdo_body.json /tmp/bdo_plan.txt
"""


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def fleet() -> dict[str, dict]:
    if not FLEET.is_file():
        return {}
    boxes = json.loads(FLEET.read_text(encoding="utf-8")).get("boxes") or {}
    return {k: v for k, v in boxes.items() if isinstance(v, dict)}


def plan_for(box: str) -> list[tuple[int, str, str, Any, bool]]:
    """Mark which probes carry the session. `/W/` is left for the BOX to fill in.

    WHY THE WORKSPACE IS NOT SUBSTITUTED HERE. A workspace id belongs to one environment. The
    record this seat owns on staging does not exist on production, so substituting one constant
    into both made every workspace probe on production ask for a STAGING record. Measured
    2026-09-23: this seat reads 13 workspaces on staging and 1 on production, and they share no
    id. The run reported 20 features RECORD_MISSING - a defect in this tool wearing a defect in
    the product's clothes, and a repair list pointing at provisioning that was not missing.

    The box now reads the workspace out of its own authenticated session, so the sweep measures
    the environment it was pointed at. The table above stays as a DECLARED value the run is
    checked against, because a seat that suddenly signs into a different workspace than the one
    it owns is itself worth seeing.
    """
    return [(index, method, path, body, name != "control.unauthenticated")
            for index, (name, method, path, body, _expect) in enumerate(PROBES)]


def encode_plan(rows) -> str:
    lines = []
    for index, method, path, body, auth in rows:
        payload = base64.b64encode(json.dumps(body).encode()).decode() if body is not None else ""
        lines.append("%d|%s|%s|%s|%d" % (index, method, path, payload, 1 if auth else 0))
    return base64.b64encode(("\n".join(lines) + "\n").encode()).decode()


# PocketBase's own router emits this when nothing is registered for a path. An application
# handler that ran and then could not find a RECORD says something else entirely.
_ROUTER_404 = "file not found"


def classify(code: int, expect: tuple[int, ...], body: str = "") -> tuple[str, bool]:
    """Returns (state, alive). `alive` is whether this feature functions for this seat.

    A 404 HAS TWO CAUSES AND THEY NEED OPPOSITE REPAIRS. Measured against production
    2026-09-21 (seat VCC): this function mapped every 404 to ROUTE_ABSENT from the status code
    alone, and reported 18 features as missing hooks. They were not missing. Probed
    unauthenticated, 12 of 13 answered 401 "requires valid record authorization token" -- the
    hook is registered and enforcing auth. The authenticated 404 body said "The requested
    workspace record is unavailable": the ROUTE exists, the seat's WORKSPACE does not.

    One data gap read as eighteen deployment gaps, and the repair list it produced pointed at a
    code deploy that could not have fixed any of them. So the body is now read: PocketBase's
    router 404 is ROUTE_ABSENT, and a handled 404 is RECORD_MISSING.
    """
    if code == 404 and body and _ROUTER_404 not in body.lower():
        return "RECORD_MISSING", code in expect
    return STATE.get(code, "HTTP_%d" % code), code in expect


def on_box(box: str, ip: str, base: str, rows) -> dict[str, Any]:
    key = Path.home() / ".ssh" / SSH_KEYS.get(box, "")
    if not key.is_file():
        return {"error": "no ssh key for %s" % box}
    script = REMOTE % {"cbf": CBF, "seat": box, "base": base, "plan": encode_plan(rows)}
    ssh = shutil.which("ssh") or "ssh"
    try:
        done = subprocess.run(
            [ssh, "-i", str(key), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
             "-o", "ConnectTimeout=15", "root@%s" % ip,
             # Windows text-mode pipes rewrite LF as CRLF; bash on the box would die at line 1.
             "tr -d '\\r' | bash -s"],
            input=script, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return {"error": "ssh timeout"}
    answer: dict[str, Any] = {"results": {}}
    for raw in (done.stdout or "").splitlines():
        parts = raw.strip().split(" ")
        if parts[0] == "R" and len(parts) >= 3:
            body = ""
            if len(parts) > 3:
                try:
                    body = base64.b64decode(parts[3]).decode("utf-8", "replace")
                except Exception:  # noqa: BLE001
                    body = ""
            answer["results"][int(parts[1])] = (int(parts[2]), body)
        elif parts[0] == "WS":
            answer["workspace"] = parts[1] if len(parts) > 1 else ""
        elif parts[0] in ("UID", "IP") and len(parts) > 1:
            answer[parts[0].lower()] = parts[1]
        elif parts[0] == "FATAL":
            answer["error"] = " ".join(parts[1:]) or "fatal"
    if not answer["results"] and "error" not in answer:
        answer["error"] = (done.stderr or "no output").strip()[:200]
    return answer


def sweep(box: str, env: str) -> dict[str, Any]:
    out: dict[str, Any] = {"schema": SCHEMA, "at": utc(), "box": box, "env": env, "checks": [],
                           "controls_held": False, "broken": [], "degraded": []}
    record = fleet().get(box) or {}
    ip = record.get("public_ip") or ""
    if not ip:
        out["state"] = "UNMEASURED"
        out["reason"] = "%s is not in the fleet map at %s" % (box, FLEET)
        return out
    out["public_ip"] = ip
    answer = on_box(box, ip, ENVS[env] + BACKEND, plan_for(box))
    if answer.get("error"):
        out["state"] = "UNMEASURED"
        out["reason"] = answer["error"]
        return out
    out["seat_uid"] = answer.get("uid", "")
    out["measured_from_ip"] = answer.get("ip", "")
    out["workspace_measured"] = answer.get("workspace", "")
    out["workspace_declared"] = WORKSPACES.get(box, "")
    if not out["workspace_measured"]:
        # Every /W/ probe below will read UNMEASURABLE. Say why once, here, rather than leaving a
        # reader to infer it from twenty rows.
        out["workspace_note"] = ("this seat can read NO workspace on %s, so no workspace feature "
                                 "could be measured" % env)
    elif out["workspace_measured"] != out["workspace_declared"]:
        out["workspace_note"] = ("measured against %s, which is not the declared %s - expected "
                                 "across environments, since a workspace id belongs to one"
                                 % (out["workspace_measured"], out["workspace_declared"]))
    controls = {}
    for index, (name, method, path, _body, expect) in enumerate(PROBES):
        code, body = answer["results"].get(index, (0, ""))
        state, alive = classify(code, expect, body)
        row = {"feature": name, "method": method, "path": path.replace("/W/", "/<workspace>/"),
               "http": code, "state": state, "alive": alive, "expected": list(expect)}
        if not alive and body:
            row["said"] = body[:160]
        out["checks"].append(row)
        if name.startswith("control."):
            controls[name] = alive
    out["controls_held"] = bool(controls) and all(controls.values())
    if not out["controls_held"]:
        out["state"] = "VOID"
        out["reason"] = ("The controls did not hold, so no status on this run means what it says: "
                         + ", ".join("%s=%s" % (k, "held" if v else "FAILED")
                                     for k, v in controls.items()))
        return out
    for row in out["checks"]:
        if row["feature"].startswith("control."):
            continue
        # `alive` decides first. A 404 this route is DECLARED to answer - estate.fleet-status
        # hides itself from every non-master seat - is working software, and reporting it as
        # absent would have sent an operator to repair a deliberate refusal.
        if row["alive"]:
            continue
        if row["state"] == "ROUTE_ABSENT":
            out["broken"].append(row["feature"])
        elif row["state"] == "UNMEASURABLE":
            out.setdefault("unmeasurable", []).append(row["feature"])
        elif row["state"] == "RECORD_MISSING":
            # Not a deploy defect: the route answered. This seat has no record to read.
            out.setdefault("record_missing", []).append(row["feature"])
        else:
            out["degraded"].append(row["feature"])
    if out.get("unmeasurable"):
        # Absence of measurement is not health and it is not breakage either.
        out["state"] = "PARTIAL"
    else:
        out["state"] = ("PASS" if not out["broken"] and not out["degraded"]
                        and not out.get("record_missing") else "REPAIR_NEEDED")
    return out


def table(result: dict[str, Any]) -> str:
    lines = ["OCN feature sweep  box=%s  env=%s  %s"
             % (result["box"], result["env"], result.get("state"))]
    if result.get("measured_from_ip"):
        lines.append("  measured from %s as seat %s"
                     % (result["measured_from_ip"], result.get("seat_uid", "")))
    if result.get("workspace_measured"):
        lines.append("  workspace measured: %s (declared %s)"
                     % (result["workspace_measured"], result.get("workspace_declared") or "none"))
    if result.get("workspace_note"):
        lines.append("  " + result["workspace_note"])
    if result.get("unmeasurable"):
        lines.append("  NOT MEASURED (no workspace to read; this is not a pass): "
                     + ", ".join(result["unmeasurable"]))
    if result.get("record_missing"):
        lines.append("  RECORD MISSING (route answered; this seat has no such record - a "
                     "PROVISIONING fix, not a deploy): " + ", ".join(result["record_missing"]))
    if result.get("reason"):
        lines.append("  " + result["reason"])
    for row in result.get("checks", []):
        lines.append("  %s%-5d%-20s%s" % ("ok " if row["alive"] else "XX ", row["http"],
                                          row["state"], row["feature"]))
        if row.get("said"):
            lines.append("        said: " + row["said"][:110])
    if result.get("broken"):
        lines.append("  ROUTE ABSENT: " + ", ".join(result["broken"]))
    if result.get("degraded"):
        lines.append("  NOT FUNCTIONING: " + ", ".join(result["degraded"]))
    return "\n".join(lines)


def selftest() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    def record(name, ok, detail=""):
        checks.append({"check": name, "state": "PASS" if ok else "FAIL", "detail": detail})

    record("every probe has a distinct feature name", len({p[0] for p in PROBES}) == len(PROBES))
    record("both controls are present",
           {"control.absent-route", "control.unauthenticated"} <= {p[0] for p in PROBES})
    record("404 where 200 was required reads as absent", classify(404, (200,))[0] == "ROUTE_ABSENT")
    record("a router 404 is still ROUTE_ABSENT",
           classify(404, (200,), '{"message":"File not found.","status":404}')[0] == "ROUTE_ABSENT")
    record("a HANDLED 404 is RECORD_MISSING, not a missing route",
           classify(404, (200,), '{"message":"The requested workspace record is unavailable."}')[0]
           == "RECORD_MISSING")
    record("and a body-less 404 stays ROUTE_ABSENT rather than guessing",
           classify(404, (200,), "")[0] == "ROUTE_ABSENT")
    record("the distinction does not change aliveness",
           classify(404, (404,), '{"message":"workspace record is unavailable."}')[1] is True)
    record("403 is working software, not a break", classify(403, (200, 403))[1] is True)
    record("a 200 where 404 was required fails", classify(200, (404,))[1] is False)
    record("503 separates from 404", classify(503, (200,))[0] == "DEPENDENCY_MISSING")
    record("a probe that could not be run is UNMEASURABLE, not absent",
           classify(-1, (200,))[0] == "UNMEASURABLE")
    record("and UNMEASURABLE is never alive", classify(-1, (200,))[1] is False)
    rows = plan_for("mesh-control")
    record("the workspace is left for the box to fill in, not baked in here",
           any("/W/" in r[2] for r in rows)
           and not any("56o8prujj51dmu2" in r[2] for r in rows))
    record("the unauthenticated control carries no session", not [r for r in rows if r[0] == 1][0][4])
    record("every other probe carries the session", all(r[4] for r in rows if r[0] != 1))
    decoded = base64.b64decode(encode_plan(rows)).decode().strip().splitlines()
    record("the encoded plan has one line per probe", len(decoded) == len(PROBES))
    record("no plan line could be split by the field separator",
           all(line.count("|") == 4 for line in decoded))
    return {"schema": SCHEMA, "at": utc(), "checks": checks,
            "state": "PASS" if all(c["state"] == "PASS" for c in checks) else "FAIL",
            "passed": sum(c["state"] == "PASS" for c in checks), "total": len(checks)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sw = sub.add_parser("sweep")
    sw.add_argument("--box", default="mesh-control", choices=sorted(SSH_KEYS))
    sw.add_argument("--env", default="staging", choices=sorted(ENVS))
    sw.add_argument("--json", action="store_true")
    sw.add_argument("--write", action="store_true",
                    help="persist the receipt so other tools can CITE this sweep")
    sub.add_parser("routes")
    sub.add_parser("selftest")
    args = ap.parse_args()
    if args.cmd == "routes":
        print(json.dumps({"schema": SCHEMA, "probes": [
            {"feature": p[0], "method": p[1], "path": p[2], "expect": list(p[4])}
            for p in PROBES]}, indent=2))
        return 0
    if args.cmd == "selftest":
        result = selftest()
        print(json.dumps(result, indent=2))
        return 0 if result["state"] == "PASS" else 1
    result = sweep(args.box, args.env)
    if getattr(args, "write", False) and result.get("env"):
        # A sweep that only prints cannot be cited. The known-gaps synthesizer needs a receipt
        # on disk naming the environment, the box it was measured FROM, and the seat it ran as.
        dest = ROOT / "state" / "ocn_feature_sweep" / ("%s.latest.json" % result["env"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(result, indent=2) + chr(10), encoding="utf-8")
        print("RECEIPT  %s" % dest)
    print(json.dumps(result, indent=2) if args.json else table(result))
    return 0 if result.get("state") == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
