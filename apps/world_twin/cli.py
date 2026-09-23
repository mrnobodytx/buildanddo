# ─── CGRF Header ──────────────────────────────
# File:        apps/world_twin/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WORLD-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/events.py, apps/world_twin/twin.py, apps/world_twin/projection.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/world_twin/events.py; DEPENDS_ON apps/world_twin/twin.py; DEPENDS_ON apps/world_twin/projection.py
# DAG Node:    none
# Intent:      Record events and disputes and print twins, projections and world state from the command line.
# ─────────────────────────────────────────────────────────────

"""Command-line entry point for the personal world twin."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError
from apps.career.ledger import read_chain
from apps.world_twin.events import record_event
from apps.world_twin.projection import SECTIONS, project, world_state
from apps.world_twin.twin import record_dispute, record_resolution


def main(argv: list[str] | None = None) -> int:
    """Run the CLI; print JSON; return 1 on malformed input."""
    parser = argparse.ArgumentParser(prog="python -m apps.world_twin")
    parser.add_argument("--ledger", required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("record").add_argument("event", help="event JSON file")
    view = sub.add_parser("twin")
    view.add_argument("subject")
    view.add_argument("--audience", default="private")
    view.add_argument("--share", nargs="*", default=[], choices=SECTIONS)
    view.add_argument("--minor", action="store_true")
    contest = sub.add_parser("dispute")
    for name in ("subject", "inference", "reason", "at"):
        contest.add_argument(f"--{name}", required=True)
    settle = sub.add_parser("resolve")
    for name in ("subject", "inference", "by", "decision", "note", "at"):
        settle.add_argument(f"--{name}", required=True)
    sub.add_parser("world")
    args = parser.parse_args(argv)
    ledger = Path(args.ledger)
    try:
        result: Any
        if args.command == "record":
            try:
                raw = json.loads(Path(args.event).read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise CareerError(f"cannot read {args.event}") from error
            result = record_event(ledger, raw)
        elif args.command == "twin":
            result = project(read_chain(ledger), args.subject, args.audience, shared=tuple(args.share),
                             minor=args.minor)
        elif args.command == "dispute":
            result = record_dispute(ledger, subject=args.subject, inference=args.inference,
                                    reason=args.reason, at=args.at)
        elif args.command == "resolve":
            result = record_resolution(ledger, subject=args.subject, inference=args.inference, by=args.by,
                                       decision=args.decision, note=args.note, at=args.at)
        else:
            result = world_state(read_chain(ledger))
    except CareerError as error:
        print(json.dumps({"state": "FAIL", "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0
