# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/verification.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/common.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/promotions.py, libs/semantic_twin/receipts.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/promotions.py; DEPENDS_ON libs/semantic_twin/receipts.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# Intent:      Require typed independent receipts plus caller-pinned evidence before accepting capability claims.
# ───────────────────────────────────────────────────────────────

"""Apply the existing promotion kernel and an explicit receiving trust boundary."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from libs.evolution.common import digest, unique
from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier, EvidenceState, TevvState


@dataclass(frozen=True, slots=True)
class ReviewPolicy(Contract):
    """Pin receipts authenticated by a receiving process, never by imported claims."""

    policy_id: SemanticId
    policy_version: str
    verifiers: tuple[SemanticId, ...]
    receipt_digests: tuple[ContentDigest, ...]
    max_age_seconds: int = 604800

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        self.policy_id.require_namespace("policy")
        text(self.policy_version, "review policy version")
        require(bool(self.verifiers), "review requires explicit independent verifiers")
        unique(tuple(str(v) for v in self.verifiers), "verifier")
        require(
            len(set(self.receipt_digests)) == len(self.receipt_digests),
            "duplicate receipt pin",
        )
        require(1 <= self.max_age_seconds <= 31_536_000, "invalid review lifetime")


def require_review(
    receipt: VerificationReceipt,
    subject: SubjectRef,
    policy: ReviewPolicy,
    *,
    at: datetime,
    tier: AuthorityTier,
    checks: tuple[str, ...],
    sources: tuple[SemanticId, ...],
    since: datetime,
) -> None:
    """Validate independent TEVV, exact evidence sources and externally supplied pins."""
    proof = PromotionProof(
        subject=subject,
        evidence=receipt.result.evidence,
        verification=receipt,
        tevv=receipt.result,
    )
    proof.validate_for(EvidenceState.TESTING, EvidenceState.VERIFIED)
    proof.validate_for(TevvState.TESTING, TevvState.PASS)
    require(
        ContentDigest(digest(receipt)) in policy.receipt_digests,
        "receipt has no authenticated content pin",
    )
    require(
        receipt.policy.policy_id == policy.policy_id
        and receipt.policy.policy_version == policy.policy_version,
        "review policy mismatch",
    )
    require(receipt.result.verifier_id in policy.verifiers, "untrusted verifier")
    receipt.policy.require_allow(
        subject, receipt.result.actor_id, tier, (subject.semantic_id,)
    )
    require(
        since <= receipt.result.evaluated_at <= at
        and 0
        <= (at - receipt.result.evaluated_at).total_seconds()
        <= policy.max_age_seconds,
        "future, stale or premature review",
    )
    require(
        all(since <= e.observed_at <= at for e in receipt.result.evidence),
        "review uses stale or future evidence",
    )
    if receipt.policy.grant is not None:
        require(
            receipt.result.evaluated_at < receipt.policy.grant.expires_at,
            "review used expired authority",
        )
        if tier is AuthorityTier.A3:
            require(
                at < receipt.policy.grant.expires_at,
                "publication or A3 consent has expired",
            )
    evidence = {e.evidence_id: e.source for e in receipt.result.evidence}
    required = set(sources)
    require(
        bool(required) and required <= set(evidence.values()),
        "review omits bound artifacts",
    )
    results = {c.name: c for c in receipt.result.checks}
    require(set(checks) <= set(results), "review omits required checks")
    for name in checks:
        require(
            required <= {evidence[e] for e in results[name].evidence_ids},
            "review check does not cover exact artifacts",
        )
