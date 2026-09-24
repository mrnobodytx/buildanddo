# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-JOURNEY-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-JOURNEY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-JOURNEY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-JOURNEY-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-JOURNEY-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-JOURNEY-001.md
# DAG Node:    none
# Intent:      Authorize the owner-directed Build/Do navigation, guided journey and career profile display.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-JOURNEY-001

**SRS:** SRS-BUILDANDDO-JOURNEY-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress
**Authorized by:** owner request in session, 2026-09-23.

## Objective

A new user sees Build and Do categories instead of 35 links, and can answer five
choices to get a first lesson and a proposed mission draft.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Journey compiler (pure) | `node --test tests/upgrade/journey.test.mjs && echo PASS` | done |
| 2 | Journey page, route and assistant draft | `npx --prefix apps/web vitest run src/pages/workspace/__tests__/JourneyPage.test.jsx && echo PASS` | written; not run in sandbox |
| 3 | Build/Do grouped navigation | `npx --prefix apps/web vitest run src/components/__tests__/Navigation.test.jsx src/pages/workspace/__tests__/AdministrationFlow.test.jsx && echo PASS` | written; not run in sandbox |
| 4 | Career profile on the Career Passport page | `npx --prefix apps/web vitest run src/pages/workspace/__tests__/JourneyPage.test.jsx && echo PASS` | written; not run in sandbox |
| 5 | Boundary and context gates | `python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

## Constraints

- Files this dispatch may touch: `apps/web/src/lib/journey.js`,
  `apps/web/src/pages/workspace/JourneyPage.jsx`, its test,
  `apps/web/src/components/workspace/WorkspaceLayout.jsx`,
  `apps/web/src/components/workspace/WorkspaceAssistant.jsx` (draft listener only),
  `apps/web/src/pages/workspace/CareerPage.jsx` (profile card only),
  `apps/web/src/App.jsx` (route only), `apps/web/src/__tests__/AppRoutes.test.jsx`,
  `tests/upgrade/journey.test.mjs`, this dispatch, the SRS, the registry,
  `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json` (refresh only),
  `.bits/handoffs/2026-09-23-bits-codegen-cmax-b-guildmaster-journey.md`.
- Must not touch: hooks, migrations, CI, authority policy, private-plane files.
