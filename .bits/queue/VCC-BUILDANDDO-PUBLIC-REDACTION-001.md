# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-PUBLIC-REDACTION-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-PUBLIC-REDACTION-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PUBLIC-REDACTION-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-PUBLIC-REDACTION-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-PUBLIC-REDACTION-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch of the 2026-09-23 public-redaction direction with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-PUBLIC-REDACTION-001

**SRS:** SRS-BUILDANDDO-PUBLIC-REDACTION-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

Nothing the build publishes names a fleet machine or carries an IP address: not the generated
JSON, not the site bundle. A test that fails on today's code, with controls, proves it.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Failing-before test and controls | `python -m unittest tests.upgrade.test_public_redaction` (fails on `da1b57f`) | in_progress |
| 2 | One rule in the product: `scripts/ci/public_redaction.py` | same test, control cases | in_progress |
| 3 | Generators publish nothing that matches (`fleet_report.py`, `capability_inventory.py`, `roadmap_status.py`) | same test, platform-health case | in_progress |
| 4 | Neutral system id on the Operator page; no machine in `publicPages.js` | `npm --prefix apps/web exec -- vitest run src/pages/workspace/__tests__/OperatorPage.test.jsx` | in_progress |
| 5 | Whole suite, production build and a scan of `dist/apps/web` | `npm test`, `npm run build`, then the test again with `dist/apps/web` present | in_progress |

## Constraints

- Files this dispatch may touch: `scripts/ci/public_redaction.py`, `scripts/ci/fleet_report.py`,
  `scripts/ci/capability_inventory.py`, `scripts/deploy/roadmap_status.py`,
  `apps/web/src/lib/operatorPlane.js`, `apps/web/src/lib/publicPages.js`,
  `apps/web/src/pages/workspace/__tests__/OperatorPage.test.jsx`,
  `tests/upgrade/test_public_redaction.py`, and this bookkeeping.
- Files it must not touch: the other files that name a machine (a separate dispatch),
  `scripts/publish/activity_publish.py` and the Buddi work (SRS-BUILDANDDO-BUDDI-001), the
  community work (SRS-BUILDANDDO-COMMUNITY-WEB-001), and `apps/web/public/activity-status.json`.
- No real machine name or address may enter this repository, including test fixtures.
- Raises the tier above A2: any deploy, push or external write. None is performed here.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
