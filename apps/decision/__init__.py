# ─── CGRF Header ──────────────────────────────
# File:        apps/decision/__init__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/contract.py, apps/decision/primitives.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/decision/contract.py; DEPENDS_ON apps/decision/primitives.py
# DAG Node:    none
# Intent:      Present one compact decision entry point and the question types needed to call it.
# ─────────────────────────────────────────────────────────────

"""Expose the compact BuildAndDo decision contract."""

from apps.decision.contract import DecisionResult, TypedAnswer, decide
from apps.decision.primitives import Choice, Extract, Noul, Rank, Score, SelectMany

__all__ = [
    "Choice",
    "DecisionResult",
    "Extract",
    "Noul",
    "Rank",
    "Score",
    "SelectMany",
    "TypedAnswer",
    "decide",
]
