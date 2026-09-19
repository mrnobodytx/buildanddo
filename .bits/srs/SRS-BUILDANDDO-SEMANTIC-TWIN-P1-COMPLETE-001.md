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

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN

## Owner-authorized continuation

On 2026-09-19 the owner requested completion of the remaining Phase 1 work after
the merged-tree audit found both ingestion layers incompatible with Phase 0 v2.
This continuation explicitly covers migration of the existing ingestion and
Phase 1 packages, their tests and evidence documentation. It replaces the
original additive-only restriction; it grants no deployment, credential or
external-write authority.

## Problem

Both merged ingestion layers construct envelopes and relations from an older
Phase 0 contract and fail against v2. The continuation must restore composition
without weakening typed identity, revision-bound evidence, relation domains,
state validation or the canonical Merkle profile.

## Intent

Provide a dependency-free and side-effect-free Phase 1 compiler that reads
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

- Runtime network clients, credentials, private-plane reads or external writes.
- Release execution, deployment, mutation, persistence, signing or attestation.
- Editing the existing release controller or weakening the Phase 0 contracts.
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
2. `python -m trace --count --summary --missing --coverdir /tmp/semantic-twin-coverage --module unittest discover -s tests/upgrade -p 'test_semantic_twin*.py'`
   measures the migration with the full contract and negative regression suite;
   every new implementation module must reach at least 80 percent line coverage.
3. `python -m mypy --strict libs/semantic_twin/ingestion libs/semantic_twin/phase1`
   and Ruff pass, including followed imports.
4. `python scripts/ci/verify_public_boundary.py` and
   `python scripts/ci/agent_context.py --check` pass.
5. Both ingestion suites and both Phase 0 suites pass together on the merged
   contracts. Serialized objects round-trip through the v2 constructors; edges
   bind existing endpoint types and exact revisions with scoped evidence.
6. Leaf hashes, epochs and context proofs use the Phase 0 serialization profile.
   Tampering with content or proof metadata fails verification. Historical
   selection excludes later and undated evidence.
7. A fresh local CLI run records input availability, release-truth gaps and a
   reproducible semantic root. Missing deployment or provider evidence remains
   explicit; available connected read-only sources may be inspected for receipt
   availability, but private telemetry is not committed to the public repository.

## Rollback

Revert the continuation and regenerate the context lock to restore main's
snapshot-based integration. Consumers of batch drafts and typed leaf/context
records must use a matching compiler revision. No remote system, deployed
application or persisted runtime state needs compensation.
