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
from typing import Any

from .vocabulary import AuthorityTier, EvidenceState, RelationPredicate, ShaclState


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


@dataclass(frozen=True, slots=True)
class ObjectState:
    """Keep evidence, structural validation and lifecycle state distinct."""

    evidence_state: EvidenceState
    shacl_state: ShaclState
    lifecycle_state: str

    def __post_init__(self) -> None:
        """Validate the open lifecycle vocabulary without weakening typed states."""

        _require_text(self.lifecycle_state, "state.lifecycle_state")


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
            "state": {
                "evidence_state": self.state.evidence_state.value,
                "shacl_state": self.state.shacl_state.value,
                "lifecycle_state": self.state.lifecycle_state,
            },
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
