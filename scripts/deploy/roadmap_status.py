#!/usr/bin/env python3
# CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/deploy/roadmap_status.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN, C-ONE (2026-09-11 progression consumer)
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/sprint_cycle.py,
#              state/roadmap_signals/latest.json (controller estate, SRS-BUILDANDDO-SIGNALS-001),
#              state/development_continuity/sprint_progression/latest.json (controller estate, read-only),
#              config/campaign_21_day_progression_v1.yaml (controller estate, read-only)
# EnumType:    Service
# EnumEdges:   CONSUMES scripts/ci/sprint_cycle.py;
#              PRODUCES apps/web/public/roadmap-status.json;
#              CONSUMES state/roadmap_signals/latest.json;
#              CONSUMES state/development_continuity/sprint_progression/latest.json
# Intent:      Project the canonical sprint state into the one file the public
#              roadmap page reads, or say UNMEASURED rather than nothing. The
#              roadmap is a CONSUMER of the estate's progression, never a
#              second progression engine.
# ───────────────────────────────────────────────────────────────
"""
roadmap_status.py - writes apps/web/public/roadmap-status.json before every
build, so RoadmapPage.jsx can render REAL data (milestone evidence, recent
commits, last gate/deploy outcome, measured progression) next to the planned
curve, not just the static plan. Vite copies public/ verbatim into dist, so
this ships automatically with every build ship.py runs - no separate publish
step.

Reuses sprint_cycle.py's MILESTONES/_planned_pct/_actual_pct/_load_state
(single source of truth for the honest milestone-evidence rule: 0% until a
milestone is marked verified with real evidence - never invented here either).
That figure is published as `verified_pct` (and `actual_pct` for older
readers): it is MILESTONE EVIDENCE against the plan curve, not measured
progression.

Measured progression is consumed - never computed - from the estate's
development-continuity projection (env NAME BUILDANDDO_PROGRESSION_FILE) and
the campaign day-index config (env NAME BUILDANDDO_CAMPAIGN_CONFIG). Only a
strict public-safe allowlist of fields is copied; file paths, bars, hostnames
and secret names never cross. The axes are independent and never averaged:

  calendar_pct   schedule elapsed (estate rule)
  planned_pct    plan curve at the day (sprint_cycle)
  measured_pct   verified acceptance criteria to date (estate rule)
  verified_pct   milestone evidence against the plan (sprint_cycle)
  full_pct       whole-campaign verified share (estate rule)

`day` is the operator-declared sprint index counted from the campaign anchor
at build time (day 8 = 2026-09-08); the browser recounts it live at view time.
`projection_day` is the day the estate projection was last computed for and
`projection_behind_days` how far behind it is. `plan_day` is the same clock
(SPRINT_START is derived from the anchor); `day_disagreement` flags any
drift between the two. A projection whose `current_date`
is not the build date is STALE and the day falls back to the plan clock for
the plan target only - the canonical numbers are still shown, labelled.

`measurement_contract` is the sha256 of the estate's rule texts; when the
rule changes the hash changes, so a contract change is detectable and never
mistaken for progression. Absent, unreadable or schema-mismatched inputs
yield {"state": "UNMEASURED", "reason": ...}; the build never fails.

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
import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # sites/buildanddo/
sys.path.insert(0, str(ROOT / "scripts" / "ci"))
import sprint_cycle  # noqa: E402 - path inserted above

OUT_PATH = ROOT / "apps" / "web" / "public" / "roadmap-status.json"
# Controller estate layout: <estate>/sites/buildanddo is this clone, so the
# estate files sit two levels up. Env NAMES only - never values.
ESTATE = ROOT.parent.parent
SIGNALS_ENV = "BUILDANDDO_ROADMAP_SIGNALS"
SIGNALS_DEFAULT = ESTATE / "state" / "roadmap_signals" / "latest.json"
SIGNALS_SCHEMA = "buildanddo.roadmap-signals/v1"
PROGRESSION_ENV = "BUILDANDDO_PROGRESSION_FILE"
PROGRESSION_DEFAULT = ESTATE / "state" / "development_continuity" / "sprint_progression" / "latest.json"
CAMPAIGN_ENV = "BUILDANDDO_CAMPAIGN_CONFIG"
CAMPAIGN_DEFAULT = ESTATE / "config" / "campaign_21_day_progression_v1.yaml"
PROGRESSION_OWNER = "Citadel Development Continuity + repository bridge"
GITHUB_API = "https://api.github.com/repos/mrnobodytx/buildanddo/commits?per_page=8"

# A string copied from an estate file must never smuggle a path. Drive-letter
# paths, estate state/config paths and file names are rejected outright.
_PATHLIKE = re.compile(r"[A-Za-z]:\\|[A-Za-z]:/|(?:^|[\s/])state/|(?:^|[\s/])config/|\.(?:json|ya?ml|pdf)\b", re.IGNORECASE)


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


# ── progression consumer ──────────────────────────────────────────────────────

def _public_str(value: object, limit: int = 240) -> str | None:
    """Copy a string out of an estate file only when it carries no path."""
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text or _PATHLIKE.search(text):
        return None
    return text[:limit]


def _num(value: object) -> float | None:
    """A JSON number as float, or None. Booleans are not numbers here."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return round(float(value), 1)


