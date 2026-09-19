# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/graph.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
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
from dataclasses import dataclass

from ..contracts import ContractError
from ..models import CanonicalObjectEnvelope
from ..relations import Relation


@dataclass(frozen=True, slots=True)
class SemanticGraph:
    """Store unique canonical objects and expose structural graph checks."""

    objects: tuple[CanonicalObjectEnvelope, ...]

    def __post_init__(self) -> None:
        """Reject duplicate semantic identities at the graph boundary."""

        if any(type(item) is not CanonicalObjectEnvelope for item in self.objects):
            raise ContractError(
                "resolve extraction drafts before constructing a semantic graph"
            )
        indexed = {item.semantic_id: item for item in self.objects}
        for item in self.objects:
            for edge in item.relations:
                target = indexed.get(edge.target)
                if target is not None and (
                    edge.target_version != target.source.version
                    or edge.target_type is not target.object_type
                ):
                    raise ContractError(
                        "relation target type/revision differs from graph object"
                    )
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


def combine_graphs(*graphs: SemanticGraph) -> SemanticGraph:
    """Combine canonical graphs without bypassing endpoint revision checks."""
    return SemanticGraph(tuple(item for graph in graphs for item in graph.objects))
