# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/promotion.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/replay.py, libs/semantic_twin/promotions.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/replay.py; CONSUMES libs/semantic_twin/promotions.py
# Intent:      Require exact independent TEVV proofs for competence and preserve authority through promotion and demotion.
# ───────────────────────────────────────────────────────────────

"""Gate competence with typed semantic-twin proofs while keeping authority immutable."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SubjectRef
from libs.semantic_twin.promotions import PromotionProof
from libs.semantic_twin.receipts import TevvResult
from libs.semantic_twin.vocabulary import EvidenceState, StringEnum, TevvState

from .candidate import Candidate, Compatibility
from .common import digest
from .replay import EvaluationMode, EvaluationReport


class CompetenceState(StringEnum):
    """Track learned competence on an axis separate from authority."""

    DISCOVERED = "DISCOVERED"
    HYPOTHESIS = "HYPOTHESIS"
    CANDIDATE = "CANDIDATE"
    REPLAY_PASS = "REPLAY_PASS"
    SHADOW = "SHADOW"
    VERIFIED_CAPABILITY = "VERIFIED_CAPABILITY"
    TOKENLESS_PREFERRED = "TOKENLESS_PREFERRED"
    WATCH = "WATCH"
    DISABLED = "DISABLED"


@dataclass(frozen=True, slots=True)
class PromotionPolicy(Contract):
    """Freeze evaluation thresholds when a candidate enters the local registry."""

    replay_cases: int = 10
    shadow_cases: int = 5
    discovery_successes: int = 2
    precision: float = 0.95
    recall: float = 0.8
    action_selection: float = 0.9
    test_recall: float = 0.8

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            min(self.replay_cases, self.shadow_cases, self.discovery_successes) > 0,
            "promotion sample thresholds must be positive",
        )
        require(
            all(
                0 < value <= 1
                for value in (
                    self.precision,
                    self.recall,
                    self.action_selection,
                    self.test_recall,
                )
            ),
            "invalid promotion quality threshold",
        )


def qualification_issues(
    report: EvaluationReport, policy: PromotionPolicy
) -> tuple[str, ...]:
    """Require sufficient actual labels, measured safety and passing quality thresholds."""
    scores = report.scores
    minimum = (
        policy.replay_cases
        if report.mode is EvaluationMode.REPLAY
        else policy.shadow_cases
    )
    issues = []
    if len(report.cases) < minimum:
        issues.append("insufficient independently reviewed cases")
    if scores["truth_coverage"].numerator != len(report.cases):
        issues.append("missing independently reviewed outcome labels")
    triggered = scores["proposal_coverage"].numerator
    if not triggered or scores["trigger_precision"].denominator != triggered:
        issues.append("missing applicability labels for proposed actions")
    for name, threshold in (
        ("trigger_precision", policy.precision),
        ("trigger_recall", policy.recall),
        ("action_selection", policy.action_selection),
        ("test_recall", policy.test_recall),
    ):
        rate = scores[name].value
        if rate is None or rate < threshold:
            issues.append(name + " below threshold or unmeasured")
    for name in ("unsafe_recommendations", "false_mutations", "rollback_required"):
        result = scores[name]
        if result.denominator != triggered or result.numerator:
            issues.append(name + " observed or incompletely measured")
    return tuple(issues)


@dataclass(frozen=True, slots=True)
class HealthObservation(Contract):
    """Retain the measurements that cause a competence demotion."""

    subject: SubjectRef
    compatibility: Compatibility
    observed_at: datetime
    evaluation: EvaluationReport | None = None
    tevv: TevvResult | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        if self.evaluation is not None:
            require(
                self.evaluation.candidate.subject == self.subject,
                "health evaluation candidate mismatch",
            )
            require(
                self.evaluation.evaluated_at <= self.observed_at,
                "future health evaluation",
            )
        if self.tevv is not None:
            require(self.tevv.subject == self.subject, "health TEVV subject mismatch")
            require(self.tevv.evaluated_at <= self.observed_at, "future health TEVV")


@dataclass(frozen=True, slots=True, kw_only=True)
class PromotionStep(Contract):
    """Preserve every competence transition and its exact evidence references."""

    target: CompetenceState
    occurred_at: datetime
    reason: str
    replay_id: str | None = None
    shadow_id: str | None = None
    proof_digest: str | None = None
    health: HealthObservation | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        text(self.reason, "promotion reason")


_LADDER = (
    CompetenceState.DISCOVERED,
    CompetenceState.HYPOTHESIS,
    CompetenceState.CANDIDATE,
    CompetenceState.REPLAY_PASS,
    CompetenceState.SHADOW,
    CompetenceState.VERIFIED_CAPABILITY,
    CompetenceState.TOKENLESS_PREFERRED,
)


def demotion_target(
    candidate: Candidate, policy: PromotionPolicy, health: HealthObservation
) -> CompetenceState | None:
    """Derive a conservative disposition from actual health inputs."""
    require(health.subject == candidate.subject, "health candidate revision mismatch")
    report = health.evaluation
    if health.tevv is not None and health.tevv.state is TevvState.FAIL:
        return CompetenceState.DISABLED
    if report is not None and any(
        report.scores[name].numerator
        for name in (
            "unsafe_recommendations",
            "false_mutations",
        )
    ):
        return CompetenceState.DISABLED
    if health.compatibility != candidate.compatibility:
        return CompetenceState.SHADOW
    if report is not None and qualification_issues(report, policy):
        return CompetenceState.WATCH
    if health.tevv is not None and health.tevv.state in (
        TevvState.HOLD,
        TevvState.WATCH,
    ):
        return CompetenceState.WATCH
    return None


def _verified_gate(
    candidate: Candidate,
    policy: PromotionPolicy,
    step: PromotionStep,
    replay: EvaluationReport | None,
    shadow: EvaluationReport | None,
    proof: PromotionProof | None,
    reset_at: datetime | None,
) -> None:
    require(
        replay is not None and shadow is not None and proof is not None,
        "verified competence requires replay, shadow and typed promotion proof",
    )
    assert replay is not None and shadow is not None and proof is not None
    require(not qualification_issues(replay, policy), "replay is not qualified")
    require(not qualification_issues(shadow, policy), "shadow is not qualified")
    require(
        replay.mode is EvaluationMode.REPLAY and shadow.mode is EvaluationMode.SHADOW,
        "promotion report modes mismatch",
    )
    left = {row.case.episode.episode_id for row in replay.cases}
    right = {row.case.episode.episode_id for row in shadow.cases}
    require(not left & right, "replay and shadow reuse outcome episodes")
    require(
        not {r.case.observation.correlation_id for r in replay.cases}
        & {r.case.observation.correlation_id for r in shadow.cases},
        "replay and shadow reuse correlations",
    )
    require(
        min(r.case.observation.decision_at for r in shadow.cases)
        > max(r.case.episode.ended_at for r in replay.cases),
        "shadow must follow replay holdout",
    )
    require(
        candidate.compatibility.sbom_digest is not None,
        "verified competence requires known supply-chain compatibility",
    )
    require(
        any(
            row.case.observation.graph.compatibility == candidate.compatibility
            for row in shadow.cases
        ),
        "shadow did not evaluate the declared runtime compatibility boundary",
    )
    if reset_at is not None:
        require(
            min(r.case.observation.decision_at for r in shadow.cases) > reset_at,
            "demoted competence requires fresh shadow cases",
        )
        require(
            replay.evaluated_at > reset_at and shadow.evaluated_at > reset_at,
            "demoted competence requires fresh evaluations",
        )
    require(proof.subject == candidate.subject, "proof candidate revision mismatch")
    proof.validate_for(EvidenceState.TESTING, EvidenceState.VERIFIED)
    proof.validate_for(TevvState.TESTING, TevvState.PASS)
    assert proof.verification is not None
    receipt = proof.verification
    receipt.policy.require_allow(
        candidate.subject,
        candidate.actor_id,
        candidate.authority,
        (candidate.subject.semantic_id,),
    )
    require(receipt.result.actor_id == candidate.actor_id, "proof producer mismatch")
    require(
        receipt.policy.tier is candidate.authority, "proof changes candidate authority"
    )
    require(
        {"replay", "shadow", "safety", "compatibility"}
        <= {check.name for check in receipt.result.checks},
        "TEVV omits required evolution checks",
    )
    sources = {ref.source for ref in receipt.result.evidence}
    require(
        {replay.report_id, shadow.report_id} <= sources,
        "TEVV omits exact evaluation artifacts",
    )
    require(
        max(replay.evaluated_at, shadow.evaluated_at)
        <= receipt.result.evaluated_at
        <= step.occurred_at,
        "promotion proof time mismatch",
    )


@dataclass(frozen=True, slots=True)
class CapabilityRecord(Contract):
    """Replay the full immutable evidence trail when loading a registry record."""

    candidate: Candidate
    policy: PromotionPolicy
    history: tuple[PromotionStep, ...]
    evaluations: tuple[EvaluationReport, ...] = ()
    proofs: tuple[PromotionProof, ...] = ()

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        reports = {str(report.report_id): report for report in self.evaluations}
        proofs = {digest(proof): proof for proof in self.proofs}
        require(
            len(reports) == len(self.evaluations) and len(proofs) == len(self.proofs),
            "duplicate registry evidence",
        )
        require(
            all(report.candidate == self.candidate for report in self.evaluations),
            "registry evaluation revision mismatch",
        )
        require(
            all(proof.subject == self.candidate.subject for proof in self.proofs),
            "registry proof revision mismatch",
        )
        require(
            bool(self.history) and self.history[0].target is CompetenceState.DISCOVERED,
            "registry must begin at discovery",
        )
        previous = CompetenceState.DISCOVERED
        previous_time = self.candidate.discovered_at
        reset_at: datetime | None = None
        for index, step in enumerate(self.history):
            require(step.occurred_at >= previous_time, "registry time reversal")
            replay = reports.get(step.replay_id) if step.replay_id else None
            shadow = reports.get(step.shadow_id) if step.shadow_id else None
            proof = proofs.get(step.proof_digest) if step.proof_digest else None
            require(
                step.replay_id is None or replay is not None, "missing replay artifact"
            )
            require(
                step.shadow_id is None or shadow is not None, "missing shadow artifact"
            )
            require(
                step.proof_digest is None or proof is not None, "missing proof artifact"
            )
            require(
                all(r.evaluated_at <= step.occurred_at for r in (replay, shadow) if r),
                "promotion uses future evaluation",
            )
            if index == 0:
                require(
                    step.health is None and step.proof_digest is None,
                    "discovery cannot contain promoted evidence",
                )
            elif step.health is not None:
                require(
                    previous is not CompetenceState.DISABLED,
                    "disabled version is terminal",
                )
                require(
                    previous
                    in (
                        CompetenceState.REPLAY_PASS,
                        CompetenceState.SHADOW,
                        CompetenceState.VERIFIED_CAPABILITY,
                        CompetenceState.TOKENLESS_PREFERRED,
                        CompetenceState.WATCH,
                    ),
                    "unqualified hypotheses cannot be demoted into a higher stage",
                )
                require(
                    step.occurred_at > previous_time,
                    "health must be newer than competence",
                )
                require(
                    step.health.observed_at == step.occurred_at,
                    "health transition time mismatch",
                )
                if step.health.evaluation is not None:
                    require(
                        step.health.evaluation.evaluated_at > previous_time,
                        "health evaluation is stale",
                    )
                if step.health.tevv is not None:
                    require(
                        step.health.tevv.evaluated_at > previous_time,
                        "health TEVV is stale",
                    )
                require(
                    step.target
                    is demotion_target(self.candidate, self.policy, step.health),
                    "demotion does not follow its measurement",
                )
                require(
                    step.proof_digest is None,
                    "demotion cannot retain active verification",
                )
                reset_at = step.occurred_at
            else:
                if previous is CompetenceState.WATCH:
                    require(
                        step.target is CompetenceState.SHADOW,
                        "WATCH must return through shadow",
                    )
                else:
                    require(
                        previous in _LADDER[:-1]
                        and step.target is _LADDER[_LADDER.index(previous) + 1],
                        "competence ladder cannot be skipped",
                    )
                if step.target is CompetenceState.CANDIDATE:
                    require(
                        self.candidate.successful_repairs
                        >= self.policy.discovery_successes,
                        "insufficient verified discovery successes",
                    )
                if step.target in (CompetenceState.REPLAY_PASS, CompetenceState.SHADOW):
                    require(
                        replay is not None and replay.mode is EvaluationMode.REPLAY,
                        "replay qualification is required",
                    )
                    assert replay is not None
                    require(
                        not qualification_issues(replay, self.policy),
                        "replay is not qualified",
                    )
                if step.target in (
                    CompetenceState.VERIFIED_CAPABILITY,
                    CompetenceState.TOKENLESS_PREFERRED,
                ):
                    _verified_gate(
                        self.candidate,
                        self.policy,
                        step,
                        replay,
                        shadow,
                        proof,
                        reset_at,
                    )
            previous, previous_time = step.target, step.occurred_at

    @property
    def state(self) -> CompetenceState:
        """Derive current competence from the validated append-only history."""
        return self.history[-1].target

    @property
    def revision(self) -> str:
        """Identify an exact local registry revision for compare-and-swap updates."""
        return digest(self)


def register(
    candidate: Candidate, *, policy: PromotionPolicy | None = None
) -> CapabilityRecord:
    """Register observed repetition as a hypothesis with unchanged authority."""
    return CapabilityRecord(
        candidate,
        policy or PromotionPolicy(),
        (
            PromotionStep(
                target=CompetenceState.DISCOVERED,
                occurred_at=candidate.discovered_at,
                reason="Captured repeated experience",
            ),
            PromotionStep(
                target=CompetenceState.HYPOTHESIS,
                occurred_at=candidate.discovered_at,
                reason="Structured response hypothesis; no execution authority granted",
            ),
        ),
    )


def advance(
    record: CapabilityRecord,
    target: CompetenceState,
    *,
    at: datetime,
    replay: EvaluationReport | None = None,
    shadow: EvaluationReport | None = None,
    proof: PromotionProof | None = None,
) -> CapabilityRecord:
    """Append a checked competence step; never synthesize verification or authority."""
    last = record.history[-1]
    evaluations = {str(item.report_id): item for item in record.evaluations}
    proofs = {digest(item): item for item in record.proofs}
    for report in (replay, shadow):
        if report is not None:
            evaluations[str(report.report_id)] = report
    if proof is not None:
        proofs[digest(proof)] = proof
    step = PromotionStep(
        target=target,
        occurred_at=at,
        reason="Evidence-gated competence transition",
        replay_id=str(replay.report_id) if replay else last.replay_id,
        shadow_id=str(shadow.report_id) if shadow else last.shadow_id,
        proof_digest=digest(proof) if proof else last.proof_digest,
    )
    return replace(
        record,
        history=(*record.history, step),
        evaluations=tuple(evaluations.values()),
        proofs=tuple(proofs.values()),
    )


def demote(record: CapabilityRecord, health: HealthObservation) -> CapabilityRecord:
    """Retain evidence and history while reducing competence under the same authority."""
    target = demotion_target(record.candidate, record.policy, health)
    if target is None:
        return record
    return replace(
        record,
        history=(
            *record.history,
            PromotionStep(
                target=target,
                occurred_at=health.observed_at,
                reason="Observed competence degradation",
                replay_id=record.history[-1].replay_id,
                shadow_id=record.history[-1].shadow_id,
                health=health,
            ),
        ),
    )