def _int(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value)


def _date(value: object) -> dt.date | None:
    if not isinstance(value, str):
        return None
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        return None


def _read_estate_file(path: Path) -> object:
    """Parse an estate JSON (or YAML, when PyYAML is present) document."""
    text = path.read_text(encoding="utf-8")
    try:
        return json.loads(text)
    except ValueError:
        try:
            import yaml  # noqa: PLC0415 - optional, stdlib-first
        except ImportError as exc:
            raise ValueError("not JSON and PyYAML unavailable") from exc
        return yaml.safe_load(text)


def _measurement_contract(rule: str | None, day_index_rule: str | None) -> str:
    """sha256 over the estate's rule texts - a change here is a CONTRACT change."""
    digest = hashlib.sha256()
    digest.update((rule or "").encode("utf-8"))
    digest.update(b"\n")
    digest.update((day_index_rule or "").encode("utf-8"))
    return digest.hexdigest()


def _campaign_anchor(build_date: dt.date) -> dict:
    """Allowlisted day-index facts from the campaign config, or UNMEASURED.

    Only anchor_day, anchor_date, strategy window, hostinger deadline and the
    rule text cross. `anchor_rule_day` is DERIVED here from the anchor at the
    build date so a stale projection is visible; it is not the canonical day.
    """
    base = {
        "plan_window_start": sprint_cycle.SPRINT_START.isoformat(),
        "day_timezone": sprint_cycle.CAMPAIGN_TZ,
        "canonical_anchor_day": None,
        "canonical_anchor_date": None,
        "anchor_rule_day": None,
        "window_start": None,
        "window_end": None,
        "hostinger_deadline": None,
        "rule": None,
    }
    path = Path(os.environ.get(CAMPAIGN_ENV) or CAMPAIGN_DEFAULT)
    if not path.is_file():
        return {**base, "state": "UNMEASURED", "reason": "CAMPAIGN_CONFIG_ABSENT"}
    try:
        data = _read_estate_file(path)
    except Exception as exc:  # noqa: BLE001 - never fails the build
        return {**base, "state": "UNMEASURED", "reason": f"{type(exc).__name__}: {exc}"[:160]}
    if not isinstance(data, dict) or not isinstance(data.get("day_index"), dict):
        return {**base, "state": "UNMEASURED", "reason": "CAMPAIGN_SCHEMA_MISMATCH"}
    index = data["day_index"]
    source = data.get("source") if isinstance(data.get("source"), dict) else {}
    anchor_day = _int(index.get("anchor_day"))
    anchor_date = _date(index.get("anchor_date"))
    if anchor_day is None or anchor_date is None:
        return {**base, "state": "UNMEASURED", "reason": "CAMPAIGN_SCHEMA_MISMATCH"}
    return {
        **base,
        "state": "MEASURED",
        "reason": None,
        "canonical_anchor_day": anchor_day,
        "canonical_anchor_date": anchor_date.isoformat(),
        "anchor_rule_day": anchor_day + (build_date - anchor_date).days,
        "window_start": _public_str(source.get("strategy_window_start")),
        "window_end": _public_str(source.get("strategy_window_end")),
        "hostinger_deadline": _public_str(source.get("hostinger_deadline")),
        "rule": _public_str(index.get("rule"), 400),
    }


