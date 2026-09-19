# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/federal_foundry/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/federal_foundry/compiler.py, apps/federal_foundry/evidence.py, apps/federal_foundry/protocol.py, apps/federal_foundry/operator.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/federal_foundry/compiler.py; DEPENDS_ON apps/federal_foundry/evidence.py; DEPENDS_ON apps/federal_foundry/protocol.py; DEPENDS_ON apps/federal_foundry/operator.py
# DAG Node:    none
# Intent:      Expose offline portfolio compilation and evidence verification to any authorized Bits or model runtime.
# ───────────────────────────────────────────────────────────────

"""Prepare Bits lane packets and evaluate evidence without choosing a model."""

from __future__ import annotations

import argparse
from pathlib import Path

from apps.research.contracts import ResearchError
from apps.mission_suite.engine import decode
from apps.federal_foundry.catalog import load_catalog, require
from apps.federal_foundry.compiler import compile_portfolio, json_text
from apps.federal_foundry.evidence import compare, evaluate
from apps.federal_foundry.protocol import make_task


def read_json(path: Path) -> dict[str, object]:
    """Read an explicitly supplied bounded JSON document."""
    require(
        path.is_file() and not path.is_symlink()
        and not any(parent.is_symlink() for parent in path.parents)
        and path.stat().st_size <= 300000,
        "invalid_input_file",
    )
    return decode(path.read_text(encoding="utf-8"))


def main(argv: list[str] | None = None) -> int:
    """Execute local compilation, task export or receipt verification."""
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser(
        "catalog", help="Print the five registered opportunity specifications."
    )
    task = commands.add_parser(
        "task", help="Print a prepared model-independent Bits task."
    )
    task.add_argument("lane")
    task.add_argument("--role", choices=("builder", "verifier"), default="builder")
    compiler = commands.add_parser(
        "compile", help="Create a new directory with packets and proposal drafts."
    )
    compiler.add_argument("--output", required=True, type=Path)
    compiler.add_argument("--manifest", action="append", type=Path, default=[])
    compiler.add_argument("--evidence-root", type=Path)
    compiler.add_argument(
        "--at", help="Use a fixed UTC evaluation time for reproducible projections."
    )
    operator = commands.add_parser(
        "operator", help="Compile an A0 operator proposal from discovered source and optional blueprint data."
    )
    operator.add_argument("--output", required=True, type=Path)
    operator.add_argument("--blueprint", type=Path)
    operator.add_argument("--problem")
    operator.add_argument("--at", help="Use an explicit UTC compilation time.")
    evaluation = commands.add_parser(
        "evaluate", help="Verify exact public receipt bytes and declared review."
    )
    evaluation.add_argument("manifest", type=Path)
    evaluation.add_argument("--evidence-root", required=True, type=Path)
    evaluation.add_argument("--require-supported", action="store_true")
    comparison = commands.add_parser(
        "compare", help="Rank reviewed candidates under matched experiment conditions."
    )
    comparison.add_argument("manifest", type=Path)
    comparison.add_argument("--evidence-root", required=True, type=Path)
    comparison.add_argument("--metric", required=True)
    comparison.add_argument("--candidate", action="append")
    args = parser.parse_args(argv)
    try:
        catalog = load_catalog()
        if args.command == "catalog":
            result = catalog
        elif args.command == "task":
            result = make_task(catalog, args.lane, args.role)
        elif args.command == "compile":
            result = compile_portfolio(
                catalog,
                args.output,
                manifests=[read_json(path) for path in args.manifest],
                evidence_root=args.evidence_root,
                evaluated_at=args.at,
            )
        elif args.command == "operator":
            from apps.federal_foundry.operator import compile_operator

            result = compile_operator(
                catalog,
                args.output,
                blueprint=read_json(args.blueprint) if args.blueprint else None,
                problem=args.problem,
                evaluated_at=args.at,
            )
        elif args.command == "evaluate":
            result = evaluate(catalog, read_json(args.manifest), args.evidence_root)
            if args.require_supported and not result["fully_supported_candidates"]:
                print(json_text(result), end="")
                return 1
        else:
            result = compare(
                catalog,
                read_json(args.manifest),
                args.evidence_root,
                args.metric,
                args.candidate,
            )
            if result["state"] != "COMPARABLE_FOR_REVIEW":
                print(json_text(result), end="")
                return 1
        print(json_text(result), end="")
        return 0
    except (ResearchError, OSError, ValueError, RecursionError) as error:
        reason = (
            error.reason
            if isinstance(error, ResearchError)
            else "input_or_output_unavailable"
        )
        print(json_text({"state": "ERROR", "reason": reason}), end="")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
