# --- CGRF Header ------------------------------------------------
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/claim-authority-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     docs/claim-authority.md, tests/upgrade/test_praxis_isolation.py, tests/upgrade/workspace-claims.test.mjs, tests/upgrade/tutorial-learning-system.test.mjs, apps/web/public/authority-repairs-source.txt, apps/web/public/authority-repairs-final-source.txt, apps/web/public/authority-repairs-recovery-source.txt
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/claim-authority.md; VERIFIED_BY tests/upgrade/test_praxis_isolation.py; VERIFIED_BY tests/upgrade/workspace-claims.test.mjs; VERIFIED_BY tests/upgrade/tutorial-learning-system.test.mjs; CONSUMES apps/web/public/authority-repairs-source.txt; CONSUMES apps/web/public/authority-repairs-final-source.txt; CONSUMES apps/web/public/authority-repairs-recovery-source.txt; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Retain the first safety and authority repair batch, measured source checks and the unresolved native and operational boundaries.
# ----------------------------------------------------------------

# Test isolation and claim authority report

Sections 1-7 retain the pre-merge repair observations. The final integration
section records the subsequent PR 103 conflict resolution and its separate
validation limits; historical captures are not results for the newer source.

## Section 1: Summary

Status: PARTIAL for acceptance; the bounded CA source repair is implemented.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. SRS: SRS-BUILDANDDO-UPGRADE-001.
Seat: BITS-CODEGEN. Risk: A2. Actor: actor:agent.
CKS Gate/CKS/CAPS/CK: pending.

The owner supplied a wide mission/evidence/progression review after merged PR 90.
The source was aligned with that merge before changes. This batch prioritizes
unsafe test destinations and falsifiable claim/progress boundaries rather than
implementing every proposed integration or changing production configuration.

## Section 2: Task results

| Phase | Implemented source behavior | Evidence boundary |
|---|---|---|
| CA-1 | No public default or deployment-file reads in the Praxis client. A fresh, runner-owned loopback database per selftest, explicit fixture proof, no proxies/redirects, fatal isolation errors, bounded all-passed summaries and cleanup. GitLab retains both declared profiles. | Source safety and assembly tests pass; actual Praxis native runs are blocked by missing binaries. |
| CA-2 | Keyless guided responses, server grading against original snapshots, canonical completion states, locked raw progress writes and honest open-book/self-report labels. Legacy rows/certificates remain unchanged. | Source/client/migration tests pass. No claim of secret exam keys or independently verified competence. |
| CA-3 | Seven collections deny raw CRUD. Scoped native commands own authorship, revisions, retry receipts, draft editing and publication decisions. Legacy correction/revenue/seat labels are reports, not newly trusted facts. | Source policy/storage doubles pass; hookless native denial is authored but not executed. |
| CA-4 | A second site lesson and source-case-study capture document these repairs. Prior broadcast output remains historical, bound to its original source revision. | Reading writes no evidence, progress or awards. No deployed website result is asserted. |

The source review corrected two overstatements. Missions already emit scoped
observations through business actions, workflow decisions and suite attachments;
native mission review freezes selected evidence. Manual reading completion could
mislead the catalogue, but did not mint guided certificates or their points.
Existing social approval/publication was already admin-only; cross-author draft
changes and hook-dependent raw rules were additional defects.

## Section 3: Verification

Red controls preceded the corresponding corrections:

- Three initial Praxis tests reproduced import-time deployment-file access,
  the implicit public target and forwarding shared settings to mutating suites.
  File/network effects were intercepted; no real secret or backend was read.
- Review controls reproduced custom temporary-root rejection, isolation errors
  miscounted as application denials, startup redirect following and inconsistent
  pass summaries. Missing/unsupported redirect locations also reproduced false
  domain rejection before their explicit fatal-status handling was added.
- Learning's initial combined source run had 39 passes and 16 failures. Follow-up
  tests reproduced native rule/field wrappers and cross-scope aggregate handling.
  Rendered certificate-disclosure/focus behavior was source-traced, not claimed
  as an executed browser red/green.
- Claims had 12 baseline failures. Follow-up tests reproduced native field-method
  shapes and a lost seat-report response blocking every later distinct report.
  Recovery now reuses the exact original key before accepting a subsequent report.
- Final review reproduced three workspace-round-trip failures, then two async
  races between recovery awaits and caller acceptance of a transport success.
  Seven added cases now cover exact-key retention, stale invocation fencing,
  revocation, account refresh/logout and bounded non-evicting pending storage.
  The publisher acknowledges a native success only in its originating visit.

Observed results:

