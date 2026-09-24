# ─── CGRF Header ──────────────────────────────
# File:        apps/knowledge_units/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-KNOWLEDGE-UNIT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/knowledge_units/units.py, apps/knowledge_units/receipt.py, apps/knowledge_units/mastery.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/knowledge_units/units.py; DEPENDS_ON apps/knowledge_units/receipt.py; DEPENDS_ON apps/knowledge_units/mastery.py
# DAG Node:    none
# Intent:      Check units, print receipts and record or report learner evidence from the command line.
# ─────────────────────────────────────────────────────────────

"""Command-line entry point for Knowledge Units."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError
from apps.knowledge_units.mastery import mastery, record_assessment, record_transfer
from apps.knowledge_units.receipt import compile_receipt
from apps.knowledge_units.units import check_succession, validate_unit


def _unit(path: str) -> dict[str, Any]:
    try:
        return validate_unit(json.loads(Path(path).read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError) as error:
        raise CareerError(f"cannot read unit {path}") from error


def main(argv: list[str] | None = None) -> int:
    """Run the CLI; print JSON; return 0, or 1 on a contract failure."""
    parser = argparse.ArgumentParser(prog="python -m apps.knowledge_units")
    sub = parser.add_subparsers(dest="command", required=True)
    check = sub.add_parser("check", help="validate a unit, optionally against its previous version")
    check.add_argument("unit")
    check.add_argument("--previous")
    receipt = sub.add_parser("receipt", help="print the knowledge receipt")
    receipt.add_argument("unit")
    receipt.add_argument("--ledger")
    receipt.add_argument("--today")
    record = sub.add_parser("record", help="append learner evidence to a ledger")
    record.add_argument("kind", choices=["assessment", "transfer"])
    record.add_argument("unit")
    record.add_argument("--ledger", required=True)
    record.add_argument("--learner", required=True)
    record.add_argument("--at", required=True)
    record.add_argument("--level", choices=["recall", "explain"])
    record.add_argument("--passed", action="store_true")
    record.add_argument("--reviewer")
    record.add_argument("--meets-rubric", action="store_true")
    args = parser.parse_args(argv)
    try:
        unit = _unit(args.unit)
        if args.command == "check":
            if args.previous:
                check_succession(_unit(args.previous), unit)
            result: dict[str, Any] = {"state": "PASS", "unit_id": unit["unit_id"], "version": unit["version"]}
        elif args.command == "receipt":
            today = date.fromisoformat(args.today) if args.today else date.today()
            result = compile_receipt(unit, today, mastery(Path(args.ledger), unit) if args.ledger else None)
        elif args.kind == "assessment":
            if not args.level:
                raise CareerError("--level is required for an assessment")
            result = record_assessment(Path(args.ledger), unit, learner=args.learner, level=args.level,
                                       passed=args.passed, at=args.at)
        else:
            if not args.reviewer:
                raise CareerError("--reviewer is required for a transfer review")
            result = record_transfer(Path(args.ledger), unit, learner=args.learner, reviewer=args.reviewer,
                                     meets_rubric=args.meets_rubric, at=args.at)
    except (CareerError, ValueError) as error:
        print(json.dumps({"state": "FAIL", "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0
