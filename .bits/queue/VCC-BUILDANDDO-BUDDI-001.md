# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-BUDDI-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-BUDDI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-BUDDI-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-BUDDI-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-BUDDI-001.md
# DAG Node:    none
# Intent:      Authorize the additive brand mark and Buddi mascot layers without data, schema or external effects.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-BUDDI-001

**SRS:** SRS-BUILDANDDO-BUDDI-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

The site shows the approved block mark, and Buddi guides the workspace front page
and celebrates only what the server has confirmed.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Brand assets, favicon, header and sidebar mark | `cd apps/web && npm run build && echo PASS` | done |
| 2 | Buddi figure and animation layer | `cd apps/web && npx vitest run src/components/buddi && echo PASS` | done |
| 3 | Engagement: Buddi fronts the existing next-action ranking | `cd apps/web && npx vitest run src/lib/__tests__/buddi.test.js src/components/buddi && echo PASS` | done |
| 4 | Achievements from server-owned facts, one-time celebration | `cd apps/web && npx vitest run src/lib/__tests__/buddi.test.js src/components/buddi && echo PASS` | done |
| 5 | Lint, Overview baseline, boundary and context | `cd apps/web && npm run lint && cd ../.. && python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

## Constraints

- May touch: `apps/web/public/brand/**`, `apps/web/index.html` (favicon only),
  `apps/web/src/components/buddi/**`, `apps/web/src/lib/buddi.js`,
  `apps/web/src/lib/__tests__/buddi.test.js`, `apps/web/src/hooks/useLearningSummary.js`,
  `apps/web/src/components/site/Header.jsx` and `apps/web/src/components/workspace/WorkspaceLayout.jsx`
  (mark only), `apps/web/src/components/workspace/NextWorkspaceActions.jsx`,
  `apps/web/src/components/workspace/EmptyState.jsx` (optional art),
  `apps/web/src/pages/workspace/OverviewPage.jsx`, this dispatch, the SRS, the registry,
  `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json` (refresh only).
- Must not touch: PocketBase hooks or migrations, scoring or verification logic,
  CI, deploy or private-plane files.
