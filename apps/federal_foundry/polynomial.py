# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/federal_foundry/polynomial.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/federal_foundry/catalog.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/federal_foundry/catalog.py
# Intent:      Check exact negacyclic products without confusing local CPU timing with official GPU qualification.
# ───────────────────────────────────────────────────────────────

"""Check integer polynomial candidates under an explicitly selected coefficient ring."""

from __future__ import annotations

import hashlib
import importlib.util
import shutil
from statistics import median

from apps.federal_foundry.catalog import require

REPORTED_N = 32768
REPORTED_W = 868


def negacyclic_product(
    left: list[int],
    right: list[int],
    *,
    width: int,
    modulus: int | None = None,
) -> list[int]:
    """Compute an exact product modulo x**N+1 using carry-free Kronecker packing.

    A None modulus means the integer coefficient ring. The caller must specify
    the official coefficient modulus when one is required; W only bounds inputs.
    No floating-point arithmetic or probabilistic check is used.
    """
    require(type(width) is int and 1 <= width <= 1792, "invalid_coefficient_width")
    require(isinstance(left, list) and isinstance(right, list), "invalid_coefficients")
    n = len(left)
    require(1 <= n <= 65536 and n == len(right) and n & (n - 1) == 0, "invalid_degree")
    require(
        modulus is None
        or type(modulus) is int
        and 2 <= modulus <= 1 << (2 * width + n.bit_length()),
        "invalid_modulus",
    )
    bound = 1 << width
    require(
        all(type(value) is int and 0 <= value < bound for value in (*left, *right)),
        "coefficient_out_of_range",
    )
    # Each linear convolution coefficient is < N*2**(2W). Byte alignment allows
    # linear extraction without repeatedly shifting a multi-megabyte integer.
    stride = (2 * width + (n - 1).bit_length() + 7) // 8
    a = int.from_bytes(
        b"".join(value.to_bytes(stride, "little") for value in left), "little"
    )
    b = int.from_bytes(
        b"".join(value.to_bytes(stride, "little") for value in right), "little"
    )
    convolution = (a * b).to_bytes(2 * n * stride, "little")
    result = []
    for i in range(n):
        low = int.from_bytes(convolution[i * stride : (i + 1) * stride], "little")
        high = int.from_bytes(
            convolution[(i + n) * stride : (i + n + 1) * stride], "little"
        )
        value = low - high
        result.append(value if modulus is None else value % modulus)
    return result


def check_candidate(
    left: list[int],
    right: list[int],
    candidate: list[int],
    *,
    width: int,
    modulus: int | None,
) -> dict[str, object]:
    """Compare every coefficient and report local correctness without qualification."""
    require(
        isinstance(candidate, list) and all(type(v) is int for v in candidate),
        "invalid_candidate",
    )
    expected = negacyclic_product(left, right, width=width, modulus=modulus)
    require(len(candidate) == len(expected), "candidate_degree_mismatch")
    mismatches = [
        index
        for index, (actual, target) in enumerate(zip(candidate, expected, strict=True))
        if actual != target
    ]
    return {
        "state": "PASS" if not mismatches else "FAIL",
        "checked_coefficients": len(expected),
        "mismatch_count": len(mismatches),
        "first_mismatches": mismatches[:16],
        "ring": "integers" if modulus is None else "explicit_modulus",
        "width": width,
        "output_sha256": hashlib.sha256(
            ",".join(str(v) for v in candidate).encode("ascii")
        ).hexdigest(),
        "official_correctness": "UNMEASURED",
        "gpu_performance": "UNMEASURED",
    }


def continuation_gate(
    samples_us: list[float], *, leader_us: float
) -> dict[str, object]:
    """Apply the owner's internal experiment thresholds to caller-supplied timings."""
    import math

    require(
        3 <= len(samples_us) <= 10000
        and all(
            type(x) in (int, float) and math.isfinite(x) and x > 0 for x in samples_us
        ),
        "invalid_timing_samples",
    )
    require(
        type(leader_us) in (int, float)
        and math.isfinite(leader_us)
        and 0 < leader_us <= 500,
        "invalid_comparison_baseline",
    )
    measured = median(samples_us)
    return {
        "median_us": measured,
        "leader_us": leader_us,
        "state": "GO"
        if measured <= 2 * leader_us
        else "WATCH"
        if measured <= 1000
        else "PIVOT",
        "scope": "internal planning only; timings and leaderboard require official provenance",
        "official_qualification": "UNMEASURED",
    }


def doctor() -> dict[str, object]:
    """Report local prerequisites without installing packages or contacting providers."""
    available = {
        name: shutil.which(name) is not None
        for name in ("nvcc", "nvidia-smi", "fherma")
    }
    available["cupy"] = importlib.util.find_spec("cupy") is not None
    return {
        "state": "BLOCKED",
        "available": available,
        "reported_parameters": {"N": REPORTED_N, "W": REPORTED_W},
        "parameter_status": "OWNER_SUPPLIED_UNVERIFIED",
        "official_interface": "UNMEASURED",
        "required": [
            "exact challenge/rules capture and coefficient ring",
            "official starter interface and cuPQC SDK",
            "GPU runner and official correctness/benchmark receipt",
        ],
    }
