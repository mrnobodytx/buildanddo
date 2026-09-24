#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/ocn_project_fleet.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     config/master_citadel.fleet.json, apps/pocketbase/pb_hooks/mission-suite.js
# EnumType:    Test
# EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/mission-suite.js
# DAG Node:    none
# Intent:      Prove multiplayer project work: two machines race for one mission, one wins.
# ───────────────────────────────────────────────────────────────
"""ocn_project_fleet.py - multiplayer work and project management, across real machines.

    ocn_project_fleet.py run [--json] [--env staging]
    ocn_project_fleet.py seats
    ocn_project_fleet.py selftest

WHAT THIS PROVES THAT A SINGLE-MACHINE TEST CANNOT. ocn_classroom_fleet.py already showed four
guildmasters on four boxes can share a room. A room is presence; a PROJECT is contention. The
question for work management is not "can several seats connect" - it is "when two seats reach
for the same task at the same instant, does exactly one get it".

mission-suite.js answers that with a LEASE: `claim` refuses when a mission is already
`processing` and its lease has not expired. That is mutual exclusion, and mutual exclusion is
only meaningfully tested CONCURRENTLY and from DIFFERENT machines - a sequential test passes
against a broken lock, and a same-machine test can pass on process-local state.

So the claim phase runs the two boxes through a thread pool, both firing at the same mission.
The assertion is not "both succeeded" but "exactly one did". Two winners is a corrupted work
queue - two people doing the same job. Two losers is a deadlocked one.

Each seat signs with its own Ed25519 key ON ITS OWN BOX over SSH, exactly as
ocn_classroom_fleet.py does: the private half never leaves the box and rig1 holds only
orchestration and receipts. The seat<->box mapping is read from the fleet map of record.
"""
from __future__ import annotations

import argparse
import base64
import concurrent.futures
import datetime as dt
import json
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
FLEET = REPO.parent.parent / "config" / "master_citadel.fleet.json"
ENVS = {"staging": "https://staging.buildanddo.com/hcgi/platform",
        "production": "https://buildanddo.com/hcgi/platform"}
CBF = "/opt/citadel/cbf"
SCHEMA = "buildanddo.ocn-project-fleet/v1"

SSH_KEYS = {"mesh-control": "citadel_test_droplet", "mesh-memory": "citadel_test_droplet",
            "ray-tor1-1": "citadel_helper", "ray-tor1-2": "citadel_helper",
            "ray-tor1-3": "citadel_helper", "ray-tor1-4": "citadel_helper"}

# The host owns the workspace and enqueues the work. The two racers contend for it. The
# outsider is the negative control: a box that belongs to no membership must not be able to
# see or take the work, and if it can, every other result here is meaningless.
HOST_BOX = "mesh-control"
RACER_BOXES = ["mesh-memory", "ray-tor1-1"]
OUTSIDER_BOX = "ray-tor1-4"

# The two seats named in BUILDANDDO_SUITE_BINDINGS for this workspace, and one that is NOT.
# All three are Guild Hall editors; only the binding tells them apart, which is what makes
# UNBOUND_BOX a control rather than a second opinion.
POOL_BOXES = ["mesh-control", "mesh-memory"]
UNBOUND_BOX = "ray-tor1-1"

# THE GUILD HALL, not a per-box workspace. ocn_feature_sweep.py maps each box to its OWN
# private workspace ("OCN box workspace (ray-tor1-1)" etc), which is right for a single-seat
# feature sweep and exactly wrong here: copying that map pointed mesh-control at ray-tor1-1's
# private workspace, where it is not a member, and `configure` answered
# "403 Current workspace membership is required."
#
# Multiplayer needs the workspace they SHARE. 56o8prujj51dmu2 is "Guild Hall", owned by
# mesh-control with all six box seats already editors - so the membership this tool needs was
# never missing, it was never addressed. Verified against the live collections rather than
# assumed; the RBAC acceptance matrix uses this same workspace.
# One source, one grant, one observation - the smallest input the maritime suite will accept.
# `key()` bounds every identifier to [A-Za-z0-9_:.-]{1,80}, event_time may not follow receipt
# time, and expires_at must still be in the future when the enqueue is read.
SOURCE_ID = "citadel-fleet-contention"
RIGHT = {"source_id": SOURCE_ID, "rights_id": "fleet-test-v1",
         "license_ref": "internal test fixture, not redistributed",
         "classification": "PUBLIC", "processing_allowed": True, "export_allowed": False,
         "expires_at": "2027-01-01T00:00:00Z", "independence_group": "citadel-fleet"}
