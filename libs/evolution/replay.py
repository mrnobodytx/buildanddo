# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/replay.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/compiler.py, libs/evolution/episode.py, libs/evolution/scorer.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/compiler.py; CONSUMES libs/evolution/episode.py; CONSUMES libs/evolution/scorer.py
# Intent:      Measure disjoint historical and captured shadow predictions while refusing future context and unverified grading labels.
# ───────────────────────────────────────────────────────────────

"""Replay frozen inputs and captured teachers against independent held-out outcomes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from time import perf_counter_ns

from libs.semantic_twin.contracts import Contract, require, text
from libs.semantic_twin.identity import SemanticId
from libs.semantic_twin.merkle import ContentDigest
from libs.semantic_twin.vocabulary import StringEnum, TevvState

from .candidate import Candidate, Decision
from .common import digest, identity, mapping
from .compiler import DecisionInput, evaluate_rule
from .episode import Episode
from .event import Phase
from .scorer import (
    OutcomeLabels,
    Rate,
    Resources,
    ScoredDecision,
    resource_summary,
    score,
)


class EvaluationMode(StringEnum):
    """Separate holdout replay from comparison with a captured teacher."""

    REPLAY = "REPLAY"
    SHADOW = "SHADOW"


@dataclass(frozen=True, slots=True)
class ReplayCase(Contract):
    """Join decision-time input to a later episode without exposing outcomes to the rule."""

    observation: DecisionInput
    episode: Episode

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        first = self.episode.events[0]
        require(
            (
                self.observation.scope_id,
                self.observation.correlation_id,
                self.observation.authority,
                self.observation.risk,
            )
            == (first.scope_id, first.correlation_id, first.authority, first.risk),
            "holdout scope/correlation/authority mismatch",
        )
        require(
            self.observation.graph.source_sha in self.episode.source_shas,
            "holdout source is not present in its episode",
        )
        attempts = self.episode.attempts
        if attempts:
            require(
                self.observation.decision_at <= attempts[0].action.occurred_at,
                "prediction context includes a later action",
            )
        available: dict[str, str] = {}
        for event in self.episode.events:
            if event.phase in (Phase.PROBLEM, Phase.CONTEXT, Phase.HYPOTHESIS) and (
                event.observed_at <= self.observation.features_observed_at
            ):
                for key, value in event.features.items():
                    require(
                        key not in available or available[key] == value,
                        "conflicting decision-time features",
                    )
                    available[key] = value
        require(
            all(available.get(k) == v for k, v in self.observation.features.items()),
            "prediction uses unobserved or future features",
        )

    @property
    def case_id(self) -> str:
        """Bind the input and the entire retained outcome history."""
        return str(
            identity("evaluation", (self.observation.input_id, self.episode.episode_id))
        )

    @property
    def truth(self) -> OutcomeLabels | None:
        """Use reviewed labels only when the exact result has independent PASS evidence."""
        attempts = self.episode.attempts
        if (
            self.episode.status != "VERIFIED"
            or not attempts
            or attempts[-1].verdict is not TevvState.PASS
        ):
            return None
        result = attempts[-1].result
        assert result is not None
        labels = result.data.get("labels")
        return OutcomeLabels.from_dict(mapping(labels)) if labels else None


@dataclass(frozen=True, slots=True, kw_only=True)
class TeacherPrediction(Contract):
    """Retain a model's captured proposal and usage without equating agreement with truth."""

    input_id: str
    model: str
    model_version: str
    source_ref: str
    source_digest: ContentDigest
    predicted_at: datetime
    observed_at: datetime
    decision: Decision | None
    resources: Resources

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for value in (self.input_id, self.model, self.model_version, self.source_ref):
            text(value, "teacher provenance")
        require(self.predicted_at <= self.observed_at, "teacher timestamp reversal")


@dataclass(frozen=True, slots=True)
class CaseEvaluation(Contract):
    """Retain the prediction, frozen case and measured tokenless usage."""

    case: ReplayCase
    decision: Decision | None
    resources: Resources
    teacher: TeacherPrediction | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.resources.model_calls == 0
            and self.resources.tokens == 0
            and self.resources.cost_usd == 0
            and self.resources.latency_ms is not None,
            "tokenless evaluation requires measured latency and zero model usage",
        )
        if self.teacher is not None:
            require(
                self.teacher.input_id == self.case.observation.input_id,
                "teacher and student saw different inputs",
            )
            require(
                self.teacher.predicted_at >= self.case.observation.decision_at,
                "teacher predates its frozen input",
            )

    def scored(self) -> ScoredDecision:
        """Keep teacher agreement distinct from independent label correctness."""
        return ScoredDecision(
            self.decision,
            self.case.truth,
            self.resources,
            self.teacher is not None,
            self.teacher.decision if self.teacher else None,
            self.teacher.resources if self.teacher else None,
        )


