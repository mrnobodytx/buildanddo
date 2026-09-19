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
# EnumEdges:   CONSUMES libs/semantic_twin/phase1/compiler.py; PRODUCES semantic-twin.phase1-complete/v2
# DAG Node:    semantic-twin.phase-1.cli
# Intent:      Provide a local-only CLI that writes the complete Phase 1 graph and proof bundle without provider or deployment actions.
# ───────────────────────────────────────────────────────

"""Write complete local Phase 1 semantic twin proof bundles."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from datetime import datetime
from pathlib import Path

from .compiler import Phase1Inputs, compile_phase1


def _timestamp(value: str) -> datetime:
    """Parse an aware timestamp without inventing a timezone."""
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None or result.utcoffset() is None:
            raise ValueError("timezone is required")
        return result
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            "expected a timezone-aware ISO-8601 timestamp"
        ) from exc


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
    value.add_argument("--release-receipt", action="append", type=Path)
    value.add_argument("--sbom", action="append", type=Path)
    value.add_argument("--memory", action="append", type=Path)
    value.add_argument("--expected-sha")
    value.add_argument("--expected-artifact-digest")
    value.add_argument(
        "--artifact-digest-field",
        choices=("artifact_tree_sha256", "artifact_sha256", "artifact_digest"),
        default="artifact_tree_sha256",
        help="Choose the same artifact identity kind used by the expected digest.",
    )
    value.add_argument(
        "--observed-at",
        type=_timestamp,
        help="Reuse a recorded snapshot's capture time for deterministic replay.",
    )
    value.add_argument("--historical-cutoff", type=_timestamp)
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
            release_receipts=tuple(arguments.release_receipt)
            if arguments.release_receipt is not None
            else None,
            sbom_paths=tuple(arguments.sbom) if arguments.sbom is not None else None,
            memory_paths=tuple(arguments.memory)
            if arguments.memory is not None
            else None,
            expected_commit=arguments.expected_sha,
            expected_artifact_digest=arguments.expected_artifact_digest,
            artifact_digest_field=arguments.artifact_digest_field,
        ),
        query=arguments.query,
        observed_at=arguments.observed_at,
        historical_cutoff=arguments.historical_cutoff,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        json.dumps(compilation.to_dict(), indent=2, sort_keys=True, allow_nan=False)
        + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
