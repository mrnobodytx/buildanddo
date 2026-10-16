# ─── CGRF Header ──────────────────────────────
# File:        apps/sentry_guild/seer.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     none
# EnumType:    Adapter
# EnumEdges:   CONSUMES Sentry integration-platform Seer webhooks
# DAG Node:    none
# Intent:      Authenticate Seer webhook deliveries and fold their seven stages into one run record per Issue Fix.
# ─────────────────────────────────────────────────────────────

"""Seer webhook intake.

Sentry signs integration-platform webhooks with HMAC-SHA256 of the raw body using the
integration's client secret and sends it as ``Sentry-Hook-Signature``. ``verify_signature``
checks it in constant time; the secret is passed in by the caller and never stored here.

Seer emits seven actions per Issue Fix run, each carrying ``run_id`` and ``group_id``.
``fold`` merges deliveries into one ``SeerRun`` and keeps them in stage order, so late or
duplicate deliveries cannot move a run backwards.
"""

from __future__ import annotations

import hashlib
import hmac
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field, replace
from typing import Any

STAGES: tuple[str, ...] = (
    "root_cause_started", "root_cause_completed", "solution_started", "solution_completed",
    "coding_started", "coding_completed", "pr_created",
)
RANK = {name: index for index, name in enumerate(STAGES)}


class SeerError(ValueError):
    """Raised for a delivery that is not an authentic, well-formed Seer event."""


def verify_signature(body: bytes, signature: str, secret: str) -> bool:
    """Constant-time check of ``Sentry-Hook-Signature`` against the raw request body."""
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip().lower())


@dataclass(frozen=True)
class SeerEvent:
    action: str
    run_id: str
    group_id: str
    payload: Mapping[str, Any]


def parse(delivery: Mapping[str, Any], resource: str = "seer") -> SeerEvent:
    """Validate one webhook delivery and return its stage, run and issue ids."""
    if resource != "seer":
        raise SeerError(f"not a Seer delivery: resource={resource!r}")
    action = delivery.get("action")
    if action not in RANK:
        raise SeerError(f"unknown Seer action: {action!r}")
    data = delivery.get("data")
    if not isinstance(data, Mapping):
        raise SeerError("delivery has no data object")
    run_id, group_id = data.get("run_id"), data.get("group_id")
    if run_id in (None, "") or group_id in (None, ""):
        raise SeerError("delivery is missing run_id or group_id")
    return SeerEvent(action=str(action), run_id=str(run_id), group_id=str(group_id), payload=data)


@dataclass(frozen=True)
class SeerRun:
    run_id: str
    group_id: str
    stage: str
    root_cause: Mapping[str, Any] | None = None
    solution: Mapping[str, Any] | None = None
    changes: tuple[Mapping[str, Any], ...] = ()
    pull_requests: tuple[Mapping[str, Any], ...] = ()
    seen: tuple[str, ...] = field(default_factory=tuple)

    @property
    def complete(self) -> bool:
        return self.stage == "pr_created"


def _seq(value: Any) -> tuple[Mapping[str, Any], ...]:
    if isinstance(value, Mapping):
        return tuple(dict(item, repo=repo) if isinstance(item, Mapping) else {"repo": repo, "value": item}
                     for repo, items in value.items() for item in (items if isinstance(items, list) else [items]))
    if isinstance(value, list):
        return tuple(item for item in value if isinstance(item, Mapping))
    return ()


def apply(run: SeerRun | None, event: SeerEvent) -> SeerRun:
    """Merge one event into its run. Stages never move backwards."""
    if run is None:
        run = SeerRun(run_id=event.run_id, group_id=event.group_id, stage=event.action)
    elif (run.run_id, run.group_id) != (event.run_id, event.group_id):
        raise SeerError("event belongs to a different run")
    data = event.payload
    updates: dict[str, Any] = {"seen": tuple(sorted(set(run.seen) | {event.action}, key=RANK.__getitem__))}
    if RANK[event.action] > RANK[run.stage]:
        updates["stage"] = event.action
    if event.action == "root_cause_completed" and isinstance(data.get("root_cause"), Mapping):
        updates["root_cause"] = data["root_cause"]
    elif event.action == "solution_completed" and isinstance(data.get("solution"), Mapping):
        updates["solution"] = data["solution"]
    elif event.action == "coding_completed":
        updates["changes"] = _seq(data.get("changes"))
    elif event.action == "pr_created":
        updates["pull_requests"] = _seq(data.get("pull_requests"))
    return replace(run, **updates)


def fold(events: Iterable[SeerEvent]) -> dict[str, SeerRun]:
    """Fold deliveries into one run per ``run_id``."""
    runs: dict[str, SeerRun] = {}
    for event in events:
        runs[event.run_id] = apply(runs.get(event.run_id), event)
    return runs
