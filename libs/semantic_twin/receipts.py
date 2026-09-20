# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/receipts.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-0.receipts
# Intent:      Require addressable, version-bound and independent evidence for promotion without minting external verification.
# ───────────────────────────────────────────────────────────────

"""Model externally produced policy, SHACL, TEVV and causal evidence receipts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .contracts import Contract, require, text
from .identity import SemanticId, SubjectRef
from .merkle import SourceRevision
from .vocabulary import (
    AuthorityTier,
    CausalState,
    CorpusUseState,
    ShaclState,
    StringEnum,
    TevvState,
)


class EvidenceKind(StringEnum):
    """Classify the evidence disciplines required by sections 35 and 37."""

    OBSERVATION = "observation"
    SOURCE = "source"
    STATIC_ANALYSIS = "static_analysis"
    RUNTIME_TRACE = "runtime_trace"
    IMPLEMENTATION = "implementation"
    TEST = "test"
    DETERMINISTIC_PROOF = "deterministic_proof"
    NLI_PROOF = "nli_proof"
    STATISTICAL = "statistical"
    EXPERIMENT = "experiment"
    REPLAY = "replay"
    INTERVENTION = "intervention"
    NEGATIVE_CONTROL = "negative_control"
    MEASUREMENT = "measurement"
    AUTHORIZATION = "authorization"
    EXECUTION = "execution"
    BUILD = "build"
    DEPLOYMENT = "deployment"
    STAGING = "staging"
    RELEASE_CONTINUITY = "release_continuity"
    ROLLBACK = "rollback"


@dataclass(frozen=True, slots=True)
class EvidenceReference(Contract):
    """Identify a measured, version-bound source; dereferencing is outside P0."""

    evidence_id: SemanticId
    subject: SubjectRef
    kind: EvidenceKind
    source: SemanticId
    observed_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.evidence_id.require_namespace("evidence", "receipt")


def validate_evidence(
    evidence: tuple[EvidenceReference, ...],
    subject: SubjectRef,
    *,
    required: bool = True,
) -> None:
    """Require unique evidence IDs bound to the intended subject and version."""
    require(not required or bool(evidence), "evidence references are required")
    require(
        len({r.evidence_id for r in evidence}) == len(evidence), "duplicate evidence ID"
    )
    require(
        all(r.subject == subject for r in evidence), "evidence subject/version mismatch"
    )


class ActorType(StringEnum):
    """Identify the kind of actor named in a governed contract."""

    HUMAN = "human"
    AGENT = "agent"
    SYSTEM = "system"


@dataclass(frozen=True, slots=True)
class AuthorityGrant(Contract):
    """Record an explicit authority grant with target and time bounds."""

    grant_id: SemanticId
    grantor_id: SemanticId
    grantor_type: ActorType
    grantee_id: SemanticId
    tier: AuthorityTier
    target_ids: tuple[SemanticId, ...]
    issued_at: datetime
    expires_at: datetime
    dispatch_reference: SemanticId

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.grant_id.require_namespace("authority")
        require(self.grantor_id != self.grantee_id, "authority cannot be self-granted")
        require(
            bool(self.target_ids) and len(set(self.target_ids)) == len(self.target_ids),
            "grant requires explicit unique targets",
        )
        require(self.expires_at > self.issued_at, "grant expiry must follow issuance")
        if self.tier is AuthorityTier.A3:
            require(
                self.grantor_type is ActorType.HUMAN,
                "A3 requires a human authority grant",
            )


@dataclass(frozen=True, slots=True)
class PolicyDecisionReceipt(Contract):
    """Record an external bounded policy decision, including any direct verifier."""

    decision_id: SemanticId
    subject: SubjectRef
    actor_id: SemanticId
    policy_id: SemanticId
    policy_version: str
    tier: AuthorityTier
    allowed: bool
    target_ids: tuple[SemanticId, ...]
    approved_tools: tuple[str, ...]
    evaluated_at: datetime
    reason: str
    direct_verifier_id: SemanticId | None = None
    grant: AuthorityGrant | None = None
    evidence: tuple[EvidenceReference, ...] = ()
    preconditions: tuple[PostconditionResult, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.decision_id.require_namespace("receipt")
        self.policy_id.require_namespace("policy")
        text(self.policy_version, "policy_version")
        text(self.reason, "policy reason")
        require(
            bool(self.target_ids) and len(set(self.target_ids)) == len(self.target_ids),
            "policy requires unique explicit targets",
        )
        for tool in self.approved_tools:
            text(tool, "approved tool")
        validate_evidence(
            self.evidence, self.subject, required=bool(self.preconditions)
        )
        require(
            all(e.observed_at <= self.evaluated_at for e in self.evidence),
            "policy cites future evidence",
        )
        ids = {e.evidence_id for e in self.evidence}
        require(
            all(set(c.evidence_ids) <= ids for c in self.preconditions),
            "policy precondition cites unbound evidence",
        )
        require(
            len({c.name for c in self.preconditions}) == len(self.preconditions),
            "duplicate policy precondition",
        )
        if self.allowed:
            require(
                all(c.passed for c in self.preconditions),
                "allow cannot conceal failed preconditions",
            )
        if self.grant is not None:
            require(self.grant.grantee_id == self.actor_id, "grant grantee mismatch")
            require(
                int(self.tier.value[1]) <= int(self.grant.tier.value[1]),
                "decision exceeds granted authority",
            )
            require(
                set(self.target_ids) <= set(self.grant.target_ids),
                "decision exceeds grant targets",
            )
            require(
                self.grant.issued_at <= self.evaluated_at < self.grant.expires_at,
                "decision outside grant validity",
            )
        if self.allowed and self.tier is AuthorityTier.A3:
            require(self.grant is not None, "A3 allow requires explicit human grant")

    def require_allow(
        self,
        subject: SubjectRef,
        actor_id: SemanticId,
        tier: AuthorityTier,
        targets: tuple[SemanticId, ...],
        tool: str | None = None,
    ) -> None:
        """Check the decision's exact action, actor, tier and target scope."""
        require(self.allowed, "policy denied the action")
        require(
            self.subject == subject and self.actor_id == actor_id,
            "policy subject/version/actor mismatch",
        )
        require(self.tier is tier, "policy authority tier mismatch")
        require(set(targets) == set(self.target_ids), "policy target scope mismatch")
        if tool is not None:
            require(tool in self.approved_tools, "tool is not approved by policy")


