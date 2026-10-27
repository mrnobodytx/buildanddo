# ─── CGRF Header ──────────────────────────────
# File:        apps/sentry_guild/lessons.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/sentry_guild/seer.py, apps/sentry_guild/scrub.py
# EnumType:    Policy
# EnumEdges:   DEPENDS_ON apps/sentry_guild/seer.py; DEPENDS_ON apps/sentry_guild/scrub.py
# DAG Node:    none
# Intent:      Turn a Seer run into a code-free lesson labelled INFERRED until a metric verifies the fix.
# ─────────────────────────────────────────────────────────────

"""Code-free lessons from Seer runs.

A lesson keeps what went wrong and what fixed it in plain language, and drops anything
that would let the code be reconstructed: code spans, fenced blocks, file paths, URLs and
secrets. Seer's analysis is model-produced, so a lesson starts as INFERRED; only
``promote`` with a RECOVERED verification may raise it to VERIFIED.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import asdict, dataclass, replace
from typing import Any

from apps.sentry_guild.scrub import redact
from apps.sentry_guild.seer import SeerRun

FENCE = re.compile(r"```.*?```", re.S)
INLINE = re.compile(r"`[^`\n]+`")
PATH = re.compile(r"(?:[\w.-]+/)+[\w.-]+\.\w{1,5}(?::\d+)?")
SPACE = re.compile(r"\s+")
MAX_TEXT = 600
LABELS = ("INFERRED", "VERIFIED")


def plain(text: Any) -> str:
    """Strip code, paths and secrets, collapse whitespace and cap length."""
    value = str(text or "")
    value = FENCE.sub("[code]", value)
    value = INLINE.sub("[code]", value)
    value = PATH.sub("[path]", value)
    value = SPACE.sub(" ", redact(value)).strip()
    return value[:MAX_TEXT]


@dataclass(frozen=True)
class Lesson:
    lesson_id: str
    group_id: str
    run_id: str
    symptom: str
    cause: str
    why_chain: tuple[str, ...]
    fix: tuple[str, ...]
    files_changed: int
    pull_requests: int
    label: str = "INFERRED"
    evidence: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _steps(items: Any, keys: tuple[str, ...]) -> tuple[str, ...]:
    out: list[str] = []
    for item in items if isinstance(items, list) else []:
        if isinstance(item, Mapping):
            text = " ".join(str(item.get(key) or "") for key in keys).strip()
        else:
            text = str(item)
        if text:
            out.append(plain(text))
    return tuple(out)


def from_run(run: SeerRun) -> Lesson:
    """Build a lesson; requires at least the root cause stage."""
    if run.root_cause is None:
        raise ValueError("run has no root cause yet")
    cause = run.root_cause
    solution = run.solution or {}
    body = {
        "group_id": run.group_id,
        "cause": plain(cause.get("description") or cause.get("title")),
        "fix": _steps(solution.get("steps"), ("title", "description")),
    }
    lesson_id = "lsn-" + hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16]
    return Lesson(
        lesson_id=lesson_id,
        group_id=run.group_id,
        run_id=run.run_id,
        symptom=plain(cause.get("title") or cause.get("description")),
        cause=body["cause"],
        why_chain=_steps(cause.get("five_whys") or cause.get("why"), ("text", "description")),
        fix=body["fix"] or ((plain(solution.get("summary")),) if solution.get("summary") else ()),
        files_changed=sum(1 for _ in run.changes),
        pull_requests=len(run.pull_requests),
    )


def promote(lesson: Lesson, verdict: str, evidence: str) -> Lesson:
    """Raise to VERIFIED only on a RECOVERED verdict with an evidence reference."""
    if verdict != "RECOVERED" or not evidence:
        return lesson
    return replace(lesson, label="VERIFIED", evidence=evidence)
