# ─── CGRF Header ───────────────────────────────
# File:        apps/decision/contract.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/primitives.py, apps/decision/router.py, apps/decision/benchmark.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/decision/primitives.py; DEPENDS_ON apps/decision/router.py; PRODUCES apps/decision/benchmark.py
# DAG Node:    none
# Intent:      Expose one asynchronous decision call with typed answers, provenance, cost and a permanent non-verification boundary.
# ───────────────────────────────────────────────────────────

"""Expose the stable asynchronous BuildAndDo decision contract."""

from __future__ import annotations

import hashlib
import json
import math
import re
import uuid
from dataclasses import asdict, dataclass
from typing import cast

from apps.decision.primitives import (
    DecisionValidationError,
    Question,
    QuestionType,
    questions_to_dict,
)
from apps.decision.router import AUTHORITY, DecisionRouter

QUESTION_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")


@dataclass(frozen=True)
class TypedAnswer:
    """Return one normalized prediction and its uncertainty."""

    value: object
    confidence: float
    probability: float | None = None
    probabilities: dict[str, float] | None = None
    abstained: bool = False

    def to_dict(self) -> dict[str, object]:
        """Serialize only uncertainty fields applicable to this answer."""
        result: dict[str, object] = {
            "value": self.value,
            "confidence": self.confidence,
            "abstained": self.abstained,
        }
        if self.probability is not None:
            result["probability"] = self.probability
        if self.probabilities is not None:
            result["probabilities"] = dict(self.probabilities)
        return result


@dataclass(frozen=True)
class DecisionResult:
    """Return typed answers with routing, cost and provenance metadata."""

    answers: dict[str, TypedAnswer]
    route: str
    latency_ms: float
    cost_usd: float
    evidence_refs: list[str]
    authority: str
    verified: bool
    trace_id: str
    state_hash: str

    def to_dict(self) -> dict[str, object]:
        """Serialize the public decision response."""
        result = asdict(self)
        result["answers"] = {
            name: answer.to_dict() for name, answer in self.answers.items()
        }
        return result


def _json_value(value: object, depth: int = 0) -> None:
    if depth > 10:
        raise DecisionValidationError("state nesting exceeds ten levels")
    if value is None or type(value) in (bool, int, str):
        return
    if type(value) is float:
        if not math.isfinite(value):
            raise DecisionValidationError("state numbers must be finite")
        return
    if isinstance(value, list):
        for item in value:
            _json_value(item, depth + 1)
        return
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        for item in value.values():
            _json_value(item, depth + 1)
        return
    raise DecisionValidationError("state must contain JSON-compatible values")


def _state(state: dict[str, object] | str) -> tuple[dict[str, object] | str, str]:
    if isinstance(state, str):
        if (
            not state.strip()
            or len(state) > 2_048
            or any(ord(char) < 32 for char in state)
        ):
            raise DecisionValidationError(
                "state reference must be bounded non-empty text"
            )
        normalized: dict[str, object] | str = state
        encoded = json.dumps(
            {"state_ref": state}, sort_keys=True, separators=(",", ":")
        )
    elif isinstance(state, dict):
        _json_value(state)
        encoded = json.dumps(
            state, sort_keys=True, separators=(",", ":"), ensure_ascii=False
        )
        if len(encoded.encode("utf-8")) > 128_000:
            raise DecisionValidationError("inline state exceeds 128,000 bytes")
        normalized = state
    else:
        raise DecisionValidationError("state must be an object or state reference")
    return normalized, hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _questions(questions: dict[str, QuestionType]) -> dict[str, QuestionType]:
    if not isinstance(questions, dict) or not 1 <= len(questions) <= 32:
        raise DecisionValidationError("questions must contain one to 32 entries")
    for name, question in questions.items():
        if not isinstance(name, str) or not QUESTION_NAME.fullmatch(name):
            raise DecisionValidationError("question names must be safe identifiers")
        if not isinstance(question, Question):
            raise DecisionValidationError("question values must be typed primitives")
    return cast(dict[str, QuestionType], questions)


def _trace(value: str | None) -> str:
    if value is None:
        return uuid.uuid4().hex
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value) > 128
        or any(ord(char) < 33 for char in value)
    ):
        raise DecisionValidationError("trace_id must be bounded non-whitespace text")
    return value


def _references(state: dict[str, object] | str, requested: bool) -> list[str]:
    if not requested or not isinstance(state, dict):
        return []
    values = state.get("evidence_refs", [])
    if (
        not isinstance(values, list)
        or len(values) > 64
        or any(
            not isinstance(item, str) or not item.strip() or len(item) > 512
            for item in values
        )
    ):
        raise DecisionValidationError("evidence_refs must contain bounded references")
    return list(dict.fromkeys(cast(list[str], values)))


def _typed(value: dict[str, object]) -> TypedAnswer:
    confidence = value.get("confidence")
    probability = value.get("probability")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise DecisionValidationError("backend confidence is invalid")
    if probability is not None and (
        isinstance(probability, bool) or not isinstance(probability, (int, float))
    ):
        raise DecisionValidationError("backend probability is invalid")
    return TypedAnswer(
        value=value.get("value"),
        confidence=float(confidence),
        probability=float(probability) if probability is not None else None,
        probabilities=cast(dict[str, float] | None, value.get("probabilities")),
        abstained=bool(value.get("abstained", False)),
    )


async def decide(
    state: dict[str, object] | str,
    questions: dict[str, QuestionType],
    *,
    evidence: bool = False,
    authority: str = "A0",
    trace_id: str | None = None,
) -> DecisionResult:
    """Answer typed questions without performing actions or minting verification."""
    normalized, state_hash = _state(state)
    selected = _questions(questions)
    if type(evidence) is not bool:
        raise DecisionValidationError("evidence must be boolean")
    if authority not in AUTHORITY:
        raise DecisionValidationError("authority must be A0, A1, A2 or A3")
    trace = _trace(trace_id)
    routed = await DecisionRouter().decide(normalized, selected, authority)
    answers = {name: _typed(value) for name, value in routed.answers.items()}
    result = DecisionResult(
        answers=answers,
        route=routed.route,
        latency_ms=routed.latency_ms,
        cost_usd=routed.cost_usd,
        evidence_refs=_references(normalized, evidence),
        authority=routed.authority,
        verified=False,
        trace_id=trace,
        state_hash=state_hash,
    )
    try:
        from apps.decision.benchmark import DECISION_LOG

        DECISION_LOG.record(
            {
                "state_hash": state_hash,
                "questions": questions_to_dict(selected),
                "prediction": {
                    name: answer.to_dict() for name, answer in answers.items()
                },
                "confidence": {
                    name: answer.confidence for name, answer in answers.items()
                },
                "route": routed.route,
                "latency_ms": routed.latency_ms,
                "cost_usd": routed.cost_usd,
                "outcome": None,
                "verification": None,
                "human_correction": None,
            }
        )
    except (ImportError, RuntimeError, ValueError):
        pass
    return result
