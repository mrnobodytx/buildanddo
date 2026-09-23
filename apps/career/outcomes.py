# ─── CGRF Header ──────────────────────────────
# File:        apps/career/outcomes.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py, apps/career/ledger.py, apps/career/packages.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; DEPENDS_ON apps/career/ledger.py; DEPENDS_ON apps/career/packages.py; CONSUMES application packages; PRODUCES outcome report
# DAG Node:    none
# Intent:      Record human-reported application outcomes and show which representations of real work get responses, without over-reading small samples.
# ─────────────────────────────────────────────────────────────

"""Keep an append-only application outcome ledger and report response rates.

The system never submits. A human records that they applied with a specific
compiled package; later stages are recorded against that application. Rates
are reported per dimension, and a group below ``MIN_SAMPLE`` applications is
marked insufficient and excluded from any reallocation suggestion.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError
from apps.career.ledger import append_chain, read_chain
from apps.career.passport import parse_instant

STAGES = ("applied", "response", "screen", "technical", "offer")
TERMINAL = ("offer", "rejected", "withdrawn")
MIN_SAMPLE = 10
DIMENSIONS = ("role_family", "application_system", "lead_capability", "dossier_state")

ROLE_FAMILIES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("leadership", ("director", "head of", "vp", "vice president", "chief")),
    ("founding", ("founding",)),
    ("architect", ("architect",)),
    ("ai_ml", ("ai", "ml", "machine learning", "llm", "applied scientist")),
    ("security", ("security", "appsec")),
    ("platform_sre", ("platform", "sre", "site reliability", "devops", "infrastructure")),
    ("program_product", ("program", "product", "tpm")),
    ("frontend", ("frontend", "front-end", "ui engineer")),
    ("backend", ("backend", "back-end", "api")),
    ("data", ("data",)),
)


def role_family(title: str) -> str:
    """Return the coarse role family for a job title."""
    lowered = title.lower()
    for family, words in ROLE_FAMILIES:
        if any(re.search(r"(?<![a-z])" + re.escape(word) + r"(?![a-z])", lowered) for word in words):
            return family
    return "other"


def read_ledger(path: Path) -> list[dict[str, Any]]:
    """Read every ledger event and verify the hash chain; a missing ledger is empty."""
    return read_chain(path)


def _applications(events: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    apps: dict[str, dict[str, Any]] = {}
    for event in events:
        key = str(event.get("application_id"))
        if event.get("stage") == "applied":
            apps[key] = {**event, "history": ["applied"]}
        elif key in apps:
            apps[key]["history"].append(str(event.get("stage")))
    return apps


def record_applied(
    path: Path,
    package: dict[str, Any],
    *,
    at: str,
    recorded_by: str,
    channel: str | None = None,
) -> dict[str, Any]:
    """Append an ``applied`` event for a verified package the human submitted themselves."""
    if not recorded_by.strip():
        raise CareerError("recorded_by names the human who applied")
    parse_instant(at)
    manifest = package["manifest"]
    application_id = f"{manifest['job_id']}@{package['digest'][7:19]}"
    if application_id in _applications(read_ledger(path)):
        raise CareerError(f"application {application_id} is already recorded")
    claims = json.loads(package["files"]["evidence_manifest.json"])["claims"]
    brief = package["files"]["interview_brief.md"]
    state = re.search(r"^State: (\S+)", brief, re.MULTILINE)
    event = {
        "application_id": application_id,
        "stage": "applied",
        "at": at,
        "recorded_by": recorded_by,
        "job_id": manifest["job_id"],
        "package_digest": package["digest"],
        "role": package["role"],
        "role_family": role_family(package["role"]),
        "application_system": package["application_system"] or "unknown",
        "channel": channel or "direct",
        "lead_capability": claims[0]["capability_id"] if claims else "none",
        "dossier_state": state.group(1) if state else "unknown",
    }
    _append(path, event)
    return event


def record_stage(path: Path, application_id: str, stage: str, *, at: str, recorded_by: str) -> dict[str, Any]:
    """Append a later stage; stages only move forward and stop at a terminal state."""
    if stage not in STAGES[1:] + TERMINAL:
        raise CareerError(f"unknown stage {stage!r}")
    if not recorded_by.strip():
        raise CareerError("recorded_by is required")
    parse_instant(at)
    application = _applications(read_ledger(path)).get(application_id)
    if application is None:
        raise CareerError(f"no applied event for {application_id}")
    history = application["history"]
    if history[-1] in TERMINAL:
        raise CareerError(f"{application_id} already ended as {history[-1]}")
    last = max(STAGES.index(item) for item in history if item in STAGES)
    if stage in STAGES and STAGES.index(stage) <= last:
        raise CareerError(f"{stage} does not advance past {STAGES[last]}")
    event = {"application_id": application_id, "stage": stage, "at": at, "recorded_by": recorded_by}
    _append(path, event)
    return event


def _append(path: Path, event: dict[str, Any]) -> None:
    append_chain(path, event)


def _furthest(history: list[str]) -> int:
    return max(STAGES.index(item) for item in history if item in STAGES)


def report(events: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Return funnel counts per dimension and reallocation hints for adequate samples."""
    apps = list(_applications(events).values())
    funnel = {stage: sum(_furthest(item["history"]) >= index for item in apps) for index, stage in enumerate(STAGES)}
    groups: dict[str, list[dict[str, Any]]] = {}
    for dimension in DIMENSIONS:
        buckets: dict[str, list[dict[str, Any]]] = {}
        for item in apps:
            buckets.setdefault(str(item.get(dimension, "unknown")), []).append(item)
        rows = []
        for value, members in sorted(buckets.items()):
            applied = len(members)
            responded = sum(_furthest(item["history"]) >= 1 for item in members)
            rows.append({
                "value": value,
                "applied": applied,
                "responses": responded,
                "offers": sum(_furthest(item["history"]) >= 4 for item in members),
                "response_rate": round(responded / applied, 3),
                "sample": "adequate" if applied >= MIN_SAMPLE else "insufficient",
            })
        groups[dimension] = rows
    adequate = [row for row in groups["role_family"] if row["sample"] == "adequate"]
    hint = sorted(adequate, key=lambda row: (-row["response_rate"], row["value"]))
    return {
        "applications": len(apps),
        "funnel": funnel,
        "by_dimension": groups,
        "reallocation": [row["value"] for row in hint] if len(hint) >= 2 else [],
        "note": (
            f"groups with fewer than {MIN_SAMPLE} applications are insufficient and excluded from "
            "reallocation; correlations describe this ledger only, not causes"
        ),
    }
