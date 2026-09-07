#!/usr/bin/env python3
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


def main() -> int:
    today = dt.datetime.now(dt.timezone.utc).date()
    sprint_day = (today - sprint_cycle.SPRINT_START).days + 1
    state = sprint_cycle._load_state()  # noqa: SLF001 - intentional reuse, this IS the interface

    report = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "campaign_id": sprint_cycle.CAMPAIGN_ID,
        "sprint_day": sprint_day,
        "planned_pct": round(sprint_cycle._planned_pct(sprint_day), 1),  # noqa: SLF001
        "actual_pct": round(sprint_cycle._actual_pct(state), 1),  # noqa: SLF001
        "milestones": state["milestones"],
        "recent_commits": _recent_commits(),
        **_last_gate_and_deploy(),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "milestones"}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
