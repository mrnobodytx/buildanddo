# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-DAY21-RUNNER-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-DAY21-RUNNER-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     .bits/srs/SRS-BUILDANDDO-DAY21-RUNNER-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-DAY21-RUNNER-001-* branches
# Intent:      Track removing every cause of the Day-21 acceptance failure on the fleet runners.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-DAY21-RUNNER-001

**SRS:** SRS-BUILDANDDO-DAY21-RUNNER-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

`day21_full_acceptance` passes on the GitLab fleet runners with every profile still required.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Install the YAML requirement and put the acceptance interpreter first on `PATH` | `python -m unittest tests.upgrade.test_day21_acceptance` | done |
| 2 | Isolate the Datadog metric tests from runner `CITADEL_*` settings | `python -m unittest tests.upgrade.test_datadog_metrics` | done |
| 3 | Test and query time limits that tolerate a loaded runner | `npm test` | done |
| 4 | Correct three stale web tests to the behaviour on `main` | `npm test` | done |
| 5 | Operator: `gitlab-runner` in the `docker` group on each fleet runner | `day21_full_acceptance` passes on `buildanddo-source` | blocked |

## Constraints

- Files this dispatch may touch: `tools/day21/day21_acceptance.py`, the tests that cover it,
  `tests/upgrade/test_datadog_metrics.py`, `apps/web/vitest.config.js`,
  `apps/web/src/test/setup.js`, the three web test files, and the generated locks.
- Files it must not touch: application code and the job's rules or `allow_failure`.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status updated for the SRS code.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
