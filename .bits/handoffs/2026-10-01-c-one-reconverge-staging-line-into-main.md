# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-10-01-c-one-reconverge-staging-line-into-main.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-RECONCILE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-RECONCILE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-01
# Depends:     .bits/queue/VCC-BUILDANDDO-RECONCILE-001.md, .bits/srs/SRS-BUILDANDDO-RECONCILE-001.md
# EnumType:    Doc
# EnumEdges:   CONSUMES .bits/queue/VCC-BUILDANDDO-RECONCILE-001.md; CONSUMES .bits/srs/SRS-BUILDANDDO-RECONCILE-001.md
# DAG Node:    none
# Intent:      Record how the staging line was converged into main a second time, which side won each overlap and why, what was measured, and what the operator still has to do.
# ───────────────────────────────────────────────────────────────

# Re-converge: the staging line into main, 2026-10-01

From: C-ONE (release workstation). To: the operator, and whoever picks up SRS-BUILDANDDO-RECONCILE-001.
Authority: A2 under the existing SRS and dispatch. Nothing was deployed; no remote branch was moved; no secret was read.

## Why this exists

After #105 and #108 (2026-09-24) the two lines split again: `main` took 63 commits (Buddi tool endpoints,
server-graded quiz, domain verification, the hygiene sweep, the growth lock, career evidence, and the four
Buddi-recovery PRs of 2026-09-30) while the staging line `bits/SRS-BUILDANDDO-WORKSPACE-001-fleet-master-seat-gate`
took 31 (OCN telemetry #110, telemetry cheap wins #111, Customer.io mail #117). Production and staging both serve
the line's tip `5805bc9`; none of main's 63 commits is live. Merge-base `82df1fb` (#109).

Branch `c-one/SRS-BUILDANDDO-RECONCILE-001-trunk-into-main-20261001` = `origin/main` (`c540085`) with the line
(`5805bc9`) merged in. It was built in a fresh LF clone, never in the shared checkout. 354 files changed on main's
side, 37 on the line's, 19 on both, 12 in conflict. Every conflict was resolved block by block; no whole-file
`--ours`/`--theirs` except where the lossless check below proved main contributed nothing else.

## Resolution rules (R-20261001)

- **R1, web telemetry overlap: main wins.** `useFailureTelemetry`, `identifyTelemetryUser`/`clearTelemetryUser`
  and the key-based scrubber are what the rest of main's tree imports (App, KnowledgeContext, WorkspaceAssistant,
  SpecialistDeskPage, datadogRum, observability/*). The line's `hooks/useSectionFailure.js`,
  `lib/observability/sectionFailure.js`, its test, and the runtime's re-export of it are removed; `AuthContext`
  returns to main's wiring (`trackAuthIdentity` already identifies and clears product identity).
- **R2, one insight ported from the line.** posthog-js puts `$set`/`$set_once` on the `$identify` envelope
  beside `properties`, and the SDK's initial pathname and person info start out holding the first room or reset
  link. Main's `scrubClassroomProperties` now scrubs those two top-level objects too; the case lives in
  `tests/upgrade/telemetry-browser.test.mjs`. The line's real-SDK test
  `apps/web/src/lib/__tests__/telemetry.navigation.test.js` is retired: main's `initTelemetry` refuses
  `MODE=test` by design, and main's fixture suite already covers identity, reset, `history_change` and
  memory persistence.
- **R3, OCN seat session and its test: the line wins, wholesale.** The registry records the operator's
  2026-09-24 ruling (box-side capture retired; publishing from the release workstation). Main's only other
  hunks there added marker fields and removed `egress_ip` from the local receipt, which the estate aggregate
  reads; both dropped deliberately. Lossless check: the line's file equals the merged file with main's side
  of every conflict block removed, apart from those hunks.
- **R4, deploy guards: both kept.** `ship.py` runs the line's `bundle_telemetry_check` (stage `telemetry_keys`)
  before main's verified rsync (`telemetry_artifact`); the line's own rsync line is dropped. `buildanddo_release.py`
  runs main's pinned telemetry contract and admission, then the line's bundle check, whose result the receipt
  already carries as `telemetry_keys`. Both test files pass.
- **R5, mailer hook header: the line** (documents the Customer.io provider order); `customerio-mail.js` arrives
  unchanged.
- **R6, governance: union.** Registry keeps main's entries plus OCN-TELEMETRY-001 and MAIL-001. The readiness,
  context and growth locks are regenerated on the merged tree; CHANGELOG regenerated (55 entries added). All
  written LF; the Windows tools emit CRLF and were normalised before staging.

## Measured on the merged tree (release workstation, Windows, LF clone, PYTHONPATH pinned to the clone)

| Gate | Merged tree | Clean `origin/main` (same machine, same hour) |
|---|---|---|
| web_lint, web_build | PASS, PASS | not rerun |
| boundary, semantic_twin, dependency_lock | PASS x3 | not rerun |
| readiness, context, growth `--check` | PASS x3 | - |
| submission_readiness, verify_public_boundary, public_redaction, readme_check, changelog | PASS (11 of 12 planned), 1874 files 0 failures, 67 files clean, 0 problems, current (447 entries) | - |
| Node (`source_node`) | 1530 pass / 7 fail | 1516 pass / 7 fail, the same 7 by name (`tests/upgrade/build.test.mjs`) |
| Vitest (`web_tests`) | 972 pass / 4 fail | 972 pass / 4 fail; 3 shared (TalkToBuddi stall, WorkflowRuns receipts, DailyEditionPage publish); the fourth differs per run (HomePage here, PageBoundary on main) and each passes alone |
| Python (`source_python`) | 1587 ran: 28 failures, 48 errors, 2 skipped, 1 loader error | 1425 ran: 28 failures, 48 errors, 2 skipped; the same names, and the inner `_FailedTest.test_development_fixture` loader error appears on both |
| AEGIS on the 11 hand-touched files | clean, crit=0 on all | - |

Node: the 14 extra passes on the merged tree are the line's new OCN telemetry and mail tests.

## Findings outside this change (pre-existing, not fixed here)

- `tools/buildanddo_release.py:107` `DEFAULT_ROOT = parents[3]` is not a repo root by marker (main).
- `tools/buildanddo_release.py` `bundle_telemetry()` runs `exec_module` without registering the module in
  `sys.modules` first (the line's checker, carried as is).
- `scripts/deploy/ship.py` `_notify_guildmasters` is defined and never referenced on either parent.
- `tests/upgrade/build.test.mjs`: 7 cases fail on clean main on this machine.
- Vitest: TalkToBuddi (30 s stall), WorkflowRuns (receipt text), DailyEditionPage (Publish button) fail on
  clean main on this machine; HomePage and PageBoundary are order-dependent.

## Traps met this time

- `hostinger_readiness.py --run` refuses after any source change until `--refresh`; the first rerun of the
  web gates silently did nothing.
- `agent_context.py`, `hostinger_readiness.py`, `system_growth.py` and `changelog_gen.py` write CRLF on Windows.
  Normalise to LF before staging or the diff is the whole file.
- A grep for a removed module must include relative imports: `./sectionFailure` in
  `lib/observability/runtime.js` was missed by a search for `observability/sectionFailure` and caught only by
  the build.
- The user environment exports `PYTHONPATH` to another repository; every gate here needs `PYTHONPATH` pinned
  to the checkout or the Python-spawning node tests fail for the wrong reason.

## Operator steps (gated; nothing below was run)

1. Review and merge PR #124 (merge commit `0459a53`) into `main` (`actor:agent`, SRS-BUILDANDDO-RECONCILE-001).
2. Fast-forward the staging line to the merge commit so the split closes:
   `git push origin <merge-sha>:refs/heads/bits/SRS-BUILDANDDO-WORKSPACE-001-fleet-master-seat-gate`
   (fast-forward, no force; the line's tip is a parent of the merge).
3. Staging deploy from the line: `tools/buildanddo_release.py pipeline-stage --ack-authority A3`, then the
   external readback. Production stays A3.
4. Rebase the open PRs afterwards: #122 and #123 into `main`, #84 into the line.

Still open from 2026-09-23: 44 worktrees on the release workstation; GitLab `deployed/*` pins still point at
the 2026-09-18 commits; `gitlab/main` is at 2026-09-19.