| Check | Result |
|---|---|
| `node --test tests/upgrade/*.test.mjs` on Node 22.17.0 | 847 pass, zero failures/skips after the final publisher follow-up; earlier 840-test result retained in history |
| Existing Python source acceptance on Python 3.12.13 | 1,210 tests, zero failures, six dependency skips; HOLD |
| `python -m unittest tests.upgrade.test_praxis_isolation tests.upgrade.test_native_fixture_contracts` | 36 pass, zero skips on both Python 3.11.15 and 3.12.13 |
| Selected public source capture | 116 Node plus 36 Python checks: 152 pass, zero failures/skips |
| Intermediate governance-header-bound source capture | 92 Node behavior plus 36 Python checks: 128 pass, zero failures/skips; before publisher follow-up |
| Latest publisher-recovery-bound source capture | 99 Node behavior plus 36 Python checks: 135 pass, zero failures/skips; both prior captures retained |
| `node --test tests/upgrade/workspace-claims.test.mjs` | 56 pass, including seven final recovery regressions |
| Governance/acceptance regression selection | 125 pass |
| Ruff on changed Python source/tests | PASS |
| Mypy `--strict --explicit-package-bases --follow-imports=silent` on client, isolated-test guard and Praxis runner | PASS for the three selected modules; not the imported fixture tree |
| Existing frontend source diagnostic | 369 modules parsed, zero static errors; not repository lint or rendered acceptance |

Python trace measured 100% statement coverage for the service client, 97.30% for
the isolated-test guard and 88.32% for the runner in the source suite. Exact file
paths were filtered after tracing: ignoring stdlib directories by basename would
also exclude this repository's `client.py`. No Python branch-coverage claim.

Without the namespace-package flag, mypy rejected duplicate module discovery.
After resolving discovery, a check that also reported imported modules found 22
pre-existing type errors in `scripts/ci/sprint_cycle.py`,
`tests/upgrade/test_dossier_native.py` and unchanged portions of
`tests/upgrade/test_classroom_native.py`. Those imported modules were not repaired
or declared type-clean; the scoped command above suppresses imported-module
diagnostics, not diagnostics in the three selected Praxis modules.

Focused V8 coverage: native claim commands 98.68% lines/90.08% branches; guided
learning 100%/96.77%; progress lock and lesson migrations 100%/100%; claim lock
migration 100%/97.10%; browser claim adapter 100%/88.71% after the final follow-up; learner projection
validator 100%/100%. These measurements execute explicit doubles, not PocketBase
rules or React rendering.

The latest public source capture is `apps/web/public/authority-repairs-recovery-source.txt`.
The initial `apps/web/public/authority-repairs-source.txt` and intermediate
`apps/web/public/authority-repairs-final-source.txt` remain unchanged as history
before the final publisher recovery changes. Retained commands,
runtime, date, counts, raw-output digests and the final run's limited file
fingerprint are shown with the lesson at `/app/evidence`. Both case-study integrity
suites passed again after updating the final observation. The earlier broadcast
capture's bytes and hashes remain unchanged. A hash establishes consistency,
not an authenticated reviewer, installed migration or a payment observation.

Required unexecuted acceptance remains visible:

- Vitest is missing; rendered learning/editorial/seat/case-study checks cannot start.
- `concurrently` is missing; the root build cannot start.
- `eslint-plugin-import` is missing; configured repository lint cannot start.
- Both PocketBase binaries are unavailable. The isolated Praxis runner returns
  BLOCKED for package and compose without starting a test or selecting a shared URL.
- The six broad Python skips require pypdf or Discord.py. No skips were disabled.
- Actual GitLab job execution, native API rules, concurrency/rollback, rendered
  behavior and staging/production readback remain receiving work.

All eighteen existing acceptance profiles and prior coverage requirements remain.
Pre-publication receipts report changed/uncommitted source and cannot establish
final-candidate acceptance. Execute the unchanged full matrix on the committed
candidate, retaining every FAIL, HOLD and BLOCKED result.

## Section 4: Memory

Preserve all 228 prior Type C events. Refresh source metadata and declared edges,
then append only actual source results, rejected unsafe paths and remaining
runtime limits. Counts live in the memory summary. Verify with
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## Section 5: Filing

Source/migrations remain with existing public owners; tests use 08_TEST. The
downloadable local-source capture is 05_EVIDENCE, guides are 06_PLAN, and
dispatch/report/handoff/memory are 11_COMMIT. New files carry CGRF metadata;
JSON has a sibling header. REFLEX and CK remain receiving/post-merge work.

## Section 6: Governance and rollback

Entity: Citadel Nexus Inc. The pre-existing A2 upgrade dispatch covers this source
continuation. No production secret, actual CI PB target or shared database was
inspected; possible past test pollution is not asserted as fact. No provider
call, payment, public post, deployment, live seat event or hosted CI trigger ran.
GitLab is the execution plane. Exactly one actor label is still required on the
review; applying that label remains the publishing owner's action.

