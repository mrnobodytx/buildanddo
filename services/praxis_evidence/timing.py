#!/usr/bin/env python3
"""
timing.py - timing is a distribution, not a constant (doc rule #4). Never
outputs an unsupported exact duration; a single observation is reported as
n=1, not promoted to a population estimate.
"""
from __future__ import annotations
import datetime as dt
import statistics

from client import PocketBaseClient
from registry import next_display_id


def record_timing(client: PocketBaseClient, *, method_id: str, activity: str, duration_value: float,
                   duration_unit: str, confidence: str, sessions: int | None = None,
                   minutes_per_session_mean: float | None = None, experience_level: str | None = None,
                   prior_skill: dict | None = None, criterion_met: bool = True,
                   observed_at: str | None = None) -> dict:
    display_id = next_display_id("praxis_timing", client)
    record = {
        "display_id": display_id, "praxis_method": method_id, "activity": activity,
        "duration_value": duration_value, "duration_unit": duration_unit, "confidence": confidence,
        "sessions": sessions, "minutes_per_session_mean": minutes_per_session_mean,
        "experience_level": experience_level, "prior_skill": prior_skill or {},
        "criterion_met": criterion_met, "observed_at": observed_at or dt.datetime.now(dt.timezone.utc).isoformat(),
    }
    return client.create("praxis_timing", record)


def timing_distribution(client: PocketBaseClient, *, method_id: str,
                         experience_level: str | None = None, successful_only: bool = True) -> dict:
    """A single sample is reported honestly as n=1 (with the raw value, no
    percentile math that implies a population), never silently treated as if
    it generalizes."""
    filter_expr = f'praxis_method="{method_id}"'
    if experience_level:
        filter_expr += f' && experience_level="{experience_level}"'
    if successful_only:
        filter_expr += ' && criterion_met=true'
    observations = client.list("praxis_timing", filter_expr=filter_expr, per_page=500)
    if not observations:
        return {"state": "NO_DATA", "n": 0, "method_id": method_id, "experience_level": experience_level}

    values = sorted(o["duration_value"] for o in observations)
    n = len(values)
    if n == 1:
        return {"state": "SINGLE_OBSERVATION", "n": 1, "value": values[0],
                 "method_id": method_id, "experience_level": experience_level,
                 "note": "n=1 - a single observation, not a population estimate"}

    def _pct(p: float) -> float:
        idx = p * (n - 1)
        lo, hi = int(idx), min(int(idx) + 1, n - 1)
        return values[lo] + (values[hi] - values[lo]) * (idx - lo)

    return {
        "state": "DISTRIBUTION", "n": n, "method_id": method_id, "experience_level": experience_level,
        "median": statistics.median(values), "p25": _pct(0.25), "p75": _pct(0.75), "p90": _pct(0.90),
    }
