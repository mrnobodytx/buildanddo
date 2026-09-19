# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/ingestion/serializer.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/ingestion/graph.py, libs/semantic_twin/models.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES libs/semantic_twin/ingestion/graph.py; CONSUMES libs/semantic_twin/models.py; PRODUCES semantic-twin.graph/v1
# DAG Node:    semantic-twin.phase-1.serializer
# Intent:      Produce stable canonical JSON and one self-excluding SHA-256 Merkle leaf digest for every ingested envelope.
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
    """Canonicalize an envelope while excluding its self-referential leaf digest."""

    payload = item.to_dict()
    payload["merkle"]["leaf_digest"] = None
    return _canonical_json(payload)


def object_leaf_digest(item: CanonicalObjectEnvelope) -> str:
    """Return the SHA-256 digest of one canonical envelope."""

    return hashlib.sha256(canonical_object_bytes(item)).hexdigest()


def graph_payload(graph: SemanticGraph) -> dict[str, Any]:
    """Return the deterministic JSON-ready semantic graph payload."""

    objects: list[dict[str, Any]] = []
    for item in sorted(graph.objects, key=lambda value: value.semantic_id):
        payload = item.to_dict()
        payload["merkle"]["leaf_digest"] = object_leaf_digest(item)
        objects.append(payload)
    return {
        "schema_version": "semantic-twin.graph/v1",
        "object_count": len(objects),
        "objects": objects,
    }


def serialize_graph(graph: SemanticGraph, *, indent: int | None = None) -> str:
    """Serialize a semantic graph to canonical or human-indented JSON."""

    payload = graph_payload(graph)
    if indent is None:
        return _canonical_json(payload).decode("utf-8")
    return json.dumps(payload, ensure_ascii=False, indent=indent, sort_keys=True) + "\n"
