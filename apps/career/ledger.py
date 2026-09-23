# ─── CGRF Header ──────────────────────────────
# File:        apps/career/ledger.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/evidence.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/career/evidence.py; PRODUCES apps/career/outcomes.py; PRODUCES apps/career/assessments.py
# DAG Node:    none
# Intent:      Give every append-only career record one hash chain, so an edited, removed or reordered line is detected on read.
# ─────────────────────────────────────────────────────────────

"""Read and append hash-chained JSON-lines ledgers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from apps.career.evidence import CareerError, canonical_digest

GENESIS = "sha256:" + "0" * 64


def chain_digest(event: dict[str, Any]) -> str:
    """Return the digest of an event without its own digest field."""
    return canonical_digest({key: value for key, value in event.items() if key != "digest"})


def read_chain(path: Path) -> list[dict[str, Any]]:
    """Read every event and verify ``prev``/``digest`` links; a missing ledger is empty."""
    if not path.exists():
        return []
    events: list[dict[str, Any]] = []
    previous = GENESIS
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as error:
            raise CareerError(f"ledger line {number} is not JSON") from error
        if not isinstance(event, dict):
            raise CareerError(f"ledger line {number} is not an object")
        if event.get("prev") != previous or event.get("digest") != chain_digest(event):
            raise CareerError(f"ledger line {number} breaks the hash chain; the ledger was edited")
        previous = str(event["digest"])
        events.append(event)
    return events


def append_chain(path: Path, event: dict[str, Any]) -> dict[str, Any]:
    """Link an event to the ledger's last digest and append it."""
    existing = read_chain(path)
    event["prev"] = existing[-1]["digest"] if existing else GENESIS
    event["digest"] = chain_digest(event)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
    return event
