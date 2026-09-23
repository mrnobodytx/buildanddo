# ─── CGRF Header ──────────────────────────────
# File:        apps/integrity/audit.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/integrity/verdict.py, apps/career/ledger.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON apps/integrity/verdict.py; DEPENDS_ON apps/career/ledger.py
# DAG Node:    none
# Intent:      Audit successes as well as failures, and revoke a pass whose evidence does not reproduce along with everything it earned.
# ─────────────────────────────────────────────────────────────

"""Deterministic audit sampling, re-execution and revocation."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Any

from apps.career.ledger import append_chain, read_chain
from apps.integrity.contract import IntegrityError
from apps.integrity.verdict import check_verdict

RATES = {"normal": 0.05, "high": 0.25, "privileged": 1.0}


def selected(verdict_digest: str, impact: str, seed: str) -> bool:
    """Return whether a verdict is audited; the seed is held by the auditor, so the actor cannot predict it."""
    if impact not in RATES:
        raise IntegrityError(f"impact must be one of {', '.join(RATES)}")
    if not seed:
        raise IntegrityError("the audit seed is required")
    draw = int(hashlib.sha256(f"{seed}|{verdict_digest}".encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
    return draw < RATES[impact]


def plan(verdicts: list[dict[str, Any]], seed: str) -> list[dict[str, Any]]:
    """Select verdicts for audit regardless of outcome; PASS is not exempt from scrutiny."""
    chosen = []
    for item in verdicts:
        check_verdict(item["verdict"])
        if selected(item["verdict"]["digest"], item.get("impact", "normal"), seed):
            chosen.append({"verdict": item["verdict"]["digest"], "final": item["verdict"]["final"],
                           "impact": item.get("impact", "normal")})
    return chosen


def record_reexecution(ledger: Path, verdict: dict[str, Any], *, reproduced: bool, auditor: str,
                       at: str, rewards: list[str]) -> dict[str, Any]:
    """Append a re-execution result; a PASS that does not reproduce is revoked with its rewards."""
    check_verdict(verdict)
    if not auditor or auditor == verdict["actor"]:
        raise IntegrityError("the auditor must differ from the actor")
    revoked = verdict["final"] == "PASS" and not reproduced
    return append_chain(ledger, {
        "kind": "reexecution", "verdict": verdict["digest"], "mission_id": verdict["mission_id"],
        "reproduced": reproduced, "auditor": auditor, "at": at,
        "state": "REVOKED" if revoked else ("CONFIRMED" if reproduced else "UNCHANGED"),
        "reverse_rewards": sorted(rewards) if revoked else [],
    })


def standing(ledger: Path, verdict: dict[str, Any]) -> str:
    """Return the verdict's current standing after any recorded re-execution."""
    events = [e for e in read_chain(ledger) if e.get("verdict") == verdict["digest"]]
    if any(e["state"] == "REVOKED" for e in events):
        return "REVOKED"
    return str(verdict["final"])
