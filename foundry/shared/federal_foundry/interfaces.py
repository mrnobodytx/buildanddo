# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/interfaces.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/models.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/models.py
# DAG Node:    foundry.runner.contracts
# Intent:      Standardize bounded experiment and benchmark implementations without choosing a lane runtime.
# ───────────────────────────────────────────────────────────────

"""Define typed experiment runner and benchmark harness contracts."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping, Protocol, runtime_checkable
import math

from .models import EvidenceRecord, FoundryValidationError


def _metrics(value: Mapping[str, float]) -> dict[str, float]:
    metrics: dict[str, float] = {}
    for name, measurement in value.items():
        if (
            not isinstance(name, str)
            or not name.strip()
            or isinstance(measurement, bool)
            or not isinstance(measurement, (int, float))
            or not math.isfinite(measurement)
        ):
            raise FoundryValidationError("metrics require named finite numbers")
        metrics[name] = float(measurement)
    return metrics


@dataclass(frozen=True)
class ExperimentSpec:
    """Describe one bounded and reproducible experiment request."""

    experiment_id: str
    command: tuple[str, ...]
    seed: int
    inputs: Mapping[str, object] = field(default_factory=dict)
    expected_artifacts: tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if (
            not isinstance(self.experiment_id, str)
            or not self.experiment_id.strip()
            or not self.command
            or not all(
                isinstance(part, str) and part and "\x00" not in part
                for part in self.command
            )
            or type(self.seed) is not int
            or not 0 <= self.seed <= 2**32 - 1
        ):
            raise FoundryValidationError(
                "experiment id, command and nonnegative seed are required"
            )
        if len(set(self.expected_artifacts)) != len(self.expected_artifacts):
            raise FoundryValidationError("duplicate expected artifacts")


@dataclass(frozen=True)
class ExperimentResult:
    """Return a bounded experiment outcome without assigning evidence authority."""

    experiment_id: str
    status: str
    metrics: Mapping[str, float]
    artifacts: tuple[EvidenceRecord, ...] = ()
    notes: str = ""

    def __post_init__(self) -> None:
        if self.status not in {"succeeded", "failed", "cancelled"}:
            raise FoundryValidationError(f"unknown experiment status: {self.status}")
        object.__setattr__(self, "metrics", _metrics(self.metrics))


@runtime_checkable
class ExperimentRunner(Protocol):
    """Execute one experiment inside an implementation-owned workspace."""

    async def run(self, spec: ExperimentSpec, workspace: Path) -> ExperimentResult:
        """Run an experiment and return its explicit result."""


@dataclass(frozen=True)
class BenchmarkSpec:
    """Describe a deterministic benchmark over a named candidate."""

    benchmark_id: str
    candidate_id: str
    dataset: str
    metrics: tuple[str, ...]
    repetitions: int = 1

    def __post_init__(self) -> None:
        if (
            not self.benchmark_id.strip()
            or not self.candidate_id.strip()
            or not self.dataset.strip()
            or not self.metrics
            or self.repetitions < 1
        ):
            raise FoundryValidationError(
                "benchmark identity, dataset, metrics and repetitions are required"
            )


@dataclass(frozen=True)
class BenchmarkResult:
    """Return measurements and evidence produced by one benchmark."""

    benchmark_id: str
    status: str
    measurements: Mapping[str, float]
    evidence: tuple[EvidenceRecord, ...] = ()

    def __post_init__(self) -> None:
        if self.status not in {"succeeded", "failed", "cancelled"}:
            raise FoundryValidationError(f"unknown benchmark status: {self.status}")
        object.__setattr__(self, "measurements", _metrics(self.measurements))


@runtime_checkable
class BenchmarkHarness(Protocol):
    """Evaluate one candidate against a declared benchmark specification."""

    async def run(self, spec: BenchmarkSpec, workspace: Path) -> BenchmarkResult:
        """Run a benchmark and return explicit measurements."""
