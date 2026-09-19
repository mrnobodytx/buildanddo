# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/__init__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/vocabulary.py, libs/semantic_twin/transitions.py, libs/semantic_twin/models.py
# EnumType:    Scaffold
# EnumEdges:   CONSUMES libs/semantic_twin/vocabulary.py; CONSUMES libs/semantic_twin/transitions.py; CONSUMES libs/semantic_twin/models.py
# DAG Node:    semantic-twin.phase-0.api
# Intent:      Expose the frozen Phase 0 vocabulary, transition policies and envelopes through one stable import surface.
# ───────────────────────────────────────────────────────────

"""Expose the Living Semantic System Twin Phase 0 public contract."""

from .models import (
    Authority,
    CanonicalEventEnvelope,
    CanonicalObjectEnvelope,
    Documentation,
    EventContext,
    EventEvidence,
    EventSubject,
    MerkleBinding,
    ObjectState,
    Ownership,
    Provenance,
    Relation,
    Runtime,
    Source,
    ValidTime,
)
from .transitions import (
    CAUSAL_TRANSITIONS,
    CGRF_ACTION_TRANSITIONS,
    CORPUS_USE_TRANSITIONS,
    EVIDENCE_TRANSITIONS,
    FORBIDDEN_AUTOMATIC_PROMOTIONS,
    MERKLE_TRANSITIONS,
    SEMANTIC_TRANSACTION_TRANSITIONS,
    SHACL_TRANSITIONS,
    TEVV_TRANSITIONS,
    InvalidTransitionError,
    allowed_transitions,
    can_automatically_promote,
    can_transition,
    require_transition,
)
from .vocabulary import (
    AUTHORITY_TIER_FRICTION,
    AUTHORITY_TIER_NAMES,
    DESIGN_LAWS,
    RELATION_PREDICATE_GROUPS,
    AuthorityTier,
    CausalState,
    CgrfActionState,
    CorpusUseState,
    EvidenceState,
    MerkleState,
    RelationPredicate,
    SemanticTransactionState,
    ShaclState,
    TevvState,
)

__all__ = [
    "AUTHORITY_TIER_FRICTION",
    "AUTHORITY_TIER_NAMES",
    "CAUSAL_TRANSITIONS",
    "CGRF_ACTION_TRANSITIONS",
    "CORPUS_USE_TRANSITIONS",
    "DESIGN_LAWS",
    "EVIDENCE_TRANSITIONS",
    "FORBIDDEN_AUTOMATIC_PROMOTIONS",
    "MERKLE_TRANSITIONS",
    "RELATION_PREDICATE_GROUPS",
    "SEMANTIC_TRANSACTION_TRANSITIONS",
    "SHACL_TRANSITIONS",
    "TEVV_TRANSITIONS",
    "Authority",
    "AuthorityTier",
    "CanonicalEventEnvelope",
    "CanonicalObjectEnvelope",
    "CausalState",
    "CgrfActionState",
    "CorpusUseState",
    "Documentation",
    "EventContext",
    "EventEvidence",
    "EventSubject",
    "EvidenceState",
    "InvalidTransitionError",
    "MerkleBinding",
    "MerkleState",
    "ObjectState",
    "Ownership",
    "Provenance",
    "Relation",
    "RelationPredicate",
    "Runtime",
    "SemanticTransactionState",
    "ShaclState",
    "Source",
    "TevvState",
    "ValidTime",
    "allowed_transitions",
    "can_automatically_promote",
    "can_transition",
    "require_transition",
]
