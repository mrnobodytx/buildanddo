# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/conformance.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/models.py, libs/capability_tokens/verification.py, libs/evolution/candidate.py, libs/evolution/common.py, libs/evolution/compiler.py, libs/evolution/promotion.py, libs/evolution/replay.py, libs/semantic_twin/contracts.py, libs/semantic_twin/identity.py, libs/semantic_twin/merkle.py, libs/semantic_twin/promotions.py, libs/semantic_twin/transactions.py, libs/semantic_twin/vocabulary.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/capability_tokens/models.py; DEPENDS_ON libs/capability_tokens/verification.py; DEPENDS_ON libs/evolution/candidate.py; DEPENDS_ON libs/evolution/common.py; DEPENDS_ON libs/evolution/compiler.py; DEPENDS_ON libs/evolution/promotion.py; DEPENDS_ON libs/evolution/replay.py; DEPENDS_ON libs/semantic_twin/contracts.py; DEPENDS_ON libs/semantic_twin/identity.py; DEPENDS_ON libs/semantic_twin/merkle.py; DEPENDS_ON libs/semantic_twin/promotions.py; DEPENDS_ON libs/semantic_twin/transactions.py; DEPENDS_ON libs/semantic_twin/vocabulary.py
# Intent:      Execute finite conformance probes and require exact independent TEVV before certification.
# ───────────────────────────────────────────────────────────────

"""Run bounded capability conformance and gate certification on existing TEVV contracts."""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from libs.evolution.candidate import Decision
from libs.evolution.common import digest, unique
from libs.evolution.compiler import ActionProposal, DecisionInput, evaluate_rule
from libs.evolution.promotion import qualification_issues
from libs.evolution.replay import EvaluationMode, EvaluationReport
from libs.semantic_twin.contracts import Contract, ContractError, require
from libs.semantic_twin.identity import SemanticId, SubjectRef
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.transactions import (
    ChangeContract,
    ChangeProposal,
    SemanticTransaction,
    StateRoots,
)
from libs.semantic_twin.vocabulary import EvidenceState, TevvState

from .models import CHECKS, ImplementationBinding, TokenBundle
from .verification import ReviewPolicy, require_review

Category = Literal["positive", "negative", "security", "rollback", "compatibility"]
Verdict = Literal["PASS", "FAIL", "HOLD"]


def input_features(inputs: Mapping[str, object]) -> dict[str, str]:
    """Encode typed scalar variables for the existing finite graph-rule language."""
    require(
        all(type(v) in (str, int, float, bool) or v is None for v in inputs.values()),
        "graph rules accept scalar variables only",
    )
    return {
        k: v
        if isinstance(v, str)
        else json.dumps(v, allow_nan=False, separators=(",", ":"))
        for k, v in inputs.items()
    }


def propose(
    bundle: TokenBundle,
    implementation: str,
    inputs: Mapping[str, object],
    observation: DecisionInput,
    *,
    environment: str,
    rollback: bool = False,
) -> ActionProposal | None:
    """Evaluate finite logic into an existing ActionProposal without executing effects."""
    token = bundle.token
    impl = token.implementation(implementation)
    program = bundle.program(implementation, rollback=rollback)
    token.inputs.validate(inputs)
    require(
        input_features(inputs) == dict(observation.features),
        "inputs differ from captured variables",
    )
    require(environment in impl.environments, "unsupported environment")
    require(
        observation.scope_id == program.scope_id, "program cannot cross tenant scope"
    )
    require(
        observation.authority is token.authority.tier is program.authority,
        "competence cannot change authority",
    )
    require(observation.risk == token.risk, "risk is outside token applicability")
    require(
        observation.graph.compatibility == program.compatibility,
        "source, schema, supply or context is incompatible",
    )
    require(
        set(observation.allowed_operations) <= set(token.authority.operations),
        "requested operations exceed token scope",
    )
    decision = evaluate_rule(program.rule, observation)
    if decision is None:
        return None
    token.outputs.validate(decision.to_dict())
    return ActionProposal(
        capability=token.binding(implementation).subject,
        scope_id=observation.scope_id,
        authority=observation.authority,
        source_sha=observation.graph.source_sha,
        context_root=observation.graph.root,
        decision=decision,
        requested_at=observation.decision_at,
        correlation_id=observation.correlation_id,
    )


