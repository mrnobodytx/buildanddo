#!/usr/bin/env python3
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/sprint_cycle.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     none
# EnumType:    Service
# EnumEdges:   PRODUCES sprint milestone state;
#              CONSUMES state/roadmap/sprint.json
# Intent:      Hold the 21-day sprint plan and its verified state in one place,
#              so the projection, the public page and the README cannot drift.
# ───────────────────────────────────────────────────────────────
"""Canonical sprint state for the 21-day campaign.

This module is the single source of truth for three things that used to be
copied into a JSX array, a deploy script and a README:

  * the milestone plan (day, title, planned cumulative percentage),
  * the rule for reading actual progress, and
  * where verified state is stored.

The actual-percentage rule is deliberately hard to game. A milestone only
contributes to `_actual_pct` when its status is exactly ``verified`` *and* it
carries a non-empty ``evidence`` reference. There is no free-text progress
number anywhere in this module, so "we are 60% done" cannot be asserted - it
has to be earned one milestone at a time.

Standard library only, matching the rest of scripts/ci/.
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CAMPAIGN_ID = "citadel-21-day-2026-09"
SPRINT_START = dt.date(2026, 9, 9)
SPRINT_DAYS = 21

STATE_PATH = ROOT / "state" / "roadmap" / "sprint.json"

VERIFIED = "verified"
PLANNED = "planned"

# The plan. `planned_value` is cumulative percent-of-sprint complete at that
# day, which is what the public chart draws as its plan curve. Status here is
# always the default; real status comes from the state file (see _load_state).
MILESTONES: list[dict] = [
    {"day": 1, "title": "Sprint kickoff - foundations", "planned_value": 5},
    {"day": 3, "title": "Auth and onboarding hardening", "planned_value": 12},
    {"day": 5, "title": "Workspace collections live", "planned_value": 20},
    {"day": 7, "title": "Signals pipeline MVP", "planned_value": 30},
    {"day": 9, "title": "Missions - bounded-action engine", "planned_value": 40},
    {"day": 11, "title": "Workflows editor", "planned_value": 50},
    {"day": 13, "title": "Service connectors (Firecrawl, n8n)", "planned_value": 60},
    {"day": 15, "title": "ERP foundation", "planned_value": 70},
    {"day": 17, "title": "Evidence ledger and verification", "planned_value": 80},
    {"day": 19, "title": "Daily edition and specialist desks", "planned_value": 88},
    {"day": 21, "title": "Sprint review - verified replay", "planned_value": 100},
]


def _default_milestones() -> list[dict]:
    """Return the plan with every milestone in its unverified default state.

    Returns:
        A fresh list of milestone dicts; callers may mutate it safely.
    """
    return [
        {
            "day": m["day"],
            "title": m["title"],
            "planned_value": m["planned_value"],
            "status": PLANNED,
            "evidence": "",
            "verified_at": None,
        }
        for m in MILESTONES
    ]


def _merge_state(stored: object) -> list[dict]:
    """Overlay stored milestone state onto the plan.

    The plan is authoritative for which milestones exist and what they are
    worth; the state file may only say whether one has been verified and with
    what evidence. A state entry for an unknown day is ignored rather than
    silently inventing a twelfth milestone.

    Args:
        stored: Whatever the state file held under ``milestones``.

    Returns:
        The merged milestone list.
    """
    merged = _default_milestones()
    if not isinstance(stored, list):
        return merged
    by_day = {m["day"]: m for m in merged}
    for entry in stored:
        if not isinstance(entry, dict):
            continue
        target = by_day.get(entry.get("day"))
        if target is None:
            continue
        status = entry.get("status")
        if isinstance(status, str) and status:
            target["status"] = status
        evidence = entry.get("evidence")
        if isinstance(evidence, str):
            target["evidence"] = evidence
        verified_at = entry.get("verified_at")
        if isinstance(verified_at, str):
            target["verified_at"] = verified_at
    return merged


def _load_state() -> dict:
    """Read sprint state from disk, falling back to the unverified plan.

    A missing or unreadable state file is not an error: it means nothing has
    been verified yet, which is the honest default for a fresh checkout.

    Returns:
        A dict with ``campaign_id``, ``sprint_start``, ``sprint_days``,
        ``milestones`` and ``source`` (``state_file`` or ``defaults``).
    """
    raw: dict = {}
    source = "defaults"
    if STATE_PATH.is_file():
        try:
            parsed = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            if isinstance(parsed, dict):
                raw = parsed
                source = "state_file"
        except (OSError, ValueError):
            source = "defaults"
    return {
        "campaign_id": raw.get("campaign_id") or CAMPAIGN_ID,
        "sprint_start": SPRINT_START.isoformat(),
        "sprint_days": SPRINT_DAYS,
        "milestones": _merge_state(raw.get("milestones")),
        "source": source,
    }


def _is_verified(milestone: dict) -> bool:
    """Report whether a milestone counts towards actual progress.

    Args:
        milestone: One merged milestone dict.

    Returns:
        True only when the milestone is verified and names its evidence.
    """
    return milestone.get("status") == VERIFIED and bool(str(milestone.get("evidence") or "").strip())


def _planned_pct(sprint_day: int) -> float:
    """Interpolate the planned cumulative percentage for a sprint day.

    Days before the first milestone read 0; days after the last read its
    value. Between milestones the plan is a straight line, because the plan is
    a plan and drawing variance into it would imply measurement.

    Args:
        sprint_day: 1-based day within the sprint.

    Returns:
        Planned cumulative completion percentage.
    """
    day = max(1, min(int(sprint_day), SPRINT_DAYS))
    first, last = MILESTONES[0], MILESTONES[-1]
    if day <= first["day"]:
        return float(first["planned_value"]) * (day / first["day"]) if first["day"] else 0.0
    if day >= last["day"]:
        return float(last["planned_value"])
    for previous, following in zip(MILESTONES, MILESTONES[1:]):
        if previous["day"] <= day <= following["day"]:
            span = following["day"] - previous["day"]
            if span == 0:
                return float(previous["planned_value"])
            step = (following["planned_value"] - previous["planned_value"]) / span
            return float(previous["planned_value"] + step * (day - previous["day"]))
    return float(last["planned_value"])


def _actual_pct(state: dict) -> float:
    """Compute actual completion from verified milestones only.

    The contribution of a milestone is the increment it adds to the plan
    curve, so the verified total is directly comparable with `_planned_pct`.
    Nothing else can raise this number.

    Args:
        state: A state dict as returned by `_load_state`.

    Returns:
        Actual completion percentage, 0.0 when nothing is verified.
    """
    milestones = state.get("milestones") or []
    by_day = {m.get("day"): m for m in milestones if isinstance(m, dict)}
    total = 0.0
    previous_value = 0.0
    for planned in MILESTONES:
        increment = planned["planned_value"] - previous_value
        previous_value = planned["planned_value"]
        milestone = by_day.get(planned["day"])
        if milestone and _is_verified(milestone):
            total += increment
    return round(total, 1)


def sprint_day(today: dt.date | None = None) -> int:
    """Return the 1-based sprint day, clamped to the sprint window.

    Args:
        today: Date to measure from; defaults to the current UTC date.

    Returns:
        A day between 1 and SPRINT_DAYS inclusive.
    """
    day = today or dt.datetime.now(dt.timezone.utc).date()
    return max(1, min((day - SPRINT_START).days + 1, SPRINT_DAYS))


def main() -> int:
    """Print the current sprint projection as JSON.

    Returns:
        Process exit code.
    """
    state = _load_state()
    day = sprint_day()
    print(
        json.dumps(
            {
                "campaign_id": CAMPAIGN_ID,
                "sprint_start": SPRINT_START.isoformat(),
                "sprint_day": day,
                "planned_pct": round(_planned_pct(day), 1),
                "actual_pct": _actual_pct(state),
                "verified_milestones": sum(1 for m in state["milestones"] if _is_verified(m)),
                "total_milestones": len(MILESTONES),
                "state_source": state["source"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
