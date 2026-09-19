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

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN

## Problem

The initial vocabulary and ten-axis correction lacked canonical identifiers,
complete Merkle and transaction schemas, and typed evidence for promotions.
Arbitrary IDs, empty inclusion bindings and under-evidenced verified relations
were accepted. Later ingestion and governance require executable contracts that
keep structural validity, evidence, authorization and verification distinct.

## Intent

Provide one dependency-free Python package that freezes the Phase 0 vocabulary,
explicit transition policies, canonical object and event envelopes, authority
tiers and the fifteen design laws before any runtime integration is attempted.
The contract must model all ten state axes together and settle independent state
deltas atomically rather than treating cross-axis progress as one scalar enum.

## Scope

- Add `libs/semantic_twin/` with string enums for all Phase 0 state families,
  authority tiers and every core relation predicate in specification section 34.2.
- Add immutable stdlib dataclasses for the canonical object and event envelopes
  from sections 44 and 45.
- Encode the explicit lifecycle progressions, conditional direct-observation
  verification rule and forbidden automatic promotions.
- Represent evidence, SHACL, Merkle, CGRF action, TEVV, semantic transaction,
  causal, corpus-use, authority and lifecycle as ten separate object-state axes.
- Add evidenced compare-and-set deltas whose complete final vector is validated
  before any immutable result is returned.
- Add stdlib unit tests covering vocabulary completeness, envelope validation,
  normal progressions, five-delta atomic settlement and prohibited shortcuts.

## P0 completion authorized by the owner

The follow-up request to produce every audited missing part authorizes A2
completion of this package under the existing in-progress dispatch. Freeze
semantic identifiers and entity types, Merkle metadata and proof contracts,
predicate domain/range/evidence rules, typed policy/SHACL/TEVV/execution receipts,
CGRF change contracts and the semantic transaction schema. Enforce receipt scope,
independent verification, envelope consistency and immutable round-trip wire
contracts. Publish schema version `2`; reject incompatible version `1` payloads
rather than guessing missing evidence. Exact state vocabulary remains unchanged.
Typed receipts describe externally produced evidence; local validation performs
no signing, evidence measurement, policy decision or live promotion.

Verification: `python -m unittest tests.upgrade.test_semantic_twin tests.upgrade.test_semantic_twin_contracts`
and `python -m mypy --strict libs/semantic_twin`.

## Execution exclusions

- New ingestion features, graph storage, SHACL engines, Merkle algorithms or signing.
- CGRF policy evaluation, mutation execution, TEVV settlement or canonical promotion.
- PocketBase schema, UI, network calls, external services, deployment or private-plane work.

## Integration acceptance authorized by the owner

The request to take P0 to completion authorizes migration of the existing local
ingestion and Phase 1 consumers to the frozen version-two contracts. Bind graph
endpoints to their actual object revisions, retain captured source evidence, and
round-trip all emitted objects through the strict decoder. Static diagrams,
heuristic documentation matches and captured reports must not acquire verification
or runtime authority. Remove the obsolete factory monkey patch. Keep graph hashes
outside the canonical object envelope unless a complete Merkle contract exists.
The combined contract, ingestion and Phase 1 suites are the acceptance boundary;
passing the contract suite alone is insufficient.

## Invariants

- Enum values exactly preserve the specification's frozen uppercase or snake-case spellings.
- `UNMEASURED` cannot transition directly to `VERIFIED`.
- Correlation or chronology cannot automatically promote to causation.
- SHACL conformance, Merkle validity, CGRF authorization and deployment are never
  represented as proof of factual or technical correctness.
- Envelope instances require semantic identity, source/provenance and typed state.
- Same-axis transition tables never contain values from another state family.
- A stale, duplicate, mistyped or inconsistent delta rejects the full change set.
- Authority and open lifecycle axes cannot self-promote through the automatic
  delta operation because Phase 0 defines no safe transition policy for them.
- The package has no dependency beyond the Python standard library.

## Acceptance evidence

1. `python -m unittest tests.upgrade.test_semantic_twin tests.upgrade.test_semantic_twin_contracts -v`
   passes frozen vocabulary, all contracts, strict wire decoding and atomic deltas,
   including every order of a five-delta batch and rejection of mismatched receipts.
2. `python -m compileall -q libs/semantic_twin tests/upgrade/test_semantic_twin.py tests/upgrade/test_semantic_twin_contracts.py`
   accepts every new Python module.
3. `python scripts/ci/verify_public_boundary.py` reports `PASS`.
4. `python scripts/ci/agent_context.py --check` reports a current context lock.
5. `python -m mypy --strict libs/semantic_twin` and Ruff pass.
6. `python -m libs.semantic_twin.schema` emits a deterministic Draft 2020-12 schema.
7. Standard-library execution tracing records at least 80 percent executable-line coverage
   in every package module. Broader upgrade tests retain their declared skips.
8. `python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py'`
   passes contracts and both existing consumers together, including strict v2
   round trips, changed-revision rejection, deferred-edge export rejection and
   separation of observed provider status from verified state.

## Rollback

Revert this version-two completion to restore the previous contract API. There
is no database or deployment to reverse. Version-one payloads require explicit
reconstruction from source and receipts; missing proof must never be fabricated.
