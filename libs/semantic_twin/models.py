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
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/receipts.py, libs/semantic_twin/relations.py, libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/receipts.py; DEPENDS_ON libs/semantic_twin/relations.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-0.envelopes
# Intent:      Provide immutable canonical object and event envelopes with explicit identity, provenance, evidence and authority fields.
# ──────────────────────────────────────────────────────────

"""Define version-two object and event contracts with explicit evidence boundaries."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, TypeAlias, cast

from .contracts import Contract, require, text
from .identity import EntityType, SemanticId, SubjectRef, ValidTime
from .merkle import ContextRoot, MerkleBinding, SemanticRoot, SourceRevision
from .receipts import (
    CausalSupport,
    CorpusValidation,
    EvidenceReference,
    PolicyDecisionReceipt,
    ShaclValidationResult,
    TevvResult,
    VerificationReceipt,
    validate_evidence,
)
from .relations import Relation
from .vocabulary import (
    AuthorityTier,
    CausalState,
    CgrfActionState,
    CorpusUseState,
    EvidenceState,
    MerkleState,
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


@dataclass(frozen=True, slots=True)
class Source(Contract):
    """Identify a source location and an immutable revision or document version."""

    system: str
    uri_or_path: str
    repository: str | None = None
    commit: str | None = None
    document_version: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.system, "source.system")
        text(self.uri_or_path, "source.uri_or_path")
        require(
            self.commit is not None or self.document_version is not None,
            "source requires a commit or document version",
        )
        if self.commit is not None:
            SourceRevision(self.commit)
        if self.document_version is not None:
            text(self.document_version, "source.document_version")
        if self.repository is not None:
            text(self.repository, "source.repository")

    @property
    def version(self) -> str:
        """Return the source revision used to bind all receipts."""
        return (
            self.commit if self.commit is not None else cast(str, self.document_version)
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class ObjectState(Contract):
    """Represent ten axes without mistaking structural checks for observed truth."""

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
        Contract.__post_init__(self)
        text(self.lifecycle_state, "lifecycle_state")
        transaction = self.semantic_transaction_state
        staged = {
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
        authorized = staged - {
            SemanticTransactionState.SHACL_VALIDATED,
            SemanticTransactionState.EVIDENCE_BOUND,
            SemanticTransactionState.POLICY_EVALUATED,
        }
        if transaction in staged:
            require(
                self.shacl_state is ShaclState.CONFORMS,
                "semantic transaction requires SHACL CONFORMS",
            )
        if transaction in authorized:
            require(
                self.cgrf_action_state
                in {
                    CgrfActionState.AUTHORIZED,
                    CgrfActionState.RESERVED,
                    CgrfActionState.EXECUTING,
                    CgrfActionState.MUTATED_UNVERIFIED,
                    CgrfActionState.VERIFYING,
                    CgrfActionState.VERIFIED,
                    CgrfActionState.WATCH,
                },
                "semantic transaction requires authorized CGRF state",
            )
        if (
            self.evidence_state is EvidenceState.VERIFIED
            or self.cgrf_action_state is CgrfActionState.VERIFIED
        ):
            require(self.tevv_state is TevvState.PASS, "VERIFIED requires TEVV PASS")
        if transaction in {
            SemanticTransactionState.VERIFIED,
            SemanticTransactionState.CANONICALIZED,
        }:
            require(
                self.evidence_state is EvidenceState.VERIFIED
                and self.cgrf_action_state is CgrfActionState.VERIFIED
                and self.tevv_state is TevvState.PASS,
                "verified transaction requires VERIFIED evidence, CGRF VERIFIED and TEVV PASS",
            )
        if transaction is SemanticTransactionState.CANONICALIZED:
            require(
                self.merkle_state
                in {
                    MerkleState.ROOTED,
                    MerkleState.ATTESTED,
                    MerkleState.INCLUSION_PROVEN,
                },
                "canonical transaction requires a current Merkle root",
            )
        if (
            self.causal_state is CausalState.VERIFIED_CAUSE
            or self.corpus_use_state is CorpusUseState.VERIFIED_FOR_CITADEL
        ):
            require(
                self.evidence_state is EvidenceState.VERIFIED
                and self.tevv_state is TevvState.PASS,
                "verified causal/corpus state requires VERIFIED evidence and TEVV PASS",
            )

    def axis_value(self, axis: StateAxis) -> AxisState:
        """Return the value of one explicit state axis."""
        require(type(axis) is StateAxis, "axis must be StateAxis")
        return cast(AxisState, getattr(self, axis.value))


@dataclass(frozen=True, slots=True)
class Provenance(Contract):
    """Preserve derivation and context without substituting parser version for origin."""

    derived_from: tuple[SemanticId, ...]
    parser_version: str | None = None
    extractor_version: str | None = None
    context_root: ContextRoot | None = None
    semantic_root: SemanticRoot | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(bool(self.derived_from), "provenance requires source references")
        require(
            len(set(self.derived_from)) == len(self.derived_from),
            "duplicate provenance reference",
        )
        for value in (self.parser_version, self.extractor_version):
            if value is not None:
                text(value, "provenance version")


@dataclass(frozen=True, slots=True)
class Ownership(Contract):
    """Name accountable identities."""

    owner: SemanticId
    guild: SemanticId | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.guild is not None:
            self.guild.require_namespace("guild")


@dataclass(frozen=True, slots=True)
class Authority(Contract):
    """Declare the required consequence tier; this field grants no authority."""

    required_tier: AuthorityTier
    mutability: Literal["immutable", "versioned", "governed"]


@dataclass(frozen=True, slots=True)
class Runtime(Contract):
    """Attach measured runtime standing and addressable telemetry."""

    observed_status: str | None = None
    telemetry_refs: tuple[SemanticId, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.observed_status is not None:
            text(self.observed_status, "runtime.observed_status")
            require(bool(self.telemetry_refs), "runtime status requires telemetry")


@dataclass(frozen=True, slots=True)
class Documentation(Contract):
    """Attach exact versioned document sections."""

    references: tuple[SemanticId, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            all(r.scheme == "doc" for r in self.references),
            "documentation requires versioned doc references",
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class CanonicalObjectEnvelope(Contract):
    """Carry section 44 fields and the typed receipts supporting their declared states."""

    semantic_id: SemanticId
    object_type: EntityType
    schema_version: Literal["2"]
    source: Source
    valid_time: ValidTime
    observed_time: datetime | None
    state: ObjectState
    claims: tuple[Mapping[str, object], ...]
    relations: tuple[Relation, ...]
    provenance: Provenance
    merkle: MerkleBinding
    ownership: Ownership
    authority: Authority
    runtime: Runtime
    documentation: Documentation
    evidence: tuple[EvidenceReference, ...] = ()
    shacl: ShaclValidationResult | None = None
    tevv: TevvResult | None = None
    verification: VerificationReceipt | None = None
    policy: PolicyDecisionReceipt | None = None
    causal: CausalSupport | None = None
    corpus: CorpusValidation | None = None

    @property
    def subject(self) -> SubjectRef:
        """Return the exact identity/revision all evidence must concern."""
        return SubjectRef(self.semantic_id, self.source.version)

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        subject = self.subject
        self.semantic_id.require_entity_type(self.object_type)
        require(
            self.authority.required_tier is self.state.authority_tier,
            "envelope authority tier disagrees with state",
        )
        require(
            all(
                r.source == subject and r.source_type is self.object_type
                for r in self.relations
            ),
            "relation source/type/version differs from enclosing object",
        )
        self.merkle.validate_state(self.state.merkle_state, subject)
        measured = self.state.evidence_state not in {
            EvidenceState.UNMEASURED,
            EvidenceState.QUARANTINED,
            EvidenceState.RETIRED,
            EvidenceState.SUPERSEDED,
        }
        validate_evidence(self.evidence, subject, required=measured)
        if measured:
            require(
                self.observed_time is not None, "measured object requires observed_time"
            )
        if self.observed_time is not None:
            require(
                all(e.observed_at <= self.observed_time for e in self.evidence),
                "object cites future evidence",
            )
        for receipt in (
            self.shacl,
            self.tevv,
            self.verification,
            self.policy,
            self.causal,
            self.corpus,
        ):
            if receipt is not None:
                require(
                    receipt.subject == subject,
                    "envelope receipt subject/version mismatch",
                )
        if self.state.shacl_state is not ShaclState.NOT_EVALUATED:
            require(
                self.shacl is not None and self.shacl.state is self.state.shacl_state,
                "SHACL state requires matching result",
            )
        if self.shacl is not None:
            require(
                self.shacl.state is self.state.shacl_state,
                "SHACL result disagrees with state",
            )
        if self.state.tevv_state is not TevvState.NOT_TESTED:
            require(
                self.tevv is not None and self.tevv.state is self.state.tevv_state,
                "TEVV state requires matching result",
            )
        if self.tevv is not None:
            require(
                self.tevv.state is self.state.tevv_state,
                "TEVV result disagrees with state",
            )
        if self.verification is not None:
            require(
                self.verification.result == self.tevv,
                "verification result differs from envelope TEVV",
            )
        if (
            self.state.evidence_state is EvidenceState.VERIFIED
            or self.state.cgrf_action_state is CgrfActionState.VERIFIED
        ):
            require(
                self.verification is not None,
                "VERIFIED requires a verification receipt",
            )
            assert self.verification is not None
            self.verification.require_pass(subject)
            require(
                all(e in self.verification.result.evidence for e in self.evidence),
                "verified object contains unchecked evidence",
            )
            require(
                self.verification.policy.tier is self.authority.required_tier,
                "verification authority tier differs from envelope",
            )
        if self.policy is not None:
            require(
                self.policy.tier is self.authority.required_tier,
                "policy tier differs from envelope authority",
            )
            if self.verification is not None:
                require(
                    self.verification.policy == self.policy,
                    "verification policy differs from envelope policy",
                )
        if self.state.cgrf_action_state in {
            CgrfActionState.AUTHORIZED,
            CgrfActionState.RESERVED,
            CgrfActionState.EXECUTING,
            CgrfActionState.MUTATED_UNVERIFIED,
            CgrfActionState.VERIFYING,
            CgrfActionState.VERIFIED,
            CgrfActionState.WATCH,
            CgrfActionState.ROLLBACK_REQUIRED,
            CgrfActionState.ROLLED_BACK,
        }:
            require(
                self.policy is not None and self.policy.allowed,
                "governed state requires policy allow",
            )
        if self.state.cgrf_action_state is CgrfActionState.DENIED:
            require(
                self.policy is not None and not self.policy.allowed,
                "DENIED requires a policy denial",
            )
        if self.causal is not None:
            require(
                self.causal.state is self.state.causal_state,
                "causal support disagrees with state",
            )
        if self.state.causal_state is not CausalState.TEMPORAL_ONLY:
            require(self.causal is not None, "causal state requires scoped support")
        if self.corpus is not None:
            require(
                self.corpus.state is self.state.corpus_use_state,
                "corpus validation disagrees with state",
            )
        if self.state.corpus_use_state is not CorpusUseState.DISCOVERY_ONLY:
            require(
                self.corpus is not None,
                "corpus use requires bounded validation metadata",
            )


@dataclass(frozen=True, slots=True)
class EventSubject(Contract):
    """Identify an event's typed, versioned subject."""

    type: EntityType
    id: SemanticId
    version: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.id.require_entity_type(self.type)
        text(self.version, "event subject version")

    @property
    def reference(self) -> SubjectRef:
        """Return the versioned evidence subject."""
        return SubjectRef(self.id, self.version)


