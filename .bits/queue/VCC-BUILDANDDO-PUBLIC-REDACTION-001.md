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
| 6 | Continuation R5: a name joined into a slug is caught; the mesh family keeps its word boundary | `python -m unittest tests.upgrade.test_public_redaction -k slug` (fails on `46ced1b`) | done |
| 7 | Continuation R6: the shipping header the stricter rule catches names its seat | `python -m unittest tests.upgrade.test_public_redaction` with `dist/apps/web` present | done |
| 8 | Continuation R7: a scan lets the unspecified address through, as it does loopback | `python -m unittest tests.upgrade.test_public_redaction -k unspecified` (fails on `1545c48`) | done |
| 9 | Continuation R8: the documentation address in the same place is still caught; the built site with the voice chunk scans clean | the same test; `public_redaction.py scan dist/apps/web` after `npm run build` | done |
| 10 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`, `verify_public_boundary.py` | done |
| 11 | Continuation R9: a scan reads `.jsx`, `.ts`, `.tsx` and `.cjs`, states the files read, and never passes having read nothing | `python -m unittest tests.upgrade.test_public_redaction -k read` (fails on `ff7b865`) | done |
| 12 | Continuation R10: test files may plant only the made-up names and documentation addresses; a fleet-map name fails even there | `python -m unittest tests.upgrade.test_public_redaction -k fixture` (fails on `ff7b865`) | done |
| 13 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`, `verify_public_boundary.py` | done |

## Constraints

- Files this dispatch may touch: `scripts/ci/public_redaction.py`, `scripts/ci/fleet_report.py`,
  `scripts/ci/capability_inventory.py`, `scripts/deploy/roadmap_status.py`,
  `apps/web/src/lib/operatorPlane.js`, `apps/web/src/lib/publicPages.js`,
  `apps/web/src/pages/workspace/__tests__/OperatorPage.test.jsx`,
  `tests/upgrade/test_public_redaction.py`, and this bookkeeping. The continuation adds the header of
  `apps/web/src/hooks/useRoomsLive.js` and the readiness and context locks. Continuations R7-R8 and R9-R10
  touch only `scripts/ci/public_redaction.py`, its test, this bookkeeping and the two locks.
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

## Evidence, continuation (2026-09-23, local run on Windows, LF checkout)

- **Found by:** a handoff file whose name joined the release machine into a slug reached a public pull
  request past this rule; the first version counted a hyphen as part of a name.
- **Before** (`46ced1b` with only the new test): the test fails on a handoff-style file name. With the
  new rule and nothing else, the web-source test fails on one shipping header that names a machine.
- **After:** with the private fleet map and `dist/apps/web` present, 11 of 11 pass; families only, 9 pass
  and 2 skip (exact names, and no build). `public_redaction.py scan dist/apps/web` PASS. The near-name
  control (`capability-mesh-fallback`) still holds.
- **Across tracked files** (findings for the separate dispatch, not fixed here): the rule now finds 39
  files that name a machine, up from 32. It newly catches 7 and loses none: five under `.bits` (two
  handoffs, a dispatch, and that dispatch's report and memory), a provenance file at the root, and one
  module under `apps/federal_foundry`.
- **Readiness lock:** 900 of its 1000 hashes had been taken from a Windows checkout, so a Linux checkout
  read the review as stale. Rebound from an LF checkout in its own commit, which also acknowledges 33
  sources changed since the last refresh, all by this seat's reviewed and merged work. No acceptance
  state changed.

## Evidence, continuation R7-R8 (2026-09-23, local run on Windows, LF checkout)

- **Found by:** #85's voice SDK. The voice chunk in a production build names the all-zeros address five
  times, in its session-description code, and `public_redaction.py scan dist/apps/web` failed on that one
  file. The build had been clean before the SDK.
- **Before** (`1545c48` with only the new test): the test fails, because the scan reports the address.
- **After:** the test passes. With the private fleet map and `dist/apps/web` present, 12 of 12 pass. The
  scanner from `1545c48` fails the same build on the voice chunk; this one passes it.
- **Controls:** the documentation address 203.0.113.9 in the same text still fails the unit test. Planted
  into a copy of the built voice chunk, it fails the scan (exit 1). Without the scan allowance the
  all-zeros address is still reported, and `redact()` still withholds it.
- **Gates:** `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`
  and `verify_public_boundary.py` pass, also in a fresh LF checkout.

## Evidence, continuation R9-R10 (2026-09-23, local run on Windows, LF checkout)

- **Found by:** a scan of the live classroom's components printed PASS having read none of them.
- **Before** (`ff7b865` with only the new tests): all three fail. The scan command exits 0 and prints "PASS:
  0 file(s) carry…" for a directory whose planted name sits in a `.jsx` file, and for a lone `.conf` file.
- **After:** the three pass. With the private fleet map and `dist/apps/web` present, 15 of 15 pass.
  - `scan dist/apps/web` reads 223 files and passes.
  - `scan apps/web/src/components/broadcast/*.jsx` reads 8 files and passes.
  - `scan apps/web/nginx.conf` reports NOT READ and UNMEASURED, with exit code 2.
- **The fixture rule, on the real tree:** `scan apps/web/src` reads 364 files, and the deliberate fixtures in
  five test files pass. Control: with `rig0` taken off the list, the four tests that plant it are flagged.
  The file was then restored byte for byte.
- **Finding, not fixed here** (it belongs to the separate dispatch for tracked files that name a machine):
  four test files name a real fleet machine, as a seat fixture or in a comment. They are
  `LoginPage.ocn.test.jsx`, `ocnLogin.test.js`, `src/test/select-testable.jsx` and
  `tests/upgrade/admin-fixture.mjs`. A scan of `apps/web/src` therefore fails on the three under it, as it
  should.
- **Gates:** `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`
  and `verify_public_boundary.py` pass, also in a fresh LF checkout.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