def _anchor_day(anchor: dict, plan_day: int) -> int:
    """The sprint day counted from the operator anchor at build time.

    The day is a calendar fact, never a measurement: it is derived from the
    campaign anchor (day 8 = 2026-09-08) and clamped to the sprint window.
    When the campaign config cannot be read the plan clock (derived from the
    same anchor) stands in, so the day never depends on a stale projection.
    """
    rule_day = anchor.get("anchor_rule_day")
    if anchor.get("state") == "MEASURED" and isinstance(rule_day, int):
        return max(1, min(rule_day, sprint_cycle.SPRINT_DAYS))
    return plan_day


def _unmeasured_progression(reason: str, plan_day: int, anchor: dict) -> dict:
    """The honest shape when the estate projection cannot be consumed.

    UNKNOWN != ZERO: no measured number is emitted at all. The plan clock
    facts are still reported because they are computed locally.
    """
    day = _anchor_day(anchor, plan_day)
    return {
        "state": "UNMEASURED",
        "reason": reason,
        "owner": PROGRESSION_OWNER,
        "day": day,
        "projection_day": None,
        "projection_behind_days": None,
        "plan_day": plan_day,
        "day_source": "anchor-rule" if anchor.get("state") == "MEASURED" else "calendar",
        "day_disagreement": plan_day != day,
        "planned_pct": round(sprint_cycle._planned_pct(day), 1),  # noqa: SLF001
        "day_anchor": anchor,
        "freshness": "UNMEASURED",
        "stale_days": None,
        "measurement_contract": None,
        "baseline_epoch": None,
    }