OBSERVATION = {"observation_id": "obs-fleet-0001", "source_id": SOURCE_ID,
               "source_record_id": "rec-0001", "entity_id": "vessel-0001",
               "event_time": "2026-01-01T00:00:00Z", "latitude": 43.65, "longitude": -79.38}

GUILD_HALL = "56o8prujj51dmu2"
WORKSPACES = {"mesh-control": GUILD_HALL}

REMOTE = r"""
set -e
cd %(cbf)s
BUCKET=$(date -u +%%Y-%%m-%%dT%%H)
PAYLOAD="{\"login\":\"buildanddo\",\"ts_bucket\":\"$BUCKET\"}"
HEADER=$(python3 -m tools.cbf.citadelkey.citadel_key sign --seat %(seat)s --audience buildanddo-login --payload "$PAYLOAD" --header 2>/dev/null | tail -1)
if [ -z "$HEADER" ]; then echo "STAGE sign"; echo "HTTP 0"; exit 0; fi
curl -s -o /tmp/pf_login.json -w "%%{http_code}" -A "Mozilla/5.0" -H "X-Citadel-Key: $HEADER" -H "Content-Type: application/json" -X POST -d "{}" "%(base)s/api/ocn/login" > /tmp/pf_code
LCODE=$(cat /tmp/pf_code)
if [ "$LCODE" != "200" ]; then echo "STAGE login"; echo "HTTP $LCODE"; exit 0; fi
TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/pf_login.json')).get('token',''))")
echo "UID $(python3 -c "import json;print((json.load(open('/tmp/pf_login.json')).get('record') or {}).get('id',''))")"
if [ "%(method)s" = "WHOAMI" ]; then
  echo "IP $(curl -s -m 10 https://api.ipify.org || echo unknown)"
  echo "STAGE login"; echo "HTTP 200"; rm -f /tmp/pf_login.json /tmp/pf_code; exit 0
fi
if [ -n "%(b64)s" ]; then
  printf "%%s" "%(b64)s" | base64 -d > /tmp/pf_body.json
  curl -s -o /tmp/pf_out.json -w "%%{http_code}" -A "Mozilla/5.0" -H "Authorization: $TOKEN" -H "Content-Type: application/json" -X %(method)s -d @/tmp/pf_body.json "%(base)s%(path)s" > /tmp/pf_code
else
  curl -s -o /tmp/pf_out.json -w "%%{http_code}" -A "Mozilla/5.0" -H "Authorization: $TOKEN" "%(base)s%(path)s" > /tmp/pf_code
fi
echo "STAGE call"
echo "HTTP $(cat /tmp/pf_code)"
echo "BODY $(base64 -w0 /tmp/pf_out.json)"
rm -f /tmp/pf_login.json /tmp/pf_code /tmp/pf_out.json /tmp/pf_body.json
"""


def utc() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def fleet() -> dict[str, dict]:
    if not FLEET.is_file():
        return {}
    boxes = json.loads(FLEET.read_text(encoding="utf-8")).get("boxes") or {}
    return {k: v for k, v in boxes.items() if isinstance(v, dict) and v.get("public_ip")}