Ship both security migrations and the lesson migration with matching hooks/client.
Older raw-write clients and the old full-key guided response contract do not get
a permissive fallback. Use coordinated release/maintenance. Down retains locks,
data and stamps; claim commands are disabled by removing their marker. Do not
backfill provenance or restore unsafe test targets as rollback. Historical
reading, corrections, revenue reports and certificates are preserved, not rewritten.

## Section 7: Next actions

The CI owner must privately audit actual past Praxis destinations and possible
fixture records without rerunning mutating probes or deleting unreviewed data.
The acceptance owner must execute the native profile matrix and rendered suite
with the declared toolchains. IDE1 must validate the installed migrations,
hookless denials and exact same-candidate publication/learning recovery.

Separate follow-ups remain: mission assignment/follow-up UX, worker placement,
durable epoch publication/retention, claim-audit concurrency, password recovery,
atomic release behavior, consent policy, runtime unification and the wider
progression model. They were not all reproduced or repaired in this bounded pass.
A verified mission status must not manufacture new independently verified evidence.

Handoff: `.bits/handoffs/2026-09-24-bits-codegen-ide1-claim-authority.md`.

## PR 103 integration - 2026-09-24

The current review is PR 103; PR 93 was already merged. The owner requested
command-line conflict resolution, so `origin/main` at
`a8a96b992a6dd24fd85f1cbedfc717ba043523f8` was integrated with the original repair
candidate `be857104b1954f90dcdaddce8602a24e26bd3756`. All 34 conflicted paths are
resolved, including the nine additional test/selftest conflicts found locally.
The two generated locks are rebuilt from reviewed source, not selected from
either parent's stale hashes. Buddi, logo assets and their integration remain
unchanged from incoming main.

The joint contract preserves canonical guided completion, keyless public and
guided lessons, private authored snapshots, bounded answer waits, locked raw
claim writes, native current-role commands and all seat-report recovery fences.
The seat command now stamps the authenticated human identity rather than accepting
an alternate browser label. A targeted identity test failed before that correction
and all 71 claim/TRUST controls pass afterward. The answer-wait migration's
native method-valued field replay likewise failed before normalization and passed
afterward. Both are source-double results, not native execution.

The recorded authority capture's 35-file fingerprint was checked against
`be857104b1954f90dcdaddce8602a24e26bd3756` before adding that historical pin. Its
lesson, original observations and all three output artifacts retain their bytes.
No older passing test result was relabeled as current integration acceptance.

| Integrated-source check | Observed result |
|---|---|
| Existing `source_node` check on Node 22.17.0 | 874 passed, no failures/skips |
| Existing `source_python` check on Python 3.12.13 | 1,210 cases: 1,204 passed, six dependency skips, no failures; HOLD |
| Claim commands, TRUST controls and publisher recovery | 71 passed |
| Guided/client, both lesson cases and public projection | 78 passed |
| Praxis safety, target screening and native-fixture contracts | 43 passed on each declared Python version, 3.11.15 and 3.12.13 |
| Incoming deployment swap regression suite with isolated filesystem/transport fixtures | 12 passed; no deployment performed |
| Existing frontend source diagnostic | 380 modules parsed, zero static errors; not repository lint or rendered tests |
| Dependency lock and public boundary | PASS |

Reproduce the broad runs with
`python scripts/ci/hostinger_readiness.py --run source_node` and
`python scripts/ci/hostinger_readiness.py --run source_python`; select Node 22
from the declared toolchain. The first Node run reported a missing diagnostic
ESLint under the selected Node prefix. Pointing `npm_config_prefix` to the already
installed local tool prefix allowed the unchanged source suite to run; no package,
test or gate was replaced. This does not provide the missing locked frontend
dependencies.

The retained local diagnostic logs and receipts are in
`/tmp/opencode/pr103-merge-checks`. They describe the in-progress merge tree, not
a clean release candidate. The three frontend checks fail before useful execution:
`eslint-plugin-import`, Vitest and `concurrently` are absent. Workspace and learning
native checks are BLOCKED for both declared PocketBase versions, 0.39.8 and 0.28.4.
The isolated Praxis attempts also run no native tests without those binaries.
The full eighteen-profile release matrix was not rerun for this conflict-only
continuation; the earlier 4 PASS / 1 HOLD / 3 FAIL / 10 BLOCKED result remains
historical, not an acceptance claim for the integrated branch.

Independent semantic review found no new scoped merge regression. It identified
an inherited assurance-fixture mismatch, retained in the receiving handoff:
the full-assurance runtime omits the answer-wait migration and its tests still
read withheld answer keys. Those files are not changed here. Fix the fixture in
its own scope, not the production response contract. No remote issue/comment,
hosted CI, provider operation or deployment was performed during integration.
