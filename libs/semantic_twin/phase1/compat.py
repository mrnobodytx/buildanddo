# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/compat.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/models.py, libs/semantic_twin/ingestion
# EnumType:    Adapter
# EnumEdges:   EXTENDS libs/semantic_twin/ingestion; CONSUMES libs/semantic_twin/models.py; PRODUCES libs/semantic_twin/phase1/compiler.py
# DAG Node:    semantic-twin.phase-1.compatibility
# Intent:      Adapt the merged bounded ingestion helper to Phase 0's ten-axis object state without mutating its source file.
# ────────────────────────────────────────────────────────

"""Bridge bounded ingestion objects onto the current ten-axis state contract."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from contextlib import contextmanager
from pathlib import Path
from threading import RLock
from typing import Any, Iterator

from ..ingestion import claims as legacy_claims
from ..ingestion import receipts as legacy_receipts
from ..ingestion import release as legacy_release
from ..ingestion import source as legacy_source
from ..ingestion.graph import SCHEMA_VERSION, SemanticGraph
from ..ingestion.pipeline import compile_release_twin
from ..models import (
    Authority,
    CanonicalObjectEnvelope,
    Documentation,
    MerkleBinding,
    ObjectState,
    Ownership,
    Provenance,
    Relation,
    Runtime,
    Source,
    ValidTime,
)
from ..vocabulary import (
    AuthorityTier,
    CausalState,
    CgrfActionState,
    CorpusUseState,
    EvidenceState,
    MerkleState,
    SemanticTransactionState,
    ShaclState,
    TevvState,
)


_COMPATIBILITY_LOCK = RLock()


def make_object(
    semantic_id: str,
    object_type: str,
    source_path: str,
    *,
    claims: Sequence[Mapping[str, Any]],
    relations: Sequence[Relation] = (),
    evidence_state: EvidenceState = EvidenceState.OBSERVED,
    lifecycle_state: str = "INGESTED",
    commit: str | None = None,
    documentation: Sequence[str] = (),
    runtime_status: str | None = None,
) -> CanonicalObjectEnvelope:
    """Create an ingested object with all ten Phase 0 state axes."""

    return CanonicalObjectEnvelope(
        semantic_id=semantic_id,
        object_type=object_type,
        schema_version=SCHEMA_VERSION,
        source=Source(system="buildanddo", uri_or_path=source_path, commit=commit),
        valid_time=ValidTime(),
        observed_time=None,
        state=ObjectState(
            evidence_state=evidence_state,
            shacl_state=ShaclState.NOT_EVALUATED,
            merkle_state=MerkleState.UNHASHED,
            cgrf_action_state=CgrfActionState.OBSERVED,
            tevv_state=TevvState.NOT_TESTED,
            semantic_transaction_state=SemanticTransactionState.DRAFT,
            causal_state=CausalState.TEMPORAL_ONLY,
            corpus_use_state=CorpusUseState.DISCOVERY_ONLY,
            authority_tier=AuthorityTier.A0,
            lifecycle_state=lifecycle_state,
        ),
        claims=tuple(claims),
        relations=tuple(relations),
        provenance=Provenance(
            derived_from=(source_path,),
            parser_version="python-stdlib",
            extractor_version="buildanddo-semantic-twin-phase1-complete/1",
        ),
        merkle=MerkleBinding(),
        ownership=Ownership(owner="Citadel Nexus Inc.", guild="BuildAndDo"),
        authority=Authority(required_tier=AuthorityTier.A0, mutability="read-only"),
        runtime=Runtime(observed_status=runtime_status),
        documentation=Documentation(references=tuple(documentation)),
    )


@contextmanager
def _legacy_factory_bridge() -> Iterator[None]:
    """Temporarily supply the ten-axis factory to merged bounded adapters."""

    modules = (legacy_source, legacy_release, legacy_claims, legacy_receipts)
    with _COMPATIBILITY_LOCK:
        originals = [module.make_object for module in modules]
        try:
            for module in modules:
                module.make_object = make_object
            yield
        finally:
            for module, original in zip(modules, originals, strict=True):
                module.make_object = original


def compile_bounded_base(
    repository_root: Path,
    *,
    commit: str | None = None,
) -> SemanticGraph:
    """Compile merged bounded Phase 1 through the ten-axis compatibility bridge."""

    with _legacy_factory_bridge():
        return compile_release_twin(repository_root, commit=commit)
