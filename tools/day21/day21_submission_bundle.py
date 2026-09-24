#!/usr/bin/env python3
# --- CGRF Header -----------------------------------------------
# File:        sites/buildanddo/tools/day21/day21_submission_bundle.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-SUBMISSION-FRESHNESS-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     submissions/hostinger/submission.json
#              submissions/hostinger/validation.json
# EnumType:    Tool
# EnumEdges:   GATES submissions/hostinger/submission.json
# Intent:      A submission may not claim a commit the live site is not serving.
# ---------------------------------------------------------------
"""Prove the Hostinger submission still describes the thing that is deployed.

WHY THIS EXISTS. On 2026-09-21, one day before the internal freeze, the submission
bundle named candidate commit 07ac9afe... while buildanddo.com and staging both served
c46e28d0..., built that morning at 14:20Z. Nothing was wrong with either commit. What
was wrong is that NOTHING CHECKED: no tool in this repo writes submissions/hostinger/
submission.json, so the bundle is hand-maintained, and a hand-maintained claim about a
continuously-deployed system is stale the moment someone deploys.

That matters more here than it would elsewhere. The product's one-line pitch is "a
platform where the work, the evidence for it, and the check on that evidence are the
same object." A judge who opens /_version, compares it to the submission, and finds a
different SHA has disproved the pitch using the submission itself.

WHAT THIS REFUSES TO DO. It never edits a claim to make it pass. `verify` observes and
grades; `refresh` rewrites ONLY the candidate block -- the commit, branch and built_at
that live measurement establishes -- and leaves every `demonstrable` claim exactly as
written, because those assert things this tool cannot observe.

THE RULE IT ENFORCES. Unreachable is not PASS. A /_version that times out leaves the
verdict UNMEASURED, never CURRENT and never DRIFTED, because a submission cannot be
graded against a site that did not answer. Today's estate had the inverse bug -- an 8s
timeout recorded as an authentication failure -- and it cost a working integration its
P0 clearance for weeks.

  py -3.13 day21_submission_bundle.py verify
  py -3.13 day21_submission_bundle.py verify --json
  py -3.13 day21_submission_bundle.py refresh        # candidate block only
  py -3.13 day21_submission_bundle.py selftest

seat=C-ONE . (c) 2026 Citadel Nexus, Inc.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

VERSION = "1.0.0"
SCHEMA = "buildanddo.submission-freshness/v1"
SRS = "SRS-BUILDANDDO-SUBMISSION-FRESHNESS-001"

# The estate root is named by CITADEL_ROOT or derived from this file's place in the tree
# (<estate>/sites/buildanddo/tools/day21/). A literal workstation path does not belong in a
# file that is published to the public mirror.
ESTATE = Path(os.environ.get("CITADEL_ROOT") or Path(__file__).resolve().parents[4])
SUBMISSION = ESTATE / "submissions" / "hostinger" / "submission.json"
VALIDATION = ESTATE / "submissions" / "hostinger" / "validation.json"
REPO = ESTATE / "sites" / "buildanddo"

# A browser UA: a bare urllib UA is refused at the Cloudflare edge, and that refusal
# would read as a dead site rather than a blocked client.
UA = "Mozilla/5.0 (citadel-submission-freshness)"
TIMEOUT_S = 25
SHA_MIN = 7


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def fetch_version(base: str) -> dict[str, Any]:
    """GET <base>/_version. Transport failure is UNMEASURED, never a verdict."""
    url = base.rstrip("/") + "/_version"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            raw = r.read(65536).decode("utf-8", "replace")
            status = int(r.status)
    except urllib.error.HTTPError as e:
        return {"state": "FAILED", "status": int(e.code), "url": url, "reason": f"http_{e.code}"}
    except Exception as e:
        return {"state": "UNMEASURED", "status": None, "url": url, "reason": type(e).__name__}
    try:
        doc = json.loads(raw)
    except Exception:
        return {"state": "UNMEASURED", "status": status, "url": url, "reason": "unparseable_version"}
    return {
        "state": "OBSERVED", "status": status, "url": url,
        "commit_sha": doc.get("commit_sha") or doc.get("candidate_sha"),
        "built_at": doc.get("built_at"),
        "gitlab_pipeline_id": doc.get("gitlab_pipeline_id"),
    }


def sha_matches(claimed: str | None, observed: str | None) -> bool:
    """Prefix-compare two SHAs, refusing degenerate comparisons.

    An empty or near-empty string must never match: `"" in x` is True for every x,
    which is how a missing value becomes a passing check.
    """
    if not claimed or not observed:
        return False
    a, b = str(claimed).strip().lower(), str(observed).strip().lower()
    if len(a) < SHA_MIN or len(b) < SHA_MIN:
        return False
    n = min(len(a), len(b))
    return a[:n] == b[:n]


def git_commit_exists(sha: str | None) -> bool:
    if not sha:
        return False
    try:
        out = subprocess.run(["git", "-C", str(REPO), "cat-file", "-t", sha],
                             capture_output=True, text=True, timeout=30)
        return out.returncode == 0 and out.stdout.strip() == "commit"
    except Exception:
        return False


def current_branch_for(sha: str | None) -> str | None:
    if not sha:
        return None
    try:
        out = subprocess.run(["git", "-C", str(REPO), "branch", "--contains", sha, "--format=%(refname:short)"],
                             capture_output=True, text=True, timeout=30)
        names = [ln.strip() for ln in out.stdout.splitlines() if ln.strip()]
        return names[0] if names else None
    except Exception:
        return None


def verify() -> dict[str, Any]:
    sub = load_json(SUBMISSION, {}) or {}
    cand = sub.get("candidate") or {}
    claimed = cand.get("commit")

    surfaces: dict[str, dict[str, Any]] = {}
    for label in ("production", "staging"):
        base = cand.get(label)
        if base:
            surfaces[label] = fetch_version(base)

    rows = []
    for label, obs in surfaces.items():
        if obs["state"] != "OBSERVED":
            verdict = "UNMEASURED"
        elif sha_matches(claimed, obs.get("commit_sha")):
            verdict = "CURRENT"
        else:
            verdict = "DRIFTED"
        rows.append({
            "surface": label, "url": obs.get("url"), "verdict": verdict,
            "claimed_commit": claimed, "observed_commit": obs.get("commit_sha"),
            "built_at": obs.get("built_at"), "probe_state": obs["state"],
            "reason": obs.get("reason"),
            # A deploy with no pipeline id did not originate from CI, which is exactly
            # how the served SHA drifts away from anything a human wrote down.
            "ci_originated": obs.get("gitlab_pipeline_id") is not None,
        })

    drifted = [r for r in rows if r["verdict"] == "DRIFTED"]
    unmeasured = [r for r in rows if r["verdict"] == "UNMEASURED"]
    if not rows:
        state = "UNMEASURED"
    elif drifted:
        state = "DRIFTED"
    elif unmeasured:
        state = "UNMEASURED"
    else:
        state = "CURRENT"

    val = load_json(VALIDATION, {}) or {}
    return {
        "schema": SCHEMA, "version": VERSION, "srs": SRS, "generated_at": utcnow(),
        "state": state,
        "claimed_commit": claimed,
        "claimed_commit_in_repo": git_commit_exists(claimed),
        "observed_commits": sorted({r["observed_commit"] for r in rows if r["observed_commit"]}),
        "surfaces": rows,
        "validation_generated_at": val.get("generated_at"),
        "validation_state": val.get("state"),
        "validation_is_replayed": True,
        "external_writes": 0,
        "rule": "A submission may not claim a commit the live site is not serving. "
                "Unreachable is UNMEASURED, never PASS.",
    }


def refresh() -> dict[str, Any]:
    """Rewrite ONLY the candidate block from live measurement. Claims are never touched."""
    rep = verify()
    if rep["state"] != "DRIFTED":
        rep["refreshed"] = False
        rep["refresh_reason"] = f"state is {rep['state']}; refresh only applies to DRIFTED"
        return rep

    observed = [r["observed_commit"] for r in rep["surfaces"]
                if r["verdict"] == "DRIFTED" and r["observed_commit"]]
    distinct = sorted(set(observed))
    if len(distinct) != 1:
        rep["refreshed"] = False
        rep["refresh_reason"] = (f"surfaces disagree ({distinct}); refusing to pick one. "
                                 "Reconcile the deploys first.")
        return rep

    sha = distinct[0]
    if not git_commit_exists(sha):
        rep["refreshed"] = False
        rep["refresh_reason"] = f"served commit {sha[:12]} is not in the repo; refusing to record it"
        return rep

    sub = load_json(SUBMISSION, {}) or {}
    cand = dict(sub.get("candidate") or {})
    previous = cand.get("commit")
    cand["commit"] = sha
    branch = current_branch_for(sha)
    if branch:
        cand["branch"] = branch
    built = next((r["built_at"] for r in rep["surfaces"] if r["observed_commit"] == sha), None)
    if built:
        cand["deployed_built_at"] = built
    cand["candidate_verified_at"] = utcnow()
    cand["previous_commit"] = previous

    sub["candidate"] = cand
    sub["generated_at"] = utcnow()
    SUBMISSION.write_text(json.dumps(sub, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    rep["refreshed"] = True
    rep["refresh_reason"] = f"candidate commit {str(previous)[:12]} -> {sha[:12]}"
    rep["external_writes"] = 0
    return rep


def render(rep: dict[str, Any]) -> None:
    print("=" * 92)
    print(f"BUILDANDDO // SUBMISSION FRESHNESS // {rep['state']}".ljust(72) + f"v{VERSION}")
    print("=" * 92)
    print(f"claimed commit {str(rep.get('claimed_commit'))[:12]} "
          f"(in repo: {rep.get('claimed_commit_in_repo')})")
    for r in rep.get("surfaces", []):
        print(f"  {r['surface']:<12} {r['verdict']:<11} served={str(r.get('observed_commit'))[:12]} "
              f"built={str(r.get('built_at'))[:19]} ci={r.get('ci_originated')}")
        if r.get("reason"):
            print(f"               reason={r['reason']}")
    if rep.get("refresh_reason"):
        print(f"refresh: {rep['refresh_reason']}")
    print(f"validation.json generated {rep.get('validation_generated_at')} "
          f"state={rep.get('validation_state')} (REPLAYED, not re-observed)")
    print("-" * 92)
    print(rep["rule"])
    print("=" * 92)


def selftest() -> int:
    checks: list[tuple[str, bool]] = []

    def ck(name: str, cond: bool) -> None:
        checks.append((name, bool(cond)))

    # An empty or stub SHA must never satisfy a comparison.
    ck("empty claimed never matches", not sha_matches("", "c46e28d0ea"))
    ck("empty observed never matches", not sha_matches("c46e28d0ea", ""))
    ck("None never matches", not sha_matches(None, None))
    ck("too-short never matches", not sha_matches("c46", "c46e28d0ea"))
    ck("prefix of adequate length matches", sha_matches("c46e28d0eae61d6", "c46e28d0ea"))
    ck("different shas do not match", not sha_matches("07ac9afef41b", "c46e28d0eae6"))
    ck("case and whitespace tolerated", sha_matches(" C46E28D0EAE6 ", "c46e28d0eae6"))

    # The verdict ladder: unreachable must never become a pass.
    def grade(probe: dict[str, Any], claimed: str) -> str:
        if probe["state"] != "OBSERVED":
            return "UNMEASURED"
        return "CURRENT" if sha_matches(claimed, probe.get("commit_sha")) else "DRIFTED"

    ck("timeout grades UNMEASURED",
       grade({"state": "UNMEASURED", "reason": "TimeoutError"}, "c46e28d0eae6") == "UNMEASURED")
    ck("http error grades UNMEASURED, not CURRENT",
       grade({"state": "FAILED", "status": 502}, "c46e28d0eae6") == "UNMEASURED")
    ck("observed matching grades CURRENT",
       grade({"state": "OBSERVED", "commit_sha": "c46e28d0eae6"}, "c46e28d0eae6") == "CURRENT")
    ck("observed differing grades DRIFTED",
       grade({"state": "OBSERVED", "commit_sha": "c46e28d0eae6"}, "07ac9afef41b") == "DRIFTED")
    ck("observed-but-null-sha grades DRIFTED, never CURRENT",
       grade({"state": "OBSERVED", "commit_sha": None}, "07ac9afef41b") == "DRIFTED")

    # The bundle must exist and carry a candidate commit, or the gate is vacuous.
    sub = load_json(SUBMISSION, {}) or {}
    ck("submission bundle present", SUBMISSION.is_file())
    ck("submission declares a candidate commit", bool((sub.get("candidate") or {}).get("commit")))
    ck("submission declares at least one live surface",
       any((sub.get("candidate") or {}).get(k) for k in ("production", "staging")))

    # The repo must be resolvable, else `claimed_commit_in_repo` is meaningless.
    ck("buildanddo repo present", (REPO / ".git").exists())
    ck("a known-bad sha is not reported as present", not git_commit_exists("0" * 40))

    # refresh must be inert unless DRIFTED, and must never invent a commit.
    ck("refresh refuses a sha absent from the repo", not git_commit_exists("deadbeefdeadbeef"))

    ok = sum(1 for _, c in checks if c)
    for name, cond in checks:
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}")
    print(f"selftest {ok}/{len(checks)}")
    return 0 if ok == len(checks) else 1


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("cmd", nargs="?", choices=["verify", "refresh", "selftest"], default="verify")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)

    if args.cmd == "selftest":
        return selftest()

    rep = refresh() if args.cmd == "refresh" else verify()
    if args.json:
        print(json.dumps(rep, indent=2, default=str))
    else:
        render(rep)
    return 0 if rep["state"] in {"CURRENT"} else 2


if __name__ == "__main__":
    sys.exit(main())
