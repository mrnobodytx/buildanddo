# ─── CGRF Header ─────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     AGENTS.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-SEMANTIC-TWIN-001-* branches; VALIDATES libs/semantic_twin
# DAG Node:    semantic-twin.phase-0
# Intent:      Freeze the dependency-free vocabulary and envelope contracts needed before semantic-twin ingestion or mutation work begins.
# ───────────────────────────────────────────────────────────

# SRS-BUILDANDDO-SEMANTIC-TWIN-001 — Living Semantic System Twin Phase 0

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

The Living Semantic System Twin specification names shared states, predicates,
authority boundaries and object/event envelopes, but BuildAndDo has no executable
contract for them. Later ingestion or governance work would otherwise invent
incompatible spellings, skip lifecycle gates, or conflate structural validity,
evidence, authorization and verification.

## Intent

Provide one dependency-free Python package that freezes the Phase 0 vocabulary,
explicit transition policies, canonical object and event envelopes, authority
tiers and the fifteen design laws before any runtime integration is attempted.

## Scope

- Add `libs/semantic_twin/` with string enums for all Phase 0 state families,
  authority tiers and every core relation predicate in specification section 34.2.
- Add immutable stdlib dataclasses for the canonical object and event envelopes
  from sections 44 and 45.
- Encode the explicit lifecycle progressions, conditional direct-observation
  verification rule and forbidden automatic promotions.
- Add stdlib unit tests covering vocabulary completeness, envelope validation,
  normal progressions and prohibited shortcuts.

## Out of scope

- Repository ingestion, graph storage, SHACL engines, Merkle hashing or signing.
- CGRF policy evaluation, mutation execution, TEVV settlement or canonical promotion.
- PocketBase schema, UI, network calls, external services, deployment or private-plane work.

## Invariants

- Enum values exactly preserve the specification's frozen uppercase or snake-case spellings.
- `UNMEASURED` cannot transition directly to `VERIFIED`.
- Correlation or chronology cannot automatically promote to causation.
- SHACL conformance, Merkle validity, CGRF authorization and deployment are never
  represented as proof of factual or technical correctness.
- Envelope instances require semantic identity, source/provenance and typed state.
- The package has no dependency beyond the Python standard library.

## Acceptance evidence

1. `python -m unittest tests.upgrade.test_semantic_twin -v` passes vocabulary,
   transition and envelope contract tests.
2. `python -m compileall -q libs/semantic_twin tests/upgrade/test_semantic_twin.py`
   accepts every new Python module.
3. `python scripts/ci/verify_public_boundary.py` reports `PASS`.
4. `python scripts/ci/agent_context.py --check` reports a current context lock.

## Rollback

Remove the additive `libs/semantic_twin` package, its unit test and this dispatch's
governance artifacts. No schema, remote state or runtime integration needs reversal.
