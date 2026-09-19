# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/release.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/graph.py; EXTENDS .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md; CONSUMES tools/buildanddo_release.py
# DAG Node:    semantic-twin.phase-1.release-path
# Intent:      Express the release truth chain as eight canonical objects whose evidenced relations preserve staging and production verification order.
# ──────────────────────────────────────────────────────────

"""Model the bounded BuildAndDo release path with Phase 0 predicates."""

from __future__ import annotations

import hashlib
from datetime import datetime
from pathlib import Path

from ..vocabulary import EvidenceState, RelationPredicate
from .drafts import GraphDraft, RelationDraft, make_object, semantic_id
from .graph import SemanticGraph

RELEASE_PATH_KEYS = tuple(
    f"release://buildanddo/{name}"
    for name in (
        "source-commit",
        "build-artifact",
        "staging-deploy",
        "staging-verify",
        "production-deploy",
        "production-verify",
        "dora-emit",
        "evidence-receipt",
    )
)
RELEASE_PATH_IDS = tuple(semantic_id("ReleaseStage", key) for key in RELEASE_PATH_KEYS)


def extract_release_path(
    controller_path: Path,
    *,
    commit: str | None = None,
    source_reference: str | None = None,
) -> GraphDraft:
    """Describe eight source-modeled capabilities without claiming execution."""
    source = source_reference or controller_path.as_posix()
    digest = hashlib.sha256(controller_path.read_bytes()).hexdigest()
    stages = (
        "source commit",
        "build artifact",
        "staging deploy",
        "staging verify",
        "production deploy",
        "production verify",
        "DORA emit",
        "evidence receipt",
    )
    objects = []
    for index, stage in enumerate(stages):
        relations = (
            ()
            if index == 7
            else (
                RelationDraft(
                    predicate=RelationPredicate.SUCCEEDED_BY,
                    target=RELEASE_PATH_KEYS[index + 1],
                    evidence=(source,),
                    confidence=1.0,
                    state=EvidenceState.INFERRED,
                ),
            )
        )
        objects.append(
            make_object(
                RELEASE_PATH_KEYS[index],
                "ReleaseStage",
                source,
                claims=(
                    {
                        "stage": stage,
                        "position": index + 1,
                        "truth_scope": "source-modeled release sequence",
                        "execution_observed": False,
                    },
                ),
                relations=relations,
                evidence_state=EvidenceState.INFERRED,
                lifecycle_state="MODELED",
                commit=commit,
                documentation=(source,),
                input_digest=digest,
            )
        )
    return GraphDraft(tuple(objects))


def build_release_path_graph(
    controller_path: Path,
    *,
    commit: str | None = None,
    source_reference: str | None = None,
    observed_at: datetime | None = None,
) -> SemanticGraph:
    """Build a canonical static model of the eight-stage release path."""
    return extract_release_path(
        controller_path, commit=commit, source_reference=source_reference
    ).resolve(observed_at=observed_at)