def _progression(build_date: dt.date | None = None) -> dict:
    """Consume the estate's canonical progression through a public-safe allowlist.

    Args:
        build_date: UTC date of the build; defaults to today. Tests pin it.

    Returns:
        The `progression` block for roadmap-status.json. Never raises.
    """
    today = build_date or sprint_cycle.campaign_date()
    plan_day = sprint_cycle.sprint_day(today)
    anchor = _campaign_anchor(today)
    path = Path(os.environ.get(PROGRESSION_ENV) or PROGRESSION_DEFAULT)
    if not path.is_file():
        return _unmeasured_progression("PROGRESSION_FILE_ABSENT", plan_day, anchor)
    try:
        data = _read_estate_file(path)
    except Exception as exc:  # noqa: BLE001 - a corrupt projection must not fail the build
        return _unmeasured_progression(f"{type(exc).__name__}: {exc}"[:160], plan_day, anchor)

    summary = data.get("summary") if isinstance(data, dict) else None
    canonical_day = _int(data.get("sprint_day")) if isinstance(data, dict) else None
    current_date = _date(data.get("current_date")) if isinstance(data, dict) else None
    total_days = _int(data.get("total_days")) if isinstance(data, dict) else None
    generated_at = _public_str(data.get("generated_at")) if isinstance(data, dict) else None
    day_index_rule = _public_str(data.get("day_index_rule"), 400) if isinstance(data, dict) else None
    if (not isinstance(summary, dict) or canonical_day is None or current_date is None
            or total_days is None or generated_at is None or day_index_rule is None
            or not isinstance(data.get("campaign_id"), str)):
        return _unmeasured_progression("PROGRESSION_SCHEMA_MISMATCH", plan_day, anchor)
    measured_pct = _num(summary.get("verified_to_date_percent"))
    calendar_pct = _num(summary.get("schedule_elapsed_percent"))
    full_pct = _num(summary.get("full_campaign_percent"))
    if measured_pct is None or calendar_pct is None or full_pct is None:
        return _unmeasured_progression("PROGRESSION_SCHEMA_MISMATCH", plan_day, anchor)

    source_state = data.get("state") if data.get("state") in ("MEASURED", "DEGRADED", "UNMEASURED") else "UNMEASURED"
    fresh = current_date == today
    stale_days = (today - current_date).days
    # The day is counted from the operator anchor at build time (the browser
    # recounts it live); the projection's own day is reported beside it so a
    # stale file is visible as "computed for day X, N days behind".
    day = _anchor_day(anchor, plan_day)
    day_source = "anchor-rule" if anchor.get("state") == "MEASURED" else "calendar"
    target_day = day
    next_hard = data.get("next_hard_milestone") if isinstance(data.get("next_hard_milestone"), dict) else {}
    focus = data.get("current_focus") if isinstance(data.get("current_focus"), dict) else {}
    source = data.get("source") if isinstance(data.get("source"), dict) else {}
    rule = _public_str(data.get("rule"), 400)
    return {
        "state": "MEASURED" if source_state in ("MEASURED", "DEGRADED") else "UNMEASURED",
        "reason": None if source_state in ("MEASURED", "DEGRADED") else "NO_MEASUREMENT",
        "source_state": source_state,
        "owner": PROGRESSION_OWNER,
        "campaign_id": _public_str(data["campaign_id"]),
        "day": day,
        "projection_day": canonical_day,
        "projection_behind_days": day - canonical_day,
        "total_days": total_days,
        "current_date": current_date.isoformat(),
        "generated_at": generated_at,
        "calendar_pct": calendar_pct,
        "measured_pct": measured_pct,
        "full_pct": full_pct,
        "pace": _public_str(summary.get("pace_state")),
        "criteria_to_date": _num(summary.get("criteria_to_date")),
        "criteria_total": _num(summary.get("criteria_total")),
        "verified_to_date": _num(summary.get("verified_to_date")),
        "verified_total": _num(summary.get("verified_total")),
        "due_holds": _int(summary.get("due_holds")),
        "next_hard_milestone": {
            "title": _public_str(next_hard.get("title")),
            "date": _public_str(next_hard.get("date")),
            "days_until": _int(next_hard.get("days_until")),
            "past": bool(next_hard.get("past")) if "past" in next_hard else None,
        } if next_hard else None,
        "current_focus": {
            "day": _int(focus.get("day")),
            "title": _public_str(focus.get("title")),
            "state": _public_str(focus.get("state")),
        } if focus else None,
        "day_index_rule": day_index_rule,
        "window_start": _public_str(source.get("strategy_window_start")),
        "window_end": _public_str(source.get("strategy_window_end")),
        "source_title": _public_str(source.get("title")),
        "planned_pct": round(sprint_cycle._planned_pct(target_day), 1),  # noqa: SLF001
        "plan_day": plan_day,
        "day_source": day_source,
        "day_disagreement": day != plan_day,
        "day_anchor": anchor,
        "freshness": "FRESH" if fresh else "STALE",
        "stale_days": 0 if fresh else stale_days,
        "measurement_contract": _measurement_contract(rule, day_index_rule),
        "baseline_epoch": generated_at,
    }


def build_report(build_date: dt.date | None = None) -> dict:
    """Assemble roadmap-status.json without writing it."""
    today = build_date or sprint_cycle.campaign_date()
    sprint_day = sprint_cycle.sprint_day(today)  # plan clock, clamped to [1, SPRINT_DAYS]
    state = sprint_cycle._load_state()  # noqa: SLF001 - intentional reuse, this IS the interface
    plan_verified = round(sprint_cycle._actual_pct(state), 1)  # noqa: SLF001

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "state": "MEASURED",
        "campaign_id": sprint_cycle.CAMPAIGN_ID,
        "sprint_day": sprint_day,
        "plan_day": sprint_day,
        "sprint_days": sprint_cycle.SPRINT_DAYS,
        "planned_pct": round(sprint_cycle._planned_pct(sprint_day), 1),  # noqa: SLF001
        # Milestone evidence against the plan. `actual_pct` is kept for older
        # readers (discord bot); it is the same number, never measured progression.
        "verified_pct": plan_verified,
        "actual_pct": plan_verified,
        "milestone_state_source": state["source"],
        "milestones": state["milestones"],
        "recent_commits": _recent_commits(),
        **_last_gate_and_deploy(),
        **_signals(),
        "progression": _progression(today),
    }


def main() -> int:
    report = build_report()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k not in ("milestones", "signals")}, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