def draft_transaction(
    bundle: TokenBundle,
    implementation: str,
    proposal: ActionProposal,
    *,
    contract: ChangeContract,
    before: StateRoots,
    targets: tuple[SubjectRef, ...],
    graph_change: ChangeProposal,
) -> SemanticTransaction:
    """Enter the existing DRAFT transaction with token tools and compensation still bound."""
    token = bundle.token
    require(
        proposal.capability == token.binding(implementation).subject,
        "proposal belongs to another implementation",
    )
    require(
        proposal.authority is token.authority.tier, "proposal changes token authority"
    )
    require(
        contract.tool_or_adapter in token.authority.tools,
        "adapter is outside token contract",
    )
    require(
        proposal.decision.operation in token.authority.operations,
        "operation is outside token contract",
    )
    require(
        set(token.authority.forbidden_side_effects)
        <= set(contract.forbidden_side_effects),
        "contract omits forbidden side effects",
    )
    rollback = contract.rollback_or_compensation
    require(
        rollback is not None
        and rollback.action == token.rollback.operation
        and set(token.rollback.postconditions) <= set(rollback.postconditions),
        "contract omits token compensation",
    )
    return proposal.draft_transaction(
        contract=contract, before=before, targets=targets, graph_change=graph_change
    )


@dataclass(frozen=True, slots=True)
class ConformanceCase(Contract):
    """Freeze one observable positive, denial, compatibility or compensation expectation."""

    name: str
    category: Category
    inputs: Mapping[str, object]
    observation: DecisionInput
    environment: str
    expected: Decision | None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(bool(self.name.strip()), "case needs a name")
        if self.category in ("positive", "rollback"):
            require(self.expected is not None, "positive cases require an output")
        else:
            require(self.expected is None, "negative probes must expect denial")


@dataclass(frozen=True, slots=True)
class ConformanceSuite(Contract):
    """Keep private test inputs and independently reviewed replay out of public bundles."""

    binding: ImplementationBinding
    cases: tuple[ConformanceCase, ...]
    replay: EvaluationReport | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        unique(tuple(c.name for c in self.cases), "case name")
        require(len(self.cases) <= 1000, "too many conformance cases")
        require(
            len({digest(c) for c in self.cases}) == len(self.cases), "duplicate case"
        )


@dataclass(frozen=True, slots=True)
class CheckResult(Contract):
    """Preserve actual conformance counts and explicit missing evidence."""

    name: str
    verdict: Verdict
    passed: int
    total: int
    reason: str

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(self.name in CHECKS, "unknown conformance check")
        require(0 <= self.passed <= self.total, "invalid check denominator")
        if self.verdict == "PASS":
            require(
                self.total > 0 and self.passed == self.total, "vacuous or partial PASS"
            )


@dataclass(frozen=True, slots=True)
class ConformanceReport(Contract):
    """Publish digest-bound aggregate checks without copying tenant test cases."""

    binding: ImplementationBinding
    suite_digest: ContentDigest
    checked_at: datetime
    checks: tuple[CheckResult, ...]

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            tuple(c.name for c in self.checks) == CHECKS[:-1],
            "incomplete conformance report",
        )

    @property
    def report_id(self) -> SemanticId:
        """Address the exact report used by independent verification."""
        return SemanticId("cni://evaluation/capability-token/" + digest(self))

    @property
    def subject(self) -> SubjectRef:
        """Bind certification to implementation, test suite, time and actual results."""
        return SubjectRef(self.binding.token.capability_id, digest(self))

    @property
    def verdict(self) -> Verdict:
        """Retain failures and missing checks rather than averaging them away."""
        values = {check.verdict for check in self.checks}
        return "FAIL" if "FAIL" in values else "HOLD" if "HOLD" in values else "PASS"


