# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/portfolio.py, foundry/shared/federal_foundry/benchmarks.py, foundry/shared/federal_foundry/execution.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/portfolio.py; DEPENDS_ON foundry/shared/federal_foundry/benchmarks.py; DEPENDS_ON foundry/shared/federal_foundry/execution.py
# DAG Node:    none
# Intent:      Operate the foundry through one local execution, replay, inspection and review-bundle interface.
# ───────────────────────────────────────────────────────────────

"""Run, replay, inspect and package federal foundry experiments locally."""

from __future__ import annotations

import asyncio
from argparse import ArgumentParser
import json
from pathlib import Path
import sys

from .benchmarks import load_plan, run_campaign, verify_campaign
from .execution import replay_run, verify_run
from .models import FoundryValidationError
from .portfolio import PortfolioCompiler, package_bundle, verify_bundle
from .registry import OpportunityRegistry
from .validation import mapping, read_json, records, strings


def main(argv: list[str] | None = None) -> int:
    """Execute a local foundry command and print its machine-readable outcome."""
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments and arguments[0].startswith("--") and "--output" in arguments:
        arguments.insert(0, "compile")
    parser = ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("run", "replay", "status", "verify", "compile"):
        command = commands.add_parser(name)
        command.add_argument("--root", type=Path, default=Path.cwd())
        if name in {"run", "replay", "compile"}:
            command.add_argument("--output", type=Path, required=True)
        if name in {"replay", "verify"}:
            command.add_argument("path", type=Path)
        if name in {"status", "compile"}:
            command.add_argument("--runs", type=Path)
        if name == "run":
            selection = command.add_mutually_exclusive_group()
            selection.add_argument("--lane", action="append")
            selection.add_argument("--all", action="store_true")
            command.add_argument("--jobs", type=int, default=4)
        if name == "compile":
            command.add_argument("--lane")
            command.add_argument("--archive", type=Path)
    args = parser.parse_args(arguments)
    try:
        root = args.root.resolve()
        result: dict[str, object]
        exit_code = 0
        if args.command == "run":
            campaign = asyncio.run(
                run_campaign(
                    root,
                    args.output,
                    lane_ids=tuple(args.lane) if args.lane else None,
                    jobs=args.jobs,
                )
            )
            result = {
                key: campaign[key]
                for key in (
                    "status",
                    "lanes",
                    "attempts",
                    "planned_attempts",
                    "concurrency",
                )
            }
            result["output"] = str(args.output)
            exit_code = 0 if campaign["status"] == "completed" else 1
        elif args.command == "replay":
            result = asyncio.run(replay_run(args.path, args.output, root))
            exit_code = 0 if result["state"] == "MATCH" else 1
        elif args.command == "verify":
            if (args.path / "campaign.json").is_file():
                document = verify_campaign(root, args.path)
            elif (args.path / "receipt.json").is_file():
                document = verify_run(args.path, root)
            else:
                document = verify_bundle(args.path)
            result = {
                "state": "MATCH",
                "schema_version": document["schema_version"],
                "path": str(args.path),
            }
        elif args.command == "status":
            registry = OpportunityRegistry(root / "foundry")
            measured = (
                strings(verify_campaign(root, args.runs)["lanes"]) if args.runs else ()
            )
            lanes: list[dict[str, object]] = []
            for lane_id in registry.lane_ids():
                plan = load_plan(root, lane_id)
                opportunity = registry.load(lane_id)
                summary = (
                    read_json(args.runs / lane_id, "summary.json")
                    if lane_id in measured
                    and (args.runs / lane_id / "summary.json").is_file()
                    else None
                )
                lanes.append(
                    {
                        "lane_id": lane_id,
                        "reference_campaign": summary["status"]
                        if summary
                        else "not_completed",
                        "planned_attempts": len(plan.candidates)
                        * len(plan.seeds)
                        * plan.repetitions,
                        "dataset": plan.document["dataset"],
                        "dataset_sha256": plan.document["dataset_sha256"],
                        "scope": plan.document["scope"],
                        "candidates": records(summary["candidates"]) if summary else [],
                        "requirements": len(opportunity.requirements),
                        "official_deadline": opportunity.deadline,
                        "unverified_eligibility": sum(
                            row["status"] != "eligible"
                            for row in opportunity.eligibility
                        ),
                        "submission_ready": False,
                    }
                )
            result = {"lanes": lanes, "authority": "local_reference_evidence_only"}
        else:
            compiler = PortfolioCompiler(root)
            bundle = (
                compiler.compile_lane(args.lane, args.output, runs=args.runs)
                if args.lane
                else compiler.compile_portfolio(args.output, runs=args.runs)
            )
            result = {
                "state": "compiled",
                "output": str(args.output),
                "view": str(args.output / "index.html"),
                "lane_id": args.lane,
                "artifacts": len(mapping(bundle["artifacts"])),
                "submission_approval": False,
            }
            if args.archive:
                result["archive"] = package_bundle(args.output, args.archive)
    except (FoundryValidationError, OSError) as error:
        parser.exit(2, f"foundry validation failed: {error}\n")
    except KeyboardInterrupt:
        parser.exit(
            130,
            "foundry interrupted; started campaign attempts remain in the output directory\n",
        )
    print(json.dumps(result, sort_keys=True))
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
