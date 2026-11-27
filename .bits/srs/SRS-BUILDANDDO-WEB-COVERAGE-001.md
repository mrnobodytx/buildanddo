# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-WEB-COVERAGE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-WEB-COVERAGE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WEB-COVERAGE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-28
# Depends:     apps/web/vitest.config.js
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-WEB-COVERAGE-001-* branches; DEPENDS_ON apps/web/vitest.config.js
# DAG Node:    none
# Intent:      Bring the web suite back over its declared per-file coverage minimums with behaviour tests.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-WEB-COVERAGE-001 — Web coverage meets its declared minimums

**Status:** in_progress **Risk:** A1 (tests only) **Seat:** C-ONE

**Authorization:** the owner chose to fix the Day-21 acceptance job properly on 2026-10-27. With
the runner causes removed (SRS-BUILDANDDO-DAY21-RUNNER-001), `web_tests` passes all 980 tests and
then fails `vitest run --coverage` on 14 per-glob minimums (pipeline 6419, reproduced locally).
This is additive test work, self-authorized as A1.

## Problem

`apps/web/vitest.config.js` declares 80% function and branch minimums per glob. Code added since
those minimums were set left 14 below them:

| Glob | Short |
|---|---|
| `src/pages/{Pricing,About,Docs,Blog,Contact}Page.jsx` | functions 59.09% |
| `src/components/workspace/{TutorialReader,ContentStudio,StructuredContent}.jsx` | functions 71.11% |
| `src/pages/workspace/ErpPage.jsx` | functions 66.66% |
| `src/pages/workspace/ResearchPage.jsx` | functions 72.72% |
| `src/components/workspace/workflows/*.jsx` | functions 77.77% |
| `src/lib/workflowRuns.js` | branches 71.87% |
| `src/lib/{businessPlanning,tutorialCurriculum}.js` | branches 76.19% |
| `src/lib/missionSuite.js` | branches 78.26% |
| `src/lib/privateDossier.js` | branches 74% |
| `src/lib/{missionResearch,discordAccount}.js` | functions 77.77%, branches 66.66% |
| `src/components/motion/*.jsx` | functions 68.49%, branches 78.6% |
| `src/contexts/MotionContext.jsx` | functions 71.42% |

## Scope

New behaviour tests only, under the existing `__tests__` folders. No source, threshold or
configuration change. Each test asserts something a user or caller would notice.

## Acceptance

1. `npm run test:coverage` passes with every declared minimum met.
2. Repository checks pass.
3. Live: `web_tests` passes in `day21_full_acceptance`.
