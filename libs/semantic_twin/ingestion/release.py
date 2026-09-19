# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/release.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/identity.py, libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/identity.py; CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-1.release-path
# Intent:      Express the release truth chain as eight canonical objects whose evidenced relations preserve staging and production verification order.
# ──────────────────────────────────────────────────────────

"""Model the bounded BuildAndDo release path with Phase 0 predicates."""

from __future__ import annotations

from pathlib import Path

from ..identity import SemanticId
from ..vocabulary import EvidenceState, RelationPredicate
from .builder import RelationDraft, canonical_id
from .graph import SemanticGraph, make_object
from .inputs import SourceSnapshot


_RELEASE_PATH_KEYS = (
    "release://buildanddo/source-commit",
    "release://buildanddo/build-artifact",
    "release://buildanddo/staging-deploy",
    "release://buildanddo/staging-verify",
    "release://buildanddo/production-deploy",
    "release://buildanddo/production-verify",
    "release://buildanddo/dora-emit",
    "release://buildanddo/evidence-receipt",
)
_OBJECT_TYPES = (
    "SourceCommit",
    "BuildArtifact",
    "Deployment",
    "Verification",
    "Deployment",
    "Verification",
    "PublishedEvent",
    "EvidenceReceipt",
)
RELEASE_PATH_IDS = tuple(
    canonical_id(kind, key)
    for kind, key in zip(_OBJECT_TYPES, _RELEASE_PATH_KEYS, strict=True)
)


def _relation(
    predicate: RelationPredicate,
    target: str,
    controller: str,
    *,
    state: EvidenceState = EvidenceState.UNMEASURED,
    environment: SemanticId | None = None,
) -> RelationDraft:
    """Create one source-evidenced release-path edge."""

    return RelationDraft(
        predicate=predicate,
        target=target,
        evidence=(controller,),
        confidence=None,
        state=state,
        environment=environment,
    )


def build_release_path_graph(
    controller_path: Path,
    *,
    commit: str | None = None,
    source_reference: str | None = None,
    snapshot: SourceSnapshot | None = None,
) -> SemanticGraph:
    """Build the eight-stage release truth graph in execution order."""

    source = source_reference or controller_path.as_posix()
    captured = snapshot or SourceSnapshot.capture(controller_path, source_path=source)
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
            _relation(
                RelationPredicate.DEPLOYED_AS,
                RELEASE_PATH_IDS[2],
                source,
                environment=SemanticId("cni://environment/buildanddo/staging"),
            ),
        ),
        (
            _relation(RelationPredicate.VERIFIED_BY, RELEASE_PATH_IDS[3], source),
            _relation(RelationPredicate.SUCCEEDED_BY, RELEASE_PATH_IDS[3], source),
        ),
        (_relation(RelationPredicate.SUCCEEDED_BY, RELEASE_PATH_IDS[4], source),),
        (_relation(RelationPredicate.VERIFIED_BY, RELEASE_PATH_IDS[5], source),),
        (_relation(RelationPredicate.SUCCEEDED_BY, RELEASE_PATH_IDS[6], source),),
        (_relation(RelationPredicate.EVIDENCED_BY, RELEASE_PATH_IDS[7], source),),
        (_relation(RelationPredicate.DERIVED_FROM, RELEASE_PATH_IDS[6], source),),
    )
    objects = tuple(
        make_object(
            RELEASE_PATH_IDS[index],
            _OBJECT_TYPES[index],
            source,
            snapshot=captured,
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
