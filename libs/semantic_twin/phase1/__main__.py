# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/phase1/compiler.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/phase1/compiler.py; PRODUCES semantic-twin.phase1-complete/v1
# DAG Node:    semantic-twin.phase-1.cli
# Intent:      Provide a local-only CLI that writes the complete Phase 1 graph and proof bundle without provider or deployment actions.
# ───────────────────────────────────────────────────────

"""Write complete local Phase 1 semantic twin proof bundles."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from collections.abc import Sequence

from .compiler import Phase1Inputs, compile_phase1


def parser() -> argparse.ArgumentParser:
    """Build the local Phase 1 command-line parser."""

    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--repo", type=Path, default=Path.cwd())
    value.add_argument("--output", type=Path, required=True)
    value.add_argument(
        "--query", default="release production verification artifact DORA evidence"
    )
    value.add_argument("--gitlab-export", action="append", type=Path, default=[])
    value.add_argument("--datadog-export", action="append", type=Path, default=[])
    value.add_argument("--history-limit", type=int, default=100)
    return value


def main(argv: Sequence[str] | None = None) -> int:
    """Compile and write one deterministic local Phase 1 payload."""

    arguments = parser().parse_args(argv)
    compilation = compile_phase1(
        arguments.repo,
        inputs=Phase1Inputs(
            gitlab_exports=tuple(arguments.gitlab_export),
            datadog_exports=tuple(arguments.datadog_export),
            history_limit=arguments.history_limit,
        ),
        query=arguments.query,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(compilation.to_dict(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
