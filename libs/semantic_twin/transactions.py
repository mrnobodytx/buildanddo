# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/transactions.py
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
# DAG Node:    semantic-twin.phase-0.transactions
# Intent:      Freeze governed semantic transactions with exact authority, execution, independent verification and compensation boundaries.
# ───────────────────────────────────────────────────────────────

"""Describe sections 27 and 33 without executing actions or granting authority."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from .contracts import Contract, require, text
from .identity import SemanticId, SubjectRef
from .merkle import ContextRoot, SemanticRoot, SourceRevision, SourceRoot
from .receipts import (
    ActorType,
    EvidenceKind,
    EvidenceReference,
    ExecutionOutcome,
    ExecutionReceipt,
    PolicyDecisionReceipt,
    ShaclValidationResult,
    VerificationReceipt,
    validate_evidence,
)
from .relations import Relation
from .vocabulary import AuthorityTier, SemanticTransactionState as S, ShaclState


@dataclass(frozen=True, slots=True)
class Actor(Contract):
    """Name the accountable actor and optional persona."""

    actor_id: SemanticId
    actor_type: ActorType
    persona: SemanticId | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.persona is not None:
            self.persona.require_namespace("persona")


@dataclass(frozen=True, slots=True)
class TransactionIntent(Contract):
    """Bind an intended change to explicit target revisions and an objective."""

    change: str
    targets: tuple[SubjectRef, ...]
    objective_id: SemanticId
    mission_id: SemanticId

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.change, "intent.change")
        self.objective_id.require_namespace("objective")
        self.mission_id.require_namespace("mission")
        require(bool(self.targets), "intent requires explicit targets")
        require(
            len({t.semantic_id for t in self.targets}) == len(self.targets),
            "duplicate transaction target",
        )


@dataclass(frozen=True, slots=True)
class StateRoots(Contract):
    """Distinguish semantic meaning, source bytes and context at a boundary."""

    semantic_root: SemanticRoot
    source_root: SourceRoot
    context_root: ContextRoot


@dataclass(frozen=True, slots=True)
class ChangeProposal(Contract):
    """Preserve typed graph additions and removals before any graph mutation."""

    add: tuple[Relation, ...] = ()
    remove: tuple[Relation, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            bool(self.add or self.remove), "proposal requires an addition or removal"
        )
        keys = [
            (r.source, r.predicate, r.target, r.target_version)
            for r in (*self.add, *self.remove)
        ]
        require(len(set(keys)) == len(keys), "duplicate or conflicting proposed edge")


@dataclass(frozen=True, slots=True)
class CompensationPlan(Contract):
    """Specify reversal or compensation and the postconditions proving it worked."""

    action: str
    target_ids: tuple[SemanticId, ...]
    postconditions: tuple[str, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.action, "compensation action")
        require(
            bool(self.target_ids) and len(set(self.target_ids)) == len(self.target_ids),
            "compensation requires explicit unique targets",
        )
        require(bool(self.postconditions), "compensation requires postconditions")
        for condition in self.postconditions:
            text(condition, "compensation postcondition")


@dataclass(frozen=True, slots=True, kw_only=True)
class ChangeContract(Contract):
    """Freeze every section 27.4 action field without evaluating policy."""

    operation_id: str
    correlation_id: str
    parent_op_id: str | None
    objective_id: SemanticId
    mission_id: SemanticId
    actor_id: SemanticId
    actor_type: ActorType
    executor_id: SemanticId
    verifier_id: SemanticId
    authority_tier: AuthorityTier
    policy_version: str
    target_ids: tuple[SemanticId, ...]
    tool_or_adapter: str
    requested_action: str
    reason: str
    input_evidence: tuple[EvidenceReference, ...]
    preconditions: tuple[str, ...]
    postconditions: tuple[str, ...]
    forbidden_side_effects: tuple[str, ...]
    rollback_or_compensation: CompensationPlan | None
    expected_outputs: tuple[str, ...]
    semantic_transaction_id: SemanticId
    source_sha: str
    context_root: ContextRoot
    requested_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.semantic_transaction_id.require_namespace("transaction")
        self.objective_id.require_namespace("objective")
        self.mission_id.require_namespace("mission")
        SourceRevision(self.source_sha)
        for value in (
            self.operation_id,
            self.correlation_id,
            self.policy_version,
            self.tool_or_adapter,
            self.requested_action,
            self.reason,
        ):
            text(value, "change contract field")
        if self.parent_op_id is not None:
            text(self.parent_op_id, "parent_op_id")
            require(
                self.parent_op_id != self.operation_id, "operation cannot parent itself"
            )
        require(
            bool(self.target_ids) and len(set(self.target_ids)) == len(self.target_ids),
            "change requires explicit unique targets",
        )
        require(
            self.authority_tier is not AuthorityTier.A0, "A0 cannot authorize a change"
        )
        require(
            self.verifier_id not in (self.actor_id, self.executor_id),
            "change requires a verifier independent of actor and executor",
        )
        for values in (self.preconditions, self.postconditions, self.expected_outputs):
            require(
                bool(values) and len(set(values)) == len(values),
                "change requires unique conditions and expected outputs",
            )
        for value in (
            *self.preconditions,
            *self.postconditions,
            *self.expected_outputs,
            *self.forbidden_side_effects,
        ):
            text(value, "change condition")
        require(bool(self.input_evidence), "change requires input evidence")
        require(
            all(e.observed_at <= self.requested_at for e in self.input_evidence),
            "change cites future input evidence",
        )
        if self.authority_tier in (AuthorityTier.A2, AuthorityTier.A3):
            require(
                self.rollback_or_compensation is not None,
                "A2/A3 requires rollback or compensation",
            )
        if self.rollback_or_compensation is not None:
            require(
                set(self.rollback_or_compensation.target_ids) <= set(self.target_ids),
                "compensation exceeds authorized targets",
            )


@dataclass(frozen=True, slots=True)
class RollbackReceipt(Contract):
    """Preserve the original failed outcome alongside verified compensation."""

    receipt_id: SemanticId
    transaction: SubjectRef
    failed_execution: ExecutionReceipt
    compensation: ExecutionReceipt
    verification: VerificationReceipt
    reason: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.receipt_id.require_namespace("receipt", "rollback")
        text(self.reason, "rollback reason")
        require(
            self.failed_execution.subject == self.transaction,
            "rollback original transaction mismatch",
        )
        require(
            self.compensation.subject != self.transaction,
            "compensation must have its own subject/revision",
        )
        require(
            self.compensation.operation_id != self.failed_execution.operation_id,
            "compensation must have its own operation",
        )
        require(
            self.compensation.outcome is ExecutionOutcome.MUTATED,
            "compensation requires completed mutation",
        )
        require(
            self.compensation.occurred_at >= self.failed_execution.occurred_at,
            "compensation precedes the original execution",
        )
        self.verification.require_pass(self.compensation.subject)
        self.verification.policy.require_allow(
            self.compensation.subject,
            self.verification.result.actor_id,
            self.verification.policy.tier,
            self.verification.policy.target_ids,
            self.compensation.tool_or_adapter,
        )
        require(
            self.verification.policy.evaluated_at <= self.compensation.occurred_at,
            "compensation precedes its authorization",
        )
        if self.verification.policy.grant is not None:
            require(
                self.compensation.occurred_at
                < self.verification.policy.grant.expires_at,
                "compensation uses expired authority",
            )
        require(
            self.verification.result.verifier_id != self.compensation.executor_id,
            "compensation verifier cannot be its executor",
        )
        require(
            self.verification.result.evaluated_at >= self.compensation.occurred_at,
            "rollback verification precedes compensation",
        )
        require(
            any(
                e.kind is EvidenceKind.ROLLBACK
                for e in self.verification.result.evidence
            ),
            "rollback verification requires compensation evidence",
        )


@dataclass(frozen=True, slots=True)
class GraphPromotionReceipt(Contract):
    """Reference an external graph/projection update, never perform one."""

    receipt_id: SemanticId
    subject: SubjectRef
    semantic_root: SemanticRoot
    epoch_id: SemanticId
    projections: tuple[SemanticId, ...]
    recorded_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.receipt_id.require_namespace("receipt")
        self.epoch_id.require_namespace("epoch")
        require(
            bool(self.projections), "graph promotion requires projection references"
        )


@dataclass(frozen=True, slots=True, kw_only=True)
class SemanticTransaction(Contract):
    """Represent the complete section 33 transaction and its stage prerequisites."""

    schema_version: Literal["2"]
    transaction_id: SemanticId
    revision: str
    actor: Actor
    intent: TransactionIntent
    before: StateRoots
    proposal: ChangeProposal
    state: S
    shacl: ShaclValidationResult | None = None
    authority: ChangeContract | None = None
    policy: PolicyDecisionReceipt | None = None
    evidence: tuple[EvidenceReference, ...] = ()
    execution: ExecutionReceipt | None = None
    verification: VerificationReceipt | None = None
    after: StateRoots | None = None
    rollback: RollbackReceipt | None = None
    promotion: GraphPromotionReceipt | None = None
    monitor_refs: tuple[SemanticId, ...] = ()
    reason: str | None = None
    successor_id: SemanticId | None = None

    @property
    def subject(self) -> SubjectRef:
        """Return the transaction revision all stage receipts must bind."""
        return SubjectRef(self.transaction_id, self.revision)

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.transaction_id.require_namespace("transaction")
        text(self.revision, "transaction revision")
        subject = self.subject
        targets = tuple(t.semantic_id for t in self.intent.targets)
        require(
            all(
                r.source in self.intent.targets
                for r in (*self.proposal.add, *self.proposal.remove)
            ),
            "proposal source/version outside transaction targets",
        )
        validate_evidence(self.evidence, subject, required=False)
        for receipt in (
            self.shacl,
            self.policy,
            self.execution,
            self.verification,
            self.promotion,
        ):
            if receipt is not None:
                require(
                    receipt.subject == subject,
                    "transaction receipt subject/version mismatch",
                )
        if self.authority is not None:
            contract = self.authority
            require(
                contract.semantic_transaction_id == self.transaction_id,
                "contract transaction mismatch",
            )
            require(
                contract.actor_id == self.actor.actor_id
                and contract.actor_type is self.actor.actor_type,
                "contract actor mismatch",
            )
            require(
                contract.objective_id == self.intent.objective_id
                and contract.mission_id == self.intent.mission_id,
                "contract objective/mission mismatch",
            )
            require(
                set(contract.target_ids) == set(targets), "contract target mismatch"
            )
            require(
                contract.context_root == self.before.context_root,
                "contract context root mismatch",
            )
            validate_evidence(contract.input_evidence, subject)
            require(
                all(e in self.evidence for e in contract.input_evidence),
                "contract input evidence missing from transaction",
            )
        if self.policy is not None:
            require(self.authority is not None, "policy requires a change contract")
            assert self.authority is not None
            require(
                self.policy.actor_id == self.actor.actor_id
                and self.policy.tier is self.authority.authority_tier,
                "policy actor/tier mismatch",
            )
            require(
                set(self.policy.target_ids) == set(targets),
                "policy target scope mismatch",
            )
            require(
                self.policy.policy_version == self.authority.policy_version,
                "policy version mismatch",
            )
            require(
                self.policy.evaluated_at >= self.authority.requested_at,
                "policy precedes request",
            )
            require(
                {c.name for c in self.policy.preconditions}
                == set(self.authority.preconditions),
                "policy does not evaluate contracted preconditions",
            )
        if self.execution is not None:
            require(
                self.authority is not None and self.policy is not None,
                "execution requires contract and policy",
            )
            assert self.authority is not None and self.policy is not None
            self.policy.require_allow(
                subject,
                self.actor.actor_id,
                self.authority.authority_tier,
                targets,
                self.authority.tool_or_adapter,
            )
            require(
                self.execution.operation_id == self.authority.operation_id,
                "execution operation mismatch",
            )
            require(
                self.execution.executor_id == self.authority.executor_id
                and self.execution.tool_or_adapter == self.authority.tool_or_adapter,
                "execution identity/tool mismatch",
            )
            require(
                self.execution.source.source_sha == self.authority.source_sha,
                "execution source revision mismatch",
            )
            require(
                self.execution.occurred_at >= self.policy.evaluated_at,
                "execution precedes authorization",
            )
            if self.policy.grant is not None:
                require(
                    self.execution.occurred_at < self.policy.grant.expires_at,
                    "execution uses expired authority",
                )
        if self.verification is not None:
            require(
                self.authority is not None and self.execution is not None,
                "verification requires an executed contract",
            )
            assert self.authority is not None and self.execution is not None
            require(
                self.verification.policy == self.policy,
                "verification differs from execution policy",
            )
            require(
                self.verification.result.verifier_id == self.authority.verifier_id,
                "verification uses an unexpected verifier",
            )
            require(
                self.verification.result.evaluated_at >= self.execution.occurred_at,
                "verification precedes execution",
            )
            require(
                {c.name for c in self.verification.result.checks}
                == set(self.authority.postconditions),
                "verification does not cover contracted postconditions",
            )
        ordered = (
            S.DRAFT,
            S.PARSED,
            S.SHACL_VALIDATED,
            S.EVIDENCE_BOUND,
            S.POLICY_EVALUATED,
            S.AUTHORIZED,
            S.EXECUTING,
            S.MUTATED_UNVERIFIED,
            S.VERIFYING,
            S.VERIFIED,
            S.CANONICALIZED,
        )
        stage = ordered.index(self.state) if self.state in ordered else -1
        if stage >= 2 or self.state is S.WATCH:
            require(
                self.shacl is not None and self.shacl.state is ShaclState.CONFORMS,
                "transaction requires SHACL CONFORMS",
            )
        if stage >= 3 or self.state is S.WATCH:
            validate_evidence(self.evidence, subject)
        if stage >= 4 or self.state is S.WATCH:
            require(self.policy is not None, "transaction requires policy evaluation")
        if stage >= 5 or self.state is S.WATCH:
            assert self.policy is not None and self.authority is not None
            self.policy.require_allow(
                subject,
                self.actor.actor_id,
                self.authority.authority_tier,
                targets,
                self.authority.tool_or_adapter,
            )
        if stage >= 6 or self.state in (S.WATCH, S.ROLLED_BACK):
            require(
                self.execution is not None, "transaction requires an execution receipt"
            )
        if stage >= 7 or self.state is S.WATCH:
            require(
                self.execution is not None
                and self.execution.outcome is ExecutionOutcome.MUTATED,
                "transaction requires completed mutation",
            )
        if stage >= 9:
            require(
                self.verification is not None and self.after is not None,
                "verified transaction requires verification and after roots",
            )
            assert self.verification is not None
            self.verification.require_pass(subject)
        if self.state is S.CANONICALIZED:
            require(
                self.promotion is not None,
                "canonical transaction requires graph promotion receipt",
            )
        if self.promotion is not None:
            require(
                self.after is not None
                and self.promotion.semantic_root == self.after.semantic_root,
                "graph promotion root mismatch",
            )
            require(
                self.verification is not None
                and self.promotion.recorded_at >= self.verification.result.evaluated_at,
                "graph promotion predates verification",
            )
            assert self.verification is not None
            self.verification.require_pass(subject)
        if self.state is S.WATCH:
            require(bool(self.monitor_refs), "WATCH requires monitor references")
        if self.state is S.REJECTED:
            require(
                bool(self.reason and self.reason.strip()), "REJECTED requires a reason"
            )
        if self.state is S.SUPERSEDED:
            require(
                self.successor_id is not None
                and self.successor_id != self.transaction_id,
                "SUPERSEDED requires a distinct successor",
            )
            assert self.successor_id is not None
            self.successor_id.require_namespace("transaction")
        if self.state is S.ROLLED_BACK:
            require(
                self.rollback is not None, "ROLLED_BACK requires verified compensation"
            )
        if self.rollback is not None:
            require(
                self.rollback.transaction == subject
                and self.rollback.failed_execution == self.execution,
                "rollback is detached from original execution",
            )
            require(
                self.authority is not None
                and self.authority.rollback_or_compensation is not None,
                "rollback requires a compensation plan",
            )
            assert (
                self.authority is not None
                and self.authority.rollback_or_compensation is not None
            )
            plan = self.authority.rollback_or_compensation
            require(
                {c.name for c in self.rollback.verification.result.checks}
                == set(plan.postconditions),
                "rollback verification omits compensation postconditions",
            )
            require(
                set(self.rollback.verification.policy.target_ids)
                == set(plan.target_ids),
                "rollback exceeds compensation scope",
            )
