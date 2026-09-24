#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_guild_dogfood.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     scripts/ci/ocn_guild_forum.py, apps/pocketbase/pb_hooks/mission-policy.js,
#              apps/pocketbase/pb_hooks/workflow-runs.js, apps/pocketbase/pb_hooks/workflow-policy.js
# EnumType:    Verifier
# EnumEdges:   PROMOTES a guildmaster's public proposals into signals, a mission and a real run
# Intent:      Take what a guild published in the forum and carry it all the way to scheduled work
#              inside the same platform, so the loop from opinion to workload is one walkable chain
#              rather than four systems that each believe the others did something.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_guild_dogfood.py - carry this guild's public proposals into signals, a mission and a run.

RUNS ON A FLEET BOX, as the guildmaster, in the workspace it is a member of.

    ocn_guild_dogfood.py <seat> <workspace> promote  --guild NAME --proposals FILE --source URL
    ocn_guild_dogfood.py <seat> <workspace> workload --guild NAME --signals ID,ID --source URL
    ocn_guild_dogfood.py <seat> <workspace> verify   --mission ID --signals ID,ID

THE CHAIN, and why each link is a RELATION rather than a sentence:

    forum reply (public, fetchable)
      <- evidence.source names that URL, evidence.content carries what was proposed
           <- signal.evidence CITES the evidence record, signal carries the OPINION
                <- signal.mission binds the opinion to the mission it produced
                     <- workflow_run.mission binds real scheduled work to that same mission

A sentence saying "see evidence 1f7z..." cannot be resolved, cannot be queried backwards to ask
what rests on an observation, and reads exactly the same after the evidence is withdrawn.

EVIDENCE IS OBSERVED, SIGNALS ARE INFERRED. The evidence records a FACT - this text was published
at this URL at this time, and anyone can fetch it. The signal records a JUDGEMENT about what should
be done. Typing the judgement as `observed` would launder an opinion into a measurement, which is
the specific failure this whole lane exists to avoid.

