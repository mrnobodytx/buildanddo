# ─── CGRF Header ──────────────────────────────
# File:        apps/sentry_guild/verify.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     none
# EnumType:    Policy
# EnumEdges:   VALIDATES Seer fixes against Datadog metric series
# DAG Node:    none
# Intent:      Decide from before and after metric points whether a deployed fix actually recovered the service.
# ─────────────────────────────────────────────────────────────

"""Metric verification of a fix.

The caller supplies points from a Datadog (or any) metric query: the error or latency
series before the fix and after it was deployed. No network call is made here. A fix is
RECOVERED only when the after-window has enough points, its mean is below the threshold
and it improved on the before-window by at least ``min_improvement``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from statistics import fmean

VERDICTS = ("RECOVERED", "NOT_RECOVERED", "INSUFFICIENT_DATA")


@dataclass(frozen=True)
class Verdict:
    verdict: str
    before: float | None
    after: float | None
    reason: str


def _clean(points: Sequence[float]) -> list[float]:
    return [float(p) for p in points if isinstance(p, (int, float)) and not isinstance(p, bool) and p == p]


def assess(before: Sequence[float], after: Sequence[float], threshold: float,
           min_points: int = 3, min_improvement: float = 0.5) -> Verdict:
    """Compare a lower-is-better series (errors, p95 latency) around a deploy."""
    if threshold < 0 or not 0 <= min_improvement <= 1 or min_points < 1:
        raise ValueError("invalid verification parameters")
    pre, post = _clean(before), _clean(after)
    if len(post) < min_points or not pre:
        return Verdict("INSUFFICIENT_DATA", fmean(pre) if pre else None, fmean(post) if post else None,
                       f"need at least {min_points} after-points and one before-point")
    b, a = fmean(pre), fmean(post)
    if a > threshold:
        return Verdict("NOT_RECOVERED", b, a, f"after mean {a:.4g} is above threshold {threshold:.4g}")
    if b > 0 and (b - a) / b < min_improvement:
        return Verdict("NOT_RECOVERED", b, a, f"improved less than {min_improvement:.0%}")
    return Verdict("RECOVERED", b, a, f"after mean {a:.4g} within threshold {threshold:.4g}")
