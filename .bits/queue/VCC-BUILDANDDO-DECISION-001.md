# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-DECISION-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     .bits/srs/SRS-BUILDANDDO-DECISION-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-DECISION-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-DECISION-001.md
# DAG Node:    none
# Intent:      Authorize and gate the additive Phase 1 decision runtime without action, verification or external-write authority.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-DECISION-001

**SRS:** SRS-BUILDANDDO-DECISION-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

BuildAndDo callers can request a bounded typed judgment through one small API,
observe its route/cost/calibration fields, and retain existing action and verification boundaries.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Implement typed primitives and decision contract | `python -m unittest tests.upgrade.test_decision_runtime.PrimitiveTests tests.upgrade.test_decision_runtime.ContractTests && echo PASS` | done |
| 2 | Implement authority-bounded deterministic/classifier/frontier routing | `python -m unittest tests.upgrade.test_decision_runtime.RouterTests && echo PASS` | done |
| 3 | Define six typed trial workloads | `python -m unittest tests.upgrade.test_decision_runtime.WorkloadTests && echo PASS` | done |
| 4 | Capture structured logs and compute benchmark metrics | `python -m unittest tests.upgrade.test_decision_runtime.BenchmarkTests && echo PASS` | done |
| 5 | Add the native-authenticated PocketBase decision endpoint | `node --test tests/upgrade/decision-runtime.test.mjs && echo PASS` | done |
| 6 | Prove behavior and per-module coverage | `python tests/upgrade/check_decision_runtime.py && echo PASS` | done |
| 7 | Pass public boundary and context gates | `python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

## Constraints

- Files this dispatch may touch: `apps/decision/**`,
  `apps/pocketbase/pb_hooks/decision.pb.js`, `tests/upgrade/test_decision_runtime.py`,
  `tests/upgrade/check_decision_runtime.py`, `tests/upgrade/decision-runtime.test.mjs`,
  `.bits/srs/SRS-BUILDANDDO-DECISION-001.md`, `.bits/srs_registry.yml`,
  `.bits/queue/VCC-BUILDANDDO-DECISION-001.md`, `.bits/context.lock.json`,
  `.bits/out/VCC-BUILDANDDO-DECISION-001/**`.
- Files it must not touch: existing authority policy, migrations, existing mission,
  workflow, evidence or telemetry implementation, deployment and private-plane files.
- Anything that would raise risk above A1: external calls, credentials, persisted
  schema, actions, verification settlement, staging or production effects.

## Smoke test

```bash
python tests/upgrade/check_decision_runtime.py
node --test tests/upgrade/decision-runtime.test.mjs
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status remains `in_progress` until merge verification.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
