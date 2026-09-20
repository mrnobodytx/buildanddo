#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_subsystem_probe.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/pocketbase/pb_hooks/missions.pb.js, suite.pb.js, decision.pb.js,
#              knowledge.pb.js, research.pb.js, classroom-presence.pb.js
# EnumType:    Verifier
# EnumEdges:   VERIFIES the mission, suite, decision, knowledge, research and classroom-presence
#              surfaces as a real seat, from a machine that is not rig1
# Intent:      Exercise the subsystems staging is supposed to carry, so "deployed" is distinguished
#              from "works" - a hook that loads can still 404, 503 or refuse every real request.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_subsystem_probe.py - drive BuildAndDo's subsystem APIs as this seat, from this box.

RUNS ON A FLEET BOX, signing in with the CitadelKey only that box holds.

    ocn_subsystem_probe.py <seat> <workspace_id> [--env staging|production]

WHAT EACH STATUS MEANS HERE, because the difference is the whole point:
  404  the route is not registered - the hook is absent or failed to load
  401  the route exists and demands authentication
  403  the route exists, sees who you are, and refuses on policy
  400  the route exists and rejected the payload - it names the field, which is a schema discovery
  503  the hook loaded but its backing collection or dependency is missing
  200  it worked

A 404 and a 403 both "fail" a naive check and mean opposite things: one is missing software, the
other is working software. Nothing here collapses them.

A route is probed with a deliberately empty body first where that is safe, so the refusal itself
reports the contract. Nothing is retried into success, and nothing is reported as healthy because it
was not reached.
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
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-subsystem/1.0)", "Content-Type": "application/json"}


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


def classify(status):
    return {404: "ROUTE_ABSENT", 401: "NEEDS_AUTH", 403: "REFUSED_BY_POLICY",
            400: "REJECTED_PAYLOAD", 503: "DEPENDENCY_MISSING", 0: "TRANSPORT_FAULT",
            200: "OK", 201: "OK"}.get(status, "HTTP_%d" % status)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("workspace")
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    args = ap.parse_args()
    base = ENVS[args.env] + BACKEND
    ws = args.workspace
    out = {"schema": "buildanddo.ocn-subsystem-probe/v1", "seat": args.seat, "env": args.env,
           "workspace": ws, "at": datetime.datetime.now(datetime.timezone.utc).isoformat()}

    token, uid = login(args.seat, ENVS[args.env])
    if not token:
        out["login"] = "FAILED"
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    auth = {"Authorization": token}
    checks = []

    def probe(subsystem, name, method, path, body=None, unauth=False):
        s, b = http(base + path, data=(json.dumps(body).encode() if body is not None else None),
                    headers=(None if unauth else auth), method=method)
        checks.append({"subsystem": subsystem, "check": name, "method": method, "path": path,
                       "http": s, "state": classify(s),
                       "message": str(b.get("message") or b.get("err") or "")[:100] or None,
                       "fields": sorted((b.get("data") or {}).keys())[:5] or None})
        return s, b

    # --- CONTROL: a route that must not exist. If this is not ROUTE_ABSENT, 404 means nothing here.
    probe("control", "unregistered route must 404", "GET", "/api/buildanddo/definitely-not-a-route-9f3")

    # --- mission system: the collection lifecycle now runs under mission-policy.js
    s, b = probe("mission", "create mission", "POST", "/api/collections/missions/records",
                 {"title": "OCN subsystem probe", "workspace": ws, "owner": uid,
                  "status": "proposed", "description": "Probe of the mission lifecycle."})
    mid = b.get("id") if s in (200, 201) else None
    if mid:
        probe("mission", "approve mission", "PATCH", "/api/collections/missions/records/%s" % mid,
              {"status": "approved"})
        probe("mission", "run mission", "PATCH", "/api/collections/missions/records/%s" % mid,
              {"status": "running"})
        probe("mission", "verify mission (policy gate)", "PATCH",
              "/api/collections/missions/records/%s" % mid, {"status": "verified"})
    probe("mission", "mission research queue", "GET",
          "/api/buildanddo/workspaces/%s/research-worker/queue" % ws)

    # --- suite system (the skill-shaped surface: a named routine run against a workspace)
    probe("suite", "suite with empty body (contract)", "POST",
          "/api/buildanddo/workspaces/%s/suite" % ws, {})

    # --- decision system
    probe("decision", "decide with empty body (contract)", "POST",
          "/api/buildanddo/workspaces/%s/decide" % ws, {})

    # --- knowledge system
    probe("knowledge", "knowledge read", "GET", "/api/buildanddo/workspaces/%s/knowledge" % ws)
    probe("knowledge", "knowledge context", "POST",
          "/api/buildanddo/workspaces/%s/knowledge/context" % ws, {})

    # --- research system
    probe("research", "research list", "GET", "/api/buildanddo/workspaces/%s/research" % ws)
    probe("research", "research submit (contract)", "POST",
          "/api/buildanddo/workspaces/%s/research" % ws, {})

    # --- blueprint system
    probe("blueprint", "blueprint list", "GET", "/api/buildanddo/workspaces/%s/blueprints" % ws)

    # --- operator surface
    probe("operator", "operator snapshot", "GET", "/api/buildanddo/workspaces/%s/operator" % ws)

    # --- communication: classroom presence (the agents' shared-room surface)
    probe("communication", "presence health", "GET", "/api/classroom/presence/health")
    probe("communication", "presence read", "GET", "/api/classroom/presence")
    probe("communication", "presence publish (contract)", "POST", "/api/classroom/presence", {})
    probe("communication", "presence health unauthenticated", "GET",
          "/api/classroom/presence/health", unauth=True)

    out["checks"] = checks
    absent = [c for c in checks if c["state"] == "ROUTE_ABSENT" and c["subsystem"] != "control"]
    out["summary"] = {
        "checks": len(checks),
        "route_absent": len(absent),
        "ok": sum(1 for c in checks if c["state"] == "OK"),
        "refused_or_contract": sum(1 for c in checks
                                   if c["state"] in ("REFUSED_BY_POLICY", "REJECTED_PAYLOAD", "NEEDS_AUTH")),
        "dependency_missing": sum(1 for c in checks if c["state"] == "DEPENDENCY_MISSING"),
        "transport_fault": sum(1 for c in checks if c["state"] == "TRANSPORT_FAULT"),
        "subsystems_with_absent_routes": sorted({c["subsystem"] for c in absent}),
    }
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