@dataclass(frozen=True, slots=True)
class EventContext(Contract):
    """Preserve optional lineage and replay context with distinct root types."""

    persona_id: SemanticId | None = None
    release_sha: str | None = None
    trace_id: str | None = None
    mission_id: SemanticId | None = None
    context_root: ContextRoot | None = None
    semantic_epoch: SemanticId | None = None
    correlation_id: str | None = None
    parent_op_id: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.release_sha is not None:
            SourceRevision(self.release_sha)
        if self.semantic_epoch is not None:
            self.semantic_epoch.require_namespace("epoch")
        for value in (self.trace_id, self.correlation_id, self.parent_op_id):
            if value is not None:
                text(value, "event context identifier")


@dataclass(frozen=True, slots=True)
class EventEvidence(Contract):
    """Bind event evidence standing to an addressable source and optional verdict."""

    evidence_id: SemanticId
    state: EvidenceState
    reference: EvidenceReference
    verification: VerificationReceipt | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.evidence_id == self.reference.evidence_id, "event evidence ID mismatch"
        )
        if self.verification is not None:
            require(
                self.verification.subject == self.reference.subject,
                "event verification subject/version mismatch",
            )
        if self.state is EvidenceState.VERIFIED:
            require(
                self.verification is not None,
                "VERIFIED event requires a verification receipt",
            )
            assert self.verification is not None
            self.verification.require_pass(self.reference.subject)
            require(
                self.reference in self.verification.result.evidence,
                "event evidence is absent from verification",
            )


@dataclass(frozen=True, slots=True, kw_only=True)
class CanonicalEventEnvelope(Contract):
    """Carry section 45 fields with schema and event-subject consistency checks."""

    id: SemanticId
    type: str
    version: Literal["2"]
    tenant_id: str
    occurred_at: datetime
    subject: EventSubject
    context: EventContext
    data: Mapping[str, object]
    evidence: EventEvidence

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.id.require_namespace("event")
        text(self.type, "event type")
        text(self.tenant_id, "tenant_id")
        require(
            self.subject.reference == self.evidence.reference.subject,
            "event evidence subject/version mismatch",
        )
        require(
            self.evidence.reference.observed_at <= self.occurred_at,
            "event cites future evidence",
        )
        if self.evidence.verification is not None:
            require(
                self.evidence.verification.result.evaluated_at <= self.occurred_at,
                "event predates verification",
            )
        if self.type.endswith(".verified"):
            require(
                self.evidence.state is EvidenceState.VERIFIED,
                "verified event type requires VERIFIED evidence",
            )
