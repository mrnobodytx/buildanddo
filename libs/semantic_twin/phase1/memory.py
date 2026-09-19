# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/memory.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     .bits/out, libs/semantic_twin/phase1/common.py
# EnumType:    Service
# EnumEdges:   CONSUMES .bits/out; PRODUCES libs/semantic_twin/phase1/compiler.py
# DAG Node:    semantic-twin.phase-1.memory
# Intent:      Preserve Type A, B and C memory meaning as typed objects and Phase 0 edges instead of flattening payloads into generic receipts.
# ───────────────────────────────────────────────────────

"""Compile governed memory vectors into typed semantic objects and edges."""

from __future__ import annotations

import hashlib
from collections.abc import Mapping
from functools import partial
from pathlib import Path
from typing import Any

from ..contracts import ContractError
from ..ingestion.drafts import GraphDraft, RelationDraft, make_object
from ..vocabulary import EvidenceState, RelationPredicate
from .common import as_mapping, read_json, relation, relative_path, stable_id


def discover_memory_paths(repository_root: Path) -> tuple[Path, ...]:
    """Find governed local memory payloads under dispatch output directories."""

    return tuple(
        sorted(
            (repository_root / ".bits" / "out").glob("*/memory.json"),
            key=lambda item: item.as_posix(),
        )
    )


def _vector_type(value: Mapping[str, Any]) -> str:
    """Return a supported vector type or a stable unknown marker."""

    vector_type = value.get("type")
    return str(vector_type).upper() if vector_type is not None else "UNKNOWN"


def ingest_memory_file(
    path: Path,
    *,
    anchor_id: str,
    repository_root: Path | None = None,
    commit: str | None = None,
) -> GraphDraft:
    """Compile one memory payload into Type A/B/C semantic objects."""

    raw = path.read_bytes()
    payload = as_mapping(read_json(path, raw=raw))
    make = partial(make_object, input_digest=hashlib.sha256(raw).hexdigest())
    source = relative_path(path, repository_root)
    vectors_value = payload.get("vectors")
    if not isinstance(vectors_value, list) or any(
        not isinstance(item, Mapping) for item in vectors_value
    ):
        raise ContractError("memory vectors must be an array of objects")
    vectors = tuple(as_mapping(item) for item in vectors_value)
    root_id = stable_id("memory-payload", source)
    summary = as_mapping(payload.get("summary"))
    objects = [
        make(
            root_id,
            "MemoryPayload",
            source,
            claims=(dict(summary),),
            relations=(relation(RelationPredicate.REFINES, anchor_id, source),),
            evidence_state=EvidenceState.OBSERVED,
            lifecycle_state="OBSERVED_LOCAL_MEMORY",
            commit=commit,
            documentation=(source,),
        )
    ]
    endpoint_ids: dict[str, str] = {}
    for index, vector in enumerate(vectors):
        if _vector_type(vector) != "A":
            continue
        file_path = str(vector.get("file_path", f"type-a-{index}"))
        endpoint_ids[file_path] = stable_id("memory-file", source, index, file_path)
    external_refs = {
        str(vector.get(key))
        for vector in vectors
        if _vector_type(vector) == "B"
        for key in ("source", "target")
        if vector.get(key) is not None and str(vector.get(key)) not in endpoint_ids
    }
    for reference in sorted(external_refs):
        reference_id = stable_id("memory-reference", source, reference)
        endpoint_ids[reference] = reference_id
        objects.append(
            make(
                reference_id,
                "MemoryReference",
                source,
                claims=({"reference": reference},),
                relations=(relation(RelationPredicate.MEMBER_OF, root_id, source),),
                evidence_state=EvidenceState.OBSERVED,
                lifecycle_state="OBSERVED_LOCAL_MEMORY",
                commit=commit,
            )
        )
    object_types = {
        "A": "MemoryFileVector",
        "B": "MemoryEdgeVector",
        "C": "MemoryEventVector",
    }
    for index, vector in enumerate(vectors):
        vector_type = _vector_type(vector)
        if vector_type == "A":
            vector_id = endpoint_ids[str(vector.get("file_path", f"type-a-{index}"))]
        else:
            vector_id = stable_id("memory-vector", source, index, vector_type)
        relations: list[RelationDraft] = [
            relation(RelationPredicate.MEMBER_OF, root_id, source)
        ]
        if vector_type == "B":
            source_ref = endpoint_ids.get(str(vector.get("source")))
            target_ref = endpoint_ids.get(str(vector.get("target")))
            if source_ref:
                relations.append(
                    relation(RelationPredicate.DERIVED_FROM, source_ref, source)
                )
            if target_ref:
                relations.append(
                    relation(RelationPredicate.REFERENCES, target_ref, source)
                )
        objects.append(
            make(
                vector_id,
                object_types.get(vector_type, "MemoryVector"),
                source,
                claims=(dict(vector),),
                relations=tuple(relations),
                evidence_state=EvidenceState.OBSERVED,
                lifecycle_state=f"MEMORY_TYPE_{vector_type}",
                commit=commit,
                documentation=(source,),
            )
        )
    return GraphDraft(tuple(objects))