class IssueSeverity(StringEnum):
    """Distinguish advisory shapes from mandatory violations."""

    WARNING = "warning"
    VIOLATION = "violation"


@dataclass(frozen=True, slots=True)
class ShaclIssue(Contract):
    """Preserve an exact shape-validation finding."""

    shape_id: SemanticId
    path: str
    severity: IssueSeverity
    message: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.shape_id.require_namespace("shape")
        text(self.path, "shape path")
        text(self.message, "shape message")


@dataclass(frozen=True, slots=True)
class ShaclValidationResult(Contract):
    """Bind a structural verdict to exact shapes, ontology and object revision."""

    validation_id: SemanticId
    subject: SubjectRef
    state: ShaclState
    shape_ids: tuple[SemanticId, ...]
    ontology_version: str
    validator_id: SemanticId
    evaluated_at: datetime
    issues: tuple[ShaclIssue, ...] = ()
    reason: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.validation_id.require_namespace("receipt", "validation")
        text(self.ontology_version, "ontology_version")
        require(bool(self.shape_ids), "shape IDs are required")
        require(len(set(self.shape_ids)) == len(self.shape_ids), "duplicate shape ID")
        for shape in self.shape_ids:
            shape.require_namespace("shape")
        require(
            all(issue.shape_id in self.shape_ids for issue in self.issues),
            "issue references an unevaluated shape",
        )
        violations = any(i.severity is IssueSeverity.VIOLATION for i in self.issues)
        if self.state is ShaclState.CONFORMS:
            require(not self.issues, "CONFORMS cannot hide shape issues")
        if self.state is ShaclState.WARNING:
            require(
                bool(self.issues) and not violations, "WARNING requires advisories only"
            )
        if self.state is ShaclState.VIOLATES:
            require(violations, "VIOLATES requires a mandatory violation")
        if self.state in (ShaclState.DEFERRED, ShaclState.QUARANTINED):
            require(
                bool(self.reason and self.reason.strip()),
                "deferred/quarantined validation requires a reason",
            )


