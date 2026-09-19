# ─── CGRF Header ─────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-SEMANTIC-TWIN-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-SEMANTIC-TWIN-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-001.md
# DAG Node:    semantic-twin.phase-0
# Intent:      Authorize and gate the additive semantic-twin vocabulary without granting ingestion, mutation, verification or external-write authority.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-SEMANTIC-TWIN-001

**SRS:** SRS-BUILDANDDO-SEMANTIC-TWIN-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

BuildAndDo exposes one tested, dependency-free Phase 0 contract for semantic-twin
states, predicates, authority, transitions and canonical object/event envelopes.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Freeze all state, authority, predicate and design-law vocabulary | `python -m unittest tests.upgrade.test_semantic_twin.VocabularyTests -v && echo PASS` | done |
| 2 | Encode allowed and prohibited state promotions | `python -m unittest tests.upgrade.test_semantic_twin.TransitionTests -v && echo PASS` | done |
| 3 | Implement canonical object and event envelopes | `python -m unittest tests.upgrade.test_semantic_twin.EnvelopeTests -v && echo PASS` | done |
| 4 | Pass syntax, public-boundary and context gates | `python -m compileall -q libs/semantic_twin tests/upgrade/test_semantic_twin.py && python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |
| 5 | Prove and correct the ten-axis representation gap | `python -m unittest tests.upgrade.test_semantic_twin.VocabularyTests.test_state_vector_has_exactly_ten_named_axes -v && echo PASS` | done |
| 6 | Apply five evidenced deltas atomically with cross-axis checks | `python -m unittest tests.upgrade.test_semantic_twin.CompositeStateTests -v && echo PASS` | done |

## Constraints

- Files this dispatch may touch: `libs/semantic_twin/**`,
  `tests/upgrade/test_semantic_twin.py`,
  `.bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-001.md`, `.bits/srs_registry.yml`,
  `.bits/queue/VCC-BUILDANDDO-SEMANTIC-TWIN-001.md`, `.bits/context.lock.json`,
  `.bits/out/VCC-BUILDANDDO-SEMANTIC-TWIN-001/**`.
- Files it must not touch: application runtime, PocketBase schema/hooks, existing
  governance policy, workflows, deployment, signing or private-plane files.
- Anything that would raise risk above A1: external calls, credentials, persisted
  state, runtime actions, canonical promotion, verification settlement or deployment.

## Smoke test

```bash
python -m unittest tests.upgrade.test_semantic_twin -v
python -m compileall -q libs/semantic_twin tests/upgrade/test_semantic_twin.py
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status remains `in_progress` until merge verification.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
