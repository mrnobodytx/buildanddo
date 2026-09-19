# ─── CGRF Header ─────────────────────────────
# File:        libs/semantic_twin/models.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   CONSUMES libs/semantic_twin/vocabulary.py; EXTENDS .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-001.md
# DAG Node:    semantic-twin.phase-0.envelopes
# Intent:      Provide immutable canonical object and event envelopes with explicit identity, provenance, evidence and authority fields.
# ──────────────────────────────────────────────────────────

"""Define immutable canonical envelopes for system-twin objects and events."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from types import MappingProxyType
from typing import Any, TypeAlias

from .vocabulary import (
    AuthorityTier,
    CausalState,
    CgrfActionState,
    CorpusUseState,
    EvidenceState,
    MerkleState,
    RelationPredicate,
    SemanticTransactionState,
    ShaclState,
    StateAxis,
    TevvState,
)


AxisState: TypeAlias = (
    EvidenceState
    | ShaclState
    | MerkleState
    | CgrfActionState
    | TevvState
    | SemanticTransactionState
    | CausalState
    | CorpusUseState
    | AuthorityTier
    | str
)


def _require_text(value: str, field_name: str) -> None:
    """Require a non-empty string value."""

    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")


def _require_aware(value: datetime | None, field_name: str) -> None:
    """Require timezone-aware timestamps when a timestamp is present."""

    if value is not None and (value.tzinfo is None or value.utcoffset() is None):
        raise ValueError(f"{field_name} must be timezone-aware")


def _timestamp(value: datetime | None) -> str | None:
    """Render an optional timestamp in its canonical ISO-8601 form."""

    return value.isoformat() if value is not None else None


@dataclass(frozen=True, slots=True)
class Source:
    """Identify the system and versioned location that supplied an object."""

    system: str
    uri_or_path: str | None = None
    repository: str | None = None
    commit: str | None = None
    document_version: str | None = None

    def __post_init__(self) -> None:
        """Validate source identity and require one addressable locator."""

        _require_text(self.system, "source.system")
        locators = (
            self.uri_or_path,
            self.repository,
            self.commit,
            self.document_version,
        )
        if not any(isinstance(value, str) and value.strip() for value in locators):
            raise ValueError("source must include at least one locator or version")


@dataclass(frozen=True, slots=True)
class ValidTime:
    """Bound the real-world validity interval of an object."""

    valid_from: datetime | None = None
    valid_until: datetime | None = None

    def __post_init__(self) -> None:
        """Validate timestamp awareness and interval ordering."""

        _require_aware(self.valid_from, "valid_time.from")
        _require_aware(self.valid_until, "valid_time.until")
        if (
            self.valid_from is not None
            and self.valid_until is not None
            and self.valid_until < self.valid_from
        ):
            raise ValueError("valid_time.until must not precede valid_time.from")


@dataclass(frozen=True, slots=True, kw_only=True)
class ObjectState:
    """Represent all ten independent semantic-twin state axes."""

    evidence_state: EvidenceState
    shacl_state: ShaclState
    merkle_state: MerkleState
    cgrf_action_state: CgrfActionState
    tevv_state: TevvState
    semantic_transaction_state: SemanticTransactionState
    causal_state: CausalState
    corpus_use_state: CorpusUseState
    authority_tier: AuthorityTier
    lifecycle_state: str

    def __post_init__(self) -> None:
        """Validate the open lifecycle value and cross-axis prerequisites."""

        typed_axes = (
            (self.evidence_state, EvidenceState, StateAxis.EVIDENCE),
            (self.shacl_state, ShaclState, StateAxis.SHACL),
            (self.merkle_state, MerkleState, StateAxis.MERKLE),
            (self.cgrf_action_state, CgrfActionState, StateAxis.CGRF_ACTION),
            (self.tevv_state, TevvState, StateAxis.TEVV),
            (
                self.semantic_transaction_state,
                SemanticTransactionState,
                StateAxis.SEMANTIC_TRANSACTION,
            ),
            (self.causal_state, CausalState, StateAxis.CAUSAL),
            (self.corpus_use_state, CorpusUseState, StateAxis.CORPUS_USE),
            (self.authority_tier, AuthorityTier, StateAxis.AUTHORITY),
        )
        for value, expected_type, axis in typed_axes:
            if not isinstance(value, expected_type):
                raise TypeError(
                    f"{axis.value} must be {expected_type.__name__}, "
                    f"not {type(value).__name__}"
                )
        if type(self.lifecycle_state) is not str:
            raise TypeError("lifecycle_state must be str")
        _require_text(self.lifecycle_state, "state.lifecycle_state")
        self._validate_cross_axis_invariants()

    def _validate_cross_axis_invariants(self) -> None:
        """Reject composite states that make unsupported success claims."""

        transaction = self.semantic_transaction_state
        if (
            transaction
            in {
                SemanticTransactionState.SHACL_VALIDATED,
                SemanticTransactionState.EVIDENCE_BOUND,
                SemanticTransactionState.POLICY_EVALUATED,
                SemanticTransactionState.AUTHORIZED,
                SemanticTransactionState.EXECUTING,
                SemanticTransactionState.MUTATED_UNVERIFIED,
                SemanticTransactionState.VERIFYING,
                SemanticTransactionState.VERIFIED,
                SemanticTransactionState.CANONICALIZED,
                SemanticTransactionState.WATCH,
            }
            and self.shacl_state is not ShaclState.CONFORMS
        ):
            raise ValueError(
                "semantic transaction requires SHACL CONFORMS at or after "
                "SHACL_VALIDATED"
            )

        if transaction in {
            SemanticTransactionState.AUTHORIZED,
            SemanticTransactionState.EXECUTING,
            SemanticTransactionState.MUTATED_UNVERIFIED,
            SemanticTransactionState.VERIFYING,
            SemanticTransactionState.VERIFIED,
            SemanticTransactionState.CANONICALIZED,
            SemanticTransactionState.WATCH,
        } and self.cgrf_action_state in {
            CgrfActionState.OBSERVED,
            CgrfActionState.PROPOSED,
            CgrfActionState.POLICY_EVALUATING,
            CgrfActionState.DENIED,
            CgrfActionState.FAILED_CLOSED,
            CgrfActionState.ROLLED_BACK,
            CgrfActionState.SUPERSEDED,
        }:
            raise ValueError(
                "authorized semantic transaction requires an authorized CGRF action"
            )

        verified_transaction = transaction in {
            SemanticTransactionState.VERIFIED,
            SemanticTransactionState.CANONICALIZED,
        }
        if verified_transaction and (
            self.evidence_state is not EvidenceState.VERIFIED
            or self.tevv_state is not TevvState.PASS
            or self.cgrf_action_state is not CgrfActionState.VERIFIED
        ):
            raise ValueError(
                "verified semantic transaction requires VERIFIED evidence, "
                "TEVV PASS and CGRF VERIFIED"
            )

        if (
            transaction is SemanticTransactionState.CANONICALIZED
            and self.merkle_state
            in {
                MerkleState.UNHASHED,
                MerkleState.CORRUPT,
                MerkleState.QUARANTINED,
            }
        ):
            raise ValueError(
                "canonicalized semantic transaction requires a valid canonical digest"
            )

        if self.causal_state is CausalState.VERIFIED_CAUSE and (
            self.evidence_state is not EvidenceState.VERIFIED
            or self.tevv_state is not TevvState.PASS
        ):
            raise ValueError("VERIFIED_CAUSE requires VERIFIED evidence and TEVV PASS")

        if self.corpus_use_state is CorpusUseState.VERIFIED_FOR_CITADEL and (
            self.evidence_state is not EvidenceState.VERIFIED
            or self.tevv_state is not TevvState.PASS
        ):
            raise ValueError(
                "VERIFIED_FOR_CITADEL requires VERIFIED evidence and TEVV PASS"
            )

    def axis_value(self, axis: StateAxis) -> AxisState:
        """Return one typed state-axis value."""

        values: dict[StateAxis, AxisState] = {
            StateAxis.EVIDENCE: self.evidence_state,
            StateAxis.SHACL: self.shacl_state,
            StateAxis.MERKLE: self.merkle_state,
            StateAxis.CGRF_ACTION: self.cgrf_action_state,
            StateAxis.TEVV: self.tevv_state,
            StateAxis.SEMANTIC_TRANSACTION: self.semantic_transaction_state,
            StateAxis.CAUSAL: self.causal_state,
            StateAxis.CORPUS_USE: self.corpus_use_state,
            StateAxis.AUTHORITY: self.authority_tier,
            StateAxis.LIFECYCLE: self.lifecycle_state,
        }
        return values[axis]

    def to_dict(self) -> dict[str, str]:
        """Render all ten axes using their canonical wire values."""

        return {axis.value: str(self.axis_value(axis)) for axis in StateAxis}


@dataclass(frozen=True, slots=True)
class Relation:
    """Describe one typed, evidenced edge from the enclosing object."""

    predicate: RelationPredicate
    target: str
    evidence: tuple[str, ...]
    confidence: float | None
    state: EvidenceState

    def __post_init__(self) -> None:
        """Validate edge identity, evidence references and confidence."""

        _require_text(self.target, "relation.target")
        for reference in self.evidence:
            _require_text(reference, "relation.evidence[]")
        if self.confidence is not None and not 0.0 <= self.confidence <= 1.0:
            raise ValueError("relation.confidence must be between 0.0 and 1.0")


@dataclass(frozen=True, slots=True)
class Provenance:
    """Record derivation and replay roots for a semantic object."""

    derived_from: tuple[str, ...] = ()
    parser_version: str | None = None
    extractor_version: str | None = None
    context_root: str | None = None
    semantic_root: str | None = None

    def __post_init__(self) -> None:
        """Require at least one substantive provenance reference."""

        values = (
            *self.derived_from,
            self.parser_version,
            self.extractor_version,
            self.context_root,
            self.semantic_root,
        )
        if not any(isinstance(value, str) and value.strip() for value in values):
            raise ValueError(
                "provenance must include at least one reference or version"
            )


@dataclass(frozen=True, slots=True)
class MerkleBinding:
    """Bind an object to an optional leaf and semantic epoch root."""

    leaf_digest: str | None = None
    epoch_id: str | None = None
    root_digest: str | None = None


@dataclass(frozen=True, slots=True)
class Ownership:
    """Name the owner and guild accountable for an object."""

    owner: str
    guild: str | None = None

    def __post_init__(self) -> None:
        """Validate the required owner identity."""

        _require_text(self.owner, "ownership.owner")


@dataclass(frozen=True, slots=True)
class Authority:
    """Declare the authority ceiling and mutability of an object."""

    required_tier: AuthorityTier
    mutability: str

    def __post_init__(self) -> None:
        """Validate the mutability contract."""

        _require_text(self.mutability, "authority.mutability")


@dataclass(frozen=True, slots=True)
class Runtime:
    """Attach current runtime standing and telemetry references."""

    observed_status: str | None = None
    telemetry_refs: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Documentation:
    """Attach exact documentation references to an object."""

    references: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class CanonicalObjectEnvelope:
    """Carry the common minimum envelope for every system-twin object."""

    semantic_id: str
    object_type: str
    schema_version: str
    source: Source
    valid_time: ValidTime
    observed_time: datetime | None
    state: ObjectState
    claims: tuple[Mapping[str, Any], ...]
    relations: tuple[Relation, ...]
    provenance: Provenance
    merkle: MerkleBinding
    ownership: Ownership
    authority: Authority
    runtime: Runtime
    documentation: Documentation

    def __post_init__(self) -> None:
        """Validate identity and freeze claim mappings at the envelope boundary."""

        _require_text(self.semantic_id, "semantic_id")
        _require_text(self.object_type, "object_type")
        _require_text(self.schema_version, "schema_version")
        _require_aware(self.observed_time, "observed_time")
        frozen_claims = tuple(MappingProxyType(dict(claim)) for claim in self.claims)
        object.__setattr__(self, "claims", frozen_claims)
        object.__setattr__(self, "relations", tuple(self.relations))

    def to_dict(self) -> dict[str, Any]:
        """Render the exact section 44 wire envelope."""

        return {
            "semantic_id": self.semantic_id,
            "object_type": self.object_type,
            "schema_version": self.schema_version,
            "source": {
                "system": self.source.system,
                "uri_or_path": self.source.uri_or_path,
                "repository": self.source.repository,
                "commit": self.source.commit,
                "document_version": self.source.document_version,
            },
            "valid_time": {
                "from": _timestamp(self.valid_time.valid_from),
                "until": _timestamp(self.valid_time.valid_until),
            },
            "observed_time": _timestamp(self.observed_time),
            "state": self.state.to_dict(),
            "claims": [dict(claim) for claim in self.claims],
            "relations": [
                {
                    "predicate": relation.predicate.value,
                    "target": relation.target,
                    "evidence": list(relation.evidence),
                    "confidence": relation.confidence,
                    "state": relation.state.value,
                }
                for relation in self.relations
            ],
            "provenance": {
                "derived_from": list(self.provenance.derived_from),
                "parser_version": self.provenance.parser_version,
                "extractor_version": self.provenance.extractor_version,
                "context_root": self.provenance.context_root,
                "semantic_root": self.provenance.semantic_root,
            },
            "merkle": {
                "leaf_digest": self.merkle.leaf_digest,
                "epoch_id": self.merkle.epoch_id,
                "root_digest": self.merkle.root_digest,
            },
            "ownership": {
                "owner": self.ownership.owner,
                "guild": self.ownership.guild,
            },
            "authority": {
                "required_tier": self.authority.required_tier.value,
                "mutability": self.authority.mutability,
            },
            "runtime": {
                "observed_status": self.runtime.observed_status,
                "telemetry_refs": list(self.runtime.telemetry_refs),
            },
            "documentation": {"references": list(self.documentation.references)},
        }


@dataclass(frozen=True, slots=True)
class EventSubject:
    """Identify the typed object that an event concerns."""

    type: str
    id: str

    def __post_init__(self) -> None:
        """Validate the subject type and identity."""

        _require_text(self.type, "subject.type")
        _require_text(self.id, "subject.id")


@dataclass(frozen=True, slots=True)
class EventContext:
    """Preserve execution, release, tracing, mission and semantic context."""

    persona_id: str | None = None
    release_sha: str | None = None
    trace_id: str | None = None
    mission_id: str | None = None
    context_root: str | None = None
    semantic_epoch: str | None = None


@dataclass(frozen=True, slots=True)
class EventEvidence:
    """Bind an event to typed evidence standing."""

    evidence_id: str
    state: EvidenceState

    def __post_init__(self) -> None:
        """Validate the evidence identity."""

        _require_text(self.evidence_id, "evidence.evidence_id")


@dataclass(frozen=True, slots=True)
class CanonicalEventEnvelope:
    """Carry the canonical event fields across projections and audit surfaces."""

    id: str
    type: str
    version: str
    tenant_id: str
    occurred_at: datetime
    subject: EventSubject
    context: EventContext
    data: Mapping[str, Any]
    evidence: EventEvidence

    def __post_init__(self) -> None:
        """Validate event identity and freeze the top-level event payload."""

        _require_text(self.id, "id")
        _require_text(self.type, "type")
        _require_text(self.version, "version")
        _require_text(self.tenant_id, "tenant_id")
        _require_aware(self.occurred_at, "occurred_at")
        object.__setattr__(self, "data", MappingProxyType(dict(self.data)))

    def to_dict(self) -> dict[str, Any]:
        """Render the exact section 45 wire envelope."""

        return {
            "id": self.id,
            "type": self.type,
            "version": self.version,
            "tenant_id": self.tenant_id,
            "occurred_at": _timestamp(self.occurred_at),
            "subject": {"type": self.subject.type, "id": self.subject.id},
            "context": {
                "persona_id": self.context.persona_id,
                "release_sha": self.context.release_sha,
                "trace_id": self.context.trace_id,
                "mission_id": self.context.mission_id,
                "context_root": self.context.context_root,
                "semantic_epoch": self.context.semantic_epoch,
            },
            "data": dict(self.data),
            "evidence": {
                "evidence_id": self.evidence.evidence_id,
                "state": self.evidence.state.value,
            },
        }
