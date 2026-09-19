# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/release.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/graph.py; IMPLEMENTS .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md; DESCRIBES tools/buildanddo_release.py
# DAG Node:    semantic-twin.phase-1.release-path
# Intent:      Express the release truth chain as eight canonical objects whose evidenced relations preserve staging and production verification order.
# ──────────────────────────────────────────────────────────

"""Model the bounded BuildAndDo release path with Phase 0 predicates."""

from __future__ import annotations

from pathlib import Path

from ..models import Relation
from ..vocabulary import EvidenceState, RelationPredicate
from .graph import SemanticGraph, make_object


RELEASE_PATH_IDS = (
    "release://buildanddo/source-commit",
    "release://buildanddo/build-artifact",
    "release://buildanddo/staging-deploy",
    "release://buildanddo/staging-verify",
    "release://buildanddo/production-deploy",
    "release://buildanddo/production-verify",
    "release://buildanddo/dora-emit",
    "release://buildanddo/evidence-receipt",
)


def _relation(
    predicate: RelationPredicate,
    target: str,
    controller: str,
    *,
    state: EvidenceState = EvidenceState.INFERRED,
) -> Relation:
    """Create one source-evidenced release-path edge."""

    return Relation(
        predicate=predicate,
        target=target,
        evidence=(controller,),
        confidence=1.0,
        state=state,
    )


def build_release_path_graph(
    controller_path: Path,
    *,
    commit: str | None = None,
    source_reference: str | None = None,
) -> SemanticGraph:
    """Build the eight-stage release truth graph in execution order."""

    source = source_reference or controller_path.as_posix()
    object_types = (
        "SourceCommit",
        "BuildArtifact",
        "Deployment",
        "Verification",
        "Deployment",
        "Verification",
        "PublishedEvent",
        "EvidenceReceipt",
    )
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
    relations = (
        (
            _relation(
                RelationPredicate.SUCCEEDED_BY,
                RELEASE_PATH_IDS[1],
                source,
            ),
        ),
        (
            _relation(RelationPredicate.BUILT_FROM, RELEASE_PATH_IDS[0], source),
            _relation(RelationPredicate.DEPLOYED_AS, RELEASE_PATH_IDS[2], source),
        ),
        (
            _relation(RelationPredicate.VERIFIED_BY, RELEASE_PATH_IDS[3], source),
            _relation(RelationPredicate.SUCCEEDED_BY, RELEASE_PATH_IDS[3], source),
        ),
        (_relation(RelationPredicate.PROMOTED_TO, RELEASE_PATH_IDS[4], source),),
        (_relation(RelationPredicate.VERIFIED_BY, RELEASE_PATH_IDS[5], source),),
        (_relation(RelationPredicate.PUBLISHES, RELEASE_PATH_IDS[6], source),),
        (_relation(RelationPredicate.EVIDENCED_BY, RELEASE_PATH_IDS[7], source),),
        (_relation(RelationPredicate.DERIVED_FROM, RELEASE_PATH_IDS[6], source),),
    )
    objects = tuple(
        make_object(
            RELEASE_PATH_IDS[index],
            object_types[index],
            source,
            claims=(
                {
                    "stage": stage,
                    "position": index + 1,
                    "truth_scope": "BuildAndDo release and deployment",
                },
            ),
            relations=relations[index],
            evidence_state=EvidenceState.INFERRED,
            lifecycle_state="MODELED",
            commit=commit,
            documentation=(source,),
        )
        for index, stage in enumerate(stages)
    )
    return SemanticGraph(objects)
