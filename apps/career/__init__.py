# ─── CGRF Header ──────────────────────────────
# File:        apps/career/__init__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/passport.py, apps/career/match.py, apps/career/dossier.py, apps/career/compiler.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/career/passport.py; DEPENDS_ON apps/career/match.py; DEPENDS_ON apps/career/dossier.py; DEPENDS_ON apps/career/compiler.py
# DAG Node:    none
# Intent:      Expose the career evidence engine's public entry points.
# ─────────────────────────────────────────────────────────────

"""Derive role matches and application packages only from recorded, attributed work."""

from apps.career.compiler import Package, compile_application, validate_package
from apps.career.dossier import Dossier, build_dossier, rank
from apps.career.evidence import CareerError, ClaimState, Participation
from apps.career.jobs import Job, normalize_job
from apps.career.match import CoverageMap, evaluate
from apps.career.passport import Passport, build_passport

__all__ = [
    "CareerError",
    "ClaimState",
    "CoverageMap",
    "Dossier",
    "Job",
    "Package",
    "Participation",
    "Passport",
    "build_dossier",
    "build_passport",
    "compile_application",
    "evaluate",
    "normalize_job",
    "rank",
    "validate_package",
]
