# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/graph.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/models.py, libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   CONSUMES libs/semantic_twin/models.py; CONSUMES libs/semantic_twin/vocabulary.py; PRODUCES libs/semantic_twin/ingestion/source.py; PRODUCES libs/semantic_twin/ingestion/release.py
# DAG Node:    semantic-twin.phase-1.graph
# Intent:      Hold ingested envelopes in a deterministic graph that can prove target resolution, connectivity and absence of orphan objects.
# ───────────────────────────────────────────────────────────

"""Build and validate in-memory semantic graphs from Phase 0 envelopes."""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

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
from ..vocabulary import AuthorityTier, EvidenceState, ShaclState


SCHEMA_VERSION = "semantic-twin.object/v1"
EXTRACTOR_VERSION = "buildanddo-release-ingestion/1"


@dataclass(frozen=True, slots=True)
class SemanticGraph:
    """Store unique canonical objects and expose structural graph checks."""

    objects: tuple[CanonicalObjectEnvelope, ...]

    def __post_init__(self) -> None:
        """Reject duplicate semantic identities at the graph boundary."""

        identities = [item.semantic_id for item in self.objects]
        if len(identities) != len(set(identities)):
            duplicates = sorted(
                identity
                for identity in set(identities)
                if identities.count(identity) > 1
            )
            raise ValueError(f"duplicate semantic identities: {duplicates}")

    def by_id(self) -> dict[str, CanonicalObjectEnvelope]:
        """Index objects by semantic identity."""

        return {item.semantic_id: item for item in self.objects}

    def relations(self) -> tuple[Relation, ...]:
        """Return every embedded relation in stable object order."""

        return tuple(relation for item in self.objects for relation in item.relations)

    def unresolved_targets(self) -> tuple[str, ...]:
        """Return relation targets that do not identify an object in the graph."""

        identities = set(self.by_id())
        return tuple(
            sorted(
                {
                    relation.target
                    for relation in self.relations()
                    if relation.target not in identities
                }
            )
        )

    def orphan_ids(self) -> tuple[str, ...]:
        """Return objects with no inbound or outbound resolved relation."""

        identities = set(self.by_id())
        connected: set[str] = set()
        for item in self.objects:
            for relation in item.relations:
                if relation.target in identities:
                    connected.add(item.semantic_id)
                    connected.add(relation.target)
        return tuple(sorted(identities - connected))

    def is_connected(self) -> bool:
        """Report whether every object belongs to one resolved component."""

        if not self.objects or self.unresolved_targets() or self.orphan_ids():
            return False
        identities = set(self.by_id())
        neighbours: dict[str, set[str]] = {identity: set() for identity in identities}
        for item in self.objects:
            for relation in item.relations:
                if relation.target in identities:
                    neighbours[item.semantic_id].add(relation.target)
                    neighbours[relation.target].add(item.semantic_id)
        seen: set[str] = set()
        pending: deque[str] = deque((self.objects[0].semantic_id,))
        while pending:
            current = pending.popleft()
            if current in seen:
                continue
            seen.add(current)
            pending.extend(sorted(neighbours[current] - seen))
        return seen == identities


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
    """Create one read-only canonical envelope for an ingested object."""

    return CanonicalObjectEnvelope(
        semantic_id=semantic_id,
        object_type=object_type,
        schema_version=SCHEMA_VERSION,
        source=Source(
            system="buildanddo",
            uri_or_path=source_path,
            commit=commit,
        ),
        valid_time=ValidTime(),
        observed_time=None,
        state=ObjectState(
            evidence_state=evidence_state,
            shacl_state=ShaclState.NOT_EVALUATED,
            lifecycle_state=lifecycle_state,
        ),
        claims=tuple(claims),
        relations=tuple(relations),
        provenance=Provenance(
            derived_from=(source_path,),
            parser_version="python-ast/stdlib",
            extractor_version=EXTRACTOR_VERSION,
        ),
        merkle=MerkleBinding(),
        ownership=Ownership(owner="Citadel Nexus Inc.", guild="BuildAndDo"),
        authority=Authority(
            required_tier=AuthorityTier.A0,
            mutability="read-only",
        ),
        runtime=Runtime(observed_status=runtime_status),
        documentation=Documentation(references=tuple(documentation)),
    )


def add_relations(
    item: CanonicalObjectEnvelope, relations: Iterable[Relation]
) -> CanonicalObjectEnvelope:
    """Return an envelope with stable, de-duplicated additional relations."""

    combined = (*item.relations, *relations)
    unique: dict[tuple[str, str, tuple[str, ...], float | None, str], Relation] = {}
    for relation in combined:
        key = (
            relation.predicate.value,
            relation.target,
            relation.evidence,
            relation.confidence,
            relation.state.value,
        )
        unique[key] = relation
    ordered = tuple(
        unique[key]
        for key in sorted(
            unique,
            key=lambda value: (
                value[0],
                value[1],
                value[2],
                -1.0 if value[3] is None else value[3],
                value[4],
            ),
        )
    )
    return replace(item, relations=ordered)


def combine_graphs(*graphs: SemanticGraph) -> SemanticGraph:
    """Combine graphs while retaining the caller's deterministic order."""

    return SemanticGraph(tuple(item for graph in graphs for item in graph.objects))
