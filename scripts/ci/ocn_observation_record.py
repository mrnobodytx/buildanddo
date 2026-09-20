#!/usr/bin/env python3
# ─── CGRF Header ─────────────────────────────────────────────────────────────
# File:        scripts/ci/ocn_observation_record.py
# Stage:       09_VERIFY
# SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-20
# Depends:     apps/pocketbase/pb_migrations/1790800000_signal_mission_link.js (signals.mission)
# EnumType:    Verifier
# EnumEdges:   PRODUCES a mission + evidence + signal chain owned by this seat, citing a public
#              forum post as the evidence source
# Intent:      Close the dogfood loop - what a seat observed becomes a public comment, a private
#              evidence record and a signal, each reachable from the next, so the claim can be
#              re-derived by someone who trusts none of it.
# ─────────────────────────────────────────────────────────────────────────────
"""ocn_observation_record.py - turn this seat's observation into a provable chain.

RUNS ON A FLEET BOX, as the seat, in the seat's OWN workspace.

    ocn_observation_record.py <seat> <workspace> --forum-url URL --finding TEXT
                              [--severity info|low|medium|high|critical] [--env staging]

THE CHAIN, and why each link exists:
    forum post (public, has a URL anyone can fetch)
        <- evidence.source names that URL, evidence.content carries the measurement
             <- evidence.mission binds it to a mission in this workspace
                  <- signal.mission binds the opinion to the same mission

So a reader who starts at the signal can walk to the mission, to the evidence, to a public post, to
the measurement - without taking any step on trust. That is the difference between a claim and a
trail: every hop is a fetch someone else can repeat.

WHY THE SEAT'S OWN WORKSPACE. Cross-workspace writes are refused now, correctly. Each seat records
in its own tenant, which is also the honest shape: this is what that seat saw, not a shared verdict
someone merged.

WHAT IS AN OPINION AND WHAT IS A MEASUREMENT. The evidence carries the measurement and the forum URL.
The signal carries the opinion, typed `inference`, because that is what a persona reading a
measurement produces. Typing it `fact` would launder a judgement into an observation.
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
UA = {"User-Agent": "Mozilla/5.0 (compatible; bnd-ocn-record/1.0)", "Content-Type": "application/json"}


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


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("seat")
    ap.add_argument("workspace")
    ap.add_argument("--forum-url", required=True)
    ap.add_argument("--finding", required=True)
    ap.add_argument("--persona", default="")
    ap.add_argument("--severity", default="medium",
                    choices=["info", "low", "medium", "high", "critical"])
    ap.add_argument("--env", default="staging", choices=sorted(ENVS))
    args = ap.parse_args()
    C = ENVS[args.env] + BACKEND + "/api/collections"
    out = {"schema": "buildanddo.ocn-observation-record/v1", "seat": args.seat,
           "persona": args.persona, "workspace": args.workspace, "env": args.env,
           "forum_url": args.forum_url,
           "at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "chain": {}}

    token, uid = login(args.seat, ENVS[args.env])
    if not token:
        out["login"] = "FAILED"
        print(json.dumps(out))
        return 1
    out["login"] = "OK"
    auth = {"Authorization": token}

    s, b = http(C + "/missions/records", data=json.dumps({
        "title": "OCN observation: %s (%s)" % (args.persona or args.seat, args.seat),
        "workspace": args.workspace, "owner": uid, "status": "proposed",
        "description": "Raised from what this seat observed of BuildAndDo. Public comment: %s"
                       % args.forum_url}).encode(), headers=auth)
    if s not in (200, 201):
        out["chain"]["mission"] = {"http": s, "message": str(b.get("message"))[:120]}
        print(json.dumps(out))
        return 1
    mid = b["id"]
    out["chain"]["mission"] = mid

    # The evidence carries the MEASUREMENT and names the public post as its source, so the claim
    # can be checked by someone who fetches that URL themselves.
    s, b = http(C + "/evidence/records", data=json.dumps({
        "content": args.finding, "source": args.forum_url, "type": "observed",
        "workspace": args.workspace, "owner": uid, "mission": mid,
        "title": "Observed by %s" % (args.persona or args.seat),
        "category": "ocn_observation", "tags": "ocn,perception"}).encode(), headers=auth)
    if s not in (200, 201):
        out["chain"]["evidence"] = {"http": s, "message": str(b.get("message"))[:120]}
        print(json.dumps(out))
        return 1
    eid = b["id"]
    out["chain"]["evidence"] = eid

    # The signal carries the OPINION. Typed `inference` on purpose: a persona reading a measurement
    # produces a judgement, and calling that a `fact` would launder it into an observation.
    s, b = http(C + "/signals/records", data=json.dumps({
        "title": "%s: %s" % (args.persona or args.seat, args.finding[:110]),
        "workspace": args.workspace, "owner": uid, "type": "inference",
        "severity": args.severity, "state": "new", "confidence": 0.7, "mission": mid,
        "source": args.forum_url,
        "description": "%s\n\nEvidence record: %s\nMission: %s\nPublic comment: %s"
                       % (args.finding, eid, mid, args.forum_url)}).encode(), headers=auth)
    if s not in (200, 201):
        out["chain"]["signal"] = {"http": s, "message": str(b.get("message"))[:120]}
        print(json.dumps(out))
        return 1
    out["chain"]["signal"] = b["id"]

    # Walk the chain back the way a sceptic would, by fetching rather than by remembering.
    s1, sig = http(C + "/signals/records/%s" % out["chain"]["signal"], headers=auth)
    s2, ev = http(C + "/evidence/records/%s" % eid, headers=auth)
    out["provable"] = {
        "signal_names_mission": sig.get("mission") == mid,
        "evidence_names_mission": ev.get("mission") == mid,
        "evidence_source_is_forum_post": ev.get("source") == args.forum_url,
        "signal_readback_http": s1, "evidence_readback_http": s2,
    }
    out["provable"]["chain_intact"] = all(v is True for k, v in out["provable"].items()
                                          if isinstance(v, bool))
    print(json.dumps(out))
    return 0 if out["provable"]["chain_intact"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
