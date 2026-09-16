# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/baselines.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/market.py, foundry/shared/federal_foundry/retrieval.py, foundry/shared/federal_foundry/simulations.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON foundry/shared/federal_foundry/market.py; DEPENDS_ON foundry/shared/federal_foundry/retrieval.py; DEPENDS_ON foundry/shared/federal_foundry/simulations.py
# DAG Node:    none
# Intent:      Expose five finite reference workloads through one measured local execution entry point.
# ───────────────────────────────────────────────────────────────

"""Execute a selected public reference workload without provider or network access."""

from __future__ import annotations

from pathlib import Path
import sys
import time
import tracemalloc
from typing import Callable

from . import market, retrieval, simulations
from .models import FoundryValidationError
from .validation import integer, mapping, read_json, write_json

Workload = Callable[[dict[str, object], str, int], dict[str, object]]
WORKLOADS: dict[str, Workload] = {
    "darpa-dv026-influence": market.evaluate,
    "navair-acquisition-analysis": retrieval.evaluate,
    "daf-nv027-low-swap": simulations.low_swap,
    "darpa-semantic-isr": simulations.semantic,
    "diu-sentinel-maritime": simulations.maritime,
}
CANDIDATES: dict[str, tuple[str, str]] = {
    "darpa-dv026-influence": ("truthful-auction", "shaded-auction"),
    "navair-acquisition-analysis": ("bm25", "tfidf"),
    "daf-nv027-low-swap": ("dense-temporal", "event-gated"),
    "darpa-semantic-isr": ("full-scene-json", "roi-delta-json"),
    "diu-sentinel-maritime": ("ordered-observations", "shuffled-observations"),
}


def evaluate(request: dict[str, object]) -> dict[str, object]:
    """Measure the selected workload with the same validated input as its child CLI."""
    lane, candidate = str(request.get("lane_id")), str(request.get("candidate_id"))
    if lane not in WORKLOADS or candidate not in CANDIDATES[lane]:
        raise FoundryValidationError("unknown lane or reference candidate")
    seed = integer(request.get("seed"), 0, 2**32 - 1, "seed")
    dataset = mapping(request.get("dataset"), "dataset")
    if (
        dataset.get("classification") != "PUBLIC"
        or dataset.get("kind") != "synthetic"
        or not isinstance(dataset.get("license"), str)
        or not str(dataset["license"]).strip()
        or not isinstance(dataset.get("id"), str)
        or not str(dataset["id"]).strip()
        or dataset.get("lane_id") != lane
    ):
        raise FoundryValidationError(
            "reference workloads require explicit public synthetic data rights"
        )
    tracing = tracemalloc.is_tracing()
    if not tracing:
        tracemalloc.start()
    clock = time.perf_counter()
    try:
        result = WORKLOADS[lane](dataset, candidate, seed)
        elapsed = (time.perf_counter() - clock) * 1000
        _, peak = tracemalloc.get_traced_memory()
    finally:
        if not tracing:
            tracemalloc.stop()
    return {
        "schema_version": "foundry.measurement/v1",
        "lane_id": lane,
        "candidate_id": candidate,
        "seed": seed,
        "dataset_id": dataset.get("id"),
        "data_kind": "synthetic",
        **result,
        "resources": {
            "elapsed_ms": round(elapsed, 6),
            "peak_python_bytes": peak,
            "method": "perf_counter with tracemalloc active; Python allocations, not process RSS",
        },
    }


def main() -> int:
    """Read one frozen input and create its measured result in the working directory."""
    try:
        request = read_json(Path.cwd(), "input.json")
        write_json(Path.cwd() / "measurement.json", evaluate(request))
    except (FoundryValidationError, ValueError, OSError) as error:
        print(f"reference workload failed: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