class VerificationMethod(StringEnum):
    """Record how a verifier reached a bounded result."""

    DETERMINISTIC = "deterministic"
    TEST = "test"
    EXPERIMENT = "experiment"
    REPLAY = "replay"


@dataclass(frozen=True, slots=True)
class PostconditionResult(Contract):
    """Record one required postcondition and its evidence IDs."""

    name: str
    passed: bool
    evidence_ids: tuple[SemanticId, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.name, "postcondition")
        require(bool(self.evidence_ids), "postcondition requires evidence")


@dataclass(frozen=True, slots=True)
class TevvResult(Contract):
    """Record scoped test conditions and independent observation of their outcome."""

    result_id: SemanticId
    subject: SubjectRef
    actor_id: SemanticId
    verifier_id: SemanticId
    policy_version: str
    state: TevvState
    method: VerificationMethod
    evaluated_at: datetime
    evidence: tuple[EvidenceReference, ...]
    checks: tuple[PostconditionResult, ...] = ()
    reason: str | None = None
    monitor_refs: tuple[SemanticId, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.result_id.require_namespace("receipt", "test-run", "evaluation")
        text(self.policy_version, "policy_version")
        validate_evidence(
            self.evidence,
            self.subject,
            required=self.state in (TevvState.PASS, TevvState.FAIL, TevvState.WATCH),
        )
        require(
            all(e.observed_at <= self.evaluated_at for e in self.evidence),
            "TEVV uses evidence from after evaluation",
        )
        ids = {e.evidence_id for e in self.evidence}
        require(
            all(set(c.evidence_ids) <= ids for c in self.checks),
            "postcondition cites unbound evidence",
        )
        require(
            len({c.name for c in self.checks}) == len(self.checks),
            "duplicate postcondition",
        )
        if self.state is TevvState.PASS:
            require(
                bool(self.checks) and all(c.passed for c in self.checks),
                "PASS requires every postcondition to pass",
            )
            require(
                self.actor_id != self.verifier_id,
                "PASS requires an independent verifier",
            )
            required_kind = {
                VerificationMethod.DETERMINISTIC: EvidenceKind.DETERMINISTIC_PROOF,
                VerificationMethod.TEST: EvidenceKind.TEST,
                VerificationMethod.EXPERIMENT: EvidenceKind.EXPERIMENT,
                VerificationMethod.REPLAY: EvidenceKind.REPLAY,
            }[self.method]
            require(
                any(e.kind is required_kind for e in self.evidence),
                "PASS requires evidence for the stated verification method",
            )
        if self.state is TevvState.FAIL:
            require(
                any(not c.passed for c in self.checks),
                "FAIL requires a failed assertion",
            )
        if self.state in (TevvState.HOLD, TevvState.NOT_APPLICABLE):
            require(
                bool(self.reason and self.reason.strip()),
                "HOLD/NOT_APPLICABLE requires a reason",
            )
        if self.state is TevvState.WATCH:
            require(bool(self.monitor_refs), "WATCH requires monitor references")
            require(
                all(c.passed for c in self.checks),
                "WATCH cannot hide failed required postconditions",
            )


@dataclass(frozen=True, slots=True)
class VerificationReceipt(Contract):
    """Tie an independent verdict to the policy and exact measured subject."""

    receipt_id: SemanticId
    subject: SubjectRef
    policy: PolicyDecisionReceipt
    result: TevvResult

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.receipt_id.require_namespace("receipt")
        require(
            self.subject == self.policy.subject == self.result.subject,
            "verification subject/version mismatch",
        )
        require(
            self.policy.actor_id == self.result.actor_id, "verification actor mismatch"
        )
        require(
            self.policy.policy_version == self.result.policy_version,
            "verification policy version mismatch",
        )
        require(
            self.policy.evaluated_at <= self.result.evaluated_at,
            "verification precedes policy evaluation",
        )

    def require_pass(self, subject: SubjectRef, *, direct: bool = False) -> None:
        """Require a bounded PASS; optionally require the policy's deterministic verifier."""
        require(self.subject == subject, "verification subject/version mismatch")
        require(
            self.policy.allowed and self.result.state is TevvState.PASS,
            "verification requires policy allow and TEVV PASS",
        )
        if direct:
            require(
                self.result.method is VerificationMethod.DETERMINISTIC,
                "direct verification must be deterministic",
            )
            require(
                self.policy.direct_verifier_id == self.result.verifier_id,
                "direct verifier must be named by policy",
            )


@dataclass(frozen=True, slots=True)
class CausalSupport(Contract):
    """Preserve section 37 causal promotion prerequisites as typed evidence."""

    subject: SubjectRef
    state: CausalState
    evidence: tuple[EvidenceReference, ...]
    temporal_evidence: tuple[EvidenceReference, ...] = ()
    mechanism: str | None = None
    hypothesis_id: SemanticId | None = None
    confounder_assessment: str | None = None
    alternatives: tuple[str, ...] = ()
    experiments: tuple[EvidenceReference, ...] = ()
    measured_outcome: str | None = None
    contradiction_assessment: str | None = None
    unresolved_contradictions: tuple[SemanticId, ...] = ()
    verification: VerificationReceipt | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        validate_evidence(self.evidence, self.subject)
        for refs in (self.temporal_evidence, self.experiments):
            validate_evidence(refs, self.subject, required=False)
        if self.verification is not None:
            require(
                self.verification.subject == self.subject,
                "causal verification subject/version mismatch",
            )
        promoted = {
            CausalState.CANDIDATE_CAUSE,
            CausalState.HYPOTHESIZED_CAUSE,
            CausalState.EXPERIMENTALLY_SUPPORTED,
            CausalState.VERIFIED_CAUSE,
        }
        if self.state in promoted:
            require(
                bool(
                    self.temporal_evidence and self.mechanism and self.mechanism.strip()
                ),
                "causal candidate requires temporal evidence and mechanism",
            )
            require(
                bool(
                    self.contradiction_assessment
                    and self.contradiction_assessment.strip()
                )
                and not self.unresolved_contradictions,
                "causal promotion requires resolved contradictions",
            )
        if self.state in promoted - {CausalState.CANDIDATE_CAUSE}:
            require(
                self.hypothesis_id is not None
                and bool(
                    self.confounder_assessment and self.confounder_assessment.strip()
                ),
                "causal hypothesis requires hypothesis and confounder assessment",
            )
            assert self.hypothesis_id is not None
            self.hypothesis_id.require_namespace("hypothesis")
        if self.state in (
            CausalState.EXPERIMENTALLY_SUPPORTED,
            CausalState.VERIFIED_CAUSE,
        ):
            require(
                bool(self.experiments)
                and all(
                    e.kind
                    in {
                        EvidenceKind.EXPERIMENT,
                        EvidenceKind.INTERVENTION,
                        EvidenceKind.REPLAY,
                        EvidenceKind.NEGATIVE_CONTROL,
                    }
                    for e in self.experiments
                ),
                "experimental cause requires experiment, intervention, replay or control evidence",
            )
            require(
                bool(self.measured_outcome and self.measured_outcome.strip()),
                "experiment requires measured outcome",
            )
        if self.state is CausalState.VERIFIED_CAUSE:
            require(
                self.verification is not None,
                "verified cause requires independent verification",
            )
            assert self.verification is not None
            self.verification.require_pass(self.subject)
            require(
                all(
                    e in self.verification.result.evidence
                    for e in (
                        *self.evidence,
                        *self.temporal_evidence,
                        *self.experiments,
                    )
                ),
                "causal verification omits supporting observations or experiments",
            )


class ExecutionOutcome(StringEnum):
    """Describe execution progress without claiming semantic success."""

    STARTED = "started"
    MUTATED = "mutated"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class ExecutionReceipt(Contract):
    """Record a bounded executor's actual attempt and its source revision."""

    receipt_id: SemanticId
    operation_id: str
    subject: SubjectRef
    executor_id: SemanticId
    tool_or_adapter: str
    source: SourceRevision
    outcome: ExecutionOutcome
    occurred_at: datetime
    evidence: tuple[EvidenceReference, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.receipt_id.require_namespace("receipt")
        text(self.operation_id, "operation_id")
        text(self.tool_or_adapter, "tool_or_adapter")
        validate_evidence(self.evidence, self.subject)
        require(
            any(e.kind is EvidenceKind.EXECUTION for e in self.evidence),
            "execution receipt requires execution evidence",
        )
        require(
            all(e.observed_at <= self.occurred_at for e in self.evidence),
            "execution cites future evidence",
        )


@dataclass(frozen=True, slots=True)
class CorpusValidation(Contract):
    """Keep external provenance separate from bounded validation in Citadel."""

    subject: SubjectRef
    state: CorpusUseState
    source_repository: SemanticId
    source_license: str
    citadel_target: SemanticId
    hypothesis_id: SemanticId | None = None
    experiment: EvidenceReference | None = None
    verification: VerificationReceipt | None = None
    reason: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.source_repository.scheme == "ext-git",
            "corpus requires source-qualified immutable repository revision",
        )
        text(self.source_license, "source license")
        require(
            self.citadel_target.scheme == "cni",
            "corpus validation requires an explicit Citadel target",
        )
        if self.verification is not None:
            require(
                self.verification.subject == self.subject,
                "corpus verification subject/version mismatch",
            )
        if self.state in {
            CorpusUseState.CITADEL_HYPOTHESIS,
            CorpusUseState.TESTED_IN_CITADEL,
            CorpusUseState.VERIFIED_FOR_CITADEL,
        }:
            require(
                self.hypothesis_id is not None,
                "Citadel use requires an explicit hypothesis",
            )
            assert self.hypothesis_id is not None
            self.hypothesis_id.require_namespace("hypothesis")
        if self.experiment is not None:
            require(
                self.experiment.subject == self.subject,
                "corpus experiment subject/version mismatch",
            )
            require(
                self.experiment.kind in {EvidenceKind.EXPERIMENT, EvidenceKind.TEST},
                "corpus validation requires a bounded test or experiment",
            )
            require(
                self.experiment.source == self.citadel_target,
                "experiment must run against the Citadel target",
            )
        if self.state in {
            CorpusUseState.TESTED_IN_CITADEL,
            CorpusUseState.VERIFIED_FOR_CITADEL,
        }:
            require(
                self.experiment is not None,
                "external observation requires bounded Citadel testing",
            )
        if self.state is CorpusUseState.VERIFIED_FOR_CITADEL:
            require(
                self.verification is not None, "Citadel verification requires a receipt"
            )
            assert self.verification is not None
            self.verification.require_pass(self.subject)
            require(
                self.experiment in self.verification.result.evidence,
                "Citadel verification must cite the bounded experiment",
            )
        if self.state is CorpusUseState.REJECTED_FOR_CITADEL:
            require(
                bool(self.reason and self.reason.strip()),
                "corpus rejection requires a reason",
            )
