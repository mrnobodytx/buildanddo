# ─── CGRF Header ──────────────────────────────
# File:        apps/world_twin/projection.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WORLD-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/twin.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/world_twin/twin.py
# DAG Node:    none
# Intent:      Keep the private twin private: community and public views are narrower projections, and minors get no public graph.
# ─────────────────────────────────────────────────────────────

"""Audience projections of a twin and suppressed community aggregates."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from apps.world_twin.events import TwinError, effective_state
from apps.world_twin.twin import build_twin

AUDIENCES = ("private", "community", "public")
SECTIONS = ("activity", "capabilities", "history", "community", "impact", "measures", "trust_by_context")
MIN_GROUP = 10


def project(entries: list[dict[str, Any]], subject: str, audience: str, *,
            shared: tuple[str, ...] = (), minor: bool = False) -> dict[str, Any]:
    """Return what an audience may see; sections outside ``shared`` are withheld for non-private audiences."""
    if audience not in AUDIENCES:
        raise TwinError(f"audience must be one of {', '.join(AUDIENCES)}")
    if not set(shared) <= set(SECTIONS):
        raise TwinError(f"shared sections must be among {', '.join(SECTIONS)}")
    if audience == "private":
        return {**build_twin(entries, subject), "audience": "private"}
    if minor and audience == "public":
        return {"subject": subject, "audience": "public", "withheld": "no public projection for a minor"}
    allowed = {"community": ("COMMUNITY", "PUBLIC"), "public": ("PUBLIC",)}[audience]
    visible = [e for e in entries if e.get("kind") != "event" or e["visibility"] in allowed]
    twin = build_twin(visible, subject)
    keep = [s for s in shared if not (minor and s == "community")]
    return {"schema": twin["schema"], "subject": subject, "audience": audience,
            **{section: twin[section] for section in keep},
            "withheld": sorted(set(SECTIONS) - set(keep))}


def world_state(entries: list[dict[str, Any]], min_group: int = MIN_GROUP) -> dict[str, Any]:
    """Aggregate community figures per capability; groups smaller than ``min_group`` people are suppressed."""
    learners: dict[str, set[str]] = defaultdict(set)
    verified: dict[str, set[str]] = defaultdict(set)
    for event in entries:
        if event.get("kind") != "event" or not event["capability"]:
            continue
        learners[event["capability"]].add(event["actor"])
        if effective_state(event) == "VERIFIED" and event["outcome"] == "SUCCESS":
            verified[event["capability"]].add(event["actor"])
    open_disputes = sum(1 for e in entries if e.get("kind") == "dispute") - \
        sum(1 for e in entries if e.get("kind") == "resolution")

    def shown(people: set[str]) -> int | None:
        return len(people) if len(people) >= min_group else None
    return {"capabilities": {cap: {"people": shown(people), "with_verified_success": shown(verified[cap])}
                             for cap, people in sorted(learners.items())},
            "open_disputes": open_disputes,
            "note": f"counts under {min_group} people are suppressed; correlations here are candidates, not causes"}
