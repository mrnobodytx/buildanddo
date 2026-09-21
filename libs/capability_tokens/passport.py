# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/passport.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/models.py, libs/capability_tokens/verification.py, libs/evolution/common.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/receipts.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/verification.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/receipts.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# Intent:      Measure implementation-specific outcomes and costs without treating reports as independent verification.
# ───────────────────────────────────────────────────────────────

"""Derive capability passports from deduplicated execution observations and pinned reviews."""

from __future__ import annotations

import math
from collections import Counter
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from libs.evolution.common import digest
from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest, SourceRevision
from libs.semantic_twin.receipts import VerificationReceipt
from libs.semantic_twin.vocabulary import AuthorityTier

from .models import ImplementationBinding, TokenBundle
from .verification import ReviewPolicy, require_review

FailureClass = Literal[
    "contract",
    "dependency",
    "authorization",
    "timeout",
    "provider",
    "verification",
    "unknown",
]


@dataclass(frozen=True, slots=True, kw_only=True)
class CallObservation(Contract):
    """Capture an actual receiver result, never a local proposal counted as execution."""

    scope_id: str
    call_id: str
    binding: ImplementationBinding
    actor_id: SemanticId
    executor_id: SemanticId
    authority: AuthorityTier
    input_digest: ContentDigest
    result_digest: ContentDigest
    source_sha: str
    sbom_digest: ContentDigest | None
    environment: str
    started_at: datetime
    finished_at: datetime
    outcome: Literal["SUCCEEDED", "FAILED", "HOLD"]
    currency: str
    cost_minor: int | None = None
    failure_class: FailureClass | None = None
    model_calls: int | None = None
    tokens: int | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for value in (self.scope_id, self.call_id, self.environment):
            text(value, "call identity")
        SourceRevision(self.source_sha)
        require(self.finished_at >= self.started_at, "call timestamp reversal")
        require(
            (self.outcome == "FAILED") == (self.failure_class is not None),
            "failure classification mismatch",
        )
        for amount in (self.cost_minor, self.model_calls, self.tokens):
            require(amount is None or amount >= 0, "negative metered amount")

    @property
    def subject(self) -> SubjectRef:
        """Bind outcome review to every input, implementation, scope and measured field."""
        return SubjectRef(
            SemanticId(
                "cni://receipt/capability-call/" + digest((self.scope_id, self.call_id))
            ),
            digest(self),
        )

    @property
    def observation_id(self) -> SemanticId:
        """Address the exact captured result for independent review."""
        return SemanticId("cni://event/capability-call/" + digest(self))

    @property
    def latency_ms(self) -> float:
        """Measure wall time from the retained receiver timestamps."""
        return (self.finished_at - self.started_at).total_seconds() * 1000


@dataclass(frozen=True, slots=True)
class MeteredCall(Contract):
    """Keep a captured result separate from its optional independent verification."""

    observation: CallObservation
    verification: VerificationReceipt | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.verification is not None:
            require(
                self.verification.subject == self.observation.subject,
                "call review revision mismatch",
            )


def validated_calls(
    bundle: TokenBundle,
    implementation: str,
    calls: tuple[MeteredCall, ...],
    policy: ReviewPolicy,
    *,
    scope_id: str,
    at: datetime,
) -> tuple[MeteredCall, ...]:
    """Deduplicate exact retries and reject conflicting, foreign or unauthenticated results."""
    binding = bundle.token.binding(implementation)
    impl = bundle.token.implementation(implementation)
    selected: dict[str, MeteredCall] = {}
    for item in calls:
        obs = item.observation
        require(obs.scope_id == scope_id, "metering cannot cross tenant scope")
        require(
            obs.binding == binding,
            "metering cannot inherit another implementation's results",
        )
        require(
            obs.authority is bundle.token.authority.tier, "metering authority mismatch"
        )
        require(
            obs.source_sha == impl.source_sha
            and obs.sbom_digest == impl.sbom_digest
            and obs.environment in impl.environments,
            "metering compatibility mismatch",
        )
        require(
            obs.currency == bundle.token.pricing.currency, "metering currency mismatch"
        )
        require(obs.finished_at <= at, "future metering result")
        previous = selected.get(obs.call_id)
        if previous is not None:
            require(previous.observation == obs, "conflicting retry observation")
            require(
                previous.verification is None
                or item.verification is None
                or previous.verification == item.verification,
                "conflicting retry review",
            )
            if item.verification is None:
                continue
        if item.verification is not None:
            receipt = item.verification
            require(
                obs.outcome != "HOLD",
                "uncertain results cannot be independently complete",
            )
            require(
                receipt.result.actor_id == obs.executor_id
                and receipt.result.verifier_id not in (obs.actor_id, obs.executor_id),
                "call reviewer is not independent of the execution",
            )
            require(receipt.result.evaluated_at <= at, "future call review")
            require_review(
                receipt,
                obs.subject,
                policy,
                at=receipt.result.evaluated_at,
                tier=obs.authority,
                checks=("call.outcome", "call.safety", "call.contract"),
                sources=(obs.observation_id,),
                since=obs.finished_at,
            )
        selected[obs.call_id] = item
    return tuple(selected[key] for key in sorted(selected))


