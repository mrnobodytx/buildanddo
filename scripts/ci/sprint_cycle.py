# CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        scripts/ci/sprint_cycle.py
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN, C-ONE (verify CLI, 2026-09-11 reframe; plan-clock split)
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     none
# EnumType:    Service
# EnumEdges:   PRODUCES sprint milestone state;
#              CONSUMES state/roadmap/sprint.json;
#              MIRRORED_BY apps/web/src/pages/RoadmapPage.jsx (PLANNED_MILESTONES)
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

Recording verification goes through this module too::

    py -3.13 scripts/ci/sprint_cycle.py verify --day 1 --evidence "commit d2d5f83; ..."

which writes state/roadmap/sprint.json in the one shape `_merge_state` reads.
The file is git-ignored (state/ is local operational state), so the projection
only shows a milestone as verified on the clone that recorded it - the ship
rail's clone. The evidence string is public: it is rendered on /roadmap.

One clock: the operator-declared sprint index
---------------------------------------------

The sprint day is the operator-declared index from the estate's campaign
config (``config/campaign_21_day_progression_v1.yaml``): day 8 is anchored to
2026-09-08 and the index increments by calendar day, so day N falls on
September N. ``SPRINT_START`` is DERIVED from that anchor (2026-09-01) and is
the same clock, not a second one. The strategy window (2026-09-03 onward,
also the first commit of this repository) is a window, not day 1.

Operator decision 2026-09-11: the public page showed D09 on the 11th because
it copied the day from a stale estate projection. The day is a calendar fact,
so it is now counted LIVE from the anchor at view time (apps/web/src/lib/
roadmapStatus.js ``liveSprintDay``) and never read from a file. Only the
MEASURED progression still comes from the continuity projection, and it stays
labelled STALE until that producer runs again.

The verified-milestone figure this module computes is published as
``plan_verified_pct`` - milestone evidence against the plan curve. It is never
the measured progression (verified acceptance criteria), which only the
continuity projection can report. PLAN != REALITY; the two are never averaged.

Standard library only, matching the rest of scripts/ci/.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

CAMPAIGN_ID = "citadel-21-day-2026-09"
# Operator-declared sprint index (config/campaign_21_day_progression_v1.yaml):
# day 8 is anchored to 2026-09-08, so day 1 is 2026-09-01 and day N is Sept N.
SPRINT_ANCHOR_DAY = 8
SPRINT_ANCHOR_DATE = dt.date(2026, 9, 8)
SPRINT_START = SPRINT_ANCHOR_DATE - dt.timedelta(days=SPRINT_ANCHOR_DAY - 1)  # 2026-09-01
# "increments by local calendar day": the operator's calendar, not UTC. Measured
# 2026-09-11: at 01:08Z on the 12th the operator's clock still said the 11th and
# a UTC count printed D12. The whole sprint sits inside CDT (UTC-5); if the
# zoneinfo database is unavailable that fixed offset stands in.
CAMPAIGN_TZ = "America/Chicago"
_CAMPAIGN_TZ_FALLBACK = dt.timezone(dt.timedelta(hours=-5), "CDT")


def _campaign_zone() -> dt.tzinfo:
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo(CAMPAIGN_TZ)
    except Exception:  # noqa: BLE001 - no tz database on this host
        return _CAMPAIGN_TZ_FALLBACK


