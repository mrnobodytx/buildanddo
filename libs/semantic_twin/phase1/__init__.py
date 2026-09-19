# ─── CGRF Header ────────────────────────────
# File:        libs/semantic_twin/phase1/__init__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     libs/semantic_twin/phase1/compiler.py, libs/semantic_twin/phase1/merkle.py, libs/semantic_twin/phase1/context.py
# EnumType:    Scaffold
# EnumEdges:   CONSUMES libs/semantic_twin/phase1/compiler.py; CONSUMES libs/semantic_twin/phase1/merkle.py; CONSUMES libs/semantic_twin/phase1/context.py
# DAG Node:    semantic-twin.phase-1.api
# Intent:      Expose the complete local Phase 1 compiler and proof contracts through one stable import surface.
# ─────────────────────────────────────────────────────

"""Expose complete local Phase 1 semantic twin compilation."""

from ..merkle import InclusionProof, ProofStep
from .claims import SourceEvidence, assess_claims, collect_source_evidence
from .compiler import Phase1Compilation, Phase1Inputs, compile_phase1
from .context import ContextProofBundle, compile_context_bundle, verify_context_bundle
from .history import CommitObservation, FileChange, read_git_history
from .merkle import (
    SemanticEpoch,
    build_epoch,
    inclusion_proof,
    verify_inclusion,
)
from .release_state import ReleaseStateReceipt, ingest_release_receipts
from .sbom import PackageRecord, SbomDocument, parse_sbom
from .truth import ReleaseObservation, reconcile_release_truth

__all__ = [
    "CommitObservation",
    "ContextProofBundle",
    "FileChange",
    "InclusionProof",
    "PackageRecord",
    "Phase1Compilation",
    "Phase1Inputs",
    "ProofStep",
    "ReleaseObservation",
    "ReleaseStateReceipt",
    "SbomDocument",
    "SemanticEpoch",
    "SourceEvidence",
    "assess_claims",
    "build_epoch",
    "collect_source_evidence",
    "compile_context_bundle",
    "compile_phase1",
    "inclusion_proof",
    "ingest_release_receipts",
    "parse_sbom",
    "read_git_history",
    "reconcile_release_truth",
    "verify_context_bundle",
    "verify_inclusion",
]
