#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_mission_lifecycle.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/pocketbase/pb_hooks/mission-policy.js (the contract under test)
# EnumType:    Verifier
# EnumEdges:   VERIFIES the mission lifecycle proposed -> approved -> running -> verified
#              with real evidence, as a real seat, from a machine that is not rig1
# Intent:      Prove a mission can actually reach verified, because "missions exist" and "a mission
#              can be completed" are different claims and only the second one ships.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_mission_lifecycle.py - drive one mission from proposal to verified, as this seat.

RUNS ON A FLEET BOX. Deterministic and repeatable: same inputs, same transitions, and every refusal
is reported with the server's own words rather than retried until something passes.

    ocn_mission_lifecycle.py <seat> <workspace_id> [--env staging|production]

THE CONTRACT, read out of mission-policy.js rather than guessed:
  * mission_plan: {version: 1, risk: A0|A1|A2} plus 15 required answers, each <= 1200 chars
  * transitions are a graph, not a flag: proposed -> approved -> running -> verified|failed
  * verified additionally needs four TEVV items ALL outcome=pass, each naming an evidence record
    that belongs to this mission and this workspace and carries a real source and content
  * mission_learning answers come from a fixed list and are explicitly not permission

WHY THIS IS THE TEST THAT MATTERS. Before mission-policy.js was deployed, a seat could PATCH a
mission straight from proposed to running and nothing objected - the lifecycle was decoration. The
interesting question is not whether the collection accepts writes, it is whether a mission can be
carried all the way to verified by someone who has to satisfy the policy. This drives exactly that,
and a HALT at any step names the step and the reason.
"""
from __future__ import annotations
import argparse
import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.request

ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
CBF = "/opt/citadel/cbf"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-mission/1.0)", "Content-Type": "application/json"}
TEVV = ["test", "evaluate", "verify", "validate"]
PLAN_FIELDS = ["purpose", "beneficiary", "in_scope", "out_of_scope", "baseline", "target",
               "authorization", "input_validation", "data_handling", "rollback",
               "test", "evaluate", "verify", "validate"]
steps = []


def http(url, data=None, headers=None, method=None, timeout=30):
    head = dict(UA)
    head.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=head,
                                 method=method or ("POST" if data is not None else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw[:1] in b"{[" else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        return exc.code, (json.loads(raw) if raw[:1] in b"{[" else {})
    except Exception as exc:  # noqa: BLE001
        return 0, {"err": type(exc).__name__}


def step(label, status, body, expect_ok=True):
    ok = status in (200, 201)
    rec = {"step": label, "http": status, "ok": ok}
    if not ok:
        rec["message"] = str(body.get("message") or body.get("err") or "")[:140]
        fields = body.get("data") or {}
        if fields:
            rec["fields"] = {k: str((v or {}).get("message"))[:60] for k, v in list(fields.items())[:4]}
    steps.append(rec)
    return ok


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
    s, b = http(base + BACKEND + "/api/ocn/login", data=b"{}", headers={"X-Citadel-Key": header})
    if s != 200:
        return None, None
    return b.get("token"), (b.get("record") or {}).get("id")


def plan_for(seat):
    answer = ("Recorded by OCN seat %s as a deterministic lifecycle exercise against staging. "
              "This text exists so the field is a real answer rather than a placeholder." % seat)
    plan = {"version": 1, "risk": "A0"}
    plan.update({f: answer for f in PLAN_FIELDS})
    plan["purpose"] = ("Prove that a mission can be carried from proposal to verified by a caller "
                       "who must satisfy mission-policy.js, not merely that the collection accepts "
                       "writes.")
    plan["rollback"] = ("Nothing outside this workspace is touched; the mission and its evidence can "
                        "be deleted by the workspace owner.")
    return plan


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("workspace")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    args = ap.parse_args()
    base = ENVS[args.env] + BACKEND
    ws = args.workspace
    out = {"schema": "buildanddo.ocn-mission-lifecycle/v1", "seat": args.seat, "env": args.env,
           "workspace": ws, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

    token, uid = login(args.seat, ENVS[args.env])
    if not token:
        out["login"] = "FAILED"
        out["steps"] = steps
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    auth = {"Authorization": token}
    C = base + "/api/collections"

    s, b = http(C + "/missions/records", data=json.dumps({
        "title": "OCN lifecycle %s" % args.seat, "workspace": ws, "owner": uid,
        "status": "proposed", "description": "Deterministic mission lifecycle exercise.",
        "mission_plan": plan_for(args.seat)}).encode(), headers=auth)
    if not step("create mission (proposed, with full plan)", s, b):
        out["steps"] = steps
        out["halted_at"] = "create"
        print(json.dumps(out))
        return 1
    mid = b["id"]
    out["mission"] = mid

    # CONTROL: the transition graph must refuse a jump that skips a state. If this is accepted the
    # lifecycle is decoration and everything after it means nothing.
    s, b = http(C + "/missions/records/%s" % mid, data=json.dumps({"status": "verified"}).encode(),
                headers=auth, method="PATCH")
    steps.append({"step": "CONTROL proposed->verified must be refused", "http": s,
                  "ok": s not in (200, 201),
                  "message": str(b.get("message") or "")[:120] if s not in (200, 201) else
                             "ACCEPTED - the transition graph is not enforced"})

    s, b = http(C + "/missions/records/%s" % mid, data=json.dumps({"status": "approved"}).encode(),
                headers=auth, method="PATCH")
    if not step("approve mission", s, b):
        out["steps"] = steps
        out["halted_at"] = "approve"
        print(json.dumps(out))
        return 1

    s, b = http(C + "/missions/records/%s" % mid, data=json.dumps({"status": "running"}).encode(),
                headers=auth, method="PATCH")
    if not step("start mission (running)", s, b):
        out["steps"] = steps
        out["halted_at"] = "running"
        print(json.dumps(out))
        return 1

    # Evidence must be bound to THIS mission and workspace, with a real source and content.
    evidence = {}
    for name in TEVV:
        s, b = http(C + "/evidence/records", data=json.dumps({
            "content": "%s observation recorded by OCN seat %s against staging." % (name, args.seat),
            "source": "ocn_mission_lifecycle.py on %s" % args.seat, "type": "observed",
            "workspace": ws, "owner": uid, "mission": mid,
            "title": "TEVV %s" % name, "category": "mission_tevv", "tags": "ocn"}).encode(),
            headers=auth)
        if not step("record %s evidence" % name, s, b):
            out["steps"] = steps
            out["halted_at"] = "evidence:%s" % name
            print(json.dumps(out))
            return 1
        evidence[name] = b["id"]
    out["evidence"] = evidence

    review = {"reflection": "The lifecycle held: each transition was checked and verification "
                            "required four passing observations with evidence bound to this mission."}
    for name in TEVV:
        review[name] = {"outcome": "pass", "evidence": evidence[name],
                        "observation": "%s completed by OCN seat %s; evidence recorded in this "
                                       "workspace and bound to this mission." % (name, args.seat)}
    learning = {"scope": "measured", "tevv": "validation", "owasp": "boundary", "credentials": "evidence"}

    # CONTROL: a review whose TEVV items are not all passing must not verify.
    failing = json.loads(json.dumps(review))
    failing["test"]["outcome"] = "fail"
    s, b = http(C + "/missions/records/%s" % mid, data=json.dumps({
        "status": "verified", "mission_review": failing, "mission_learning": learning}).encode(),
        headers=auth, method="PATCH")
    steps.append({"step": "CONTROL verify with a failing TEVV must be refused", "http": s,
                  "ok": s not in (200, 201),
                  "message": str(b.get("message") or "")[:120] if s not in (200, 201) else
                             "ACCEPTED - verification does not require passing observations"})

    s, b = http(C + "/missions/records/%s" % mid, data=json.dumps({
        "status": "verified", "mission_review": review, "mission_learning": learning}).encode(),
        headers=auth, method="PATCH")
    step("verify mission", s, b)
    out["final_status"] = b.get("status") if s in (200, 201) else None

    s, b = http(C + "/missions/records/%s" % mid, headers=auth)
    out["readback"] = {"http": s, "status": b.get("status"),
                       "reviewed_by_set": bool(b.get("mission_reviewed_by")),
                       "reviewed_at_set": bool(b.get("mission_reviewed_at")),
                       "approved_by_set": bool(b.get("mission_approved_by"))}
    out["steps"] = steps
    out["summary"] = {"steps": len(steps), "failed": [s["step"] for s in steps if not s["ok"]],
                      "reached_verified": out["readback"].get("status") == "verified"}
    print(json.dumps(out))
    return 0 if out["summary"]["reached_verified"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
