# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/semantic_twin/promotions.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/receipts.py, libs/semantic_twin/transactions.py, libs/semantic_twin/vocabulary.py
# EnumType:    Schema
# EnumEdges:   DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/receipts.py; DEPENDS_ON libs/semantic_twin/transactions.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# DAG Node:    semantic-twin.phase-0.promotions
# Intent:      Bind every privileged state promotion to its required typed evidence without treating caller booleans as verification.
# ───────────────────────────────────────────────────────────────

"""Check structural promotion prerequisites; authenticate receipts outside this package."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .contracts import Contract, require
from .identity import SemanticId, SubjectRef
from .merkle import MerkleBinding
from .receipts import (
    CausalSupport,
    CorpusValidation,
    EvidenceReference,
    ShaclValidationResult,
    TevvResult,
    VerificationReceipt,
    validate_evidence,
)
from .transactions import SemanticTransaction
from .vocabulary import (
    CausalState,
    CgrfActionState,
    CorpusUseState,
    EvidenceState,
    MerkleState,
    SemanticTransactionState as S,
    ShaclState,
    TevvState,
)


@dataclass(frozen=True, slots=True, kw_only=True)
class PromotionProof(Contract):
    """Collect addressable prerequisite receipts for one exact subject revision."""

    subject: SubjectRef
    evidence: tuple[EvidenceReference, ...]
    verification: VerificationReceipt | None = None
    shacl: ShaclValidationResult | None = None
    tevv: TevvResult | None = None
    merkle: MerkleBinding | None = None
    causal: CausalSupport | None = None
    corpus: CorpusValidation | None = None
    transaction: SemanticTransaction | None = None
    reservation: SemanticId | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        validate_evidence(self.evidence, self.subject)
        for receipt in (
            self.verification,
            self.shacl,
            self.tevv,
            self.causal,
            self.corpus,
            self.transaction,
        ):
            if receipt is not None:
                require(
                    receipt.subject == self.subject,
                    "promotion receipt subject/version mismatch",
                )
        if self.verification is not None:
            require(
                all(e in self.evidence for e in self.verification.result.evidence),
                "promotion omits verification evidence",
            )
            if self.tevv is not None:
                require(
                    self.tevv == self.verification.result,
                    "promotion TEVV differs from verification",
                )
        if self.transaction is not None:
            if self.verification is not None:
                require(
                    self.transaction.verification == self.verification,
                    "promotion transaction verification mismatch",
                )
            if self.shacl is not None:
                require(
                    self.transaction.shacl == self.shacl,
                    "promotion transaction SHACL mismatch",
                )
        if self.causal is not None:
            require(
                all(
                    e in self.evidence
                    for e in (
                        *self.causal.evidence,
                        *self.causal.temporal_evidence,
                        *self.causal.experiments,
                    )
                ),
                "promotion omits causal evidence",
            )
        if self.corpus is not None and self.corpus.experiment is not None:
            require(
                self.corpus.experiment in self.evidence,
                "promotion omits bounded corpus experiment",
            )

    def require_verification(self, *, direct: bool = False) -> None:
        """Require independent PASS under the bound policy."""
        require(
            self.verification is not None, "promotion requires a verification receipt"
        )
        assert self.verification is not None
        self.verification.require_pass(self.subject, direct=direct)

    def validate_for(self, current: Enum, target: Enum) -> None:
        """Check the receipt type and verdict needed for one scalar state change."""
        if type(target) is EvidenceState and target is EvidenceState.VERIFIED:
            self.require_verification(direct=current is EvidenceState.OBSERVED)
        elif type(target) is ShaclState:
            require(
                self.shacl is not None and self.shacl.state is target,
                "SHACL promotion requires matching validation result",
            )
        elif type(target) is MerkleState:
            require(self.merkle is not None, "Merkle promotion requires metadata")
            assert self.merkle is not None
            self.merkle.validate_state(target, self.subject)
        elif type(target) is TevvState:
            require(
                self.tevv is not None and self.tevv.state is target,
                "TEVV promotion requires matching test result",
            )
            if target is TevvState.PASS:
                self.require_verification()
        elif type(target) is CausalState:
            require(
                self.causal is not None and self.causal.state is target,
                "causal promotion requires staged causal support",
            )
        elif type(target) is CorpusUseState:
            require(
                self.corpus is not None and self.corpus.state is target,
                "corpus promotion requires scoped Citadel validation",
            )
        elif type(target) is S:
            require(
                self.transaction is not None and self.transaction.state is target,
                "semantic promotion requires matching full transaction",
            )
        elif type(target) is CgrfActionState:
            self._validate_action(target)

    def _validate_action(self, target: CgrfActionState) -> None:
        required = {
            CgrfActionState.DENIED: {S.REJECTED},
            CgrfActionState.AUTHORIZED: {S.AUTHORIZED},
            CgrfActionState.RESERVED: {S.AUTHORIZED},
            CgrfActionState.EXECUTING: {S.EXECUTING},
            CgrfActionState.MUTATED_UNVERIFIED: {S.MUTATED_UNVERIFIED},
            CgrfActionState.VERIFYING: {S.VERIFYING},
            CgrfActionState.VERIFIED: {S.VERIFIED, S.CANONICALIZED},
            CgrfActionState.WATCH: {S.WATCH},
            CgrfActionState.ROLLED_BACK: {S.ROLLED_BACK},
            CgrfActionState.SUPERSEDED: {S.SUPERSEDED},
        }
        if target in required:
            require(
                self.transaction is not None
                and self.transaction.state in required[target],
                "CGRF promotion requires a matching governed transaction",
            )
        if target is CgrfActionState.DENIED:
            require(
                self.transaction is not None
                and self.transaction.policy is not None
                and not self.transaction.policy.allowed,
                "DENIED requires a policy denial",
            )
        if target is CgrfActionState.RESERVED:
            require(
                self.reservation is not None,
                "RESERVED requires a reservation reference",
            )


def requires_proof(target: Enum) -> bool:
    """Identify transitions that must carry typed receipts beyond a scalar edge."""
    if type(target) is EvidenceState:
        return target is EvidenceState.VERIFIED
    if type(target) is CgrfActionState:
        return target not in {
            CgrfActionState.OBSERVED,
            CgrfActionState.PROPOSED,
            CgrfActionState.POLICY_EVALUATING,
            CgrfActionState.FAILED_CLOSED,
            CgrfActionState.ROLLBACK_REQUIRED,
        }
    return isinstance(
        target, (ShaclState, MerkleState, TevvState, S, CausalState, CorpusUseState)
    )
