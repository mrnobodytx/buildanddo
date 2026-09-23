# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-TRUST-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-TRUST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRUST-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-TRUST-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-TRUST-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-TRUST-001.md
# DAG Node:    none
# Intent:      Authorize the owner-requested trust fixes without deployment, secret or external effects.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-TRUST-001

**SRS:** SRS-BUILDANDDO-TRUST-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

Progress, shared records and the deploy path can no longer be asserted or damaged
from a browser or a misconfigured job.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Tutorial answer withheld, bounded retries, server-owned lesson completion | `node --test tests/upgrade/*.test.mjs && echo PASS` | pending |
| 2 | Shared-record permissions, revenue fields, seat events | `node --test tests/upgrade/*.test.mjs && echo PASS` | pending |
| 3 | Praxis fail-closed target, staged deploy swap, host keys | `python -m pytest -q tests/deploy 2>/dev/null; python scripts/ci/verify_public_boundary.py && echo PASS` | pending |
| 4 | Password reset URL, confirmation page, honest errors | `cd apps/web && npx vitest run src/pages/__tests__ && echo PASS` | pending |
| 5 | Lint, build, context, readiness, boundary, secret scan | `cd apps/web && npm run lint && npm run build && cd ../.. && python scripts/ci/agent_context.py --check && echo PASS` | pending |

## Constraints

- May touch: `apps/pocketbase/pb_hooks/**`, new files in `apps/pocketbase/pb_migrations/`,
  `apps/web/src/**`, `services/praxis_evidence/client.py`, `.gitlab-ci.yml` (the
  Praxis job only), `scripts/deploy/ship.py`, `tests/**`, this dispatch, the SRS,
  the registry, `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json`.
- Must not touch: existing migrations' up steps, secrets or `secrets/**`,
  deployment execution, private-plane files.
- No secret values anywhere; configuration by variable name only.
