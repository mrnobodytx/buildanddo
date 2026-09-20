# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/compat.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/pipeline.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/pipeline.py
# DAG Node:    semantic-twin.phase-1.compatibility
# Intent:      Reuse the strict v2 ingestion factory directly without patching module globals.
# ────────────────────────────────────────────────────────

"""Reuse the strict ingestion factory without altering module globals."""

from __future__ import annotations

from pathlib import Path

from ..ingestion.builder import make_object as make_object
from ..ingestion.graph import SemanticGraph
from ..ingestion.pipeline import compile_release_twin


def compile_bounded_base(
    repository_root: Path,
    *,
    commit: str | None = None,
) -> SemanticGraph:
    """Compile the bounded base directly against the shared v2 builder."""
    return compile_release_twin(repository_root, commit=commit)
