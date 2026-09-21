# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/economics.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/models.py, libs/capability_tokens/passport.py, libs/capability_tokens/verification.py, libs/evolution/common.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/receipts.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/passport.py; DEPENDS_ON libs/capability_tokens/verification.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/receipts.py
# Intent:      Calculate conserved royalty accruals from reviewed outcomes without moving money or inventing measured revenue.
# ───────────────────────────────────────────────────────────────

"""Calculate local capability economics in integer currency units without payment effects."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from libs.evolution.common import digest
from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.receipts import VerificationReceipt

from .models import ImplementationBinding, TokenBundle
from .passport import MeteredCall, validated_calls
from .verification import ReviewPolicy, require_review


@dataclass(frozen=True, slots=True)
class Adjustment(Contract):
    """Retain an independently reviewed refund or void against one metered result."""

    adjustment_id: str
    scope_id: str
    binding: ImplementationBinding
    call_id: str
    amount_minor: int
    currency: str
    occurred_at: datetime
    reason: Literal["refund", "void"]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.adjustment_id, "adjustment ID")
        text(self.call_id, "adjustment call ID")
        require(self.amount_minor > 0, "adjustment must be positive")

    @property
    def subject(self) -> SubjectRef:
        """Bind independent review to the exact financial adjustment."""
        return SubjectRef(
            SemanticId(
                "cni://receipt/capability-adjustment/"
                + digest((self.scope_id, self.adjustment_id))
            ),
            digest(self),
        )

    @property
    def source_id(self) -> SemanticId:
        """Address the retained adjustment for the receiving reviewer."""
        return SemanticId("cni://event/capability-adjustment/" + digest(self))


@dataclass(frozen=True, slots=True)
class ReviewedAdjustment(Contract):
    """Separate a proposed accounting correction from its independent review."""

    adjustment: Adjustment
    verification: VerificationReceipt


def settlement(
    bundle: TokenBundle,
    implementation: str,
    calls: tuple[MeteredCall, ...],
    adjustments: tuple[ReviewedAdjustment, ...],
    policy: ReviewPolicy,
    *,
    scope_id: str,
    at: datetime,
) -> dict[str, object]:
    """Compute an accrual estimate, conserving royalties and exposing every missing cost."""
    retained = validated_calls(
        bundle, implementation, calls, policy, scope_id=scope_id, at=at
    )
    pricing = bundle.token.pricing
    earned = {
        c.observation.call_id: c
        for c in retained
        if c.verification is not None and c.observation.outcome == "SUCCEEDED"
    }
    refunds: dict[str, int] = {}
    seen: dict[str, ReviewedAdjustment] = {}
    for item in adjustments:
        adj = item.adjustment
        if adj.adjustment_id in seen:
            require(seen[adj.adjustment_id] == item, "conflicting adjustment retry")
            continue
        require(
            adj.scope_id == scope_id
            and adj.binding == bundle.token.binding(implementation),
            "adjustment scope or implementation mismatch",
        )
        require(
            adj.currency == pricing.currency and adj.call_id in earned,
            "unearned or foreign-currency refund",
        )
        call = earned[adj.call_id]
        require(
            call.observation.finished_at <= adj.occurred_at <= at,
            "adjustment time mismatch",
        )
        require_review(
            item.verification,
            adj.subject,
            policy,
            at=at,
            tier=bundle.token.authority.tier,
            checks=("settlement.adjustment",),
            sources=(adj.source_id,),
            since=adj.occurred_at,
        )
        refunds[adj.call_id] = refunds.get(adj.call_id, 0) + adj.amount_minor
        require(
            refunds[adj.call_id] <= pricing.price_minor, "refund exceeds earned amount"
        )
        seen[adj.adjustment_id] = item
    gross = len(earned) * pricing.price_minor
    refund = sum(refunds.values())
    net = gross - refund
    shares = {
        str(a.creator_id): net * a.basis_points // 10000 for a in pricing.attributions
    }
    creator_total = sum(shares.values())
    retained_minor = net - creator_total
    cost_count = sum(c.observation.cost_minor is not None for c in retained)
    observed_cost = sum(c.observation.cost_minor or 0 for c in retained)
    complete_cost = observed_cost if cost_count == len(retained) and retained else None
    result: dict[str, object] = {
        "schema_version": "cnwb.capability-settlement/v1",
        "status": "ACCRUAL_ESTIMATE_NO_FUNDS_MOVED",
        "scope_id": scope_id,
        "binding": bundle.token.binding(implementation).to_dict(),
        "calculated_at": at.isoformat(),
        "currency": pricing.currency,
        "metered_calls": len(retained),
        "verified_units": len(earned),
        "gross_minor": gross,
        "refund_minor": refund,
        "net_minor": net,
        "creator_royalties_minor": shares,
        "retained_minor": retained_minor,
        "cost_observations": cost_count,
        "observed_cost_minor": observed_cost,
        "complete_cost_minor": complete_cost,
        "cost_per_verified_result": {
            "numerator_minor": complete_cost,
            "denominator": len(earned),
            "measured": complete_cost is not None and bool(earned),
        },
        "contribution_minor": net - complete_cost
        if complete_cost is not None
        else None,
        "operator_profit_minor": retained_minor - complete_cost
        if complete_cost is not None
        else None,
        "actual_revenue_minor": None,
        "evidence_root": digest((retained, tuple(seen[k] for k in sorted(seen)))),
    }
    result["statement_digest"] = digest(result)
    return result
