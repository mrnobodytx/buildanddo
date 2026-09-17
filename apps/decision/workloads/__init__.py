# ─── CGRF Header ──────────────────────────────
# File:        apps/decision/workloads/__init__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/decision/workloads/definitions.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/decision/workloads/definitions.py
# DAG Node:    none
# Intent:      Export the named Phase 1 workload definitions without adding another decision entry point.
# ──────────────────────────────────────────────────────────

"""Export the six Phase 1 decision trial workloads."""

from apps.decision.workloads.definitions import (
    ACTION_NO_ACTION,
    CHALLENGE_SELECTION,
    EVIDENCE_SUPPORT,
    ISSUE_CLASSIFICATION,
    RULES_BY_QUESTION,
    TOOL_ROUTING,
    URGENCY_SCORING,
    WORKLOADS,
    Workload,
)

__all__ = [
    "ACTION_NO_ACTION",
    "CHALLENGE_SELECTION",
    "EVIDENCE_SUPPORT",
    "ISSUE_CLASSIFICATION",
    "RULES_BY_QUESTION",
    "TOOL_ROUTING",
    "URGENCY_SCORING",
    "WORKLOADS",
    "Workload",
]