def check(
    bundle: TokenBundle, suite: ConformanceSuite, *, at: datetime
) -> ConformanceReport:
    """Execute local tests and replay; leave opaque adapters or absent evidence on HOLD."""
    require(
        suite.binding == bundle.token.binding(suite.binding.implementation_id),
        "suite is for a different implementation",
    )
    name = suite.binding.implementation_id
    impl = bundle.token.implementation(name)
    require(
        all(c.observation.decision_at <= at for c in suite.cases),
        "future conformance input",
    )
    results = [
        CheckResult(
            "schema", "PASS", 1, 1, "strict contract and asset hashes validated"
        )
    ]
    for category in (
        "positive",
        "negative",
        "replay",
        "security",
        "rollback",
        "compatibility",
    ):
        if category == "replay":
            replay = suite.replay
            if replay is None:
                results.append(
                    CheckResult(
                        category, "HOLD", 0, 0, "independent holdout replay absent"
                    )
                )
                continue
            require(replay.evaluated_at <= at, "future replay")
            require(
                impl.kind == "graph_rule",
                "opaque adapter replay requires a receiving runner",
            )
            program = bundle.program(name)
            require(
                replay.candidate.subject == program.capability
                and replay.candidate.rule == program.rule
                and replay.candidate.authority is program.authority
                and replay.candidate.risk == bundle.token.risk
                and replay.candidate.scope_id == program.scope_id
                and replay.candidate.compatibility == program.compatibility,
                "replay evaluates a different program",
            )
            require(
                replay.mode is EvaluationMode.REPLAY, "shadow is not holdout replay"
            )
            issues = qualification_issues(replay, bundle.token.evidence.replay_policy)
            count = len(replay.cases)
            results.append(
                CheckResult(
                    category,
                    "FAIL" if issues else "PASS",
                    0 if issues else count,
                    count,
                    "; ".join(issues) or "holdout qualifies",
                )
            )
            continue
        cases = [c for c in suite.cases if c.category == category]
        if (
            not cases
            or impl.kind != "graph_rule"
            or (category == "rollback" and impl.rollback_entrypoint is None)
        ):
            results.append(
                CheckResult(
                    category, "HOLD", 0, len(cases), "runner or cases unavailable"
                )
            )
            continue
        passed = 0
        for case in cases:
            try:
                proposal = propose(
                    bundle,
                    name,
                    case.inputs,
                    case.observation,
                    environment=case.environment,
                    rollback=category == "rollback",
                )
                actual = proposal.decision if proposal else None
                matched = actual == case.expected
            except ContractError:
                matched = case.expected is None
            passed += int(matched)
        results.append(
            CheckResult(
                category,
                "PASS" if passed == len(cases) else "FAIL",
                passed,
                len(cases),
                "bounded proposal/denial expectations",
            )
        )
    return ConformanceReport(
        suite.binding, ContentDigest(digest(suite)), at, tuple(results)
    )


@dataclass(frozen=True, slots=True)
class Certification(Contract):
    """Retain a kernel-checked certificate; trust and freshness are rechecked on use."""

    report: ConformanceReport
    proof: PromotionProof

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.report.verdict == "PASS", "incomplete conformance cannot be certified"
        )
        require(
            self.proof.subject == self.report.subject, "certification revision mismatch"
        )
        self.proof.validate_for(EvidenceState.TESTING, EvidenceState.VERIFIED)
        self.proof.validate_for(TevvState.TESTING, TevvState.PASS)

    def require_valid(
        self, bundle: TokenBundle, policy: ReviewPolicy, *, at: datetime
    ) -> None:
        """Reject stale, untrusted, incompletely reviewed or changed implementations."""
        name = self.report.binding.implementation_id
        require(
            self.report.binding == bundle.token.binding(name),
            "certification cannot be inherited",
        )
        require(
            0
            <= (at - self.report.checked_at).total_seconds()
            <= bundle.token.evidence.max_age_seconds,
            "conformance is future or stale",
        )
        require(
            policy.policy_id == bundle.token.evidence.policy_id
            and policy.policy_version == bundle.token.evidence.policy_version,
            "certification uses a different required policy",
        )
        receipt = self.proof.verification
        assert receipt is not None
        require_review(
            receipt,
            self.report.subject,
            policy,
            at=at,
            tier=bundle.token.authority.tier,
            checks=tuple("token." + c for c in CHECKS),
            sources=(self.report.report_id,),
            since=self.report.checked_at,
        )


def certify(
    bundle: TokenBundle,
    suite: ConformanceSuite,
    *,
    checked_at: datetime,
    reviewed_at: datetime,
    policy: ReviewPolicy,
    proof: PromotionProof | None = None,
) -> tuple[ConformanceReport, Certification | None]:
    """Recompute results before accepting a separately supplied independent review."""
    report = check(bundle, suite, at=checked_at)
    if proof is None:
        return report, None
    certificate = Certification(report, proof)
    certificate.require_valid(bundle, policy, at=reviewed_at)
    return report, certificate
