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
# EnumEdges:   CONSUMES libs/semantic_twin/phase1/merkle.py; PRODUCES semantic-twin.context-proof/v2
# DAG Node:    semantic-twin.phase-1.context-proof
# Intent:      Compile query-scoped, inclusion-proven context bundles with explicit historical cutoffs and selection reasons.
# ───────────────────────────────────────────────────────

"""Compile query-scoped and replay-bounded semantic context proofs."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from typing import Literal

from ..contracts import Contract, ContractError, require
from ..identity import SemanticId
from ..ingestion.drafts import canonical_json
from ..ingestion.graph import SemanticGraph
from ..ingestion.serializer import object_leaf_digest
from ..merkle import ContextRoot, InclusionProof
from ..models import CanonicalObjectEnvelope
from .merkle import SemanticEpoch, inclusion_proof, verify_inclusion

_WORD = re.compile(r"[A-Za-z0-9_]+")


@dataclass(frozen=True, slots=True)
class ContextSelection(Contract):
    """Carry the exact answer context alongside its membership proof."""

    envelope: CanonicalObjectEnvelope
    proof: InclusionProof
    score: int
    matched_terms: tuple[str, ...]

    @property
    def semantic_id(self) -> SemanticId:
        """Return the identity authenticated by the selected envelope hash."""
        return self.envelope.semantic_id


@dataclass(frozen=True, slots=True)
class ContextExclusion(Contract):
    """Explain a conservative temporal exclusion without exposing later facts."""

    semantic_id: SemanticId
    reason: str


@dataclass(frozen=True, slots=True)
class ContextProofBundle(Contract):
    """Bind question, selection reasons, object bytes and replay boundary."""

    schema_version: Literal["semantic-twin.context-proof/v2"]
    query: str
    epoch_id: SemanticId
    semantic_root: str
    historical_cutoff: datetime | None
    limit: int
    selections: tuple[ContextSelection, ...]
    exclusions: tuple[ContextExclusion, ...]
    context_root: ContextRoot


def _terms(value: str) -> set[str]:
    return {word.casefold() for word in _WORD.findall(value) if len(word) > 1}


def _selection_score(
    item: CanonicalObjectEnvelope, query_terms: set[str]
) -> tuple[int, tuple[str, ...]]:
    payload = item.to_dict()
    text = canonical_json(
        {
            "object_type": payload["object_type"],
            "claims": payload["claims"],
            "relations": [r.predicate.value for r in item.relations],
        }
    ).decode("utf-8")
    matched = tuple(sorted(query_terms & _terms(text)))
    return len(matched), matched


def _exclusion(item: CanonicalObjectEnvelope, cutoff: datetime | None) -> str | None:
    if cutoff is None:
        return None
    if item.observed_time is None:
        return "observation_time_unknown"
    evidence_times = tuple(e.observed_at for e in item.evidence) + tuple(
        e.observed_at for r in item.relations for e in r.evidence
    )
    if item.observed_time > cutoff or any(t > cutoff for t in evidence_times):
        return "observed_after_cutoff"
    if item.valid_time.valid_from is not None and item.valid_time.valid_from > cutoff:
        return "valid_after_cutoff"
    if (
        item.valid_time.valid_until is not None
        and item.valid_time.valid_until <= cutoff
    ):
        return "no_longer_valid_at_cutoff"
    return None


def _context_digest(bundle: ContextProofBundle) -> ContextRoot:
    payload = bundle.to_dict()
    del payload["context_root"]
    return ContextRoot(hashlib.sha256(canonical_json(payload)).hexdigest())


def compile_context_bundle(
    graph: SemanticGraph,
    epoch: SemanticEpoch,
    query: str,
    *,
    historical_cutoff: datetime | None = None,
    limit: int = 20,
) -> ContextProofBundle:
    """Select available facts, retaining their bytes and exact Phase 0 proofs."""
    require(bool(query.strip()), "query must not be empty")
    require(limit > 0, "limit must be positive")
    if historical_cutoff is not None:
        require(
            historical_cutoff.tzinfo is not None
            and historical_cutoff.utcoffset() is not None,
            "historical cutoff must be timezone-aware",
        )
        historical_cutoff = historical_cutoff.astimezone(timezone.utc)
    leaves = {leaf.subject.semantic_id: leaf for leaf in epoch.leaves}
    require(set(leaves) == set(graph.by_id()), "context graph differs from epoch")
    for item in graph.objects:
        leaf = leaves[item.semantic_id]
        require(
            leaf.subject == item.subject
            and leaf.digest.value == object_leaf_digest(item),
            "context graph content differs from epoch",
        )
    excluded = {
        item.semantic_id: reason
        for item in graph.objects
        if (reason := _exclusion(item, historical_cutoff)) is not None
    }
    # Keep an entire authenticated envelope out if it would reveal a later target.
    if historical_cutoff is not None:
        changed = True
        while changed:
            changed = False
            for item in graph.objects:
                if item.semantic_id not in excluded and any(
                    r.target in excluded for r in item.relations
                ):
                    excluded[item.semantic_id] = "references_unavailable_object"
                    changed = True
    terms = _terms(query)
    scored = []
    for item in graph.objects:
        if item.semantic_id not in excluded:
            score, matched = _selection_score(item, terms)
            if score:
                scored.append((score, matched, item))
    scored.sort(key=lambda value: (-value[0], value[2].semantic_id))
    selections = tuple(
        ContextSelection(item, inclusion_proof(epoch, item.semantic_id), score, matched)
        for score, matched, item in scored[:limit]
    )
    bundle = ContextProofBundle(
        "semantic-twin.context-proof/v2",
        query,
        epoch.epoch_id,
        epoch.root_digest,
        historical_cutoff,
        limit,
        selections,
        tuple(ContextExclusion(key, excluded[key]) for key in sorted(excluded)),
        ContextRoot("0" * 64),
    )
    return replace(bundle, context_root=_context_digest(bundle))


def verify_context_bundle(
    bundle: ContextProofBundle,
    expected_root: str,
    *,
    expected_query: str | None = None,
    expected_context_root: str | None = None,
) -> bool:
    """Verify content, query metadata and temporal eligibility against a trusted root."""
    try:
        if (
            bundle.semantic_root != expected_root
            or bundle.context_root != _context_digest(bundle)
        ):
            return False
        if expected_query is not None and bundle.query != expected_query:
            return False
        if (
            expected_context_root is not None
            and bundle.context_root.value != expected_context_root
        ):
            return False
        if (
            not bundle.query.strip()
            or bundle.limit < 1
            or len(bundle.selections) > bundle.limit
        ):
            return False
        ids = tuple(item.semantic_id for item in bundle.selections)
        excluded = {item.semantic_id for item in bundle.exclusions}
        if len(set(ids)) != len(ids) or excluded.intersection(ids):
            return False
        terms = _terms(bundle.query)
        for selection in bundle.selections:
            if selection.proof.root.epoch_id != bundle.epoch_id:
                return False
            if not verify_inclusion(
                selection.proof, expected_root, item=selection.envelope
            ):
                return False
            score, matched = _selection_score(selection.envelope, terms)
            if score < 1 or (score, matched) != (
                selection.score,
                selection.matched_terms,
            ):
                return False
            if _exclusion(selection.envelope, bundle.historical_cutoff) is not None:
                return False
            if any(r.target in excluded for r in selection.envelope.relations):
                return False
        return True
    except (ContractError, ValueError, TypeError):
        return False