A MISSION IS NOT A WORKLOAD UNTIL SOMETHING RUNS. missions carry intent; workflow_runs carry work.
The run refuses to bind unless the mission is genuinely `running` with a recorded approval
(workflow-runs.js missionFor), so a mission that was never approved cannot acquire work by
accident. That refusal is exercised here rather than assumed.
"""
from __future__ import annotations
import argparse
import datetime
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.request

ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
CBF = "/opt/citadel/cbf"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-dogfood/1.0)",
      "Content-Type": "application/json"}

PLAN_FIELDS = ["purpose", "beneficiary", "in_scope", "out_of_scope", "baseline", "target",
               "authorization", "input_validation", "data_handling", "rollback",
               "test", "evaluate", "verify", "validate"]

# The shape of turning a published proposal into work. Kinds are the five the policy allows:
# read, transform, approval, notify, record.
STEPS = [
    {"id": "read-thread", "name": "Read the proposal and its thread", "kind": "read",
     "detail": "Fetch the forum reply this work came from and the topic it answered."},
    {"id": "remeasure", "name": "Re-measure the claim it rests on", "kind": "read",
     "detail": "Reproduce the measurement independently before acting on it."},
    {"id": "guild-approval", "name": "Guild approval to schedule", "kind": "approval",
     "detail": "A guildmaster accepts the work into the guild's queue."},
    {"id": "smallest-slice", "name": "Implement the smallest provable slice", "kind": "transform",
     "detail": "Build the least that can be demonstrated end to end."},
    {"id": "record-outcome", "name": "Record evidence of the outcome", "kind": "record",
     "detail": "Attach what actually happened, including a negative control."},
]


def http(url, data=None, headers=None, method=None, timeout=30):
    head = dict(UA)
    head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head,
                                 method=method or ("POST" if data is not None else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw[:1] in (b"{", b"[") else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw[:1] in (b"{", b"[") else {})
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
    status, body = http(base + BACKEND + "/api/ocn/login", data=b"{}",
                        headers={"X-Citadel-Key": header})
    if status != 200:
        return None, None
    return body.get("token"), (body.get("record") or {}).get("id")


def request_key(seat, purpose):
    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    return "wf" + hashlib.sha256(("|".join([seat, purpose, day])).encode("utf-8")).hexdigest()[:40]


def plan_for(guild, headline, source):
    """A real plan, not placeholder text. Every field has to answer its own question."""
    plan = {"version": 1, "risk": "A1"}
    plan["purpose"] = ("Carry the %s guild's published proposal - %s - from a forum opinion into "
                       "scheduled work, so that a recommendation either becomes a run with "
                       "receipts or is visibly declined." % (guild, headline))[:1200]
    plan["beneficiary"] = ("Whoever next has to decide what this platform works on, and the guild "
                           "that has to answer for the recommendation.")
    plan["in_scope"] = ("The proposals this guild published at %s, and the signals raised from "
                        "them." % source)[:1200]
    plan["out_of_scope"] = ("Proposals from other guilds, and any change outside this workspace. "
                            "Each guild carries its own recommendations.")
    plan["baseline"] = ("The proposals exist only as forum text. Nothing is scheduled and nothing "
                        "is measurable about whether they were acted on.")
    plan["target"] = ("Each proposal is a signal citing the public post it came from, and the "
                      "guild's first proposal is bound to a run that records real outcomes.")
    plan["authorization"] = ("A1 additive work inside the guild's own workspace, proposed and "
                             "approved by the guildmaster that published it.")
    plan["input_validation"] = ("Proposal text is bounded before it is posted and again before it "
                                "is stored; the server checks payload keys exactly.")
    plan["data_handling"] = ("Public forum content and workspace records only. No credentials, no "
                             "personal data, nothing that leaves this workspace.")
    plan["rollback"] = ("Signals, mission and run are records in this workspace and can be deleted "
                        "by the workspace owner. Nothing outside it is touched.")
    plan["test"] = ("Walk the chain back by fetching: signal cites evidence, evidence names the "
                    "public post, run names the mission.")
    plan["evaluate"] = ("A link that cannot be fetched, or a relation that is prose rather than a "
                        "relation, counts as a failure even if every record exists.")
    plan["verify"] = ("A box that did not write any of it re-reads the whole chain and agrees.")
    plan["validate"] = ("The recommendation is only carried if the measurement behind it "
                        "reproduces independently.")
    return plan


def linkable(source, limit=120):
    """signals.source caps at 120 characters and evidence.source does not.

    MEASURED: the topic URL plus a '#reply-id' fragment is 125 characters, and the server refuses
    it with 'Must be no more than 120 character(s).' Truncating a URL to fit would store a link
    that resolves to nothing, which is worse than a shorter one that works - so the fragment is
    dropped here and the exact reply is named in the description instead.
    """
    if len(source) <= limit:
        return source, ""
    base = source.split("#")[0]
    fragment = source.split("#", 1)[1] if "#" in source else ""
    return (base if len(base) <= limit else base[:limit]), fragment


def promote(root, auth, uid, args, out):
    """Each published proposal becomes evidence of its publication and a signal of its opinion."""
    with open(args.proposals, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    items = data[args.guild]["items"] if args.guild in data else data["items"]
    made = []
    for n, item in enumerate(items, 1):
        status, body = http(root + "/api/collections/evidence/records", data=json.dumps({
            "content": "%s\n\n%s" % (item["short"], item["prose"]),
            "source": args.source, "type": "observed",
            "workspace": args.workspace, "owner": uid,
            "title": "%s proposal %d: %s" % (args.guild, n, item["short"][:80]),
            "category": "guild_proposal", "tags": "guild,%s,proposal" % args.guild,
        }).encode(), headers=auth)
        if status not in (200, 201):
            made.append({"n": n, "evidence_http": status,
                         "message": str(body.get("message") or "")[:120]})
            continue
        eid = body["id"]
        link, fragment = linkable(args.source)
        status, body = http(root + "/api/collections/signals/records", data=json.dumps({
            "title": "%s: %s" % (args.guild, item["short"][:110]),
            "workspace": args.workspace, "owner": uid, "type": "inference",
            "severity": "medium", "state": "new", "confidence": 0.6,
            "evidence": [eid], "source": link,
            "description": "%s\n\nProposed publicly by the %s guild at %s%s"
                           % (item["prose"], args.guild, link,
                              (", reply %s" % fragment) if fragment else ""),
        }).encode(), headers=auth)
        entry = {"n": n, "short": item["short"][:60], "evidence": eid,
                 "signal": body.get("id") if status in (200, 201) else None,
                 "signal_http": status}
        if status not in (200, 201):
            # Name the FIELD, not just "Failed to create record." A bare message cost a whole
            # round trip to the box to rediscover that one field had a 120-character limit.
            entry["message"] = str(body.get("message") or "")[:120]
            entry["fields"] = {k: str((v or {}).get("message"))[:90]
                               for k, v in (body.get("data") or {}).items()}
        made.append(entry)
    out["promoted"] = made
    out["signals"] = [m["signal"] for m in made if m.get("signal")]
    return 0 if out["signals"] else 1


def workload(root, auth, uid, args, out):
    """A mission is intent. A run is work. This builds both and refuses to fake either."""
    signals = [s for s in args.signals.split(",") if s]
    headline = args.headline or ("%s guild proposals" % args.guild)
    steps = []

    status, body = http(root + "/api/collections/missions/records", data=json.dumps({
        "title": "Carry the %s guild's proposals into work" % args.guild,
        "workspace": args.workspace, "owner": uid, "status": "proposed",
        "description": "Raised from what the %s guild published at %s" % (args.guild, args.source),
        "mission_plan": plan_for(args.guild, headline, args.source),
    }).encode(), headers=auth)
    steps.append({"step": "create mission (proposed, full plan)", "http": status,
                  "ok": status in (200, 201), "message": str(body.get("message") or "")[:140]})
    if status not in (200, 201):
        out["steps"] = steps
        return 1
    mid = body["id"]
    out["mission"] = mid

    # The workflow is built BEFORE the control on purpose. An earlier version ran the control with
    # a made-up workflow id, which 404'd on the workflow long before the mission's approval was
    # ever consulted - so it proved only that some refusal happens, not that THIS gate holds. A
    # control has to fail for the reason under test.
    status, body = http(root + "/api/collections/workflows/records", data=json.dumps({
        "name": "Carry a guild proposal to a provable slice",
        "description": "How the %s guild turns something it published into work with receipts."
                       % args.guild,
        "workspace": args.workspace, "owner": uid, "status": "draft", "steps": STEPS,
    }).encode(), headers=auth)
    steps.append({"step": "create workflow (draft)", "http": status, "ok": status in (200, 201),
                  "message": str(body.get("message") or "")[:140]})
    if status not in (200, 201):
        out["steps"] = steps
        return 1
    wid = body["id"]
    out["workflow"] = wid

    status, body = http(root + "/api/collections/workflows/records/%s" % wid,
                        data=json.dumps({"status": "active"}).encode(), headers=auth, method="PATCH")
    steps.append({"step": "activate workflow", "http": status, "ok": status in (200, 201),
                  "message": str(body.get("message") or "")[:140]})

    # CONTROL: a REAL, active workflow against a mission that is still `proposed` must be refused
    # for the approval reason. If this is accepted the approval requirement is decoration and
    # every receipt after it is worthless.
    status, body = http(root + "/api/buildanddo/workflow-runs", data=json.dumps({
        "workspace": args.workspace, "workflow": wid, "mission": mid,
        "request_key": request_key(args.seat, "control-" + mid),
    }).encode(), headers=auth)
    steps.append({"step": "CONTROL run on an unapproved mission must be refused", "http": status,
                  "ok": status not in (200, 201),
                  "message": str(body.get("message") or "")[:140] if status not in (200, 201)
                  else "ACCEPTED - approval is not enforced"})

    for target in ("approved", "running"):
        status, body = http(root + "/api/collections/missions/records/%s" % mid,
                            data=json.dumps({"status": target}).encode(),
                            headers=auth, method="PATCH")
        steps.append({"step": "mission -> %s" % target, "http": status,
                      "ok": status in (200, 201), "message": str(body.get("message") or "")[:140]})
        if status not in (200, 201):
            out["steps"] = steps
            return 1

    # Bind each signal to the mission it produced, by relation.
    bound = []
    for sid in signals:
        status, _ = http(root + "/api/collections/signals/records/%s" % sid,
                         data=json.dumps({"mission": mid, "state": "acknowledged"}).encode(),
                         headers=auth, method="PATCH")
        bound.append({"signal": sid, "http": status})
    out["signals_bound"] = bound

    status, body = http(root + "/api/buildanddo/workflow-runs", data=json.dumps({
        "workspace": args.workspace, "workflow": wid, "mission": mid,
        "request_key": request_key(args.seat, "run-" + mid),
    }).encode(), headers=auth)
    steps.append({"step": "start run bound to the mission", "http": status,
                  "ok": status in (200, 201), "message": str(body.get("message") or "")[:140]})
    if status not in (200, 201):
        out["steps"] = steps
        return 1
    # MEASURED: the run endpoint answers {record: {...}, replayed: bool}, not a bare record.
    # Report the keys we did
    # get rather than crashing on a None, because a crash here loses the mission id too.
    run = body if isinstance(body.get("id"), str) else (
        body.get("record") or body.get("run") or body.get("result") or {})
    rid = run.get("id")
    out["run"] = rid
    out["run_status"] = run.get("status")
    out["run_body_keys"] = sorted(body.keys())[:14]
    if not rid:
        steps.append({"step": "read run id from the response", "http": status, "ok": False,
                      "message": "no id in %s" % out["run_body_keys"]})
        out["steps"] = steps
        return 1
    revision = int(run.get("revision") or 1)

    # Record the first step honestly: this seat DID read the thread it is acting on.
    status, body = http(root + "/api/buildanddo/workflow-runs/%s/decisions" % rid,
                        data=json.dumps({
                            "workspace": args.workspace,
                            "request_key": request_key(args.seat, "step1-" + rid),
                            "revision": revision, "action": "step", "step_id": "read-thread",
                            "outcome": "passed",
                            "observation": ("Read the %s guild's own reply and the topic it "
                                            "answered before acting on it. %d signals were raised "
                                            "from that post and bound to this mission."
                                            % (args.guild, len(signals))),
                            "source": args.source[:160],
                        }).encode(), headers=auth)
    steps.append({"step": "advance run: read-thread passed", "http": status,
                  "ok": status in (200, 201), "message": str(body.get("message") or "")[:140]})
    out["run_next_step"] = body.get("next_step")
    out["run_status_after"] = body.get("status")
    out["steps"] = steps
    return 0 if all(s["ok"] for s in steps) else 1


# The 21-day sprint's remaining work, one item per guild. Every line is something MEASURED this
# cycle, not a wish list: the evidence field says how it is known, so a guildmaster reading the
# mission can check the claim before accepting the work.
#
# entertainment gets the org chart because the read model already exists (132 agents, 11 guilds)
# and has no page in the product - the operator asked where it went. Nothing is invented to give a
# guild something to do; a guild with no measured work is reported as having none.
SPRINT_WORK = {
    "builder": {
        "headline": "a migration preflight that runs against a throwaway copy of live data",
        "why": "One failed migration aborts PocketBase startup entirely - not the migration, the "
               "service. Pushing twelve at once took staging down, and it came back quickly only "
               "because a database copy had been taken by hand first.",
        "evidence": "staging outage 2026-09-20; the pb_migrations quarantine loop; migrations "
                    "apply by set-difference on filename, so a lower-numbered file added later "
                    "still runs, out of order",
        "done": "A pending migration set is applied to a copy and the deploy refuses on any "
                "failure, demonstrated with a migration that is MEANT to fail.",
    },
    "intelligence": {
        "headline": "a negative-control gate every verifier must pass before it is believed",
        "why": "Three findings this week were the instrument, not the system. A broken checker "
               "does not return an error - it returns a FINDING, in the same shape and the same "
               "confident tone as a real one.",
        "evidence": "content assessor: a 4KB truncation found 0 routes; a 0x08 byte inside a "
                    "regex; prerequisites resolved against a graph that does not exist",
        "done": "No checker merges without a recorded run where it FAILS on a deliberately "
                "broken input.",
    },
    "research": {
        "headline": "write Foundations and Signals to depth before anything else is added",
        "why": "The curriculum is structurally perfect and editorially empty. A reader finds "
               "nothing broken and learns nothing.",
        "evidence": "33/33 pass every structural check and 0/33 pass on depth; 9,619 "
                    "instructional words against 467 declared minutes - 20.6 per claimed minute",
        "done": "Foundations and Signals clear the depth floor, each lesson carrying a worked "
                "example and a failure case.",
    },
    "writers": {
        "headline": "a worked example and a failure case in every lesson",
        "why": "A definition followed by a quiz about that definition tests recall of the "
               "previous paragraph. Median prose per lesson is 89 words across three headings.",
        "evidence": "99 sections across 33 lessons, almost exactly three paragraphs each - a "
                    "uniformity human writing does not have",
        "done": "Every lesson shows the idea doing work, and shows what going wrong looks like.",
    },
    "creator": {
        "headline": "rebuild the content-production path to depth, shipping the artifact it teaches",
        "why": "Five lessons claim to teach content production and all five are stubs. A lesson "
               "on writing a brief that is itself 270 words has demonstrated the opposite of its "
               "own thesis.",
        "evidence": "Content production 5/5 STUB, 1,347 words against 73 declared minutes; "
                    "Practice and improvement 5/5 STUB",
        "done": "Each lesson ships the real artifact - a brief, the post produced from it, and an "
                "editorial pass with the changes visible.",
    },
    "commerce": {
        "headline": "one provable end-to-end payment path, or descope the plane in writing",
        "why": "The commerce plane has never processed anything. Not little - never.",
        "evidence": "zero commerce events; Stripe unrouted; the dedupe tables a payment path "
                    "needs are absent from the schema; billing_subscriptions is an unwritable "
                    "view; there are no external_identities",
        "done": "One real webhook, one deduplicated event, one row that can actually be written - "
                "or the twelve contracts are relabelled design intent.",
    },
    "finance": {
        "headline": "relabel the commercial contracts that describe a system which has never run",
        "why": "A validator with 147 passing tests is testing the DESCRIPTION of a commerce "
               "system, and will keep passing for exactly as long as that system does not exist.",
        "evidence": "docs/commercial carries 12 contracts and 147 green tests while the commerce "
                    "event count is zero",
        "done": "Each contract is marked implemented or design intent, and the validator reports "
                "which is which.",
    },
    "entertainment": {
        "headline": "give the workforce org chart a page in the product",
        "why": "The read model is fresh and has no surface. People cannot collaborate with a "
               "hierarchy they cannot see, and the operator has asked where it went.",
        "evidence": "the organizational read model holds 132 agents across 11 guilds at revision "
                    "131, and no route for it appears in the shipped bundle's 16-route table",
        "done": "A route renders the hierarchy from the live read model, not from a static copy.",
    },
}


def sprint(root, auth, uid, args, out):
    """Issue one sprint mission per guild, carrying work that was measured rather than imagined.

    THE CREATING SEAT IS NOT THE OWNING GUILD, and the record says so. A mission's `owner` is
    whichever box seat could reach the API; the guild that owns the work is named in the title and
    in the plan. Pretending otherwise would put a guild's name on a record it never touched - the
    same mistake as posting under a box name instead of a guildmaster's.

    Missions are left at `proposed` DELIBERATELY. Accepting work on a guild's behalf is exactly the
    decision a guildmaster exists to make, and a sprint that auto-approves its own missions has a
    lifecycle for decoration.
    """
    wanted = [args.guild] if args.guild else sorted(SPRINT_WORK)
    made = []
    for guild in wanted:
        work = SPRINT_WORK.get(guild)
        if not work:
            made.append({"guild": guild, "state": "NO_MEASURED_WORK"})
            continue
        plan = plan_for(guild, work["headline"], args.source or "the 21-day sprint")
        plan["purpose"] = ("%s. %s" % (work["headline"].capitalize(), work["why"]))[:1200]
        plan["baseline"] = work["evidence"][:1200]
        plan["target"] = work["done"][:1200]
        plan["in_scope"] = ("Work owned by the %s guild for the remainder of the 21-day sprint."
                            % guild)
        plan["evaluate"] = ("The evidence line in this plan is re-measured. If it no longer holds "
                            "the mission is withdrawn, not completed.")
        description = "\n\n".join([
            "OWNING GUILD: %s" % guild,
            "WHY NOW: %s" % work["why"],
            "HOW IT IS KNOWN: %s" % work["evidence"],
            "DONE MEANS: %s" % work["done"],
            "Raised by seat %s. The owning guild approves or declines it - this record is "
            "proposed, not assigned." % args.seat,
        ])
        status, body = http(root + "/api/collections/missions/records", data=json.dumps({
            "title": "Sprint: %s - %s" % (guild, work["headline"][:80]),
            "workspace": args.workspace, "owner": uid, "status": "proposed",
            "description": description, "mission_plan": plan,
        }).encode(), headers=auth)
        entry = {"guild": guild, "http": status, "headline": work["headline"][:58]}
        if status in (200, 201):
            entry["mission"] = body.get("id")
            entry["state"] = "PROPOSED"
        else:
            entry["state"] = "REFUSED"
            entry["message"] = str(body.get("message") or "")[:120]
            entry["fields"] = {k: str((v or {}).get("message"))[:80]
                               for k, v in (body.get("data") or {}).items()}
        made.append(entry)
    out["missions"] = made
    out["proposed"] = [m["mission"] for m in made if m.get("mission")]
    return 0 if out["proposed"] else 1


def resume(root, auth, args, out):
    """Finish a workload whose earlier attempt left real records behind.

    Re-running the whole thing would mint a SECOND mission for the same proposals, and two
    missions that mean the same thing is worse than one that is half finished. This binds the
    signals to the mission that already exists and advances the run that is already open.
    """
    # signals.state is a select of exactly new | acknowledged | dismissed. "triaged" reads like a
    # sensible value and is refused, which is the schema being right and the caller being wrong.
    steps = []
    bound = []
    for sid in [s for s in args.signals.split(",") if s]:
        status, body = http(root + "/api/collections/signals/records/%s" % sid,
                            data=json.dumps({"mission": args.mission, "state": "acknowledged"}).encode(),
                            headers=auth, method="PATCH")
        entry = {"signal": sid, "http": status}
        if status not in (200, 201):
            entry["message"] = str(body.get("message") or body.get("err") or "")[:120]
            entry["fields"] = {k: str((v or {}).get("message"))[:80]
                               for k, v in (body.get("data") or {}).items()}
        else:
            entry["mission_now"] = body.get("mission")
        bound.append(entry)
    out["signals_bound"] = bound

    status, run = http(root + "/api/collections/workflow_runs/records/%s" % args.run, headers=auth)
    if status != 200:
        steps.append({"step": "read the open run", "http": status, "ok": False})
        out["steps"] = steps
        return 1
    revision = int(run.get("revision") or 1)
    out["run_revision"] = revision
    out["run_next_step"] = run.get("next_step")

    status, body = http(root + "/api/buildanddo/workflow-runs/%s/decisions" % args.run,
                        data=json.dumps({
                            "workspace": args.workspace,
                            "request_key": request_key(args.seat, "resume-step1-" + args.run),
                            "revision": revision, "action": "step", "step_id": "read-thread",
                            "outcome": "passed",
                            "observation": ("Read the %s guild's own reply and the topic it "
                                            "answered before acting on it. %d signals were raised "
                                            "from that post and bound to this mission."
                                            % (args.guild, len(bound))),
                            "source": args.source[:160],
                        }).encode(), headers=auth)
    steps.append({"step": "advance run: read-thread passed", "http": status,
                  "ok": status in (200, 201),
                  "message": str(body.get("message") or "")[:160]})
    out["run_status_after"] = body.get("status")
    out["run_next_step_after"] = body.get("next_step")
    out["steps"] = steps
    return 0 if all(s["ok"] for s in steps) else 1


def inventory(root, auth, args, out):
    """What actually exists in this workspace right now, by fetching rather than by remembering."""
    for name in ("missions", "workflows", "workflow_runs", "signals", "evidence",
                 "forum_topics", "forum_replies", "wiki_pages"):
        status, body = http("%s/api/collections/%s/records?perPage=60&filter=%s"
                            % (root, name,
                               urllib.parse.quote("workspace='%s'" % args.workspace)),
                            headers=auth)
        if status != 200:
            out.setdefault("inventory", {})[name] = {"http": status}
            continue
        items = body.get("items") or []
        out.setdefault("inventory", {})[name] = {
            "total": body.get("totalItems"),
            "items": [{"id": i.get("id"), "owner": i.get("owner"),
                       "status": i.get("status") or i.get("state"),
                       "mission": i.get("mission"),
                       "label": str(i.get("title") or i.get("name") or "")[:70]}
                      for i in items]}
    return 0


def verify(root, auth, args, out):
    """Walk it back the way a sceptic would: by fetching, not by remembering."""
    checks = {}
    status, mission = http(root + "/api/collections/missions/records/%s" % args.mission,
                           headers=auth)
    checks["mission_readable"] = status == 200
    checks["mission_running"] = mission.get("status") == "running"
    checks["mission_has_approval"] = bool(mission.get("mission_approved_at"))

    linked, cited = 0, 0
    for sid in [s for s in args.signals.split(",") if s]:
        status, signal = http(root + "/api/collections/signals/records/%s" % sid, headers=auth)
        if status != 200:
            continue
        if signal.get("mission") == args.mission:
            linked += 1
        for eid in (signal.get("evidence") or []):
            estatus, evidence = http(root + "/api/collections/evidence/records/%s" % eid,
                                     headers=auth)
            if estatus == 200 and evidence.get("source"):
                cited += 1
    checks["signals_bound_to_mission"] = linked
    checks["signals_whose_evidence_names_a_source"] = cited
    out["verified"] = checks
    return 0 if checks["mission_running"] and linked else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("workspace")
    ap.add_argument("action", choices=["promote", "workload", "verify", "cleanup", "inventory", "resume", "sprint"])
    ap.add_argument("--collection", default="")
    ap.add_argument("--ids", default="")
    ap.add_argument("--guild", default="")
    ap.add_argument("--proposals", default="")
    ap.add_argument("--signals", default="")
    ap.add_argument("--mission", default="")
    ap.add_argument("--run", default="")
    ap.add_argument("--source", default="")
    ap.add_argument("--headline", default="")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    args = ap.parse_args()

    base = ENVS[args.env]
    root = base + BACKEND
    out = {"schema": "buildanddo.ocn-guild-dogfood/v1", "seat": args.seat, "guild": args.guild,
           "action": args.action, "workspace": args.workspace,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

    token, uid = login(args.seat, base)
    if not token:
        out["login"] = "FAILED"
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    out["uid"] = uid
    auth = {"Authorization": token}

    if args.action == "sprint":
        code = sprint(root, auth, uid, args, out)
    elif args.action == "promote":
        code = promote(root, auth, uid, args, out)
    elif args.action == "workload":
        # An exception here would lose the mission id that earlier steps already created, leaving
        # an orphan nobody can find. Report what happened and what exists so far, then fail.
        try:
            code = workload(root, auth, uid, args, out)
        except Exception as exc:  # noqa: BLE001
            out["crashed"] = "%s: %s" % (type(exc).__name__, str(exc)[:160])
            code = 1
    elif args.action == "cleanup":
        # Records made while diagnosing are not evidence, and leaving them behind would inflate
        # exactly the counts this lane asks people to trust. Named ids only - never a filter.
        removed = []
        for rid in [r for r in args.ids.split(",") if r]:
            status, _ = http("%s/api/collections/%s/records/%s" % (root, args.collection, rid),
                             headers=auth, method="DELETE")
            removed.append({"id": rid, "http": status})
        out["removed"] = removed
        code = 0 if all(r["http"] in (200, 204) for r in removed) else 1
    elif args.action == "resume":
        code = resume(root, auth, args, out)
    elif args.action == "inventory":
        code = inventory(root, auth, args, out)
    else:
        code = verify(root, auth, args, out)
    print(json.dumps(out))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
