# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/serializer.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/models.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/models.py
# DAG Node:    semantic-twin.phase-1.serializer
# Intent:      Serialize strict v2 objects unchanged and publish detached digests over their exact canonical bytes.
# ──────────────────────────────────────────────────────────

"""Serialize semantic graphs with deterministic Merkle leaf digests."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from ..models import CanonicalObjectEnvelope
from .graph import SemanticGraph


def _canonical_json(value: Any) -> bytes:
    """Encode a JSON value using the graph's canonical byte representation."""

    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def canonical_object_bytes(item: CanonicalObjectEnvelope) -> bytes:
    """Use the exact P0 serialization profile without modifying the envelope."""
    return item.to_json().encode("utf-8")


def object_leaf_digest(item: CanonicalObjectEnvelope) -> str:
    """Return the SHA-256 digest of one canonical envelope."""

    return hashlib.sha256(canonical_object_bytes(item)).hexdigest()


def graph_payload(graph: SemanticGraph) -> dict[str, Any]:
    """Return the deterministic JSON-ready semantic graph payload."""

    graph.require_resolved()
    objects: list[dict[str, object]] = []
    leaf_digests: dict[str, str] = {}
    for item in sorted(graph.objects, key=lambda value: value.semantic_id):
        payload = item.to_dict()
        leaf_digests[str(item.semantic_id)] = object_leaf_digest(item)
        objects.append(payload)
    return {
        "schema_version": "semantic-twin.graph/v2",
        "object_count": len(objects),
        "objects": objects,
        "leaf_digests": leaf_digests,
    }


def serialize_graph(graph: SemanticGraph, *, indent: int | None = None) -> str:
    """Serialize a semantic graph to canonical or human-indented JSON."""

    payload = graph_payload(graph)
    if indent is None:
        return _canonical_json(payload).decode("utf-8")
    return json.dumps(payload, ensure_ascii=False, indent=indent, sort_keys=True) + "\n"
