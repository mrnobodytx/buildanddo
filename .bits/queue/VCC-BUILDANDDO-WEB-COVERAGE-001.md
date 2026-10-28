# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-WEB-COVERAGE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-WEB-COVERAGE-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-28
# Depends:     .bits/srs/SRS-BUILDANDDO-WEB-COVERAGE-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-WEB-COVERAGE-001-* branches
# Intent:      Track the behaviour tests that close each coverage gap.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-WEB-COVERAGE-001

**SRS:** SRS-BUILDANDDO-WEB-COVERAGE-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

## Objective

`npm run test:coverage` passes with every declared minimum met, using behaviour tests only.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Public pages and tutorial/content components | `npm run test:coverage` | done |
| 2 | ERP and research pages | `npm run test:coverage` | done |
| 3 | Workflow components and `workflowRuns` | `npm run test:coverage` | done |
| 4 | Planning, curriculum, mission, dossier and Discord libraries | `npm run test:coverage` | done |
| 5 | Motion components and `MotionContext` | `npm run test:coverage` | done |

## Constraints

- Files this dispatch may touch: new files under `apps/web/src/**/__tests__/`, this dispatch,
  its SRS, the registry and the generated locks.
- Files it must not touch: application source, `vitest.config.js` and its thresholds.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status updated for the SRS code.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
