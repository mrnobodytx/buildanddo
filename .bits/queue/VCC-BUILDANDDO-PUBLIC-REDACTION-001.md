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
| 1 | Failing-before test and controls | `python -m unittest tests.upgrade.test_public_redaction` (fails on `da1b57f`) | done |
| 2 | One rule in the product: `scripts/ci/public_redaction.py` | same test, control cases | done |
| 3 | Generators publish nothing that matches (`fleet_report.py`, `capability_inventory.py`, `roadmap_status.py`) | same test, platform-health case | done |
| 4 | Neutral system id on the Operator page; no machine in `publicPages.js` | `npm --prefix apps/web exec -- vitest run src/pages/workspace/__tests__/OperatorPage.test.jsx` | done |
| 5 | Whole suite, production build and a scan of `dist/apps/web` | `npm test`, `npm run build`, then the test again with `dist/apps/web` present | done |

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

## Evidence (2026-09-23, local run on Windows)

- **Before** (`da1b57f` with only the rule and the test added): families only, 3 failures and 1 skip;
  with the private fleet map, 4 failures. `platform-health.json` carried 1 exact fleet name. The built
  site carried 3 machine names: 2 in the Operator page chunk and 1 in `platform-health.json`. The web
  source carried 3: 2 in `operatorPlane.js` and 1 in `publicPages.js`. The generator wrote a planted
  name and address unchanged.
- **After:** families only, 9 pass and 1 skip (the exact-name test states why); with the private
  fleet map, 10 of 10 pass. The build prints `0 value(s) withheld from platform-health.json`.
- **Built site:** `public_redaction.py scan dist/apps/web` PASS with the private fleet map. The
  estate's stricter rule finds 0 machine names, down from 3 on the live build. What it still reports
  (SVG geometry, and a loopback hostname check) is identical to the live build.
- **Suites:** `npm test` 536 of 536. One earlier full run had one MissionsPage timeout; the file alone
  passes 13 of 13 twice, and the rerun passed in full. Python `tests/upgrade`: failures and errors
  identical to `da1b57f`, except one semantic-twin test that fails only on a branch checked out in a
  linked worktree. Node `tests/upgrade`: no new failure.
- `verify_public_boundary.py` PASS. `verify_public_disclosure.py --strict`: 0 block, 1 warning (a
  public contact mailbox). Its two machine-name warnings are gone.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