def campaign_date(moment: dt.datetime | None = None) -> dt.date:
    """The operator's calendar date for ``moment`` (default: now), in CAMPAIGN_TZ."""
    m = moment or dt.datetime.now(dt.timezone.utc)
    if m.tzinfo is None:
        m = m.replace(tzinfo=dt.timezone.utc)
    return m.astimezone(_campaign_zone()).date()
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
    {"day": 13, "title": "Living Rooms and public-record bridges", "planned_value": 60},
    {"day": 15, "title": "Objectives, tasks and guild contacts", "planned_value": 70},
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

    Calendar days from ``SPRINT_START``, which is derived from the operator
    anchor (day 8 = 2026-09-08), so this IS the operator-declared index.

    Args:
        today: Date to measure from; defaults to today on the operator's
            calendar (``campaign_date``), never the UTC date.

    Returns:
        A day between 1 and SPRINT_DAYS inclusive.
    """
    day = today or campaign_date()
    return max(1, min((day - SPRINT_START).days + 1, SPRINT_DAYS))


def _projection(state: dict, day: int) -> dict:
    """Summarise the sprint as the JSON `main` prints.

    Args:
        state: A state dict as returned by `_load_state`.
        day: 1-based sprint day.

    Returns:
        The projection dict.
    """
    return {
        "campaign_id": CAMPAIGN_ID,
        "sprint_start": SPRINT_START.isoformat(),
        "sprint_day": day,
        "planned_pct": round(_planned_pct(day), 1),
        # Milestone evidence against the plan curve - never measured progression.
        "plan_verified_pct": _actual_pct(state),
        "verified_milestones": sum(1 for m in state["milestones"] if _is_verified(m)),
        "total_milestones": len(MILESTONES),
        "state_source": state["source"],
    }


def _record_verification(day: int, evidence: str, verified_at: str | None) -> dict:
    """Mark one planned milestone verified in the state file.

    Only a day that exists in `MILESTONES` can be recorded, and the evidence
    reference must be non-empty - the same two rules `_merge_state` and
    `_is_verified` apply on the way back out, enforced on the way in so a
    hollow entry is never written.

    Args:
        day: Sprint day of the milestone.
        evidence: Public evidence reference (commit shas, repo paths, receipt
            paths). Never a secret.
        verified_at: ISO-8601 timestamp; defaults to now (UTC).

    Returns:
        The full state dict that was written.

    Raises:
        ValueError: When the day is not in the plan or evidence is blank.
    """
    if day not in {m["day"] for m in MILESTONES}:
        raise ValueError(f"day {day} is not a planned milestone")
    reference = evidence.strip()
    if not reference:
        raise ValueError("evidence reference must not be empty")
    current = _load_state()
    stamp = verified_at or dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    for milestone in current["milestones"]:
        if milestone["day"] == day:
            milestone["status"] = VERIFIED
            milestone["evidence"] = reference
            milestone["verified_at"] = stamp
    payload = {
        "campaign_id": CAMPAIGN_ID,
        "sprint_start": current["sprint_start"],
        "sprint_days": SPRINT_DAYS,
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "milestones": [
            {k: m[k] for k in ("day", "status", "evidence", "verified_at")}
            for m in current["milestones"]
            if m["status"] != PLANNED or m["evidence"]
        ],
    }
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def main(argv: list[str] | None = None) -> int:
    """Print the sprint projection, or record a milestone verification.

    Args:
        argv: Command-line arguments; defaults to sys.argv.

    Returns:
        Process exit code.
    """
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("status", help="print the projection (default)")
    verify = sub.add_parser("verify", help="record one milestone as verified with evidence")
    verify.add_argument("--day", type=int, required=True, help="sprint day of the planned milestone")
    verify.add_argument("--evidence", required=True, help="public evidence reference (commits, paths, receipts)")
    verify.add_argument("--verified-at", default=None, help="ISO-8601 timestamp; default now UTC")
    args = parser.parse_args(argv)

    if args.command == "verify":
        try:
            written = _record_verification(args.day, args.evidence, args.verified_at)
        except ValueError as exc:
            print(f"FAIL: {exc}")
            return 2
        print(json.dumps({"written": str(STATE_PATH.relative_to(ROOT)), "day": args.day,
                          "verified_entries": sum(1 for m in written["milestones"] if m["status"] == VERIFIED)},
                         indent=2))

    state = _load_state()
    print(json.dumps(_projection(state, sprint_day()), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