def on_box(box: str, record: dict, base: str, method: str, path: str = "",
           body: Any = None) -> dict[str, Any]:
    """One signed, authenticated call executed ON that box."""
    key = Path.home() / ".ssh" / SSH_KEYS.get(box, "")
    if not key.is_file():
        return {"stage": "ssh", "http": 0, "error": f"no ssh key for {box}"}
    script = REMOTE % {
        "cbf": CBF, "seat": box, "base": base, "method": method, "path": path,
        "b64": base64.b64encode(json.dumps(body).encode()).decode() if body is not None else "",
    }
    ssh = shutil.which("ssh") or "ssh"
    try:
        done = subprocess.run(
            [ssh, "-i", str(key), "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
             "-o", "ConnectTimeout=15", f"root@{record['public_ip']}",
             # Windows pipes rewrite LF as CRLF; bash on the box dies at line 1 without this.
             "tr -d '\\r' | bash -s"],
            input=script, capture_output=True, text=True, timeout=180)
    except subprocess.TimeoutExpired:
        return {"stage": "ssh", "http": 0, "error": "ssh timeout"}
    answer: dict[str, Any] = {"stage": "ssh", "http": 0, "box": box}
    for raw in (done.stdout or "").splitlines():
        label, _, rest = raw.strip().partition(" ")
        if label == "HTTP":
            answer["http"] = int(rest or 0)
        elif label in ("STAGE", "UID", "IP"):
            answer[label.lower()] = rest
        elif label == "BODY" and rest:
            try:
                answer["body"] = json.loads(base64.b64decode(rest) or b"{}")
            except Exception:                                   # noqa: BLE001
                answer["body"] = {}
    if answer["http"] == 0 and "stage" not in answer:
        answer["error"] = (done.stderr or done.stdout or "")[-180:]
    return answer


def note(checks: list[dict], name: str, box: str, answer: dict, expect: str, ok: bool) -> bool:
    checks.append({"check": name, "box": box, "expect": expect, "http": answer.get("http"),
                   "stage": answer.get("stage"),
                   "outcome": "AS_EXPECTED" if ok else "CONTRACT_BROKEN",
                   "message": str((answer.get("body") or {}).get("message")
                                  or answer.get("error") or "")[:150] or None})
    return ok


def adjudicate(results: list[dict]) -> dict:
    """The whole point of the exercise: exactly one racer may hold the mission.

    Kept separate from the network code so selftest can drive it with synthetic answers - the
    contention rule is the thing most worth testing, and it must not need two live boxes to be
    checked.
    """
    winners = [r for r in results if r.get("http") == 200]
    refused = [r for r in results if r.get("http") in (403, 409, 423)]
    errored = [r for r in results if r.get("http") not in (200, 403, 409, 423)]
    if errored:
        verdict = "UNMEASURED"
        why = "a racer neither won nor was cleanly refused; contention was not exercised"
    elif len(winners) == 1 and len(refused) == len(results) - 1:
        verdict = "MUTUAL_EXCLUSION_HELD"
        why = "exactly one machine took the work"
    elif len(winners) > 1:
        verdict = "DOUBLE_CLAIM"
        why = "more than one machine holds the same mission - duplicated work"
    else:
        verdict = "NOBODY_CLAIMED"
        why = "no machine could take queued work - the queue is stuck"
    return {"verdict": verdict, "why": why,
            "winners": [r.get("box") for r in winners],
            "refused": [r.get("box") for r in refused],
            "errored": [r.get("box") for r in errored]}


def selftest() -> dict:
    """Drive the adjudicator with synthetic answers. No network."""
    cases = [
        ("one winner, one refused", [{"box": "a", "http": 200}, {"box": "b", "http": 409}],
         "MUTUAL_EXCLUSION_HELD"),
        ("both won", [{"box": "a", "http": 200}, {"box": "b", "http": 200}], "DOUBLE_CLAIM"),
        ("neither won", [{"box": "a", "http": 409}, {"box": "b", "http": 409}], "NOBODY_CLAIMED"),
        ("one errored", [{"box": "a", "http": 200}, {"box": "b", "http": 500}], "UNMEASURED"),
        ("ssh failed", [{"box": "a", "http": 0}, {"box": "b", "http": 409}], "UNMEASURED"),
    ]
    checks = []
    for name, results, expected in cases:
        got = adjudicate(results)["verdict"]
        checks.append({"case": name, "expected": expected, "got": got,
                       "state": "PASS" if got == expected else "FAIL"})
    passed = sum(1 for c in checks if c["state"] == "PASS")
    return {"schema": SCHEMA, "command": "selftest", "checks": checks,
            "passed": passed, "total": len(checks),
            "state": "PASS" if passed == len(checks) else "FAIL"}


