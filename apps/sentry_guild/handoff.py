# ─── CGRF Header ──────────────────────────────
# File:        apps/sentry_guild/handoff.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/sentry_guild/lessons.py, apps/sentry_guild/seer.py, apps/sentry_guild/verify.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/sentry_guild/lessons.py; DEPENDS_ON apps/sentry_guild/verify.py
# DAG Node:    none
# Intent:      Write a guild handoff that keeps Seer as producer, Oracle and the metric as verifiers, and a human as the closer.
# ─────────────────────────────────────────────────────────────

"""Guild handoff for one Seer run.

Roles are fixed: Seer (external) produces the diagnosis and fix, Sentinel triages the
issue, Oracle reviews the lesson and the metric verdict decides whether it is VERIFIED.
The producer never verifies. Any change Seer proposes is a pull request that must pass
BuildAndDo's own gates, and the handoff is always ``open`` until a human closes it.
"""

from __future__ import annotations

from typing import Any

from apps.sentry_guild.lessons import Lesson
from apps.sentry_guild.seer import SeerRun
from apps.sentry_guild.verify import Verdict

ROLES: dict[str, str] = {
    "seer": "producer: root cause, solution and draft pull request (external, Sentry)",
    "sentinel": "triage: issue intake inside the BuildAndDo scope",
    "oracle": "verifier: lesson is code-free and its claims match the run",
    "metric": "verifier: before/after series decide RECOVERED",
}


def record(run: SeerRun, lesson: Lesson | None, verdict: Verdict | None) -> dict[str, Any]:
    return {
        "kind": "sentry-guild-handoff",
        "status": "open",
        "run_id": run.run_id,
        "group_id": run.group_id,
        "stage": run.stage,
        "complete": run.complete,
        "lesson": lesson.to_dict() if lesson else None,
        "verdict": None if verdict is None else {
            "verdict": verdict.verdict, "before": verdict.before, "after": verdict.after, "reason": verdict.reason},
        "pull_requests": [str(pr.get("url") or pr.get("number") or "") for pr in run.pull_requests],
        "roles": ROLES,
        "closer": "human",
    }


def markdown(data: dict[str, Any]) -> str:
    lesson = data.get("lesson") or {}
    verdict = data.get("verdict") or {}
    lines = [
        f"# Sentry guild handoff: issue {data['group_id']}, run {data['run_id']}",
        "",
        f"**Status:** {data['status']} **Stage:** {data['stage']} **Label:** {lesson.get('label', 'n/a')}",
        "",
        "## Lesson",
        f"- Symptom: {lesson.get('symptom') or 'n/a'}",
        f"- Cause: {lesson.get('cause') or 'n/a'}",
    ]
    lines += [f"- Why: {step}" for step in lesson.get("why_chain") or ()]
    lines += [f"- Fix: {step}" for step in lesson.get("fix") or ()]
    lines += ["", "## Verification", f"- Verdict: {verdict.get('verdict', 'not run')}"]
    if verdict:
        lines.append(f"- Reason: {verdict.get('reason')}")
    lines += ["", "## Pull requests"] + [f"- {pr}" for pr in data["pull_requests"] or ["none yet"]]
    lines += ["", "Closer: a human reviewer. Seer never merges; its pull requests pass BuildAndDo gates."]
    return "\n".join(lines) + "\n"
