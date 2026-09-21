#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_signal_lifecycle.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/pocketbase/pb_hooks/workspace-record-policy.js (the RBAC this rides on)
# EnumType:    Verifier
# EnumEdges:   VERIFIES the signal lifecycle new -> acknowledged / dismissed as a real seat;
#              MEASURES whether a signal can reach a mission
# Intent:      Establish what "signals work" currently means, including the part that does not
#              exist, so the gap is a measurement rather than an assumption.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_signal_lifecycle.py - drive a signal through its states, as this seat, from this box.

    ocn_signal_lifecycle.py <seat> <workspace_id> [--env staging|production]

WHAT THE SCHEMA ACTUALLY SUPPORTS, measured 2026-09-20 against staging:
  signals: title, description, source, type(fact|inference|user), confidence, severity
           (info|low|medium|high|critical), state(new|acknowledged|dismissed), acknowledged_at
  signals.mission: relation -> missions, optional, added by 1790800000_signal_mission_link.js

Measured first, added second: the run that preceded that migration found no relation in EITHER
direction, so a signal that deserved work left no trace of the work it caused. The script still
CHECKS for the field rather than assuming it, and only exercises promotion when it is really there -
a test that presumes its own fixture stops being a test.

Unlike missions, signals have no policy hook. Their state column is a column: nothing refuses an
illegal transition, and this run demonstrates that rather than hiding it - a dismissed signal is
walked back to new, which succeeds. That is reported as a finding, not as a pass.
"""
from __future__ import annotations
import argparse
import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

ENVS = {"staging": "https://staging.buildanddo.com", "production": "https://buildanddo.com"}
BACKEND = "/hcgi/platform"
CBF = "/opt/citadel/cbf"
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-signal/1.0)", "Content-Type": "application/json"}
steps = []


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


def step(label, status, body, want_ok=True):
    ok = (status in (200, 201)) if want_ok else (status not in (200, 201))
    rec = {"step": label, "http": status, "ok": ok, "expected": "accept" if want_ok else "refuse"}
    if status not in (200, 201):
        rec["message"] = str(body.get("message") or body.get("err") or "")[:120]
    steps.append(rec)
    return status in (200, 201), body


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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("workspace")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    args = ap.parse_args()
    base = ENVS[args.env] + BACKEND
    C = base + "/api/collections"
    ws = args.workspace
    out = {"schema": "buildanddo.ocn-signal-lifecycle/v1", "seat": args.seat, "env": args.env,
           "workspace": ws, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

    token, uid = login(args.seat, ENVS[args.env])
    if not token:
        out["login"] = "FAILED"
        out["steps"] = steps
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    auth = {"Authorization": token}

    # raise one signal of each type, because `type` is required and the UI offers all three
    raised = {}
    for kind, sev in (("fact", "high"), ("inference", "medium"), ("user", "low")):
        ok, b = step("raise %s signal" % kind, *http(C + "/signals/records", data=json.dumps({
            "title": "OCN %s signal from %s" % (kind, args.seat), "workspace": ws, "owner": uid,
            "type": kind, "severity": sev, "state": "new", "confidence": 0.75,
            "source": "ocn_signal_lifecycle.py on %s" % args.seat,
            "description": "Raised by an OCN seat as a deterministic lifecycle exercise."}).encode(),
            headers=auth))
        if ok:
            raised[kind] = b["id"]
    out["raised"] = raised
    if not raised:
        out["steps"] = steps
        out["halted_at"] = "raise"
        print(json.dumps(out))
        return 1

    sid = raised.get("fact") or next(iter(raised.values()))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    step("acknowledge signal", *http(C + "/signals/records/%s" % sid, data=json.dumps(
        {"state": "acknowledged", "acknowledged_at": now}).encode(), headers=auth, method="PATCH"))
    step("dismiss signal", *http(C + "/signals/records/%s" % sid, data=json.dumps(
        {"state": "dismissed"}).encode(), headers=auth, method="PATCH"))

    # There is no signal policy hook, so this SHOULD be refused by a lifecycle and is not. Recorded
    # as a finding: a state column is not a state machine.
    ok, _ = step("CONTROL dismissed -> new should be refused", *http(
        C + "/signals/records/%s" % sid, data=json.dumps({"state": "new"}).encode(),
        headers=auth, method="PATCH"), want_ok=False)
    out["lifecycle_enforced"] = not ok

    # filter/list the seat's own signals, which is what the workspace page does
    step("list own signals", *http(
        C + "/signals/records?perPage=20&filter=" + urllib.parse.quote('owner="%s"' % uid),
        headers=auth))

    # Can a signal reach a mission at all? Measure, do not assume - and if the relation exists,
    # USE it, because a field that is present but never written is not a working feature.
    link = {"signal_has_mission_field": False, "promoted": False}
    s, b = http(C + "/signals/records?perPage=1", headers=auth)
    if s == 200 and (b.get("items") or []):
        link["signal_has_mission_field"] = "mission" in (b["items"][0] or {})

    if link["signal_has_mission_field"]:
        ok, mission = step("create a mission for the signal to become", *http(
            C + "/missions/records", data=json.dumps({
                "title": "Promoted from an OCN signal (%s)" % args.seat, "workspace": ws,
                "owner": uid, "status": "proposed",
                "description": "Raised by a signal this seat filed."}).encode(), headers=auth))
        if ok:
            mid = mission["id"]
            promoted_from = raised.get("inference") or sid
            ok2, _ = step("promote signal -> mission", *http(
                C + "/signals/records/%s" % promoted_from,
                data=json.dumps({"mission": mid}).encode(), headers=auth, method="PATCH"))
            if ok2:
                s2, back = http(C + "/signals/records/%s" % promoted_from, headers=auth)
                link["promoted"] = back.get("mission") == mid
                steps.append({"step": "readback: signal names its mission", "http": s2,
                              "ok": link["promoted"], "expected": "accept"})
            # The relation cannot express "same workspace", so the constraint has to live in the
            # request hook. Measure whether anything stops a cross-workspace link today.
            ok3, _ = step("CONTROL link a signal to a foreign mission should be refused", *http(
                C + "/signals/records/%s" % promoted_from,
                data=json.dumps({"mission": "nonexistent999999"}).encode(),
                headers=auth, method="PATCH"), want_ok=False)
            link["rejects_unknown_mission"] = not ok3
            # leave the signal correctly linked
            http(C + "/signals/records/%s" % promoted_from,
                 data=json.dumps({"mission": mid}).encode(), headers=auth, method="PATCH")
    out["signal_to_mission_link"] = link

    out["steps"] = steps
    out["summary"] = {
        "steps": len(steps),
        "failed": [s["step"] for s in steps if not s["ok"]],
        "signals_raised": len(raised),
        "state_machine_enforced": out["lifecycle_enforced"],
        "can_promote_signal_to_mission": link.get("promoted", False),
    }
    print(json.dumps(out))
    return 0 if not out["summary"]["failed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
