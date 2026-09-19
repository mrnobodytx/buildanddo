# ─── CGRF Header ────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md, libs/semantic_twin/ingestion
# EnumType:    Doc
# EnumEdges:   EXTENDS SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001; GATES bits/SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001-* branches; VALIDATES libs/semantic_twin/phase1
# DAG Node:    semantic-twin.phase-1.complete
# Intent:      Complete Phase 1 with deterministic local history, supply-chain, provider-export, memory, reconciliation, epoch and replay proof compilation.
# ────────────────────────────────────────────────────────

# SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001 — Complete Phase 1

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

The bounded Phase 1 compiler maps current controller source, SRS claims and
dispatch evidence, but it does not yet join release-state receipts, evolution,
supply-chain identity, captured provider observations or typed memory into a
rooted semantic epoch that can answer and replay evidence-grounded questions.

## Intent

Add a dependency-free and side-effect-free Phase 1 completion layer that reads
only local repository state and explicitly supplied public provider exports. It
must preserve provenance, distinguish expected from observed release truth and
produce deterministic Merkle inclusion and context proof artifacts.

## Scope

1. Ingest controller release-state JSON receipts.
2. Ingest local Git commits, changed paths and parent relationships read-only.
3. Parse CycloneDX, SPDX and npm lock data into packages and dependencies.
4. Normalize captured GitLab pipeline, job and artifact JSON exports.
5. Normalize captured Datadog DORA, trace, event and verification JSON exports.
6. Compile memory Type A, B and C vectors as typed semantic objects.
7. Evaluate claims against symbol/string evidence and flag stale source references.
8. Reconcile expected and observed SHA, artifact, environment and verification truth.
9. Build deterministic graph roots, semantic epochs and inclusion proofs.
10. Build queryable context proof bundles with historical replay boundaries.

## Out of scope

- Live GitLab or Datadog calls, credentials, private-plane reads or network I/O.
- Release execution, deployment, mutation, persistence, signing or attestation.
- Editing the existing release controller or the merged Phase 1 implementation.
- Treating exported or hashed evidence as independently verified runtime truth.

## Invariants

- Inputs are local files, local read-only Git output or caller-provided values.
- Every semantic edge uses the frozen Phase 0 relation vocabulary.
- Captured provider observations remain observations, never live verification.
- Missing inputs produce explicit UNMEASURED gaps, never inferred success.
- Merkle roots and inclusion proofs are deterministic and self-verifiable.
- Context bundles preserve query, selection reason, source identity and epoch.

## Acceptance evidence

1. `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete -v`
   passes focused tests for all ten capabilities.
2. `python -m trace --count --summary --missing --module unittest tests.upgrade.test_semantic_twin_phase1_complete`
   observes at least 80 percent line coverage per new module.
3. `python -m mypy --strict --follow-imports=skip libs/semantic_twin/phase1`
   and Ruff pass. Import following is skipped because the previously merged
   bounded ingestion factory predates Phase 0's ten-axis state contract; this
   package supplies an additive compatibility adapter without mutating it.
4. `python scripts/ci/verify_public_boundary.py` and
   `python scripts/ci/agent_context.py --check` pass.

## Rollback

Remove the additive `libs/semantic_twin/phase1` package, focused tests and this
dispatch's governance/evidence artifacts. No remote or runtime state changes.
