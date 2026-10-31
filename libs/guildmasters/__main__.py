# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/guildmasters/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     libs/guildmasters/__init__.py, libs/guildmasters/rota.py
# EnumType:    Tool
# EnumEdges:   CONSUMES libs/guildmasters/__init__.py; CONSUMES libs/guildmasters/rota.py; VERIFIED_BY tests/upgrade/test_guild_rota.py
# DAG Node:    none
# Intent:      Let scripts and operators read the guildmaster roster and weekly class rota without a server.
# ───────────────────────────────────────────────────────────────

"""``python -m libs.guildmasters list | week | current``: read-only, offline.

    list                                     the eight guildmasters in rota order
    week [--week YYYY-Www | --date YYYY-MM-DD]  one week's eight classes (default: this week)
    current [--at ISO-8601 with a zone]      the class happening now or next

``--json`` prints machine-readable output. Nothing here reads the environment, opens a socket
or writes a file; the only input besides the arguments is the clock, when no instant is given.
"""

from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import json
import re
import sys

from libs.guildmasters import as_json, by_seat
from libs.guildmasters import rota


def _date(value: str) -> datetime:
    # Exactly YYYY-MM-DD: date.fromisoformat alone also accepts compact and week-date forms.
    try:
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            raise ValueError(value)
        day = date.fromisoformat(value)
    except ValueError:
        raise argparse.ArgumentTypeError("use a date as YYYY-MM-DD") from None
    return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)


def _week(value: str) -> datetime:
    try:
        return rota.parse_week(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(str(error)) from None


def _instant(value: str) -> datetime:
    try:
        moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise argparse.ArgumentTypeError("use an ISO 8601 time with a zone, e.g. 2026-11-02T15:00:00Z") from None
    if moment.tzinfo is None:
        raise argparse.ArgumentTypeError("give the time a zone, e.g. 2026-11-02T15:00:00Z")
    return moment


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m libs.guildmasters", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    listing = commands.add_parser("list", help="the eight guildmasters in rota order")
    listing.add_argument("--json", action="store_true")
    weekly = commands.add_parser("week", help="one week's eight guild classes")
    which = weekly.add_mutually_exclusive_group()
    which.add_argument("--week", type=_week, metavar="YYYY-Www")
    which.add_argument("--date", type=_date, metavar="YYYY-MM-DD")
    weekly.add_argument("--json", action="store_true")
    now = commands.add_parser("current", help="the class happening now or next")
    now.add_argument("--at", type=_instant, metavar="ISO")
    now.add_argument("--json", action="store_true")
    return parser


def _line(item: dict[str, object]) -> str:
    auditor = by_seat(item["auditor"])
    return (
        f"{item['slot']}  {item['starts_at']}  {item['name']} hosts the {item['guild']} guild class; "
        f"{auditor.name if auditor else item['auditor']} audits"
    )


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.command == "list":
        result: object = as_json()
        text = "\n".join(f"{item['seat']:<9} {item['slug']:<15} {item['name']:<15} {item['guild']}" for item in as_json())
    elif args.command == "week":
        plan = rota.week(args.week or args.date or datetime.now(timezone.utc))
        result = plan
        text = "\n".join([f"{plan['week']} (week {plan['index']} of the rota, from {plan['starts_at']})",
                          *(_line(item) for item in plan["classes"])])  # type: ignore[union-attr]
    else:
        item = rota.current(args.at or datetime.now(timezone.utc))
        result = item
        text = f"{item['week']}  " + _line(item) + "; attending: " + ", ".join(item["attendees"])  # type: ignore[arg-type]
    print(json.dumps(result, indent=2) if args.json else text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
