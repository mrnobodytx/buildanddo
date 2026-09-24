# ─── CGRF Header ──────────────────────────────
# File:        apps/knowledge_units/receipt.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001, SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/knowledge_units/units.py, apps/knowledge_units/mastery.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/knowledge_units/units.py; DEPENDS_ON apps/knowledge_units/mastery.py
# DAG Node:    none
# Intent:      Publish a knowledge receipt whose every number is counted from the unit and its evidence, including what is not yet established.
# ─────────────────────────────────────────────────────────────

"""Compile the public knowledge receipt for a unit."""

from __future__ import annotations

from datetime import date
from typing import Any

from apps.knowledge_units.units import UnitError, unit_digest, unit_state


def compile_receipt(unit: dict[str, Any], today: date, learning: dict[str, Any] | None = None) -> dict[str, Any]:
    """Count claims, sources, items and standards; derive state; state the CPE boundary."""
    claims = unit["claims"]
    by = {status: sum(c["status"] == status for c in claims) for status in ("proposed", "reviewed", "contested", "retracted")}
    state = unit_state(unit, today)
    receipt: dict[str, Any] = {
        "schema": "buildanddo.knowledge-receipt/v1",
        "knowledge_id": unit["unit_id"], "version": unit["version"], "title": unit["title"],
        "unit_digest": unit_digest(unit), "state": state,
        "author": unit["author"],
        "reviewer": unit["reviewer"] if unit["reviewer"] != unit["author"] else None,
        "sources": len(unit["sources"]),
        "primary_sources": sum(s["kind"] == "primary" for s in unit["sources"]),
        "claims": len(claims), "claims_by_status": by,
        "assessment_items": len(unit["items"]), "items_reviewed": sum(i["reviewed"] for i in unit["items"]),
        "standards_declared": len(unit["standards"]),
        "standards_confirmed": sum(s["confirmed"] for s in unit["standards"]),
        "last_review": unit["last_review"], "next_review": unit["next_review"],
        "freshness": "STALE" if state == "STALE" else "PASS",
        "cpe": {
            "suggested_hours": unit["surfaces"]["professional"]["suggested_hours"],
            "credit": "PROVIDER_REFERENCE_RECORDED" if unit["cpe"]["provider_approval"] else "NOT_ISSUED",
            "provider_approval": unit["cpe"]["provider_approval"],
            "note": "BuildAndDo records a provider reference only; it does not issue CPE credit or certification",
        },
        "limits": [
            "standard mappings count as confirmed only when someone other than the author confirmed them",
            "a reviewed claim was checked by the named reviewer; it is not a guarantee of truth",
        ],
    }
    if learning is not None:
        if (learning.get("unit_id"), learning.get("version"), learning.get("unit_digest")) != \
                (unit["unit_id"], unit["version"], receipt["unit_digest"]):
            raise UnitError("mastery must match the unit revision and content")
        receipt["learners"] = len(learning["learners"])
        receipt["mastery_attempts"] = learning["attempts"]
        receipt["verified_mastery"] = learning["counts"]["VERIFIED"]
        receipt["mastery_counts"] = learning["counts"]
    return receipt
