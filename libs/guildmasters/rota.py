# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/guildmasters/rota.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     libs/guildmasters/__init__.py, apps/pocketbase/pb_hooks/guild-rota.js
# EnumType:    Model
# EnumEdges:   MIRRORS apps/pocketbase/pb_hooks/guild-rota.js; DEPENDS_ON libs/guildmasters/__init__.py; CONSUMED_BY libs/guildmasters/__main__.py; VERIFIED_BY tests/upgrade/guild-rota.test.mjs; VERIFIED_BY tests/upgrade/test_guild_rota.py
# DAG Node:    none
# Intent:      Give scripts the same weekly guild class rota, field for field, as the server cron.
# ───────────────────────────────────────────────────────────────

"""The weekly guild class rota, mirrored from ``apps/pocketbase/pb_hooks/guild-rota.js``.

Each ISO week (Monday 00:00 UTC) has eight classes. In week ``w``, slot ``s`` is hosted by
``ORDER[(s + w) % 8]``; the auditor is ``ORDER[(s + w + k) % 8]`` with ``k = 1 + w % 7``; the
other seven attend, listed from the guildmaster after the host. Week 0 is 2026-W45.

Pure: no I/O, no environment, no clock. Every function takes the instant it answers for, so
``tests/upgrade/guild-rota.test.mjs`` can compare this module with the server's for any week.
Instants must be timezone-aware; a naive datetime is refused rather than guessed.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

from libs.guildmasters import GUILDMASTERS, ORDER

EPOCH_MONDAY = datetime(2026, 11, 2, tzinfo=timezone.utc)
# UTC hours after Monday 00:00: Monday to Thursday at 15:00 and 18:00.
SLOT_HOURS: tuple[int, ...] = (15, 18, 39, 42, 63, 66, 87, 90)
CLASS_MINUTES = 120
WEEK = timedelta(weeks=1)
# [0-9], not \d: \d also matches non-ASCII digits in Python.
_WEEK_LABEL = re.compile(r"([0-9]{4})-W([0-9]{2})")


def _utc(t: datetime) -> datetime:
    if not isinstance(t, datetime):
        raise TypeError("pass a timezone-aware datetime")
    if t.tzinfo is None or t.utcoffset() is None:
        raise ValueError("pass a timezone-aware datetime; naive times are ambiguous")
    return t.astimezone(timezone.utc)


def _iso(t: datetime) -> str:
    """The server's Date.toISOString() form: ``YYYY-MM-DDTHH:MM:SS.mmmZ``."""
    return t.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def monday_of(t: datetime) -> datetime:
    """Return Monday 00:00 UTC of the ISO week containing ``t``."""
    day = _utc(t).date()
    start = day - timedelta(days=day.weekday())
    return datetime(start.year, start.month, start.day, tzinfo=timezone.utc)


def week_label(t: datetime) -> str:
    """Return the ISO 8601 week label of ``t``, ``YYYY-Www``."""
    year, week, _ = monday_of(t).isocalendar()
    return f"{year:04d}-W{week:02d}"


def week_index(t: datetime) -> int:
    """Return whole weeks between EPOCH_MONDAY and the week of ``t``; negative before the epoch."""
    return (monday_of(t) - EPOCH_MONDAY) // WEEK


def parse_week(label: object) -> datetime:
    """Return Monday 00:00 UTC of an ISO week label.

    Strict: exactly ``YYYY-Www``, year 0001 to 9999, and a week that exists in that year
    (``2027-W53`` does not). Anything else raises ValueError.
    """
    match = _WEEK_LABEL.fullmatch(label) if isinstance(label, str) else None
    if not match:
        raise ValueError("choose a week as YYYY-Www")
    try:
        start = date.fromisocalendar(int(match.group(1)), int(match.group(2)), 1)
    except ValueError:
        raise ValueError("choose a week that exists in that year") from None
    return datetime(start.year, start.month, start.day, tzinfo=timezone.utc)


def _class(index: int, slot: int, monday: datetime) -> dict[str, object]:
    at = (slot + index) % 8
    host = GUILDMASTERS[at]
    auditor = GUILDMASTERS[(at + 1 + index % 7) % 8]
    return {
        "slot": slot,
        "host": host.seat,
        "persona": host.slug,
        "name": host.name,
        "guild": host.guild,
        "auditor": auditor.seat,
        "auditor_persona": auditor.slug,
        # Everyone but the host, starting after the host; the auditor is one of them.
        "attendees": [ORDER[(at + step) % 8] for step in range(1, 8)],
        "starts_at": _iso(monday + timedelta(hours=SLOT_HOURS[slot])),
    }


def week(t: datetime) -> dict[str, object]:
    """Return the rota of the ISO week containing ``t``: label, index, first instant, eight classes."""
    monday = monday_of(t)
    index = (monday - EPOCH_MONDAY) // WEEK
    return {
        "week": week_label(monday),
        "index": index,
        "starts_at": _iso(monday),
        "classes": [_class(index, slot, monday) for slot in range(len(SLOT_HOURS))],
    }


def current(t: datetime) -> dict[str, object]:
    """Return the class happening now or next, with its week label.

    The first class this week, else next week, with ``starts_at + CLASS_MINUTES > t``.
    """
    moment = _utc(t)
    for plan in (week(moment), week(monday_of(moment) + WEEK)):
        for item in plan["classes"]:  # type: ignore[union-attr]
            starts = datetime.fromisoformat(str(item["starts_at"]).replace("Z", "+00:00"))
            if starts + timedelta(minutes=CLASS_MINUTES) > moment:
                return {"week": plan["week"], **item}
    raise AssertionError("the rota has no class after this instant")  # unreachable


__all__ = [
    "CLASS_MINUTES",
    "EPOCH_MONDAY",
    "SLOT_HOURS",
    "WEEK",
    "current",
    "monday_of",
    "parse_week",
    "week",
    "week_index",
    "week_label",
]