def run(env: str) -> dict[str, Any]:
    base = ENVS[env]
    boxes = fleet()
    out: dict[str, Any] = {"schema": SCHEMA, "command": "run", "env": env,
                           "observed_at": utc(), "checks": [], "machines": {}}
    needed = [HOST_BOX, *RACER_BOXES, OUTSIDER_BOX]
    missing = [b for b in needed if b not in boxes]
    if missing:
        out["state"] = "UNMEASURED"
        out["reason"] = f"fleet map has no public_ip for: {', '.join(missing)}"
        return out

    checks = out["checks"]
    workspace = WORKSPACES.get(HOST_BOX)
    mission = f"ocn-multiplayer-{uuid.uuid4().hex[:10]}"
    suite = f"/api/buildanddo/workspaces/{workspace}/suite"

    # 0. Who is each box, really. Distinct public IPs are what makes this multi-machine
    #    rather than four identities on one host.
    for box in needed:
        who = on_box(box, boxes[box], base, "WHOAMI")
        out["machines"][box] = {"ip": who.get("ip"), "uid": who.get("uid"),
                                "login_http": who.get("http")}
        note(checks, "login", box, who, "200", who.get("http") == 200)
    ips = {m["ip"] for m in out["machines"].values() if m.get("ip")}
    out["distinct_public_ips"] = len(ips)

    out["workspace"] = workspace

    # 0b. The project itself. `configure` resolves the mission by RECORD ID via
    #     findRecordById, so a generated name answers "The requested workspace record is
    #     unavailable" (404) - which is the same message the production sweep returns 18 times,
    #     for the same reason. The host creates a real mission from its own box: a superuser
    #     cannot, because the missions hook refuses with "Sign in with a workspace account."
    #     Field values are READ BACK from the collection schema, not guessed: `status` is a
    #     select over proposed|approved|running|needs_attention|verified|failed and `priority`
    #     over low|normal|high|urgent, and `owner` is REQUIRED. A first attempt with
    #     status="active", priority="medium" and no owner got a bare 400 "Failed to create
    #     record." - PocketBase does not say which field, so read the schema.
    created = on_box(HOST_BOX, boxes[HOST_BOX], base, "POST",
                     "/api/collections/missions/records",
                     {"workspace": workspace, "title": f"OCN Multiplayer {mission[-8:]}",
                      "status": "proposed", "priority": "normal",
                      "owner": out["machines"][HOST_BOX].get("uid") or ""})
    mission_id = (created.get("body") or {}).get("id") or ""
    note(checks, "create-mission", HOST_BOX, created, "200", bool(mission_id))
    out["mission_title"] = f"OCN Multiplayer {mission[-8:]}"
    out["mission"] = mission_id or mission

    # 0c. PROMOTE THE MISSION TO `running`. mission-suite.js:42 refuses every write with
    #     409 "Record mission approval and work started before running the suite." unless the
    #     mission is already `running`, and mission-policy.js will not let you jump there:
    #     TRANSITIONS allows proposed->approved->running and nothing else, a complete
    #     mission_plan is required before approval, approval authorship is stamped SERVER-side
    #     from the caller, and "Save the plan first, then approve the saved proposal" refuses a
    #     PATCH that changes the plan and the status together. So this is three deliberate
    #     writes, not one - the governance is the point, and a tool that could skip it would be
    #     testing a different system than the one that ships.
    plan = {"version": 1, "risk": "A1"}
    plan.update({
        "purpose": "Prove that two machines reaching for one work item produce exactly one owner.",
        "beneficiary": "Every member of a shared workspace, who must never be handed a task "
                       "another member is already doing.",
        "in_scope": "The suite_runs claim lease, exercised concurrently from separate hosts.",
        "out_of_scope": "Media transport. SFU, MoQ and TURN carry no work-ownership state.",
        "baseline": "Mutual exclusion is unproven: every prior test was sequential or "
                    "single-machine, and both pass against a lock that does not exist.",
        "target": "Exactly one enqueue returns 200 and the other is refused, across real hosts.",
        "authorization": "A1 additive test work under SRS-BUILDANDDO-LIVE-UTILIZATION-001.",
        "input_validation": "Each call is signed on its own box by its own seat key and the "
                            "server re-checks workspace membership per request.",
        "data_handling": "No personal data. The mission carries a random title and is left in "
                         "place as the receipt for this run.",
        "rollback": "The mission is inert once the race ends; failing the race changes no "
                    "production state.",
        "test": "Two boxes fire enqueue at one mission through a thread pool.",
        "evaluate": "Count the 200s. Two winners is duplicated work, zero is a deadlock.",
        "verify": "A non-member must be refused where the owner succeeds, or the run is void.",
        "validate": "Each box reports a distinct public IP, so the concurrency is real.",
    })
    record = f"/api/collections/missions/records/{out['mission']}"
    steps = (("plan", {"mission_plan": plan}),
             ("approve", {"status": "approved"}),
             ("start", {"status": "running"}))
    promoted = True
    for label, body in steps:
        if not promoted:
            break
        answer = on_box(HOST_BOX, boxes[HOST_BOX], base, "PATCH", record, body)
        promoted = note(checks, f"mission-{label}", HOST_BOX, answer, "200",
                        answer.get("http") == 200)

    # 1a. Enable the suite. mission-suite.js refuses an enqueue with "Ask a workspace
    #     administrator to enable this mission suite" until a configure has run, and every
    #     body is checked with access.exact - EXACTLY these keys, no more and no fewer, or it
    #     answers 400 "Use the listed fields for this command." That strictness is why the
    #     first version of this tool got 400 on a payload that looked perfectly reasonable.
    configure = on_box(HOST_BOX, boxes[HOST_BOX], base, "POST", suite, {
        "action": "configure", "mission": out["mission"], "revision": 0,
        "request_key": uuid.uuid4().hex,
        # parameters must carry EXACTLY the keys of DEFAULT_PARAMETERS, and they are the
        # MARITIME suite's (gap_seconds / max_speed_knots / position_tolerance_m /
        # stale_seconds) whichever suite you are configuring - each range-checked by finite().
        "payload": {"enabled": True, "rights": [RIGHT], "parameters": {
            "gap_seconds": 300, "max_speed_knots": 30,
            "position_tolerance_m": 100, "stale_seconds": 3600}},
    })
    configured = note(checks, "configure", HOST_BOX, configure, "200",
                      configure.get("http") == 200)

    # 2. THE RACE - and it is `enqueue`, not `claim`. The first version of this tool raced
    #    two boxes for a `claim` lease and every caller was refused with the identical
    #    "A registered suite worker is required.", INCLUDING the outsider, so the negative
    #    control was passing for a reason that had nothing to do with membership. Reading
    #    suite-policy.js explains why: worker() requires BUILDANDDO_SUITE_BINDINGS, which is
    #    absent from the staging unit, and bindings() keys at most ONE enabled binding per
    #    workspace with worker_user === auth.id. Peers can therefore never race for a claim -
    #    that lease guards one worker against double-processing its own run, not two people
    #    against each other.
    #
    #    The lock that DOES arbitrate between different members is `active_run`: enqueue
    #    refuses with 409 "Finish or cancel this mission's active run first." once a run
    #    exists. That is the work-management question in its real form - two people reach for
    #    the same task, exactly one creates the work item - and it holds between distinct
    #    users, which is what a shared project needs.
    race: list[dict[str, Any]] = []
    if configured:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(RACER_BOXES)) as pool:
            futures = {
                pool.submit(on_box, box, boxes[box], base, "POST", suite, {
                    "action": "enqueue", "mission": out["mission"], "revision": 0,
                    "request_key": uuid.uuid4().hex,
                    # MARITIME, not submission: the parameters `configure` insists on are
                    # maritime's, and its input is one bounded array rather than a document
                    # pipeline. Every observation must be covered by a rights grant carrying
                    # processing_allowed and an unexpired PUBLIC/COMMERCIAL classification -
                    # rightsFor() refuses the whole enqueue otherwise, which is why
                    # RIGHT.source_id and the observation's source_id are one constant and
                    # not two strings that happen to look alike.
                    "payload": {"suite": "maritime",
                                "input": {"observations": [OBSERVATION]}},
                }): box for box in RACER_BOXES
            }
            race = [f.result() for f in concurrent.futures.as_completed(futures)]
        out["race"] = adjudicate(race)
        out["race_detail"] = [{"box": r.get("box"), "http": r.get("http"),
                               "message": str((r.get("body") or {}).get("message") or "")[:120]}
                              for r in race]
        note(checks, "concurrent-enqueue", "+".join(RACER_BOXES),
             {"http": 200 if out["race"]["verdict"] == "MUTUAL_EXCLUSION_HELD" else 0},
             "exactly one winner", out["race"]["verdict"] == "MUTUAL_EXCLUSION_HELD")
    else:
        out["race"] = {"verdict": "UNMEASURED", "why": "the suite was never configured"}

    won = next((r for r in race if r.get("http") == 200), None)
    out["job_id"] = ((won or {}).get("body") or {}).get("id") or ""

    # 2b. A 200 here does NOT mean the work is runnable. With no worker binding the run is
    #     created `blocked` / `worker_unbound` - the mutual exclusion is real but nothing can
    #     execute the result. Reporting the HTTP code alone would have been a green over a
    #     queue that cannot move, so read the status the server actually stored.
    out["run_status"] = ((won or {}).get("body") or {}).get("status") or ""
    note(checks, "run-executable", HOST_BOX,
         {"http": 200 if out["run_status"] == "queued" else 0,
          "body": {"message": f"run status is {out['run_status'] or 'unknown'}"
                              + ("" if out["run_status"] == "queued" else
                                 "; a run is stored blocked/worker_unbound when no "
                                 "BUILDANDDO_SUITE_BINDINGS entry covers this workspace")}},
         "queued", out["run_status"] == "queued")

    # 2c. THE CLAIM LEASE, raced for real. This is the test this tool set out to write and
    #     could not: bindings() admitted exactly ONE worker_user per workspace, so two machines
    #     could never contend for a lease and the first attempt at this race refused every
    #     caller identically. suite-policy.js now accepts a bounded LIST of worker ids against
    #     the same pinned source_sha256, which is what actually guards the evidence - so the
    #     lease's own machinery is finally reachable. It was always multi-consumer:
    #     suite_runs.processor is a per-user relation, an expired lease is re-claimable, and
    #     complete() fences on the attempt number the claimer recorded, which can only ever
    #     matter when someone else can take over.
    #
    #     UNBOUND_BOX is the control and it is the sharp one: it is a Guild Hall editor exactly
    #     like both racers, and the ONLY thing separating it from them is the binding. If the
    #     pool admitted people by membership rather than by name, it would get through.
    claim_race: list[dict[str, Any]] = []
    unbound: dict[str, Any] = {"http": 0}
    if out["run_status"] == "queued" and out["job_id"]:
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(POOL_BOXES)) as pool:
            futures = {
                pool.submit(on_box, box, boxes[box], base, "POST", suite, {
                    "action": "claim", "mission": out["mission"], "revision": 1,
                    "request_key": uuid.uuid4().hex, "payload": {"id": out["job_id"]},
                }): box for box in POOL_BOXES
            }
            claim_race = [f.result() for f in concurrent.futures.as_completed(futures)]
        out["claim_race"] = adjudicate(claim_race)
        out["claim_race_detail"] = [
            {"box": r.get("box"), "http": r.get("http"),
             "message": str((r.get("body") or {}).get("message") or "")[:120]}
            for r in claim_race]
        note(checks, "concurrent-claim", "+".join(POOL_BOXES),
             {"http": 200 if out["claim_race"]["verdict"] == "MUTUAL_EXCLUSION_HELD" else 0,
              "body": {"message": out["claim_race"]["why"]}},
             "exactly one lease holder",
             out["claim_race"]["verdict"] == "MUTUAL_EXCLUSION_HELD")

        unbound = on_box(UNBOUND_BOX, boxes[UNBOUND_BOX], base, "POST", suite, {
            "action": "claim", "mission": out["mission"], "revision": 1,
            "request_key": uuid.uuid4().hex, "payload": {"id": out["job_id"]},
        })
        note(checks, "unbound-member-refused", UNBOUND_BOX, unbound, "403",
             unbound.get("http") == 403)
        won_lease = [r for r in claim_race if r.get("http") == 200]
        by_binding = bool(won_lease) and unbound.get("http") == 403
        note(checks, "pool-admits-by-binding", f"{'+'.join(POOL_BOXES)} vs {UNBOUND_BOX}",
             {"http": 200 if by_binding else 0,
              "body": {"message": f"pool winner={[r.get('box') for r in won_lease]} "
                                  f"unbound_member={unbound.get('http')} - all three are "
                                  "editors, so only the binding can separate them"}},
             "a named worker leases it, an unnamed member cannot", by_binding)
    else:
        out["claim_race"] = {"verdict": "UNMEASURED",
                             "why": "no queued run to contend for"}
    out["claim_detail"] = {
        "pool": out.get("claim_race_detail") or [],
        "unbound_member": {"box": UNBOUND_BOX, "http": unbound.get("http"),
                           "message": str((unbound.get("body") or {}).get("message") or "")[:120]},
    }

    # 3. THE CONTROL, rebuilt so that it discriminates. Every one of the six box seats is an
    #    editor of the Guild Hall, so the box named OUTSIDER_BOX was never outside anything.
    #    workspace_members rows are superuser-only, so the test cannot provision a membership
    #    it lacks - but it CAN own a workspace, and an owner-only workspace makes every other
    #    seat a genuine non-member. The control is therefore two callers against ONE resource:
    #    the owner must succeed where the non-member is refused, and the refusal must cite
    #    membership rather than repeating the race's 409. Identical answers would mean the
    #    control is measuring nothing, which is exactly the trap the first version fell into.
    private = on_box(HOST_BOX, boxes[HOST_BOX], base, "POST",
                     "/api/collections/workspaces/records",
                     {"name": f"OCN Contention Control {uuid.uuid4().hex[:8]}",
                      "owner": out["machines"][HOST_BOX].get("uid") or ""})
    control_ws = (private.get("body") or {}).get("id") or ""
    out["control_workspace"] = control_ws
    # The control workspace needs its OWN mission. Pointing both callers at the Guild Hall
    # mission made the owner fail too - 403 for "that mission is not in this workspace"
    # rather than for membership - and two 403s from different causes look exactly like a
    # working control. The assertion below is what caught it.
    control_mission = on_box(HOST_BOX, boxes[HOST_BOX], base, "POST",
                             "/api/collections/missions/records",
                             {"workspace": control_ws,
                              "title": f"OCN Contention Control {uuid.uuid4().hex[:8]}",
                              "status": "proposed", "priority": "normal",
                              "owner": out["machines"][HOST_BOX].get("uid") or ""})
    control_id = (control_mission.get("body") or {}).get("id") or ""
    control_suite = f"/api/buildanddo/workspaces/{control_ws}/suite"
    control_body = {"action": "snapshot", "mission": control_id, "revision": 0,
                    "request_key": uuid.uuid4().hex, "payload": {"page": 1}}
    owner_sees = on_box(HOST_BOX, boxes[HOST_BOX], base, "POST", control_suite, control_body)
    outsider = on_box(OUTSIDER_BOX, boxes[OUTSIDER_BOX], base, "POST", control_suite,
                      dict(control_body, request_key=uuid.uuid4().hex))
    out["control_detail"] = {
        "owner": {"box": HOST_BOX, "http": owner_sees.get("http"),
                  "message": str((owner_sees.get("body") or {}).get("message") or "")[:120]},
        "non_member": {"box": OUTSIDER_BOX, "http": outsider.get("http"),
                       "message": str((outsider.get("body") or {}).get("message") or "")[:120]},
    }
    note(checks, "non-member-refused", OUTSIDER_BOX, outsider, "403/404",
         outsider.get("http") in (403, 404))
    # The discrimination itself, asserted rather than assumed.
    discriminates = (outsider.get("http") != owner_sees.get("http")
                     and owner_sees.get("http") not in (0, 403, 404))
    note(checks, "control-discriminates", f"{HOST_BOX} vs {OUTSIDER_BOX}",
         {"http": 200 if discriminates else 0,
          "body": {"message": f"owner={owner_sees.get('http')} "
                              f"non_member={outsider.get('http')} - equal answers would mean "
                              "the control measures nothing"}},
         "owner and non-member differ", discriminates)

    broken = [c for c in checks if c["outcome"] == "CONTRACT_BROKEN"]
    out["state"] = ("UNMEASURED" if out["race"]["verdict"] == "UNMEASURED"
                    else "CONTRACT_BROKEN" if broken else "PASS")
    out["contract_broken"] = [c["check"] for c in broken]
    return out