@dataclass(frozen=True, slots=True)
class CapabilityPassport(Contract):
    """Publish bounded aggregate history for exactly one token implementation."""

    binding: ImplementationBinding
    observed_at: datetime
    calls: int
    reported_successes: int
    reviewed_calls: int
    verified_successes: int
    failure_classes: Mapping[str, int]
    environments_tested: tuple[str, ...]
    cost_minor: int
    cost_observations: int
    currency: str
    latency_total_ms: float
    verifiers: tuple[SemanticId, ...]
    evidence_root: ContentDigest

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            0 <= self.verified_successes <= self.reviewed_calls <= self.calls,
            "invalid passport counts",
        )
        require(
            self.verified_successes <= self.reported_successes <= self.calls,
            "invalid success count",
        )
        require(
            0 <= self.cost_observations <= self.calls
            and self.cost_minor >= 0
            and self.latency_total_ms >= 0,
            "invalid passport measurements",
        )
        require(
            set(self.failure_classes)
            <= {
                "contract",
                "dependency",
                "authorization",
                "timeout",
                "provider",
                "verification",
                "unknown",
            }
            and all(n >= 0 for n in self.failure_classes.values())
            and sum(self.failure_classes.values()) <= self.calls,
            "invalid passport failure classes",
        )

    @property
    def subject(self) -> SubjectRef:
        """Bind any publication review to the aggregate and its evidence root."""
        return SubjectRef(self.binding.token.capability_id, digest(self))

    @property
    def report_id(self) -> SemanticId:
        """Address the aggregate without embedding tenant identities or raw results."""
        return SemanticId("cni://evaluation/capability-passport/" + digest(self))

    def summary(self) -> dict[str, object]:
        """Expose exact denominators and a Wilson interval only for reviewed outcomes."""
        n, successes = self.reviewed_calls, self.verified_successes
        interval: list[float] | None = None
        if n:
            p, z = successes / n, 1.959963984540054
            scale = 1 + z * z / n
            center = (p + z * z / (2 * n)) / scale
            radius = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / scale
            interval = [max(0.0, center - radius), min(1.0, center + radius)]
        return {
            **self.to_dict(),
            "unknown_outcomes": self.calls - n,
            "verified_success_rate": {
                "numerator": successes,
                "denominator": n,
                "value": successes / n if n else None,
                "wilson_95": interval,
            },
            "mean_latency_ms": self.latency_total_ms / self.calls
            if self.calls
            else None,
            "complete_cost_minor": self.cost_minor
            if self.cost_observations == self.calls and self.calls
            else None,
            "scope": "Captured receiver observations and pinned independent reviews; no live identity attestation.",
        }


def passport(
    bundle: TokenBundle,
    implementation: str,
    calls: tuple[MeteredCall, ...],
    policy: ReviewPolicy,
    *,
    scope_id: str,
    at: datetime,
) -> CapabilityPassport:
    """Compute a passport from actual observations, preserving missing outcome and cost evidence."""
    retained = validated_calls(
        bundle, implementation, calls, policy, scope_id=scope_id, at=at
    )
    observations = [c.observation for c in retained]
    return CapabilityPassport(
        binding=bundle.token.binding(implementation),
        observed_at=at,
        calls=len(retained),
        reported_successes=sum(o.outcome == "SUCCEEDED" for o in observations),
        reviewed_calls=sum(c.verification is not None for c in retained),
        verified_successes=sum(
            c.verification is not None and c.observation.outcome == "SUCCEEDED"
            for c in retained
        ),
        failure_classes=dict(
            Counter(
                o.failure_class for o in observations if o.failure_class is not None
            )
        ),
        environments_tested=tuple(
            sorted(
                {
                    c.observation.environment
                    for c in retained
                    if c.verification is not None
                }
            )
        ),
        cost_minor=sum(o.cost_minor or 0 for o in observations),
        cost_observations=sum(o.cost_minor is not None for o in observations),
        currency=bundle.token.pricing.currency,
        latency_total_ms=sum(o.latency_ms for o in observations),
        verifiers=tuple(
            sorted(
                {
                    c.verification.result.verifier_id
                    for c in retained
                    if c.verification is not None
                }
            )
        ),
        evidence_root=ContentDigest(digest(retained)),
    )


@dataclass(frozen=True, slots=True)
class PassportPublication(Contract):
    """Carry reviewed public measurements without exporting private receipt bodies."""

    passport: CapabilityPassport
    published_at: datetime
    review_digest: ContentDigest

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.passport.observed_at <= self.published_at,
            "publication predates measurement",
        )


def publish_passport(
    record: CapabilityPassport,
    receipt: VerificationReceipt,
    policy: ReviewPolicy,
    *,
    at: datetime,
) -> PassportPublication:
    """Require explicit pinned publication and privacy review for a portable passport."""
    require_review(
        receipt,
        record.subject,
        policy,
        at=at,
        tier=AuthorityTier.A3,
        checks=("passport.measurements", "passport.privacy", "passport.publication"),
        sources=(record.report_id,),
        since=record.observed_at,
    )
    return PassportPublication(record, at, ContentDigest(digest(receipt)))
