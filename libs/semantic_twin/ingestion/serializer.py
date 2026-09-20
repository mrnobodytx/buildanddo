# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/serializer.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/models.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/models.py; PRODUCES semantic-twin.graph/v2
# DAG Node:    semantic-twin.phase-1.serializer
# Intent:      Serialize complete canonical envelopes unchanged with detached subject-bound SHA-256 leaf digests.
# ──────────────────────────────────────────────────────────

"""Serialize semantic graphs with deterministic Merkle leaf digests."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from ..merkle import CanonicalSerialization, ContentDigest
from ..models import CanonicalObjectEnvelope
from .drafts import canonical_json
from .graph import SemanticGraph

SERIALIZATION = CanonicalSerialization()


def canonical_object_bytes(item: CanonicalObjectEnvelope) -> bytes:
    """Serialize the complete unmodified envelope using the Phase 0 profile."""
    return item.to_json().encode("utf-8")


def object_leaf_digest(item: CanonicalObjectEnvelope) -> str:
    """Hash every envelope field, including identity, evidence and state."""
    return hashlib.sha256(canonical_object_bytes(item)).hexdigest()


def graph_payload(graph: SemanticGraph) -> dict[str, Any]:
    """Return canonical envelopes and separate subject-bound digest records.

    Hash records stay outside their hashed objects, avoiding circular hashes or
    an unsupported change to the object's Merkle state.
    """
    graph.require_resolved()
    objects = sorted(graph.objects, key=lambda value: value.semantic_id)
    return {
        "schema_version": "semantic-twin.graph/v2",
        "object_count": len(objects),
        "serialization": SERIALIZATION.to_dict(),
        "hash_scope": "complete-object-envelope",
        "objects": [item.to_dict() for item in objects],
        "leaf_digests": [
            {
                "subject": item.subject.to_dict(),
                "digest": ContentDigest(object_leaf_digest(item)).to_dict(),
            }
            for item in objects
        ],
    }


def serialize_graph(graph: SemanticGraph, *, indent: int | None = None) -> str:
    """Serialize a graph in canonical or indented JSON form."""
    payload = graph_payload(graph)
    if indent is None:
        return canonical_json(payload).decode("utf-8")
    return (
        json.dumps(
            payload, ensure_ascii=True, indent=indent, sort_keys=True, allow_nan=False
        )
        + "\n"
    )
