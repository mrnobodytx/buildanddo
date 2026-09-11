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
# Depends:     scripts/ci/sprint_cycle.py,
#              state/roadmap_signals/latest.json (controller estate, SRS-BUILDANDDO-SIGNALS-001)
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/sprint_cycle.py;
#              PRODUCES apps/web/public/roadmap-status.json;
#              CONSUMES state/roadmap_signals/latest.json
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

Live source signals (GitHub / Datadog / PostHog / wiki / Discord / Reddit /
forum / Citadel rail) are read from the controller estate's
state/roadmap_signals/latest.json (tools/citadel_roadmap_signals.py) and
embedded verbatim as `signals`. They are presentational SIGNALS, never
results: an absent or unreadable file yields signals_state UNMEASURED and the
build still succeeds. Path override: env NAME BUILDANDDO_ROADMAP_SIGNALS.
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
# Controller estate layout: <estate>/sites/buildanddo is this clone, so the
# signals file the estate tool writes sits two levels up. Env NAME only.
SIGNALS_ENV = "BUILDANDDO_ROADMAP_SIGNALS"
SIGNALS_DEFAULT = ROOT.parent.parent / "state" / "roadmap_signals" / "latest.json"
SIGNALS_SCHEMA = "buildanddo.roadmap-signals/v1"
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


def _signals() -> dict:
    """Embed the estate's roadmap signals, or say UNMEASURED - never invent a tile."""
    path = Path(os.environ.get(SIGNALS_ENV) or SIGNALS_DEFAULT)
    if not path.is_file():
        return {"signals_state": "UNMEASURED", "signals_reason": "SIGNALS_FILE_ABSENT",
                "signals_generated_at": None, "signals": None}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - a corrupt signals file must not fail the build
        return {"signals_state": "UNMEASURED", "signals_reason": f"{type(exc).__name__}: {exc}",
                "signals_generated_at": None, "signals": None}
    if not isinstance(data, dict) or data.get("schema") != SIGNALS_SCHEMA or not isinstance(data.get("sources"), dict):
        return {"signals_state": "UNMEASURED", "signals_reason": "SIGNALS_SCHEMA_MISMATCH",
                "signals_generated_at": None, "signals": None}
    signals = {
        "schema": data["schema"],
        "generated_at": data.get("generated_at"),
        "state": data.get("state"),
        "sources": data["sources"],
        "failures": data.get("failures") or [],
        "truth_boundary": {**(data.get("truth_boundary") or {}), "presentation_only": True, "remote_writes": 0},
    }
    measured = data.get("state") in ("MEASURED", "DEGRADED")
    return {"signals_state": "MEASURED" if measured else "UNMEASURED",
            "signals_reason": None if measured else "NO_SOURCE_MEASURED",
            "signals_generated_at": data.get("generated_at"), "signals": signals}


def main() -> int:
    sprint_day = sprint_cycle.sprint_day()  # clamped to [1, SPRINT_DAYS]
    state = sprint_cycle._load_state()  # noqa: SLF001 - intentional reuse, this IS the interface

    report = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "state": "MEASURED",
        "campaign_id": sprint_cycle.CAMPAIGN_ID,
        "sprint_day": sprint_day,
        "sprint_days": sprint_cycle.SPRINT_DAYS,
        "planned_pct": round(sprint_cycle._planned_pct(sprint_day), 1),  # noqa: SLF001
        "actual_pct": round(sprint_cycle._actual_pct(state), 1),  # noqa: SLF001
        "milestone_state_source": state["source"],
        "milestones": state["milestones"],
        "recent_commits": _recent_commits(),
        **_last_gate_and_deploy(),
        **_signals(),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("milestones", "signals")}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
