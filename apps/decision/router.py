# ─── CGRF Header ──────────────────────────────
# File:        apps/decision/router.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/primitives.py, apps/decision/workloads/definitions.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/decision/primitives.py; CONSUMES apps/decision/workloads/definitions.py
# DAG Node:    none
# Intent:      Route typed questions through deterministic and bounded fallback backends without crossing caller authority.
# ────────────────────────────────────────────────────────────

"""Route typed questions through Phase 1 decision backends."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Callable, Mapping, Protocol, cast

from apps.decision.primitives import (
    Choice,
    DecisionValidationError,
    Extract,
    Noul,
    QuestionType,
    Rank,
    Score,
    SelectMany,
)

AUTHORITY = {"A0": 0, "A1": 1, "A2": 2, "A3": 3}
DEFAULT_THRESHOLDS: dict[type[object], float] = {
    Noul: 0.75,
    Choice: 0.70,
    Score: 0.65,
    Rank: 0.70,
    SelectMany: 0.70,
    Extract: 0.80,
}


@dataclass(frozen=True)
class RuleMatch:
    """Carry a deterministic workload match into typed normalization."""

    value: object
    probability: float | None = None
    probabilities: dict[str, float] | None = None


@dataclass(frozen=True)
class BackendResult:
    """Carry one backend answer and its measured execution envelope."""

    answer: dict[str, object]
    confidence: float
    cost_usd: float
    latency_ms: float
    authority: str
    route: str


@dataclass(frozen=True)
class RoutedDecision:
    """Combine per-question backend results for the public contract."""

    answers: dict[str, dict[str, object]]
    route: str
    routes: dict[str, str]
    latency_ms: float
    cost_usd: float
    authority: str


class Backend(Protocol):
    """Answer one question when the backend can do so."""

    route: str
    authority: str

    async def answer(
        self, name: str, state: dict[str, object] | str, question: QuestionType
    ) -> BackendResult | None:
        """Return a typed answer or no match."""


Rule = Callable[[dict[str, object] | str, QuestionType], RuleMatch | None]


def _probability(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise DecisionValidationError(f"{label} must be finite")
    result = float(value)
    if not math.isfinite(result):
        raise DecisionValidationError(f"{label} must be finite")
    if not 0 <= result <= 1:
        raise DecisionValidationError(f"{label} must be between zero and one")
    return result


def _distribution(
    labels: tuple[str, ...], values: Mapping[str, float] | None, selected: set[str]
) -> dict[str, float]:
    if values is None:
        if not labels:
            return {}
        if len(selected) == 1:
            chosen = next(iter(selected))
            return {label: 1.0 if label == chosen else 0.0 for label in labels}
        return {label: 1.0 if label in selected else 0.0 for label in labels}
    if set(values) != set(labels):
        raise DecisionValidationError("probability labels must match the question")
    result = {label: _probability(values[label], label) for label in labels}
    return result


def _answer(
    question: QuestionType,
    match: RuleMatch,
    confidence: float,
    *,
    abstained: bool = False,
) -> dict[str, object]:
    confidence = _probability(confidence, "confidence")
    value = match.value
    payload: dict[str, object] = {
        "value": value,
        "confidence": confidence,
        "abstained": abstained,
    }
    if abstained:
        payload["value"] = None
        payload["probability"] = confidence
        return payload
    if isinstance(question, Noul):
        if type(value) is not bool:
            raise DecisionValidationError("Noul answers must be boolean")
        payload["probability"] = _probability(
            match.probability if match.probability is not None else confidence,
            "probability",
        )
    elif isinstance(question, Choice):
        if not isinstance(value, str) or value not in question.options:
            raise DecisionValidationError("Choice answer is not an option")
        payload["probabilities"] = _distribution(
            question.options, match.probabilities, {value}
        )
    elif isinstance(question, Score):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise DecisionValidationError("Score answer is outside its bounds")
        score = float(value)
        if not question.min <= score <= question.max:
            raise DecisionValidationError("Score answer is outside its bounds")
        payload["value"] = score
        payload["probability"] = _probability(
            match.probability if match.probability is not None else confidence,
            "probability",
        )
    elif isinstance(question, Rank):
        if not isinstance(value, list) or not 1 <= len(value) <= question.top_k:
            raise DecisionValidationError("Rank answer has the wrong length")
        if len(set(value)) != len(value) or any(
            item not in question.candidates for item in value
        ):
            raise DecisionValidationError("Rank answer contains unknown candidates")
        payload["probabilities"] = _distribution(
            question.candidates, match.probabilities, set(cast(list[str], value))
        )
    elif isinstance(question, SelectMany):
        if (
            not isinstance(value, list)
            or len(set(value)) != len(value)
            or any(item not in question.options for item in value)
        ):
            raise DecisionValidationError("SelectMany answer contains unknown options")
        payload["probabilities"] = _distribution(
            question.options, match.probabilities, set(cast(list[str], value))
        )
    elif isinstance(question, Extract):
        if not isinstance(value, dict) or not all(
            isinstance(key, str) for key in value
        ):
            raise DecisionValidationError("Extract answer must be an object")
        payload["probability"] = _probability(
            match.probability if match.probability is not None else confidence,
            "probability",
        )
    return payload


def _text(state: dict[str, object] | str) -> str:
    return state if isinstance(state, str) else json.dumps(state, sort_keys=True)


class RulesBackend:
    """Resolve explicit facts and deterministic workload patterns."""

    route = "rules"
    authority = "A0"

    def __init__(self, rules: Mapping[str, Rule] | None = None) -> None:
        if rules is None:
            from apps.decision.workloads import RULES_BY_QUESTION

            rules = RULES_BY_QUESTION
        self.rules = dict(rules)

    async def answer(
        self, name: str, state: dict[str, object] | str, question: QuestionType
    ) -> BackendResult | None:
        match: RuleMatch | None = None
        if isinstance(state, dict) and isinstance(state.get("answers"), dict):
            answers = cast(dict[str, object], state["answers"])
            if name in answers:
                match = RuleMatch(answers[name])
        if match is None and name in self.rules:
            match = self.rules[name](state, question)
        if match is None:
            return None
        return BackendResult(
            answer=_answer(question, match, 1.0),
            confidence=1.0,
            cost_usd=0.0,
            latency_ms=0.0,
            authority=self.authority,
            route=self.route,
        )


class ClassifierBackend:
    """Provide dependency-free local defaults until a trained classifier exists."""

    route = "local_reflex"
    authority = "A0"

    async def answer(
        self, name: str, state: dict[str, object] | str, question: QuestionType
    ) -> BackendResult:
        source = _text(state).lower()
        confidence = 0.45
        if isinstance(question, Noul):
            match = RuleMatch(False, probability=0.5)
        elif isinstance(question, Choice):
            tokens = {
                option: source.count(option.lower().replace("_", " "))
                for option in question.options
            }
            selected = max(
                question.options,
                key=lambda option: (tokens[option], -question.options.index(option)),
            )
            peak = 0.6 if tokens[selected] else 1 / len(question.options)
            remainder = (1 - peak) / (len(question.options) - 1)
            match = RuleMatch(
                selected,
                probabilities={
                    option: peak if option == selected else remainder
                    for option in question.options
                },
            )
            confidence = peak
        elif isinstance(question, Score):
            match = RuleMatch((question.min + question.max) / 2, probability=0.5)
            confidence = 0.5
        elif isinstance(question, Rank):
            value = list(question.candidates[: question.top_k])
            match = RuleMatch(
                value,
                probabilities={
                    candidate: max(0.1, 0.6 - index * 0.1)
                    for index, candidate in enumerate(question.candidates)
                },
            )
            confidence = 0.55
        elif isinstance(question, SelectMany):
            match = RuleMatch(
                [], probabilities={option: 0.4 for option in question.options}
            )
            confidence = 0.5
        else:
            properties = question.schema.get("properties", {})
            if not isinstance(properties, dict):
                properties = {}
            extracted = {
                key: state[key]
                for key in properties
                if isinstance(state, dict) and key in state
            }
            match = RuleMatch(extracted, probability=0.4)
            confidence = 0.4 if not extracted else 0.6
        return BackendResult(
            answer=_answer(question, match, confidence),
            confidence=confidence,
            cost_usd=0.0,
            latency_ms=1.0,
            authority=self.authority,
            route=self.route,
        )


class FrontierBackend:
    """Return bounded structured stand-ins for a future caller-configured model."""

    route = "frontier"
    authority = "A1"

    async def answer(
        self, name: str, state: dict[str, object] | str, question: QuestionType
    ) -> BackendResult:
        confidence = 0.84
        if isinstance(question, Noul):
            match = RuleMatch(False, probability=0.2)
        elif isinstance(question, Choice):
            selected = question.options[0]
            rest = (1 - confidence) / (len(question.options) - 1)
            match = RuleMatch(
                selected,
                probabilities={
                    option: confidence if option == selected else rest
                    for option in question.options
                },
            )
        elif isinstance(question, Score):
            match = RuleMatch((question.min + question.max) / 2, probability=confidence)
        elif isinstance(question, Rank):
            value = list(question.candidates[: question.top_k])
            match = RuleMatch(
                value,
                probabilities={
                    candidate: max(0.05, confidence - index * 0.12)
                    for index, candidate in enumerate(question.candidates)
                },
            )
        elif isinstance(question, SelectMany):
            value = list(question.options[:1])
            match = RuleMatch(
                value,
                probabilities={
                    option: 0.8 if option in value else 0.2
                    for option in question.options
                },
            )
        else:
            properties = question.schema.get("properties", {})
            if not isinstance(properties, dict):
                properties = {}
            match = RuleMatch({key: None for key in properties}, probability=confidence)
        return BackendResult(
            answer=_answer(question, match, confidence),
            confidence=confidence,
            cost_usd=0.001,
            latency_ms=25.0,
            authority=self.authority,
            route=self.route,
        )


class DecisionRouter:
    """Run deterministic-first routing with confidence and authority gates."""

    def __init__(
        self,
        rules: Backend | None = None,
        classifier: Backend | None = None,
        frontier: Backend | None = None,
        thresholds: Mapping[type[object], float] | None = None,
    ) -> None:
        self.rules = rules or RulesBackend()
        self.classifier = classifier or ClassifierBackend()
        self.frontier = frontier or FrontierBackend()
        self.thresholds = dict(DEFAULT_THRESHOLDS if thresholds is None else thresholds)
        for threshold in self.thresholds.values():
            _probability(threshold, "threshold")

    @staticmethod
    def _allowed(backend: Backend, authority: str) -> bool:
        return AUTHORITY[backend.authority] <= AUTHORITY[authority]

    def _threshold(self, question: QuestionType) -> float:
        for kind, threshold in self.thresholds.items():
            if isinstance(question, kind):
                return threshold
        raise DecisionValidationError("no confidence threshold for question")

    async def decide(
        self,
        state: dict[str, object] | str,
        questions: dict[str, QuestionType],
        authority: str,
    ) -> RoutedDecision:
        if authority not in AUTHORITY:
            raise DecisionValidationError("authority must be A0, A1, A2 or A3")
        answers: dict[str, dict[str, object]] = {}
        routes: dict[str, str] = {}
        latency = 0.0
        cost = 0.0
        used = 0
        for name, question in questions.items():
            threshold = self._threshold(question)
            result = await self.rules.answer(name, state, question)
            if result is None:
                result = await self.classifier.answer(name, state, question)
            if result is None:
                raise DecisionValidationError("classifier backend returned no answer")
            latency += result.latency_ms
            cost += result.cost_usd
            used = max(used, AUTHORITY[result.authority])
            if result.confidence < threshold:
                if self._allowed(self.frontier, authority):
                    result = await self.frontier.answer(name, state, question)
                    if result is None:
                        raise DecisionValidationError(
                            "frontier backend returned no answer"
                        )
                    latency += result.latency_ms
                    cost += result.cost_usd
                    used = max(used, AUTHORITY[result.authority])
                if result.confidence < threshold:
                    answers[name] = _answer(
                        question, RuleMatch(None), result.confidence, abstained=True
                    )
                    routes[name] = "abstain"
                    continue
            answers[name] = result.answer
            routes[name] = result.route
        distinct = list(dict.fromkeys(routes.values()))
        route = (
            distinct[0] if len(distinct) == 1 else "mixed(" + ",".join(distinct) + ")"
        )
        actual = next(name for name, tier in AUTHORITY.items() if tier == used)
        return RoutedDecision(answers, route, routes, latency, cost, actual)
