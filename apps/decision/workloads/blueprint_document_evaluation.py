# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/decision/workloads/blueprint_document_evaluation.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/research/blueprint_documents.py, apps/decision/contract.py, apps/decision/primitives.py
# EnumType:    Adapter
# EnumEdges:   CONSUMES apps/research/blueprint_documents.py; CONSUMES apps/decision/contract.py; CONSUMES apps/decision/primitives.py
# DAG Node:    none
# Intent:      Assess untrusted requirements with A0 typed decisions while preserving abstention and keeping verification separate.
# ───────────────────────────────────────────────────────────────

"""Evaluate extracted requirements without granting action authority."""
from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import Protocol, cast

from apps.decision.contract import DecisionResult, TypedAnswer, decide
from apps.decision.primitives import Choice, Noul, QuestionType, Score
from apps.research.blueprint_documents import Blueprint, COMPONENT_TYPES
from apps.research.contracts import ResearchError


class DecideFn(Protocol):
    """Accept the existing decision contract without provider-specific bindings."""

    async def __call__(self, state: dict[str, object] | str, questions: dict[str, QuestionType], *,
                       evidence: bool = False, authority: str = 'A0', trace_id: str | None = None) -> DecisionResult: ...


@dataclass
class RequirementEvaluation:
    """Retain bounded scores, abstentions and mappings for one requirement."""

    requirement_id: str
    feasibility: float | None
    complexity: float | None
    component_type: str | None
    automatable: bool | None
    risk: float | None
    confidence: dict[str, float]
    abstained: list[str]
    components: list[str]
    route: str
    trace_id: str
    state_hash: str


@dataclass
class BlueprintEvaluation:
    """Summarize observed decisions without converting unknowns into zero scores."""

    source_hash: str
    requirements: list[RequirementEvaluation]
    overall: dict[str, object]
    authority: str = 'A0'
    verified: bool = False

    def to_dict(self) -> dict[str, object]:
        """Serialize the assessment with an explicit non-verification marker."""
        return asdict(self)


def _questions() -> dict[str, QuestionType]:
    return {'feasibility': Score(0, 10), 'complexity': Score(0, 10), 'component_type': Choice(list(COMPONENT_TYPES)),
            'automatable': Noul(), 'risk': Score(0, 10)}


def _answer(answer: TypedAnswer, spec: QuestionType) -> object:
    if not isinstance(answer, TypedAnswer) or type(answer.abstained) is not bool or type(answer.confidence) not in (int, float) or (
        not math.isfinite(answer.confidence) or not 0 <= answer.confidence <= 1
    ):
        raise ResearchError('invalid_data')
    value = answer.value
    if answer.abstained:
        if value is not None:
            raise ResearchError('invalid_data')
        return None
    if isinstance(spec, Score):
        if type(value) not in (int, float) or not math.isfinite(cast(float, value)) or not 0 <= cast(float, value) <= 10:
            raise ResearchError('invalid_data')
        return float(cast(float, value))
    if isinstance(spec, Choice) and value not in COMPONENT_TYPES:
        raise ResearchError('invalid_data')
    if isinstance(spec, Noul) and type(value) is not bool:
        raise ResearchError('invalid_data')
    return value


async def evaluate_blueprint(blueprint: Blueprint, decide_fn: DecideFn = decide) -> BlueprintEvaluation:
    """Evaluate each requirement's feasibility and map to components at A0."""
    blueprint = Blueprint.from_dict(blueprint.to_dict())
    evaluations: list[RequirementEvaluation] = []
    for requirement in blueprint.requirements:
        components = [component for component in blueprint.components if requirement.id in component.requirements]
        # Never merge source fields into state controls (notably `answers`). The
        # text is data, including any purported prompts, policies or tool calls.
        state: dict[str, object] = {
            'workload': 'blueprint_evaluation',
            'input_trust': 'untrusted_document',
            'source': {'source_hash': blueprint.source_hash, 'requirement': asdict(requirement),
                       'components': [asdict(component) for component in components],
                       'constraints': blueprint.constraints, 'assumptions': blueprint.assumptions},
        }
        questions = _questions()
        decision = await decide_fn(state, questions, evidence=False, authority='A0')
        if not isinstance(decision, DecisionResult) or decision.authority != 'A0' or decision.verified is not False or set(decision.answers) != set(questions):
            raise ResearchError('invalid_data')
        values = {name: _answer(decision.answers[name], spec) for name, spec in questions.items()}
        evaluations.append(RequirementEvaluation(
            requirement.id, cast(float | None, values['feasibility']), cast(float | None, values['complexity']),
            cast(str | None, values['component_type']), cast(bool | None, values['automatable']), cast(float | None, values['risk']),
            {name: float(answer.confidence) for name, answer in decision.answers.items()},
            [name for name, answer in decision.answers.items() if answer.abstained], [component.name for component in components],
            decision.route, decision.trace_id, decision.state_hash,
        ))
    averages: dict[str, object] = {}
    for name in ('feasibility', 'complexity', 'risk'):
        scores = [cast(float, getattr(row, name)) for row in evaluations if getattr(row, name) is not None]
        averages[name] = round(sum(scores) / len(scores), 3) if scores else None
    complete = sum(not row.abstained for row in evaluations)
    return BlueprintEvaluation(blueprint.source_hash, evaluations, {
        'status': 'empty' if not evaluations else 'assessed' if complete == len(evaluations) else 'review_required',
        'requirement_count': len(evaluations), 'assessed_count': complete,
        'review_count': sum(bool(row.abstained) or row.automatable is not True for row in evaluations),
        'average_scores': averages,
    })
