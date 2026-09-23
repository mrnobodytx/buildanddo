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
# Depends:     apps/federal_foundry/compiler.py, apps/federal_foundry/evidence.py, apps/federal_foundry/protocol.py, apps/federal_foundry/operator.py, apps/decision/packages.py, apps/federal_foundry/sprint.py, apps/federal_foundry/episodes.py, apps/federal_foundry/polynomial.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/federal_foundry/compiler.py; DEPENDS_ON apps/federal_foundry/evidence.py; DEPENDS_ON apps/federal_foundry/protocol.py; DEPENDS_ON apps/federal_foundry/operator.py; CONSUMES apps/decision/packages.py; CONSUMES apps/federal_foundry/sprint.py; CONSUMES apps/federal_foundry/episodes.py; CONSUMES apps/federal_foundry/polynomial.py
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


def read_json(path: Path, *, max_bytes: int = 300000) -> dict[str, object]:
    """Read an explicitly supplied bounded JSON document."""
    require(
        path.is_file()
        and not path.is_symlink()
        and not any(parent.is_symlink() for parent in path.parents)
        and path.stat().st_size <= max_bytes,
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
        "operator",
        help="Compile an A0 operator proposal from discovered source and optional blueprint data.",
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
    sprint = commands.add_parser(
        "sprint",
        help="Compile local decision demos, market controls and separate proposal skeletons.",
    )
    sprint.add_argument("--output", type=Path, required=True)
    sprint.add_argument("--at", help="Explicit UTC time for a reproducible export.")
    sprint_verify = commands.add_parser(
        "verify-sprint", help="Replay and verify an exact local research export."
    )
    sprint_verify.add_argument("directory", type=Path)
    commands.add_parser(
        "fherma-doctor",
        help="Report GPU and official-interface prerequisites without contacting providers.",
    )
    decision = commands.add_parser(
        "decision-package",
        help="Evaluate a supplied strict decision input; no action or approval is granted.",
    )
    decision.add_argument("input", type=Path)
    decision.add_argument("--at", required=True)
    decision_refresh = commands.add_parser(
        "decision-refresh",
        help="Retain and compare both versions after changed evidence.",
    )
    decision_refresh.add_argument("previous", type=Path)
    decision_refresh.add_argument("input", type=Path)
    decision_refresh.add_argument("--at", required=True)
    market_replay = commands.add_parser(
        "market-replay", help="Recompute a retained black-box action episode."
    )
    market_replay.add_argument("receipt", type=Path)
    polynomial = commands.add_parser(
        "polynomial-check",
        help="Check every candidate coefficient under an explicitly selected ring.",
    )
    polynomial.add_argument("input", type=Path)
    gate = commands.add_parser(
        "fherma-gate",
        help="Apply internal continuation thresholds to supplied timing samples.",
    )
    gate.add_argument("--leader-us", required=True, type=float)
    gate.add_argument("--sample-us", action="append", required=True, type=float)
    args = parser.parse_args(argv)
    try:
        catalog = load_catalog()
        if args.command == "sprint":
            from apps.federal_foundry.sprint import compile_sprint

            result = compile_sprint(args.output, at=args.at)
        elif args.command == "verify-sprint":
            from apps.federal_foundry.sprint import verify_sprint

            result = verify_sprint(args.directory)
        elif args.command == "fherma-doctor":
            from apps.federal_foundry.polynomial import doctor

            result = doctor()
            print(json_text(result), end="")
            return 1 if result["state"] == "BLOCKED" else 0
        elif args.command == "decision-package":
            from apps.decision.packages import evaluate as decision_evaluate

            result = decision_evaluate(read_json(args.input), at=args.at)
        elif args.command == "decision-refresh":
            from apps.decision.packages import refresh

            result = refresh(
                read_json(args.previous), read_json(args.input), at=args.at
            )
        elif args.command == "market-replay":
            from apps.federal_foundry.episodes import replay

            result = replay(read_json(args.receipt, max_bytes=16000000))
        elif args.command == "polynomial-check":
            from typing import cast
            from apps.federal_foundry.polynomial import check_candidate
            from apps.mission_suite.engine import obj

            data = read_json(args.input, max_bytes=100000000)
            obj(data, {"left", "right", "candidate", "width", "modulus"})
            result = check_candidate(
                cast(list[int], data["left"]),
                cast(list[int], data["right"]),
                cast(list[int], data["candidate"]),
                width=cast(int, data["width"]),
                modulus=cast(int | None, data["modulus"]),
            )
            if result["state"] != "PASS":
                print(json_text(result), end="")
                return 1
        elif args.command == "fherma-gate":
            from apps.federal_foundry.polynomial import continuation_gate

            result = continuation_gate(args.sample_us, leader_us=args.leader_us)
        elif args.command == "catalog":
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
