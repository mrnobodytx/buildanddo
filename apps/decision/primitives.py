# ─── CGRF Header ──────────────────────────────
# File:        apps/decision/primitives.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     none
# EnumType:    Schema
# EnumEdges:   PRODUCES apps/decision/contract.py
# DAG Node:    none
# Intent:      Define dependency-free question contracts whose wire shape stays stable as decision backends change.
# ────────────────────────────────────────────────────────────

"""Define typed questions for the decision runtime."""

from __future__ import annotations

import json
import math
from abc import ABC, abstractmethod
from copy import deepcopy
from dataclasses import dataclass
from typing import TypeAlias, cast


class DecisionValidationError(ValueError):
    """Reject an invalid public decision contract."""


def _text(value: object, label: str) -> str:
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value) > 160
        or any(ord(char) < 32 for char in value)
    ):
        raise DecisionValidationError(f"{label} must be bounded non-empty text")
    return value


def _unique(values: object, label: str, minimum: int = 1) -> tuple[str, ...]:
    if not isinstance(values, (list, tuple)) or not minimum <= len(values) <= 64:
        raise DecisionValidationError(f"{label} must contain {minimum} to 64 items")
    result = tuple(_text(value, label) for value in values)
    if len(set(result)) != len(result):
        raise DecisionValidationError(f"{label} must not contain duplicates")
    return result


def _number(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise DecisionValidationError(f"{label} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise DecisionValidationError(f"{label} must be a finite number")
    return result


def _json_value(value: object, depth: int = 0) -> None:
    if depth > 8:
        raise DecisionValidationError("schema nesting exceeds eight levels")
    if value is None or type(value) in (bool, int, str):
        return
    if type(value) is float:
        if not math.isfinite(value):
            raise DecisionValidationError("schema numbers must be finite")
        return
    if isinstance(value, list):
        for item in value:
            _json_value(item, depth + 1)
        return
    if isinstance(value, dict) and all(isinstance(key, str) for key in value):
        for item in value.values():
            _json_value(item, depth + 1)
        return
    raise DecisionValidationError("schema must contain JSON-compatible values")


class Question(ABC):
    """Describe one typed answer contract."""

    kind: str

    @abstractmethod
    def to_dict(self) -> dict[str, object]:
        """Serialize the question to its public wire shape."""


@dataclass(frozen=True)
class Noul(Question):
    """Boolean probability question."""

    kind = "noul"

    def to_dict(self) -> dict[str, object]:
        """Serialize a boolean probability question."""
        return {"type": self.kind}


@dataclass(frozen=True, init=False)
class Choice(Question):
    """One-of-N selection with probability distribution."""

    options: tuple[str, ...]
    kind = "choice"

    def __init__(self, options: list[str]) -> None:
        object.__setattr__(self, "options", _unique(options, "options", 2))

    def to_dict(self) -> dict[str, object]:
        """Serialize a one-of-N question."""
        return {"type": self.kind, "options": list(self.options)}


@dataclass(frozen=True, init=False)
class Score(Question):
    """Continuous value within bounds."""

    minimum: float
    maximum: float
    kind = "score"

    def __init__(self, min: float = 0, max: float = 10) -> None:
        minimum = _number(min, "min")
        maximum = _number(max, "max")
        if minimum >= maximum:
            raise DecisionValidationError("min must be lower than max")
        object.__setattr__(self, "minimum", minimum)
        object.__setattr__(self, "maximum", maximum)

    @property
    def min(self) -> float:
        """Return the inclusive lower bound."""
        return self.minimum

    @property
    def max(self) -> float:
        """Return the inclusive upper bound."""
        return self.maximum

    def to_dict(self) -> dict[str, object]:
        """Serialize a bounded score question."""
        return {"type": self.kind, "min": self.minimum, "max": self.maximum}


@dataclass(frozen=True, init=False)
class Rank(Question):
    """Ordered candidates."""

    candidates: tuple[str, ...]
    top_k: int
    kind = "rank"

    def __init__(self, candidates: list[str], top_k: int | None = None) -> None:
        values = _unique(candidates, "candidates")
        count = len(values) if top_k is None else top_k
        if type(count) is not int or not 1 <= count <= len(values):
            raise DecisionValidationError("top_k must select at least one candidate")
        object.__setattr__(self, "candidates", values)
        object.__setattr__(self, "top_k", count)

    def to_dict(self) -> dict[str, object]:
        """Serialize an ordered-candidate question."""
        return {
            "type": self.kind,
            "candidates": list(self.candidates),
            "top_k": self.top_k,
        }


@dataclass(frozen=True, init=False)
class SelectMany(Question):
    """Subset selection with per-item probability."""

    options: tuple[str, ...]
    kind = "select_many"

    def __init__(self, options: list[str]) -> None:
        object.__setattr__(self, "options", _unique(options, "options"))

    def to_dict(self) -> dict[str, object]:
        """Serialize a subset-selection question."""
        return {"type": self.kind, "options": list(self.options)}


@dataclass(frozen=True, init=False)
class Extract(Question):
    """Typed field extraction."""

    schema: dict[str, object]
    kind = "extract"

    def __init__(self, schema: dict[str, object]) -> None:
        if not isinstance(schema, dict) or not schema:
            raise DecisionValidationError("schema must be a non-empty object")
        _json_value(schema)
        if len(json.dumps(schema, sort_keys=True, separators=(",", ":"))) > 32_000:
            raise DecisionValidationError("schema exceeds 32,000 characters")
        object.__setattr__(self, "schema", deepcopy(schema))

    def to_dict(self) -> dict[str, object]:
        """Serialize a typed extraction question."""
        return {"type": self.kind, "schema": deepcopy(self.schema)}


QuestionType: TypeAlias = Noul | Choice | Score | Rank | SelectMany | Extract


def question_from_dict(value: dict[str, object]) -> QuestionType:
    """Deserialize one strict question descriptor."""
    if not isinstance(value, dict) or not isinstance(value.get("type"), str):
        raise DecisionValidationError("question must be an object with a type")
    kind = cast(str, value["type"])
    expected = {
        "noul": {"type"},
        "choice": {"type", "options"},
        "score": {"type", "min", "max"},
        "rank": {"type", "candidates", "top_k"},
        "select_many": {"type", "options"},
        "extract": {"type", "schema"},
    }
    if kind not in expected or set(value) != expected[kind]:
        raise DecisionValidationError("question fields do not match its type")
    if kind == "noul":
        return Noul()
    if kind == "choice":
        return Choice(cast(list[str], value["options"]))
    if kind == "score":
        return Score(cast(float, value["min"]), cast(float, value["max"]))
    if kind == "rank":
        return Rank(
            cast(list[str], value["candidates"]), cast(int | None, value["top_k"])
        )
    if kind == "select_many":
        return SelectMany(cast(list[str], value["options"]))
    return Extract(cast(dict[str, object], value["schema"]))


def questions_to_dict(
    questions: dict[str, QuestionType],
) -> dict[str, dict[str, object]]:
    """Serialize a named question set without backend details."""
    return {name: question.to_dict() for name, question in questions.items()}
