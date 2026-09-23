# CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-BUDDI-002.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-BUDDI-002
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-002
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     .bits/srs/SRS-BUILDANDDO-BUDDI-002.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-BUDDI-002
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that builds Buddi's tool endpoints, with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-BUDDI-002

**SRS:** SRS-BUILDANDDO-BUDDI-002 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

Each of Buddi's eight tool URLs answers JSON from real platform data - or an honest refusal - with
its authority, source and time, and the three write tools leave a receipt a person can act on.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Server-only intake collection with a reversible migration | `python tests/upgrade/test_public_api_native.py --require-binary` | in_progress |
| 2 | Five A0 read routes over authored lessons and public evidence | `python tests/upgrade/test_public_api_native.py --require-binary` | in_progress |
| 3 | Three A2 routes: secret, schema, rate limits, receipts, handoff notice | `python tests/upgrade/test_public_api_native.py --require-binary` | in_progress |
| 4 | Pure validation and drift checks against the site's own sources | `node --test tests/upgrade/public-api.test.mjs` | in_progress |
| 5 | Edge proxy `/api/v1/public/*`, leaving `/api/webhooks/*` alone | `npm --prefix apps/edge test` | in_progress |

## Constraints

- Files this dispatch may touch: the new hooks, migration and tests named in the SRS,
  `apps/edge/src/index.js` and a new `apps/edge/src/public-api.js` with its test, the environment
  declarations (`.env.example`, `docker-compose.yml`, `docker-compose.staging.yml`),
  `docs/api/README.md`, and this bookkeeping. `apps/edge` itself is not in git on any branch; it is
  imported byte-for-byte from the shared checkout as a separate commit before it is edited.
- Files it must not touch: workspace, mission, evidence, tutorial-learning and classroom hooks and
  migrations; CSP and Permissions-Policy; deployment scripts.
- Raises the tier above A2: any deploy, push, secret value or change to the live ElevenLabs agent.
  None is performed here.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] `python scripts/ci/agent_context.py --check` passes (blocked while the readiness review is stale).
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
