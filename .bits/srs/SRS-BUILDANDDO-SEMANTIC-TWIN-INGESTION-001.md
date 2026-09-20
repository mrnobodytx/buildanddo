# ─── CGRF Header ─────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-001.md, libs/semantic_twin
# EnumType:    Doc
# EnumEdges:   EXTENDS SRS-BUILDANDDO-SEMANTIC-TWIN-001; GATES bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-* branches; VALIDATES libs/semantic_twin/ingestion
# DAG Node:    semantic-twin.phase-1.release-ingestion
# Intent:      Build a deterministic semantic graph from BuildAndDo release source, documentation claims and local deployment evidence without executing the release path.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001 — Phase 1 release ingestion

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

Phase 0 freezes semantic identity, evidence states and relation vocabulary, but
it cannot yet describe a real BuildAndDo subsystem. Release understanding is
still split across the controller source, SRS prose and local dispatch receipts,
so claims cannot be compared with implementation or reproduced as one graph.

## Intent

Add a dependency-free, read-only ingestion layer that compiles the bounded
BuildAndDo release and deployment path into Phase 0 object envelopes and typed,
evidence-bearing relations with deterministic Merkle leaf digests.

## Scope

- Parse `tools/buildanddo_release.py` with the Python AST for code symbols,
  call/read/write relationships, event publications, external dependencies and
  consumed configuration keys.
- Model the release path from source commit through evidence receipt as a
  connected graph using canonical Phase 0 object envelopes.
- Extract testable claims from `.bits/srs/SRS-BUILDANDDO-*.md` and classify them
  as `ENTAILED`, `CONTRADICTED` or `UNMEASURED` using deterministic AST/string
  evidence only.
- Ingest local `.bits/out/*/report.md` and `memory.json` deployment evidence.
- Serialize graph objects and relations to canonical JSON with deterministic
  SHA-256 leaf digests.
- Add stdlib unit tests for connectivity, vocabulary, evidence-state validity,
  claim classification and digest determinism.

## Out of scope

- Executing, changing or importing the release controller at runtime.
- Git history, SBOM, GitLab pipeline or Datadog network ingestion.
- Graph persistence, signing, root attestation, canonical promotion or mutation.
- Deployment, external writes, credentials, private-plane data or policy changes.

## Invariants

- Ingestion is deterministic and side-effect free for the same filesystem input.
- Every emitted relation uses a Phase 0 `RelationPredicate` and evidence state.
- Every emitted object is a valid immutable `SemanticObjectEnvelope`.
- The release-path graph is connected and every object participates in a relation.
- Digests cover canonical serialized content and never include their own value.
- Missing or ambiguous evidence remains `UNMEASURED`; it is never promoted by
  documentation wording alone.

## Acceptance evidence

1. `python -m unittest tests.upgrade.test_semantic_twin_ingestion -v` passes all
   ingestion, graph, claims, receipt and serializer tests.
2. `python -m compileall -q libs/semantic_twin tests/upgrade/test_semantic_twin_ingestion.py`
   accepts the Phase 0 and Phase 1 modules.
3. `python scripts/ci/verify_public_boundary.py` reports `PASS`.
4. `python scripts/ci/agent_context.py --check` reports a current context lock.

## Rollback

Remove the additive ingestion package, its unit tests and this dispatch's
governance/evidence artifacts. No deployment, schema, remote state or existing
release behavior needs compensation.
