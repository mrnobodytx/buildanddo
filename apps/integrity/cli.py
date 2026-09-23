# ─── CGRF Header ──────────────────────────────
# File:        apps/integrity/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/integrity/contract.py, apps/integrity/verdict.py, apps/integrity/settlement.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/integrity/contract.py; DEPENDS_ON apps/integrity/verdict.py; DEPENDS_ON apps/integrity/settlement.py
# DAG Node:    none
# Intent:      Freeze contracts, adjudicate reports and settle verdicts from the command line.
# ─────────────────────────────────────────────────────────────

"""Command-line entry point for the integrity fabric."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError
from apps.integrity.contract import freeze
from apps.integrity.settlement import settle
from apps.integrity.verdict import adjudicate


def _json(path: str) -> Any:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise CareerError(f"cannot read {path}") from error


def main(argv: list[str] | None = None) -> int:
    """Run the CLI; exit 0 on PASS, 2 on any other verdict, 1 on malformed input."""
    parser = argparse.ArgumentParser(prog="python -m apps.integrity")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("freeze").add_argument("contract")
    judge = sub.add_parser("adjudicate")
    for name in ("contract", "evidence", "reports"):
        judge.add_argument(f"--{name}", required=True)
    judge.add_argument("--claimed-success", action="store_true")
    args = parser.parse_args(argv)
    try:
        contract = freeze(_json(args.contract))
        if args.command == "freeze":
            print(json.dumps(contract, indent=2))
            return 0
        verdict = adjudicate(contract, _json(args.evidence), _json(args.reports))
        result = {"verdict": verdict, "settlement": settle(verdict, claimed_success=args.claimed_success)}
    except CareerError as error:
        print(json.dumps({"state": "FAIL", "error": str(error)}), file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2))
    return 0 if verdict["final"] == "PASS" else 2
