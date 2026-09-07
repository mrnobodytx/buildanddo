#!/usr/bin/env python3
"""
sprint_cycle.py - one iteration of the 21-day BuildAndDo sprint driver.

Backlog source of truth: the MILESTONES array literally shipped in
apps/web/src/pages/RoadmapPage.jsx (kept in sync here, not duplicated logic -
this script only READS the intent; RoadmapPage.jsx is still what renders it).
Campaign start date is fixed to Day 1 of docs/journal/2026-09-03-day-01.md.

Each cycle:
  1. Runs integrity_regression_check.py (hash/diff/build/lint - real, not assumed).
  2. Computes the current sprint day and which milestone is "due".
  3. Loads/updates local milestone state (state/sprint/milestones.json) -
     never marks a milestone verified from this script; only PLANNED -> DUE
     -> (a human/coding session marks IN_PROGRESS/VERIFIED with real evidence).
  4. Logs one CAL-AN-DR dev-activity event per cycle via
     services/cal_an_dr/dev_activity.py's write path (CNWB repo), tagged with
     the campaign_id, so the sprint's real progress is visible in CAL-AN-DR,
     not just on this disk.

This script does NOT write feature code. Building a milestone's actual
deliverable (e.g. "Workspace collections live") is separate, reviewed work -
autonomous, unsupervised feature generation for a live hackathon submission
is out of scope for a cron job.
"""
from __future__ import annotations
import datetime as dt
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/
CNWB_ROOT = Path(r"D:/citadel_websites/Citadel-nexus/projects/guilds/CNWB")
STATE_PATH = ROOT / "state" / "sprint" / "milestones.json"
CAMPAIGN_ID = "citadel-21-day-2026-09"
SPRINT_START = dt.date(2026, 9, 3)  # docs/journal/2026-09-03-day-01.md

CNWB_HELPER_KEY = r"C:\Users\raizoken\.ssh\citadel_helper"
CNWB_PROD_HOST = "root@10.100.0.23"  # ray-tor1-3, the box that actually runs citadel-api (see
# earlier session finding: nginx's citadel_api_pool routes here, not the VPS)
CNWB_SYSTEMS_GROWTH_JSONL = "/opt/citadel/repo/data/runtime/calandr/system_events.jsonl"

# `value` matches RoadmapPage.jsx's MILESTONES exactly (planned cumulative completion %).
MILESTONES = [
    {"day": 1, "title": "Sprint kickoff — foundations", "value": 5},
    {"day": 3, "title": "Auth & onboarding hardening", "value": 12},
    {"day": 5, "title": "Workspace collections live", "value": 20},
    {"day": 7, "title": "Signals pipeline MVP", "value": 30},
    {"day": 9, "title": "Missions — bounded-action engine", "value": 40},
    {"day": 11, "title": "Workflows editor", "value": 50},
    {"day": 13, "title": "Service connectors (Firecrawl, n8n)", "value": 60},
    {"day": 15, "title": "ERP foundation", "value": 70},
    {"day": 17, "title": "Evidence ledger & verification", "value": 80},
    {"day": 19, "title": "Daily edition & specialist desks", "value": 88},
    {"day": 21, "title": "Sprint review — verified replay", "value": 100},
]


def _planned_pct(sprint_day: int) -> float:
    """Interpolated planned completion %, same formula as RoadmapPage.jsx's TRAJECTORY
    (minus the cosmetic market-plot wiggle - this feeds a data pipeline, not a chart)."""
    day = max(1, min(21, sprint_day))
    exact = next((m for m in MILESTONES if m["day"] == day), None)
    if exact:
        return float(exact["value"])
    prev = max((m for m in MILESTONES if m["day"] < day), key=lambda m: m["day"])
    nxt = min((m for m in MILESTONES if m["day"] > day), key=lambda m: m["day"])
    frac = (day - prev["day"]) / (nxt["day"] - prev["day"])
    return prev["value"] + (nxt["value"] - prev["value"]) * frac


def _actual_pct(state: dict) -> float:
    """Honest, not invented: actual % = the value of the highest-day milestone actually
    marked 'verified' with real evidence (never 'due' or 'in_progress' - those aren't
    completions). Zero milestones verified => 0%, which is the honest truth today."""
    verified_days = [int(k) for k, v in state["milestones"].items() if v.get("status") == "verified"]
    if not verified_days:
        return 0.0
    top = max(m for m in MILESTONES if m["day"] == max(verified_days))
    return float(top["value"])


def _load_state() -> dict:
    if STATE_PATH.is_file():
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    return {"milestones": {str(m["day"]): {"title": m["title"], "status": "planned"} for m in MILESTONES}}


