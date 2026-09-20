#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/deploy/roadmap_status.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/sprint_cycle.py
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/sprint_cycle.py;
#              PRODUCES apps/web/public/roadmap-status.json
# Intent:      Project the canonical sprint state into the one file the public
#              roadmap page reads, or say UNMEASURED rather than nothing.
# ───────────────────────────────────────────────────────────────
"""
roadmap_status.py - writes apps/web/public/roadmap-status.json before every
build, so RoadmapPage.jsx can render REAL data (actual %, recent commits,
last gate/deploy outcome) next to the planned curve, not just the static
plan. Vite copies public/ verbatim into dist, so this ships automatically
with every build ship.py runs - no separate publish step.

Reuses sprint_cycle.py's MILESTONES/_planned_pct/_actual_pct/_load_state
(single source of truth for the honest-actual-% rule: 0% until a milestone
is marked verified with real evidence - never invented here either).

Commit history comes from GitHub's public REST API (no auth, public repo) -
safe to expose since it's the same commit log already visible on GitHub.
"""
from __future__ import annotations
import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/
sys.path.insert(0, str(ROOT / "scripts" / "ci"))
import sprint_cycle  # noqa: E402 - path inserted above

OUT_PATH = ROOT / "apps" / "web" / "public" / "roadmap-status.json"
GITHUB_API = "https://api.github.com/repos/mrnobodytx/buildanddo/commits?per_page=8"


def _recent_commits() -> list[dict]:
    try:
        req = urllib.request.Request(GITHUB_API, headers={"Accept": "application/vnd.github+json",
                                                            "User-Agent": "buildanddo-roadmap-status"})
        with urllib.request.urlopen(req, timeout=10) as resp:  # noqa: S310 - fixed GitHub API URL
            data = json.loads(resp.read())
        return [
            {
                "sha": c["sha"][:7],
                "message": c["commit"]["message"].splitlines()[0][:120],
                "date": c["commit"]["committer"]["date"],
                "url": c["html_url"],
            }
            for c in data
        ]
    except Exception as exc:  # noqa: BLE001 - GitHub API outage must not fail the build
        return [{"error": f"{type(exc).__name__}: {exc}"}]


def _last_gate_and_deploy() -> dict:
    gate_path = ROOT / "state" / "integrity" / "latest.json"
    deploy_path = ROOT / "state" / "deploy" / "latest.json"
    gate = json.loads(gate_path.read_text(encoding="utf-8")) if gate_path.is_file() else {}
    deploy = json.loads(deploy_path.read_text(encoding="utf-8")) if deploy_path.is_file() else {}
    return {
        "gate_state": gate.get("state"),
        "gate_checked_at": gate.get("generated_at"),
        "last_deploy_finished_at": deploy.get("finished_at"),
        "last_deploy_promoted": deploy.get("promoted_to_production"),
    }


def _estate_progression() -> dict:
    """The estate's canonical progression, when the ship rail exposes it (BUILDANDDO_PROGRESSION_FILE). It is a
    DIFFERENT truth from the milestone ledger (owner: development-continuity fabric; criteria verified to date), so it
    is carried under its own key with its own generated_at and never averaged into actual_pct."""
    path = os.environ.get("BUILDANDDO_PROGRESSION_FILE", "").strip()
    if not path:
        return {"state": "UNMEASURED", "reason": "BUILDANDDO_PROGRESSION_FILE not set at ship time"}
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except Exception as exc:  # noqa: BLE001
        return {"state": "UNMEASURED", "reason": f"{type(exc).__name__}: {exc}"[:160]}
    summary = doc.get("summary") or {}
    return {
        "state": "MEASURED",
        "owner": "citadel-development-continuity-fabric",
        "generated_at": doc.get("generated_at"),
        "campaign_id": doc.get("campaign_id"),
        "schedule_elapsed_percent": summary.get("schedule_elapsed_percent"),
        "verified_to_date_percent": summary.get("verified_to_date_percent"),
        "full_campaign_percent": summary.get("full_campaign_percent"),
        "pace_state": summary.get("pace_state"),
        "verified_to_date": summary.get("verified_to_date"),
        "verified_total": summary.get("verified_total"),
        "criteria_to_date": summary.get("criteria_to_date"),
        "criteria_total": summary.get("criteria_total"),
        "next_hard_milestone": doc.get("next_hard_milestone"),
    }


def _replay() -> dict:
    """Re-check every milestone against its own evidence, for the public page.

    Day 21's contract, as the roadmap itself states it: every milestone "gets replayed
    against its own stated evidence bar, in public - not summarized as 'done,' but shown
    with what was actually verified and what wasn't." So the rotted claims travel with
    their reasons; a verdict with the reason stripped out is just another assertion.

    A replay that cannot run reports UNMEASURED and never blocks a build. It must also
    never report health: an exception here means nothing was checked, which is a different
    thing from everything checking out.

    Returns:
        The replay summary, or an UNMEASURED marker naming what went wrong.
    """
    try:
        sys.path.insert(0, str(ROOT / "scripts" / "ci"))
        import sprint_replay  # noqa: PLC0415 - imported here so a replay fault cannot break the build

        report = sprint_replay.replay(sprint_cycle._load_state(), sprint_replay.Context())  # noqa: SLF001
    except Exception as exc:  # noqa: BLE001 - a broken replay must not fail the ship
        return {"state": "UNMEASURED", "reason": f"{type(exc).__name__}: {exc}"[:160]}
    return {
        "state": "MEASURED",
        "context": report["context"],
        "claimed_pct": report["claimed_pct"],
        "replayed_pct": report["replayed_pct"],
        "overstatement_pct": report["overstatement_pct"],
        "counts": report["counts"],
        "milestones": [
            {
                "day": m["day"],
                "verdict": m["verdict"],
                "claims": m["claims"],
                "rot": [{"kind": c["kind"], "ref": c["ref"], "reason": c["reason"]}
                        for c in m["checked"] if c["outcome"] == sprint_replay.ROTTED],
            }
            for m in report["milestones"]
        ],
    }


def main() -> int:
    sprint_day = sprint_cycle.sprint_day()  # clamped to [1, SPRINT_DAYS]
    state = sprint_cycle._load_state()  # noqa: SLF001 - intentional reuse, this IS the interface

    report = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "state": "MEASURED",
        "campaign_id": sprint_cycle.CAMPAIGN_ID,
        # sprint_day is derived; publish what it is derived FROM, so a reader can check the
        # arithmetic instead of taking "day 12" on trust. sprint_cycle.py is the canonical,
        # tracked home for this date per SRS-BUILDANDDO-ROADMAP-001, and state["sprint_start"]
        # reads it from there rather than from the ledger file, which may be stale.
        "sprint_start": state["sprint_start"],
        "sprint_day": sprint_day,
        "sprint_days": sprint_cycle.SPRINT_DAYS,
        "planned_pct": round(sprint_cycle._planned_pct(sprint_day), 1),  # noqa: SLF001
        "actual_pct": round(sprint_cycle._actual_pct(state), 1),  # noqa: SLF001
        "milestone_state_source": state["source"],
        "milestones": state["milestones"],
        "recent_commits": _recent_commits(),
        **_last_gate_and_deploy(),
        "progression": _estate_progression(),
        # Carried under its own key, never averaged into actual_pct: actual_pct is what the
        # ledger claims, replay is what survived re-checking, and collapsing the two would
        # destroy the only comparison that makes either number meaningful.
        "replay": _replay(),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "milestones"}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
