# ─── CGRF Header ──────────────────────────────
# File:        apps/integrity/settlement.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/integrity/verdict.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/integrity/verdict.py
# DAG Node:    none
# Intent:      Settle competence and trust from the verdict alone, so being wrong is recoverable and lying about it is expensive.
# ─────────────────────────────────────────────────────────────

"""Disclosure-aware settlement: reward reads the verdict and nothing flows back into evidence."""

from __future__ import annotations

from typing import Any

from apps.integrity.verdict import check_verdict

# Units are policy-level signs and magnitudes for downstream XP/TP, not scores.
RULES: dict[tuple[str, bool], dict[str, Any]] = {
    ("PASS", True): {"competence": 1, "trust": 0, "investigate": False, "note": "verified success"},
    ("PASS", False): {"competence": 1, "trust": 1, "investigate": False, "note": "verified success, understated"},
    ("FAIL", False): {"competence": -1, "trust": 1, "investigate": False, "note": "failure disclosed"},
    ("FAIL", True): {"competence": -1, "trust": -3, "investigate": True, "note": "claimed success that did not verify"},
}


def settle(verdict: dict[str, Any], *, claimed_success: bool) -> dict[str, Any]:
    """Return the settlement; contested or incomplete verdicts hold everything."""
    check_verdict(verdict)
    final = verdict["final"]
    if final in ("CONTESTED", "INCOMPLETE"):
        rule = {"competence": 0, "trust": 0, "investigate": final == "CONTESTED" and claimed_success,
                "note": f"held: verdict {final.lower()}"}
    else:
        rule = RULES[(final, claimed_success)]
    if verdict["shortcuts"]:
        rule = {"competence": 0, "trust": -3, "investigate": True, "note": "disallowed shortcut detected"}
    return {"mission_id": verdict["mission_id"], "verdict": verdict["digest"], "final": final,
            "claimed_success": claimed_success, **rule, "reversible": True}