def require_holdout(candidate: Candidate, cases: tuple[ReplayCase, ...]) -> None:
    """Exclude every discovery identity, correlation and source revision from evaluation."""
    require(bool(cases), "evaluation requires holdout cases")
    episode_ids = {item.episode_id for item in candidate.training}
    correlations = {item.correlation_id for item in candidate.training}
    sources = {sha for item in candidate.training for sha in item.source_shas}
    require(
        len({case.episode.episode_id for case in cases}) == len(cases),
        "duplicate holdout episode",
    )
    require(
        len({case.observation.correlation_id for case in cases}) == len(cases),
        "correlated holdout duplicates",
    )
    for case in cases:
        obs, ep = case.observation, case.episode
        require(
            obs.scope_id == candidate.scope_id
            and obs.authority is candidate.authority
            and obs.risk == candidate.risk,
            "evaluation changes scope or authority",
        )
        require(
            ep.episode_id not in episode_ids and obs.correlation_id not in correlations,
            "discovery/holdout identity leakage",
        )
        require(not set(ep.source_shas) & sources, "discovery/holdout source leakage")
        require(
            obs.decision_at > candidate.training_end,
            "holdout must follow the entire discovery window",
        )


@dataclass(frozen=True, slots=True)
class EvaluationReport(Contract):
    """Bind reproducible predictions and exact observed scores to a candidate revision."""

    candidate: Candidate
    mode: EvaluationMode
    cases: tuple[CaseEvaluation, ...]
    evaluated_at: datetime

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require_holdout(self.candidate, tuple(row.case for row in self.cases))
        require(
            self.evaluated_at >= self.candidate.discovered_at,
            "evaluation predates candidate discovery",
        )
        for row in self.cases:
            require(
                row.decision
                == evaluate_rule(self.candidate.rule, row.case.observation),
                "reported decision differs from deterministic rule",
            )
            require(
                all(
                    event.ingested_at <= self.evaluated_at
                    for event in row.case.episode.events
                ),
                "evaluation predates captured outcome ingestion",
            )
            if self.mode is EvaluationMode.REPLAY:
                require(row.teacher is None, "replay cannot contain a teacher")
            else:
                require(
                    row.teacher is not None, "shadow requires an actual teacher capture"
                )
                assert row.teacher is not None
                require(
                    row.teacher.observed_at <= self.evaluated_at,
                    "future teacher capture",
                )

    @property
    def report_id(self) -> SemanticId:
        """Address exact predictions, measurements and outcome evidence."""
        return identity("evaluation", self)

    @property
    def scores(self) -> dict[str, Rate]:
        """Recompute scores from retained outcomes rather than accepting caller aggregates."""
        return score(
            tuple(row.scored() for row in self.cases),
            rule_digest=digest(self.candidate.rule),
        )

    def summary(self) -> dict[str, object]:
        """Expose measured denominators and the difference between agreement and truth."""
        return {
            "report_id": str(self.report_id),
            "candidate": self.candidate.subject.to_dict(),
            "mode": self.mode.value,
            "cases": len(self.cases),
            "scores": {name: value.summary() for name, value in self.scores.items()},
            "resources": resource_summary(tuple(row.scored() for row in self.cases)),
            "effects_executed": 0,
        }


def evaluate(
    candidate: Candidate,
    cases: tuple[ReplayCase, ...],
    *,
    evaluated_at: datetime,
    mode: EvaluationMode = EvaluationMode.REPLAY,
    teachers: tuple[TeacherPrediction, ...] = (),
) -> EvaluationReport:
    """Run student proposals without effects and optionally compare supplied model captures."""
    require_holdout(candidate, cases)
    teacher_map = {item.input_id: item for item in teachers}
    require(len(teacher_map) == len(teachers), "duplicate teacher input")
    expected = {case.observation.input_id for case in cases}
    require(not set(teacher_map) - expected, "teacher refers to an unknown case")
    require(
        (mode is EvaluationMode.REPLAY and not teachers)
        or (mode is EvaluationMode.SHADOW and set(teacher_map) == expected),
        "shadow requires a teacher capture for every case",
    )
    rows = []
    for case in cases:
        started = perf_counter_ns()
        decision = evaluate_rule(candidate.rule, case.observation)
        elapsed = (perf_counter_ns() - started) / 1_000_000
        rows.append(
            CaseEvaluation(
                case,
                decision,
                Resources(latency_ms=elapsed, model_calls=0, tokens=0, cost_usd=0),
                teacher_map.get(case.observation.input_id),
            )
        )
    return EvaluationReport(candidate, mode, tuple(rows), evaluated_at)
