# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/scorer.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/candidate.py, libs/semantic_twin/contracts.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/candidate.py; CONSUMES libs/semantic_twin/contracts.py
# Intent:      Make outcome accuracy and resource differences measurable without inventing missing grading answers.
# ───────────────────────────────────────────────────────────────

"""Measure only evidence-backed answers and expose every missing denominator."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

from libs.semantic_twin.contracts import Contract, require
from libs.semantic_twin.merkle import ContentDigest

from .candidate import Decision
from .common import unique


@dataclass(frozen=True, slots=True, kw_only=True)
class OutcomeLabels(Contract):
    """Carry explicitly reviewed labels within an exact result-event receipt."""

    rule_digest: ContentDigest | None = None
    applicable: bool | None = None
    action: Decision | None = None
    tests: tuple[str, ...] | None = None
    safe_action_keys: tuple[str, ...] = ()
    unsafe_action_keys: tuple[str, ...] = ()
    false_mutation: bool | None = None
    rollback_required: bool | None = None
    subsystems: tuple[str, ...] | None = None
    dependencies: tuple[str, ...] | None = None
    runtime_risk: str | None = None
    next_failure: str | None = None
    repair_class: str | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(
            self.applicable is None or self.rule_digest is not None,
            "applicability label must identify its exact rule",
        )
        require(
            not set(self.safe_action_keys) & set(self.unsafe_action_keys),
            "contradictory safety labels",
        )
        for key in (*self.safe_action_keys, *self.unsafe_action_keys):
            ContentDigest(key)
        for name in (
            "tests",
            "safe_action_keys",
            "unsafe_action_keys",
            "subsystems",
            "dependencies",
        ):
            value = getattr(self, name)
            if value is not None:
                unique(value, name)


@dataclass(frozen=True, slots=True)
class Rate(Contract):
    """Expose a measured numerator and denominator; an empty denominator is unknown."""

    numerator: int
    denominator: int

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        require(0 <= self.numerator <= self.denominator, "invalid measured rate")

    @property
    def value(self) -> float | None:
        """Return no percentage when the evidence does not supply a grading answer."""
        return self.numerator / self.denominator if self.denominator else None

    def summary(self) -> dict[str, object]:
        """Render the exact evidence count beside its derived rate."""
        return {**self.to_dict(), "value": self.value}


@dataclass(frozen=True, slots=True, kw_only=True)
class Resources(Contract):
    """Retain measured or captured usage without replacing missing values with zero."""

    latency_ms: float | None = None
    model_calls: int | None = None
    tokens: int | None = None
    cost_usd: float | None = None

    def __post_init__(self) -> None:
        Contract.__post_init__(self)
        for value in (self.latency_ms, self.model_calls, self.tokens, self.cost_usd):
            require(value is None or value >= 0, "negative resource measurement")


@dataclass(frozen=True, slots=True)
class ScoredDecision:
    """Provide one evaluated prediction and optional independently reviewed labels."""

    decision: Decision | None
    truth: OutcomeLabels | None
    resources: Resources
    teacher_present: bool = False
    teacher: Decision | None = None
    teacher_resources: Resources | None = None


def score(rows: tuple[ScoredDecision, ...], *, rule_digest: str) -> dict[str, Rate]:
    """Score exact action agreement separately from triggers, tests and observed safety."""
    totals: dict[str, list[int]] = {
        name: [0, 0]
        for name in (
            "trigger_precision",
            "trigger_recall",
            "action_selection",
            "test_precision",
            "test_recall",
            "unsafe_recommendations",
            "false_mutations",
            "rollback_required",
            "teacher_agreement",
            "teacher_correctness",
            "student_correctness",
            "truth_coverage",
            "proposal_coverage",
        )
    }

    def add(name: str, numerator: int | bool, denominator: int | bool = 1) -> None:
        totals[name][0] += int(numerator)
        totals[name][1] += int(denominator)

    for row in rows:
        decision, truth = row.decision, row.truth
        add("proposal_coverage", decision is not None)
        add("truth_coverage", truth is not None)
        if row.teacher_present:
            agrees = (row.teacher is None and decision is None) or (
                row.teacher is not None
                and decision is not None
                and row.teacher.action_key == decision.action_key
                and row.teacher.tests == decision.tests
            )
            add("teacher_agreement", agrees)
        if truth is None:
            continue
        applicable = (
            truth.applicable
            if truth.rule_digest is not None and truth.rule_digest.value == rule_digest
            else None
        )
        if applicable is not None:
            if decision is not None:
                add("trigger_precision", applicable)
            if applicable:
                add("trigger_recall", decision is not None)
        if truth.action is not None:
            correct = (
                decision is not None and decision.action_key == truth.action.action_key
            )
            add("student_correctness", correct)
            if applicable is True:
                add("action_selection", correct)
            if row.teacher_present:
                add(
                    "teacher_correctness",
                    row.teacher is not None
                    and row.teacher.action_key == truth.action.action_key,
                )
        if truth.tests is not None:
            selected = set(decision.tests) if decision else set()
            expected = set(truth.tests)
            add("test_precision", len(selected & expected), len(selected))
            add("test_recall", len(selected & expected), len(expected))
        if decision is None:
            continue
        key = decision.action_key
        if key in (*truth.safe_action_keys, *truth.unsafe_action_keys):
            add("unsafe_recommendations", key in truth.unsafe_action_keys)
        # These are retained observations of the same action, not replay mutations.
        if truth.action is not None and key == truth.action.action_key:
            if truth.false_mutation is not None:
                add("false_mutations", truth.false_mutation)
            if truth.rollback_required is not None:
                add("rollback_required", truth.rollback_required)
    return {name: Rate(*values) for name, values in totals.items()}


def resource_summary(rows: tuple[ScoredDecision, ...]) -> Mapping[str, object]:
    """Compare only paired resource observations, with explicit measurement counts."""
    output: dict[str, object] = {}
    for field in ("latency_ms", "model_calls", "tokens", "cost_usd"):
        values = [
            getattr(row.resources, field)
            for row in rows
            if getattr(row.resources, field) is not None
        ]
        paired = [
            (getattr(row.teacher_resources, field), getattr(row.resources, field))
            for row in rows
            if row.teacher_resources is not None
            and getattr(row.teacher_resources, field) is not None
            and getattr(row.resources, field) is not None
        ]
        output[field] = {
            "total": sum(values) if values else None,
            "measured_cases": len(values),
            "teacher_minus_student": sum(
                teacher - student for teacher, student in paired
            )
            if paired
            else None,
            "paired_cases": len(paired),
        }
    return output
