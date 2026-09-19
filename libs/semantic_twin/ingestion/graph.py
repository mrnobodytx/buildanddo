# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/graph.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/ingestion/builder.py, libs/semantic_twin/ingestion/inputs.py, libs/semantic_twin/models.py, libs/semantic_twin/relations.py
# EnumType:    Schema
# EnumEdges:   CONSUMES libs/semantic_twin/contracts.py; CONSUMES libs/semantic_twin/identity.py; CONSUMES libs/semantic_twin/ingestion/builder.py; CONSUMES libs/semantic_twin/ingestion/inputs.py; CONSUMES libs/semantic_twin/models.py; CONSUMES libs/semantic_twin/relations.py
# DAG Node:    semantic-twin.phase-1.graph
# Intent:      Bind extraction fragments to actual v2 endpoint revisions and reject unresolved exports or stale graph edges.
# ───────────────────────────────────────────────────────────

"""Resolve extraction fragments into strict, revision-bound semantic graphs."""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, replace
from types import MappingProxyType

from ..contracts import require
from ..identity import SemanticId
from ..models import CanonicalObjectEnvelope
from ..relations import Relation
from .builder import (
    ObjectDraft,
    PendingRelation,
    RelationDraft,
    make_object as make_object,
    pending_relation,
)
from .inputs import SourceSnapshot


SCHEMA_VERSION = "2"
EXTRACTOR_VERSION = "buildanddo-local-ingestion/2"


@dataclass(frozen=True, slots=True, init=False)
class SemanticGraph:
    """Keep canonical objects separate from explicitly unresolved fragment edges.

    Fragments may reference an object supplied by a later adapter. Such edges
    remain pending and cannot be serialized or hashed. Combining fragments binds
    both endpoints to the actual object revisions and invokes P0 validation.
    """

    objects: tuple[CanonicalObjectEnvelope, ...]
    pending: tuple[PendingRelation, ...]
    aliases: Mapping[str, SemanticId]

    def __init__(
        self,
        objects: Iterable[CanonicalObjectEnvelope | ObjectDraft],
        *,
        pending: Iterable[PendingRelation] = (),
        aliases: Mapping[str, SemanticId] | None = None,
    ) -> None:
        indexed: dict[SemanticId, CanonicalObjectEnvelope] = {}
        names = dict(aliases or {})
        waiting = list(pending)
        for value in objects:
            item = value.envelope if isinstance(value, ObjectDraft) else value
            require(
                isinstance(item, CanonicalObjectEnvelope),
                "graph requires canonical objects",
            )
            require(item.semantic_id not in indexed, "duplicate semantic identities")
            indexed[item.semantic_id] = item
            keys: tuple[str, ...] = (str(item.semantic_id),)
            if isinstance(value, ObjectDraft):
                keys += (value.local_key,)
                waiting.extend(value.pending)
            for key in keys:
                require(
                    key not in names or names[key] == item.semantic_id,
                    "conflicting extraction key",
                )
                names[key] = item.semantic_id
        unresolved: list[PendingRelation] = []
        added: dict[SemanticId, list[Relation]] = {key: [] for key in indexed}
        for edge in waiting:
            source = indexed.get(edge.source.semantic_id)
            require(
                source is not None and source.subject == edge.source,
                "pending source revision missing",
            )
            assert source is not None
            target_id = names.get(edge.draft.target)
            target = indexed.get(target_id) if target_id is not None else None
            if target is None:
                unresolved.append(edge)
            else:
                added[source.semantic_id].append(edge.bind(source, target))
        for identity, item in tuple(indexed.items()):
            combined = (*item.relations, *added[identity])
            # The complete canonical edge, including revision and evidence, is
            # the deduplication key. Distinct receipts must not collapse.
            unique = {edge.to_json(): edge for edge in combined}
            relations = tuple(unique[key] for key in sorted(unique))
            for bound in relations:
                target = indexed.get(bound.target)
                if target is not None:
                    require(
                        bound.target_type is target.object_type
                        and bound.target_version == target.source.version,
                        "relation target type/revision differs from graph object",
                    )
            indexed[identity] = replace(item, relations=relations)
        object.__setattr__(self, "objects", tuple(indexed.values()))
        object.__setattr__(self, "pending", tuple(unresolved))
        object.__setattr__(self, "aliases", MappingProxyType(names))

    def by_id(self) -> dict[str, CanonicalObjectEnvelope]:
        """Index only canonical identities, not temporary extractor keys."""
        return {str(item.semantic_id): item for item in self.objects}

    def relations(self) -> tuple[Relation, ...]:
        """Return fully bound edges in stable object order."""
        return tuple(edge for item in self.objects for edge in item.relations)

    def unresolved_targets(self) -> tuple[str, ...]:
        """Report both deferred draft targets and missing canonical endpoints."""
        identities = set(self.by_id())
        return tuple(
            sorted(
                {edge.draft.target for edge in self.pending}
                | {
                    str(edge.target)
                    for edge in self.relations()
                    if edge.target not in identities
                }
            )
        )

    def require_resolved(self) -> None:
        """Fail closed before export if any relation lacks an endpoint revision."""
        require(not self.unresolved_targets(), "graph contains unresolved targets")

    def orphan_ids(self) -> tuple[str, ...]:
        """Return identities without any resolved inbound or outbound relation."""
        identities = set(self.by_id())
        connected: set[str] = set()
        for item in self.objects:
            for edge in item.relations:
                if edge.target in identities:
                    connected.update((item.semantic_id, edge.target))
        return tuple(sorted(identities - connected))

    def is_connected(self) -> bool:
        """Report whether the complete graph forms one resolved component."""
        if not self.objects or self.unresolved_targets() or self.orphan_ids():
            return False
        neighbours: dict[str, set[str]] = {key: set() for key in self.by_id()}
        for item in self.objects:
            for edge in item.relations:
                neighbours[item.semantic_id].add(edge.target)
                neighbours[edge.target].add(item.semantic_id)
        seen: set[str] = set()
        queue: deque[str] = deque((self.objects[0].semantic_id,))
        while queue:
            identity = queue.popleft()
            if identity not in seen:
                seen.add(identity)
                queue.extend(sorted(neighbours[identity] - seen))
        return seen == set(neighbours)


def add_relations(
    item: CanonicalObjectEnvelope,
    relations: Iterable[RelationDraft],
    *,
    snapshot: SourceSnapshot,
) -> ObjectDraft:
    """Attach extraction assertions for binding during the next graph assembly."""
    return ObjectDraft(
        str(item.semantic_id),
        item,
        tuple(pending_relation(item, edge, snapshot) for edge in relations),
    )


def combine_graphs(*graphs: SemanticGraph) -> SemanticGraph:
    """Resolve fragment edges using the combined canonical endpoint index."""
    aliases: dict[str, SemanticId] = {}
    for graph in graphs:
        for key, identity in graph.aliases.items():
            require(
                key not in aliases or aliases[key] == identity,
                "conflicting extraction key",
            )
            aliases[key] = identity
    return SemanticGraph(
        (item for graph in graphs for item in graph.objects),
        pending=(edge for graph in graphs for edge in graph.pending),
        aliases=aliases,
    )
