# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/context.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/phase1/merkle.py, libs/semantic_twin/ingestion/graph.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/semantic_twin/phase1/merkle.py; PRODUCES semantic-twin.context-proof/v1
# DAG Node:    semantic-twin.phase-1.context-proof
# Intent:      Compile query-scoped, inclusion-proven context bundles with explicit historical cutoffs and selection reasons.
# ───────────────────────────────────────────────────────

"""Compile query-scoped and replay-bounded semantic context proofs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
import re
from typing import Any

from ..ingestion.graph import SemanticGraph
from ..models import CanonicalObjectEnvelope
from .merkle import SemanticEpoch, inclusion_proof, verify_inclusion


_WORD = re.compile(r"[A-Za-z0-9_./:-]+")


@dataclass(frozen=True, slots=True)
class ContextSelection:
    """Explain why one semantic object entered a context proof bundle."""

    semantic_id: str
    object_type: str
    score: int
    matched_terms: tuple[str, ...]
    proof: dict[str, object]


@dataclass(frozen=True, slots=True)
class ContextProofBundle:
    """Carry query, epoch, replay boundary and verified object selections."""

    schema_version: str
    query: str
    epoch_id: str
    semantic_root: str
    historical_cutoff: str | None
    selections: tuple[ContextSelection, ...]
    excluded_later_objects: tuple[str, ...]
    context_root: str

    def to_dict(self) -> dict[str, object]:
        """Render the proof bundle as stable JSON data."""

        return {
            "schema_version": self.schema_version,
            "query": self.query,
            "epoch_id": self.epoch_id,
            "semantic_root": self.semantic_root,
            "historical_cutoff": self.historical_cutoff,
            "selections": [
                {
                    "semantic_id": item.semantic_id,
                    "object_type": item.object_type,
                    "score": item.score,
                    "matched_terms": list(item.matched_terms),
                    "proof": item.proof,
                }
                for item in self.selections
            ],
            "excluded_later_objects": list(self.excluded_later_objects),
            "context_root": self.context_root,
        }


def _terms(value: str) -> set[str]:
    """Tokenize semantic query and object data for deterministic matching."""

    return {item.casefold() for item in _WORD.findall(value) if len(item) > 1}


def _object_time(item: CanonicalObjectEnvelope) -> datetime | None:
    """Extract the first ISO timestamp carried by common observation claims."""

    observed_time = item.observed_time
    if isinstance(observed_time, datetime):
        return observed_time
    if not item.claims:
        return None
    for key in ("authored_at", "timestamp", "generated_at", "deployed_at"):
        value = item.claims[0].get(key)
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                continue
    return None


def _selection_score(
    item: CanonicalObjectEnvelope, query_terms: set[str]
) -> tuple[int, tuple[str, ...]]:
    """Score exact token overlap in identity, type and canonical claims."""

    searchable = json.dumps(
        {
            "semantic_id": item.semantic_id,
            "object_type": item.object_type,
            "claims": [dict(claim) for claim in item.claims],
            "relations": [relation.predicate.value for relation in item.relations],
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    object_terms = _terms(searchable)
    matched = tuple(sorted(query_terms & object_terms))
    return len(matched), matched


def compile_context_bundle(
    graph: SemanticGraph,
    epoch: SemanticEpoch,
    query: str,
    *,
    historical_cutoff: datetime | None = None,
    limit: int = 20,
) -> ContextProofBundle:
    """Select relevant objects and bind each to the current semantic epoch."""

    if not query.strip():
        raise ValueError("query must not be empty")
    if limit < 1:
        raise ValueError("limit must be positive")
    query_terms = _terms(query)
    scored: list[tuple[int, tuple[str, ...], CanonicalObjectEnvelope]] = []
    excluded: list[str] = []
    for item in graph.objects:
        item_time = _object_time(item)
        if (
            historical_cutoff is not None
            and item_time is not None
            and item_time > historical_cutoff
        ):
            excluded.append(item.semantic_id)
            continue
        score, matched = _selection_score(item, query_terms)
        if score:
            scored.append((score, matched, item))
    scored.sort(key=lambda value: (-value[0], value[2].semantic_id))
    selected = scored[:limit]
    selections = tuple(
        ContextSelection(
            semantic_id=item.semantic_id,
            object_type=item.object_type,
            score=score,
            matched_terms=matched,
            proof=inclusion_proof(epoch, item.semantic_id).to_dict(),
        )
        for score, matched, item in selected
    )
    cutoff = historical_cutoff.isoformat() if historical_cutoff is not None else None
    root_payload: dict[str, Any] = {
        "query": query,
        "epoch_id": epoch.epoch_id,
        "semantic_root": epoch.root_digest,
        "historical_cutoff": cutoff,
        "semantic_ids": [item.semantic_id for item in selections],
        "excluded_later_objects": sorted(excluded),
    }
    context_root = hashlib.sha256(
        json.dumps(root_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return ContextProofBundle(
        schema_version="semantic-twin.context-proof/v1",
        query=query,
        epoch_id=epoch.epoch_id,
        semantic_root=epoch.root_digest,
        historical_cutoff=cutoff,
        selections=selections,
        excluded_later_objects=tuple(sorted(excluded)),
        context_root=context_root,
    )


def verify_context_bundle(bundle: ContextProofBundle) -> bool:
    """Verify every selected object's inclusion proof against the semantic root."""

    from .merkle import InclusionProof, ProofStep

    for selection in bundle.selections:
        proof_data = selection.proof
        steps_value = proof_data.get("steps")
        if not isinstance(steps_value, list):
            return False
        steps = tuple(
            ProofStep(str(item.get("side")), str(item.get("digest")))
            for item in steps_value
            if isinstance(item, dict)
        )
        proof = InclusionProof(
            semantic_id=str(proof_data.get("semantic_id")),
            leaf_digest=str(proof_data.get("leaf_digest")),
            steps=steps,
        )
        if not verify_inclusion(proof, bundle.semantic_root):
            return False
    return True