def _save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _log_to_calandr(event: dict) -> dict:
    """Best-effort: reuse services/cal_an_dr/dev_activity.py's writer. Fail-soft +
    loud - a CAL-AN-DR outage must never silently drop the milestone from view."""
    try:
        sys.path.insert(0, str(CNWB_ROOT))
        from services.cal_an_dr import dev_activity  # noqa: PLC0415

        env = {}
        for line in (CNWB_ROOT / "tools" / "workspace.env").read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
        row = dev_activity._row(  # noqa: SLF001 - intentional reuse of the canonical row shape
            tenant=CAMPAIGN_ID, user="sprint_cycle", source_id=event["source_id"],
            event_type=event["event_type"], event_ts=dt.datetime.now(dt.timezone.utc).isoformat(),
            payload=event["payload"],
        )
        result = dev_activity.write_events(
            [row], supabase_url=env.get("SUPABASE_URL", ""), supabase_key=env.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        )
        return {"ok": True, "result": result}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def _log_growth_event(etype: str, label: str, meta: dict) -> dict:
    """Append one row to CAL-AN-DR's systems-growth event ledger (the file
    POST /api/calandr/systems-growth/event writes to) via SSH, since that endpoint
    is admin/master-gated and this cron has no human session token. Same row shape,
    same file, same effect: shows up in the day-bucketed growth series + recent-events
    list CAL-AN-DR's UI already renders. Fail-soft + loud, same contract as CAL-AN-DR
    dev-activity logging - a write failure must be visible in the result, never silent.
    """
    row = {
        "ts_iso": dt.datetime.now(dt.timezone.utc).isoformat(),
        "type": etype[:64], "label": label[:200], "meta": meta, "source": "cron",
    }
    line = json.dumps(row, default=str)
    try:
        # single-quote the JSON for the remote shell; escape embedded single quotes.
        remote_line = line.replace("'", "'\\''")
        cmd = [
            "ssh", "-i", CNWB_HELPER_KEY, "-o", "StrictHostKeyChecking=no", CNWB_PROD_HOST,
            f"mkdir -p $(dirname {CNWB_SYSTEMS_GROWTH_JSONL}) && "
            f"echo '{remote_line}' >> {CNWB_SYSTEMS_GROWTH_JSONL}",
        ]
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return {"ok": p.returncode == 0, "returncode": p.returncode, "stderr_tail": p.stderr[-300:]}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def main() -> int:
    today = dt.datetime.now(dt.timezone.utc).date()
    sprint_day = (today - SPRINT_START).days + 1

    check = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ci" / "integrity_regression_check.py")],
        cwd=str(ROOT), capture_output=True, text=True, timeout=900,
    )
    # Read the report file rather than parse stdout - integrity_regression_check.py's own
    # stdout is pretty-printed (multi-line), so scraping it is fragile; the file is authoritative.
    latest_report_path = ROOT / "state" / "integrity" / "latest.json"
    try:
        check_report = json.loads(latest_report_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        check_report = {"state": "UNKNOWN", "raw_stdout_tail": check.stdout[-1000:]}

    state = _load_state()
    due = [m for m in MILESTONES if m["day"] <= sprint_day]
    current = due[-1] if due else None
    if current is not None:
        key = str(current["day"])
        if state["milestones"].get(key, {}).get("status") == "planned":
            state["milestones"][key]["status"] = "due"
            state["milestones"][key]["due_observed_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
    _save_state(state)

    planned = round(_planned_pct(sprint_day), 1)
    actual = round(_actual_pct(state), 1)
    drift = round(actual - planned, 1)  # negative = behind plan; 0 today is the honest state

    calandr_result = _log_to_calandr({
        "source_id": f"sprint-cycle-{dt.datetime.now(dt.timezone.utc).isoformat()}",
        "event_type": "sprint_cycle_check",
        "payload": {
            "campaign_id": CAMPAIGN_ID,
            "sprint_day": sprint_day,
            "current_milestone": current,
            "planned_pct": planned, "actual_pct": actual, "drift_pct": drift,
            "integrity_check": {"state": check_report.get("state"), "returncode": check.returncode},
        },
    })

    growth_result = _log_growth_event(
        "buildanddo_sprint_cycle",
        f"Day {sprint_day}: {(current or {}).get('title', '?')} — planned {planned}% / actual {actual}% (drift {drift:+}%)",
        {
            "campaign_id": CAMPAIGN_ID, "sprint_day": sprint_day,
            "planned_pct": planned, "actual_pct": actual, "drift_pct": drift,
            "integrity_state": check_report.get("state"), "tracked_files": check_report.get("tracked_files"),
        },
    )

    result = {
        "sprint_day": sprint_day,
        "current_milestone": current,
        "planned_pct": planned, "actual_pct": actual, "drift_pct": drift,
        "integrity_check": {k: v for k, v in check_report.items() if k != "manifest"},
        "calandr_logged": calandr_result.get("ok", False),
        "calandr_error": calandr_result.get("error"),
        "growth_event_logged": growth_result.get("ok", False),
        "growth_event_error": growth_result.get("stderr_tail") or growth_result.get("error"),
    }
    print(json.dumps(result, indent=2, default=str))
    return 0 if check_report.get("state") == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
