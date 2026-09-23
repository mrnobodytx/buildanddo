# ─── CGRF Header ──────────────────────────────
# File:        apps/knowledge_units/mastery.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/knowledge_units/units.py, apps/career/ledger.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/knowledge_units/units.py; DEPENDS_ON apps/career/ledger.py; PRODUCES apps/knowledge_units/receipt.py
# DAG Node:    none
# Intent:      Place each learner on the KNOW to VERIFIED ladder from recorded evidence only, so reading or watching never earns a rung.
# ─────────────────────────────────────────────────────────────

"""Compute learner mastery rungs from a hash-chained evidence ledger."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from apps.career.ledger import append_chain, read_chain
from apps.knowledge_units.units import UnitError, _text, unit_digest

RUNGS = ("NONE", "KNOW", "UNDERSTAND", "DEMONSTRATE", "APPLY", "VERIFIED")


def record_assessment(ledger: Path, unit: dict[str, Any], *, learner: str, level: str,
                      passed: bool, at: str) -> dict[str, Any]:
    """Append a graded assessment result bound to the assessed unit's normalized content."""
    if level not in ("recall", "explain"):
        raise UnitError("level must be recall or explain")
    if not isinstance(passed, bool):
        raise UnitError("passed must be a boolean")
    return append_chain(ledger, {"kind": "assessment", "unit_id": unit["unit_id"], "version": unit["version"],
                                 "unit_digest": unit_digest(unit),
                                 "learner": _text(learner, "learner", 120), "level": level,
                                 "passed": passed, "at": _text(at, "at", 40)})


def record_transfer(ledger: Path, unit: dict[str, Any], *, learner: str, reviewer: str,
                    meets_rubric: bool, at: str) -> dict[str, Any]:
    """Append a transfer-task review; a learner cannot review their own task."""
    if not isinstance(meets_rubric, bool):
        raise UnitError("meets_rubric must be a boolean")
    who, by = _text(learner, "learner", 120), _text(reviewer, "reviewer", 120)
    if who == by:
        raise UnitError("a learner cannot review their own transfer task")
    return append_chain(ledger, {"kind": "transfer", "unit_id": unit["unit_id"], "version": unit["version"],
                                 "unit_digest": unit_digest(unit),
                                 "learner": who, "reviewer": by, "meets_rubric": meets_rubric,
                                 "at": _text(at, "at", 40)})


def _bound_events(events: list[dict[str, Any]], unit: dict[str, Any]) -> list[dict[str, Any]]:
    digest = unit_digest(unit)
    # Legacy history without this binding cannot establish mastery of any revision.
    return [e for e in events if e.get("unit_id") == unit["unit_id"] and e.get("version") == unit["version"]
            and e.get("unit_digest") == digest]


def rung(events: list[dict[str, Any]], unit: dict[str, Any], learner: str) -> str:
    """Return the highest rung supported for one learner on this exact unit revision."""
    mine = [e for e in _bound_events(events, unit) if e.get("learner") == learner]
    for event in mine:
        if event.get("kind") == "assessment":
            if not isinstance(event.get("passed"), bool):
                raise UnitError("passed must be a boolean")
            if event.get("level") not in ("recall", "explain"):
                raise UnitError("level must be recall or explain")
        elif event.get("kind") == "transfer" and not isinstance(event.get("meets_rubric"), bool):
            raise UnitError("meets_rubric must be a boolean")
    passed = {e["level"] for e in mine if e.get("kind") == "assessment" and e.get("passed") is True}
    applied = [_text(e.get("reviewer"), "reviewer", 120) for e in mine
               if e.get("kind") == "transfer" and e.get("meets_rubric") is True]
    if learner in applied:
        raise UnitError("a learner cannot review their own transfer task")
    independent = [reviewer for reviewer in applied if reviewer != unit["author"]]
    if "recall" in passed and "explain" in passed:
        if independent:
            return "VERIFIED"
        return "APPLY" if applied else "DEMONSTRATE"
    if "explain" in passed:
        return "UNDERSTAND"
    return "KNOW" if "recall" in passed else "NONE"


def mastery(ledger: Path, unit: dict[str, Any]) -> dict[str, Any]:
    """Return learner rungs and attempt counts for this exact unit revision only."""
    events = _bound_events(read_chain(ledger), unit)
    learners = sorted({_text(e.get("learner"), "learner", 120) for e in events})
    rows = {learner: rung(events, unit, learner) for learner in learners}
    counts = {name: sum(value == name for value in rows.values()) for name in RUNGS}
    return {"unit_id": unit["unit_id"], "version": unit["version"], "unit_digest": unit_digest(unit),
            "learners": rows, "counts": counts,
            "attempts": sum(1 for e in events if e.get("kind") == "assessment")}
