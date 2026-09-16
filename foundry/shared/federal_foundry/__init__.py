# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/federal_foundry/__init__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/shared/federal_foundry/evidence.py, foundry/shared/federal_foundry/interfaces.py, foundry/shared/federal_foundry/portfolio.py
# EnumType:    Service
# EnumEdges:   EXTENDS foundry/shared/federal_foundry/evidence.py; EXTENDS foundry/shared/federal_foundry/interfaces.py; EXTENDS foundry/shared/federal_foundry/portfolio.py
# DAG Node:    foundry.shared.api
# Intent:      Expose the supported public API for shared federal foundry components.
# ───────────────────────────────────────────────────────────────

"""Expose the supported federal foundry API."""

from .evidence import ClaimEvidenceCompiler, RequirementTracker, evidence_index
from .interfaces import (
    BenchmarkHarness,
    BenchmarkResult,
    BenchmarkSpec,
    ExperimentResult,
    ExperimentRunner,
    ExperimentSpec,
)
from .models import EvidenceRecord, FoundryValidationError, LaneResults, Opportunity
from .portfolio import PortfolioCompiler
from .registry import OpportunityRegistry

__all__ = [
    "BenchmarkHarness",
    "BenchmarkResult",
    "BenchmarkSpec",
    "ClaimEvidenceCompiler",
    "EvidenceRecord",
    "ExperimentResult",
    "ExperimentRunner",
    "ExperimentSpec",
    "FoundryValidationError",
    "LaneResults",
    "Opportunity",
    "OpportunityRegistry",
    "PortfolioCompiler",
    "RequirementTracker",
    "evidence_index",
]
