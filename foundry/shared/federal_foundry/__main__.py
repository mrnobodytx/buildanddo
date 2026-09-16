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
# Depends:     foundry/shared/federal_foundry/portfolio.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/portfolio.py
# DAG Node:    foundry.cli
# Intent:      Provide a local command for compiling one lane or the complete review portfolio.
# ───────────────────────────────────────────────────────────────

"""Compile federal foundry review bundles from the command line."""

from __future__ import annotations

from argparse import ArgumentParser
from pathlib import Path
import json

from .models import FoundryValidationError
from .portfolio import PortfolioCompiler


def main() -> int:
    """Compile requested foundry artifacts into a new output directory."""

    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--lane")
    arguments = parser.parse_args()
    compiler = PortfolioCompiler(arguments.root)
    try:
        if arguments.lane:
            result = compiler.compile_lane(arguments.lane, arguments.output)
        else:
            result = compiler.compile_portfolio(arguments.output)
    except FoundryValidationError as error:
        parser.exit(2, f"foundry validation failed: {error}\n")
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
