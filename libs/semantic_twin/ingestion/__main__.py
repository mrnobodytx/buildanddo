# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/pipeline.py, libs/semantic_twin/ingestion/serializer.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/pipeline.py; CONSUMES libs/semantic_twin/ingestion/serializer.py; PRODUCES semantic-twin.graph/v2
# DAG Node:    semantic-twin.phase-1.cli
# Intent:      Give reviewers a local command that compiles and writes the semantic graph without importing or executing deployment code.
# ──────────────────────────────────────────────────────────

"""Compile the BuildAndDo release semantic graph from local repository inputs."""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Sequence

from .pipeline import compile_release_twin
from .serializer import serialize_graph


def parser() -> argparse.ArgumentParser:
    """Build the local ingestion command-line parser."""

    result = argparse.ArgumentParser(
        description="Compile the BuildAndDo release path into canonical semantic JSON."
    )
    result.add_argument("--repo", type=Path, default=Path.cwd())
    result.add_argument("--controller", default="tools/buildanddo_release.py")
    result.add_argument("--commit")
    result.add_argument("--observed-at", type=datetime.fromisoformat)
    result.add_argument("--output", type=Path)
    result.add_argument("--indent", type=int)
    return result


def main(argv: Sequence[str] | None = None) -> int:
    """Compile the graph and write it to stdout or an explicit local path."""

    args = parser().parse_args(argv)
    graph = compile_release_twin(
        args.repo,
        controller_relative_path=args.controller,
        commit=args.commit,
        observed_at=args.observed_at,
    )
    payload = serialize_graph(graph, indent=args.indent)
    if args.output is None:
        sys.stdout.write(payload)
        if not payload.endswith("\n"):
            sys.stdout.write("\n")
        return 0
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(payload, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