def table(result: dict) -> str:
    lines = [f"OCN project fleet  env={result.get('env')}  {result.get('state')}"]
    if result.get("reason"):
        lines.append(f"  reason: {result['reason']}")
    lines.append(f"  distinct public IPs: {result.get('distinct_public_ips')}")
    for box, machine in sorted((result.get("machines") or {}).items()):
        lines.append(f"    {box:14s} ip={machine.get('ip') or '?':16s} login={machine.get('login_http')}")
    lease = result.get("claim_race") or {}
    if lease:
        lines.append(f"  LEASE RACE: {lease.get('verdict')} - {lease.get('why')}")
        lines.append(f"    holder={lease.get('winners')} refused={lease.get('refused')}")
    race = result.get("race") or {}
    if race:
        lines.append(f"  ENQUEUE RACE: {race.get('verdict')} - {race.get('why')}")
        lines.append(f"    winners={race.get('winners')} refused={race.get('refused')} errored={race.get('errored')}")
    for check in result.get("checks") or []:
        mark = "ok" if check["outcome"] == "AS_EXPECTED" else "XX"
        lines.append(f"    {mark} {str(check['http']):4s} {check['check']:20s} {check['box']}")
        if check.get("message"):
            lines.append(f"          said: {check['message']}")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    rn = sub.add_parser("run")
    rn.add_argument("--env", default="staging", choices=sorted(ENVS))
    rn.add_argument("--json", action="store_true")
    rn.add_argument("--write", action="store_true",
                    help="persist the receipt so other tools can CITE this contention run")
    sub.add_parser("seats")
    sub.add_parser("selftest")
    args = ap.parse_args()

    if args.cmd == "seats":
        boxes = fleet()
        print(json.dumps({"schema": SCHEMA, "host": HOST_BOX, "racers": RACER_BOXES,
                          "outsider": OUTSIDER_BOX,
                          "known": {b: boxes.get(b, {}).get("public_ip") for b in
                                    [HOST_BOX, *RACER_BOXES, OUTSIDER_BOX]}}, indent=2))
        return 0
    if args.cmd == "selftest":
        result = selftest()
        print(json.dumps(result, indent=2))
        return 0 if result["state"] == "PASS" else 1

    result = run(args.env)
    if getattr(args, "write", False) and result.get("env"):
        # Same convention as ocn_feature_sweep: a contention run that only prints cannot be
        # cited. The receipt names the environment, every machine's public IP, the verdict and
        # the control's two answers - the last of which is what makes the verdict readable.
        dest = REPO / "state" / "ocn_project_fleet" / ("%s.latest.json" % result["env"])
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(result, indent=2) + chr(10), encoding="utf-8")
        print("RECEIPT  %s" % dest)
    print(json.dumps(result, indent=2) if args.json else table(result))
    return 0 if result.get("state") == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
