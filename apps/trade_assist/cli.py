# ─── CGRF Header ──────────────────────────────
# File:        apps/trade_assist/cli.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/trade_assist/intake.py, apps/trade_assist/package.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/trade_assist/package.py
# DAG Node:    none
# Intent:      Draft, batch and re-verify trade-site packages from local JSON files.
# ─────────────────────────────────────────────────────────────

"""Command line for the guildmaster content assist.

    python -m apps.trade_assist draft  --source walkin --input intake.json --output out/
    python -m apps.trade_assist batch  --source tradebuilder --input records/ --output out/
    python -m apps.trade_assist verify --package out/tap-....json

Inputs are local files only. Exit status is 0 when every package is ready for review,
1 when any package is blocked by findings, and 2 on bad input.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from apps.trade_assist.intake import IntakeError, SOURCES, normalize
from apps.trade_assist.package import build_package, deliver, digest

MAX_INPUT = 2 * 1024 * 1024


def _read(path: Path) -> Any:
    with path.open("rb") as stream:
        content = stream.read(MAX_INPUT + 1)
    if len(content) > MAX_INPUT:
        raise IntakeError(f"{path.name} exceeds 2 MiB")
    try:
        return json.loads(content.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise IntakeError(f"{path.name} is not valid JSON") from error


def _records(path: Path) -> list[tuple[str, dict[str, Any]]]:
    data = _read(path)
    if isinstance(data, list):
        return [(f"{path.name}[{index}]", item) for index, item in enumerate(data)]
    return [(path.name, data)]


def _write(output: Path, package: dict[str, Any]) -> Path:
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"{package['package_id']}.json"
    target.write_text(json.dumps(package, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    return target


def _summary(label: str, package: dict[str, Any], written: Path | None) -> dict[str, Any]:
    return {
        "input": label,
        "package_id": package["package_id"],
        "status": package["status"],
        "findings": len(package["findings"]),
        "gaps": package["gaps"],
        "dry_run": deliver(package),
        "file": str(written) if written else None,
    }


def _draft(paths: list[Path], source: str, output: Path | None) -> tuple[int, list[dict[str, Any]]]:
    results: list[dict[str, Any]] = []
    blocked = False
    for path in paths:
        for label, raw in _records(path):
            package = build_package(normalize(raw, source))
            written = _write(output, package) if output else None
            results.append(_summary(label, package, written))
            blocked = blocked or package["status"] == "blocked"
    return (1 if blocked else 0), results


def _verify(path: Path) -> tuple[int, dict[str, Any]]:
    package = _read(path)
    if not isinstance(package, dict) or "content" not in package or "envelope" not in package:
        raise IntakeError(f"{path.name} is not a trade assist package")
    intact = digest(package["content"]) == package["envelope"].get("content_digest")
    report = {
        "package_id": package.get("package_id"),
        "digest_intact": intact,
        "status": package.get("status"),
        "findings": len(package.get("findings", [])),
    }
    return (0 if intact and package.get("status") == "ready_for_review" else 1), report


def build_parser() -> argparse.ArgumentParser:
    """Argument parser for the three commands."""
    parser = argparse.ArgumentParser(prog="python -m apps.trade_assist")
    commands = parser.add_subparsers(dest="command", required=True)
    draft = commands.add_parser("draft", help="draft one input file (an object or a list of objects)")
    draft.add_argument("--source", choices=SOURCES, required=True)
    draft.add_argument("--input", required=True)
    draft.add_argument("--output")
    batch = commands.add_parser("batch", help="draft every *.json file in a directory")
    batch.add_argument("--source", choices=SOURCES, required=True)
    batch.add_argument("--input", required=True)
    batch.add_argument("--output")
    check = commands.add_parser("verify", help="re-check a written package's digest and status")
    check.add_argument("--package", required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    """Run a command and print a JSON report."""
    args = build_parser().parse_args(argv)
    try:
        if args.command == "verify":
            code, report = _verify(Path(args.package))
            print(json.dumps(report, indent=2, sort_keys=True))
            return code
        source_path = Path(args.input)
        if args.command == "batch":
            if not source_path.is_dir():
                raise IntakeError("batch --input must be a directory")
            paths = sorted(source_path.glob("*.json"))
        else:
            paths = [source_path]
        code, results = _draft(paths, args.source, Path(args.output) if args.output else None)
        print(json.dumps({"packages": results}, indent=2, sort_keys=True))
        return code
    except (IntakeError, OSError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        return 2
