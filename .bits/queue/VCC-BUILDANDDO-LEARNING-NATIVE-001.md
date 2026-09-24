# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-LEARNING-NATIVE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-LEARNING-NATIVE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-LEARNING-NATIVE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs/SRS-BUILDANDDO-LEARNING-NATIVE-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-LEARNING-NATIVE-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-LEARNING-NATIVE-001.md
# DAG Node:    none
# Intent:      Authorize the native learning summary and migration replay fixes.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-LEARNING-NATIVE-001

**SRS:** SRS-BUILDANDDO-LEARNING-NATIVE-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Learning summary counts with dbx expressions; native-faithful double | `node --test tests/upgrade/*.test.mjs && echo PASS` | done |
| 2 | Migration replay checks call method-valued field properties | `node --test tests/upgrade/*.test.mjs && echo PASS` | done |
| 3 | Native learning suite on 0.39.8 | `BUILDANDDO_TEST_POCKETBASE=<pocketbase-0.39.8> python3 tests/upgrade/test_tutorial_learning_native.py --require-binary && echo PASS` | done |
| 4 | Pin PocketBase 0.39.8 in Compose, staging Compose, Dockerfile and `.env.example` | `python3 -m unittest tests.upgrade.test_native_fixture_contracts tests.upgrade.test_day21_acceptance && echo PASS` | done |
| 5 | Context, readiness, boundary | `python scripts/ci/agent_context.py --check && python scripts/ci/verify_public_boundary.py && echo PASS` | done |

## Constraints

- May touch: `apps/pocketbase/pb_hooks/tutorial-learning.js`, the replay checks of
  existing migrations (no up/down behaviour change), `tests/upgrade/**`, this
  dispatch, the SRS, the registry, `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json`.
- Also may touch: `docker-compose.yml`, `docker-compose.staging.yml`, `apps/pocketbase/Dockerfile`,
  `.env.example` (the PocketBase version default only) and operator docs naming the version.
- Must not touch: evidence-bound files, secrets, running hosts.
