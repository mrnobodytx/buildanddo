# ─── CGRF Header ──────────────────────────────
# File:        apps/decision/benchmark.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/contract.py
# EnumType:    Service
# EnumEdges:   CONSUMES apps/decision/contract.py
# DAG Node:    none
# Intent:      Capture privacy-bounded decision examples and compute calibration, outcome, latency and correction measures.
# ────────────────────────────────────────────────────────────

"""Capture decisions and compute dependency-free benchmark summaries."""

from __future__ import annotations

import logging
import math
from copy import deepcopy
from dataclasses import asdict, dataclass
from threading import Lock
from typing import Mapping

LOGGER = logging.getLogger("buildanddo.decision")


class StructuredDecisionLog:
    """Retain bounded structured records while also emitting standard logs."""

    def __init__(self, limit: int = 10_000) -> None:
        if type(limit) is not int or limit < 1:
            raise ValueError("limit must be a positive integer")
        self.limit = limit
        self._records: list[dict[str, object]] = []
        self._lock = Lock()

    def record(self, value: Mapping[str, object]) -> None:
        """Append one detached decision record without raw state."""
        required = {
            "state_hash",
            "questions",
            "prediction",
            "confidence",
            "route",
            "latency_ms",
            "cost_usd",
            "outcome",
            "verification",
            "human_correction",
        }
        if set(value) != required:
            raise ValueError("decision log fields do not match the training contract")
        row = deepcopy(dict(value))
        with self._lock:
            self._records.append(row)
            if len(self._records) > self.limit:
                del self._records[: len(self._records) - self.limit]
        try:
            LOGGER.info("decision", extra={"decision": row})
        except Exception:
            # Observability must not change the decision result.
            pass

    def snapshot(self) -> list[dict[str, object]]:
        """Return detached copies of retained records."""
        with self._lock:
            return deepcopy(self._records)

    def clear(self) -> None:
        """Clear process-local records between bounded runs or tests."""
        with self._lock:
            self._records.clear()


DECISION_LOG = StructuredDecisionLog()


@dataclass(frozen=True)
class BenchmarkObservation:
    """Bind one prediction to a later outcome for metric calculation."""

    prediction: object
    outcome: object | None
    confidence: float
    latency_ms: float
    cost_usd: float
    probability: float | None = None
    human_correction: object | None = None


@dataclass(frozen=True)
class BenchmarkMetrics:
    """Summarize outcome, calibration, performance and correction measures."""

    count: int
    evaluated: int
    accuracy: float | None
    agreement: float | None
    brier_score: float | None
    expected_calibration_error: float | None
    latency_p50_ms: float | None
    latency_p95_ms: float | None
    latency_p99_ms: float | None
    cost_usd: float
    false_positive_rate: float | None
    false_negative_rate: float | None
    abstention_rate: float
    human_correction_rate: float

    def to_dict(self) -> dict[str, object]:
        """Serialize the complete metric summary."""
        return asdict(self)


def _finite(value: float, label: str, low: float = 0) -> float:
    if (
        type(value) not in (int, float)
        or not math.isfinite(float(value))
        or float(value) < low
    ):
        raise ValueError(f"{label} must be a finite number at least {low}")
    return float(value)


def _percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def compute_metrics(
    observations: list[BenchmarkObservation], bins: int = 10
) -> BenchmarkMetrics:
    """Compute Phase 1 metrics from decisions with optional later outcomes."""
    if type(bins) is not int or not 1 <= bins <= 100:
        raise ValueError("bins must be between one and 100")
    for item in observations:
        confidence = _finite(item.confidence, "confidence")
        if confidence > 1:
            raise ValueError("confidence must not exceed one")
        _finite(item.latency_ms, "latency_ms")
        _finite(item.cost_usd, "cost_usd")
        if (
            item.probability is not None
            and not 0 <= _finite(item.probability, "probability") <= 1
        ):
            raise ValueError("probability must not exceed one")
    evaluated = [
        item
        for item in observations
        if item.prediction is not None and item.outcome is not None
    ]
    correct = [item.prediction == item.outcome for item in evaluated]
    accuracy = sum(correct) / len(correct) if correct else None
    binary = [
        item
        for item in evaluated
        if type(item.prediction) is bool and type(item.outcome) is bool
    ]
    brier_rows = [item for item in binary if item.probability is not None]
    squared_errors = [
        (cast_probability(item) - (1.0 if item.outcome is True else 0.0)) ** 2
        for item in brier_rows
    ]
    brier = sum(squared_errors) / len(squared_errors) if brier_rows else None
    ece = None
    if evaluated:
        total = 0.0
        for index in range(bins):
            low, high = index / bins, (index + 1) / bins
            group = [
                item
                for item in evaluated
                if low <= item.confidence <= high
                and (index == bins - 1 or item.confidence < high)
            ]
            if group:
                observed = sum(item.prediction == item.outcome for item in group) / len(
                    group
                )
                expected = sum(item.confidence for item in group) / len(group)
                total += len(group) / len(evaluated) * abs(observed - expected)
        ece = total
    negatives = [item for item in binary if item.outcome is False]
    positives = [item for item in binary if item.outcome is True]
    false_positive = (
        sum(item.prediction is True for item in negatives) / len(negatives)
        if negatives
        else None
    )
    false_negative = (
        sum(item.prediction is False for item in positives) / len(positives)
        if positives
        else None
    )
    count = len(observations)
    latencies = [float(item.latency_ms) for item in observations]
    return BenchmarkMetrics(
        count=count,
        evaluated=len(evaluated),
        accuracy=accuracy,
        agreement=accuracy,
        brier_score=brier,
        expected_calibration_error=ece,
        latency_p50_ms=_percentile(latencies, 0.50),
        latency_p95_ms=_percentile(latencies, 0.95),
        latency_p99_ms=_percentile(latencies, 0.99),
        cost_usd=sum(float(item.cost_usd) for item in observations),
        false_positive_rate=false_positive,
        false_negative_rate=false_negative,
        abstention_rate=(
            sum(item.prediction is None for item in observations) / count
            if count
            else 0.0
        ),
        human_correction_rate=(
            sum(item.human_correction is not None for item in observations) / count
            if count
            else 0.0
        ),
    )


def cast_probability(item: BenchmarkObservation) -> float:
    """Return a checked probability from a calibration row."""
    if item.probability is None:
        raise ValueError("calibration row has no probability")
    return float(item.probability)
