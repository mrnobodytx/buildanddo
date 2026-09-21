#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_mission_work.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     scripts/ci/verifier_control_gate.py, scripts/ci/migration_preflight.py
# EnumType:    Verifier
# EnumEdges:   RECORDS mission work as evidence, predictions as corrections, and method as workflows
# Intent:      Close the loop the platform already models - evidence for what was done, a correction
#              for what was expected versus what happened, and a workflow so the next agent runs the
#              method instead of rediscovering it.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_mission_work.py - record mission work the way this platform already models it.

RUNS ON A FLEET BOX, as the seat, from a JSON payload.

    ocn_mission_work.py <seat> <workspace> evidence  --payload FILE
    ocn_mission_work.py <seat> <workspace> correction --payload FILE
    ocn_mission_work.py <seat> <workspace> workflow   --payload FILE

THREE RECORD TYPES, THREE DIFFERENT CLAIMS, and keeping them apart is the point:

  evidence     WHAT WAS DONE, with its output. Typed `observed` - it is a measurement, and the
               source names where it can be re-run.
  correction   WHAT WAS EXPECTED versus WHAT HAPPENED. `prior_prediction` and `observed_result`
               with a status of verified or rejected. A rejected correction is the useful kind:
               it is the record of having been wrong, which is the only thing that stops the same
               wrong answer being produced again.
  workflow     HOW IT IS DONE, as steps another agent can run. A method that lives only in a
               finished task has to be rediscovered; a workflow is the method surviving the task.

A CORRECTION IS NOT AN APOLOGY. `status: rejected` means the prediction did not hold and the
platform now records that. Three findings this cycle were the instrument rather than the system,
and each was believed for a while - a corrections ledger is what makes that recoverable instead of
merely embarrassing.

WORKFLOWS ARE CREATED AS DRAFTS AND ACTIVATED SEPARATELY. workflow-policy.js refuses to activate a
definition with no steps, so a draft that fails validation cannot become runnable by accident.
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
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-mission-work/1.0)",
      "Content-Type": "application/json"}


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


def post_evidence(root, auth, uid, workspace, item):
    body = {"content": item["content"][:20000], "source": item["source"][:160], "type": "observed",
            "workspace": workspace, "owner": uid,
            "title": item["title"][:120], "category": item.get("category", "mission_work"),
            "tags": item.get("tags", "sprint,work")}
    if item.get("mission"):
        body["mission"] = item["mission"]
    status, payload = http(root + "/api/collections/evidence/records",
                           data=json.dumps(body).encode(), headers=auth)
    return {"kind": "evidence", "title": item["title"][:60], "http": status,
            "id": payload.get("id") if status in (200, 201) else None,
            "error": None if status in (200, 201) else str(payload.get("message") or payload)[:140],
            "fields": {k: str((v or {}).get("message"))[:70]
                       for k, v in (payload.get("data") or {}).items()} or None}


def post_correction(root, auth, uid, workspace, item):
    """prior_prediction vs observed_result. `rejected` is the valuable status, not the shameful one."""
    body = {"prior_prediction": item["prediction"][:2000],
            "observed_result": item["observed"][:2000],
            "status": item.get("status", "verified"),
            "reference": item.get("reference", "")[:300],
            "workspace": workspace, "owner": uid}
    status, payload = http(root + "/api/collections/corrections/records",
                           data=json.dumps(body).encode(), headers=auth)
    return {"kind": "correction", "status": item.get("status"), "http": status,
            "id": payload.get("id") if status in (200, 201) else None,
            "prediction": item["prediction"][:64],
            "error": None if status in (200, 201) else str(payload.get("message") or payload)[:140],
            "fields": {k: str((v or {}).get("message"))[:70]
                       for k, v in (payload.get("data") or {}).items()} or None}


def post_workflow(root, auth, uid, workspace, item, activate=True):
    """Create the method as a draft, then activate it - policy refuses an empty definition."""
    body = {"name": item["name"][:160], "description": item["description"][:1000],
            "workspace": workspace, "owner": uid, "status": "draft", "steps": item["steps"]}
    status, payload = http(root + "/api/collections/workflows/records",
                           data=json.dumps(body).encode(), headers=auth)
    out = {"kind": "workflow", "name": item["name"][:60], "http": status,
           "id": payload.get("id") if status in (200, 201) else None,
           "steps": len(item["steps"])}
    if status not in (200, 201):
        out["error"] = str(payload.get("message") or payload)[:140]
        out["fields"] = {k: str((v or {}).get("message"))[:70]
                         for k, v in (payload.get("data") or {}).items()} or None
        return out
    if activate:
        status, payload = http("%s/api/collections/workflows/records/%s" % (root, out["id"]),
                               data=json.dumps({"status": "active"}).encode(),
                               headers=auth, method="PATCH")
        out["activated"] = payload.get("status") == "active" if status in (200, 201) else False
        if status not in (200, 201):
            out["activate_error"] = str(payload.get("message") or "")[:140]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("workspace")
    ap.add_argument("action", choices=["evidence", "correction", "workflow"])
    ap.add_argument("--payload", required=True, help="JSON file: a list of items")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    args = ap.parse_args()

    base = ENVS[args.env]
    root = base + BACKEND
    out = {"schema": "buildanddo.ocn-mission-work/v1", "seat": args.seat, "action": args.action,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

    token, uid = login(args.seat, base)
    if not token:
        out["login"] = "FAILED"
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    auth = {"Authorization": token}

    with open(args.payload, "r", encoding="utf-8") as handle:
        items = json.load(handle)
    fn = {"evidence": post_evidence, "correction": post_correction,
          "workflow": post_workflow}[args.action]
    out["results"] = [fn(root, auth, uid, args.workspace, item) for item in items]
    out["created"] = [r["id"] for r in out["results"] if r.get("id")]
    print(json.dumps(out))
    return 0 if out["created"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
