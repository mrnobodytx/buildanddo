# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-SITE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-SITE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SITE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs/SRS-BUILDANDDO-SITE-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-SITE-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-SITE-001.md
# DAG Node:    none
# Intent:      Authorize DNS ownership proof for workspace domains without fetching user sites or exposing secrets.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-SITE-001

**SRS:** SRS-BUILDANDDO-SITE-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

A workspace domain is `verified` only after the server finds the owner's DNS TXT
record, and the product says so honestly.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Server-owned domain state and hidden challenge fields | `node --test tests/upgrade/*.test.mjs && echo PASS` | pending |
| 2 | Challenge and DNS-over-HTTPS check commands with rate limit | `node --test tests/upgrade/*.test.mjs && echo PASS` | pending |
| 3 | Add or change the domain after onboarding | `node --test tests/upgrade/*.test.mjs && echo PASS` | pending |
| 4 | Settings verification panel and honest Front Page banner | `cd apps/web && npx vitest run src/pages/workspace/__tests__/SettingsPage.test.jsx src/pages/workspace/__tests__/OverviewPage.test.jsx && echo PASS` | pending |
| 5 | Lint, build, context, readiness, boundary, secret scan | `cd apps/web && npm run lint && npm run build && cd ../.. && python scripts/ci/agent_context.py --check && echo PASS` | pending |

## Constraints

- May touch: `apps/pocketbase/pb_hooks/**`, new files in `apps/pocketbase/pb_migrations/`,
  `apps/web/src/**`, `tests/upgrade/**`, `docker-compose.yml` and `.env.example`
  (variable names only), this dispatch, the SRS, the registry,
  `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json`.
- Must not touch: existing migrations' up steps, secrets, deployment or private-plane files.
- No request may be sent to a user-supplied host in this stage.
