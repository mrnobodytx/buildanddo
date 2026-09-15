# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md;
#              VALIDATES .bits/context.lock.json;
#              VALIDATES .github/workflows/candidate-to-gitlab.yml;
#              VALIDATES apps/web/public/robots.txt;
#              VALIDATES apps/web/public/sitemap.xml;
#              VALIDATES apps/web/public/social-card.png;
#              VALIDATES apps/web/src/components/ScrollToTop.jsx;
#              VALIDATES apps/web/src/components/Seo.jsx;
#              VALIDATES apps/web/src/components/auth/AuthLayout.jsx;
#              VALIDATES apps/web/src/components/site/Footer.jsx;
#              VALIDATES apps/web/src/components/site/Header.jsx;
#              VALIDATES apps/web/src/components/ui/sheet.jsx;
#              VALIDATES apps/web/src/components/workspace/workspaceHelpers.jsx;
#              VALIDATES apps/web/src/main.jsx;
#              VALIDATES apps/web/src/pages/HomePage.jsx;
#              VALIDATES apps/web/src/pages/PracticePage.jsx;
#              VALIDATES apps/web/src/pages/workspace/CommunitySocialPage.jsx;
#              VALIDATES apps/web/src/pages/workspace/CorrectionsPage.jsx;
#              VALIDATES apps/web/src/pages/workspace/ErpPage.jsx;
#              VALIDATES apps/web/src/pages/workspace/SupportRevenuePage.jsx;
#              VALIDATES apps/web/src/pages/workspace/TutorialsPage.jsx;
#              VALIDATES apps/web/tools/build.mjs
# DAG Node:    none
# Intent:      Distinguish implemented upgrade behavior from measured acceptance and blocked environment checks.
# ───────────────────────────────────────────────────────────────

# Dispatch implementation report

## §1 SUMMARY

Status: PARTIAL
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924
Tasks: 12/25 acceptance gates complete; public upgrades, backend reuse, mission education, prior handoff and workflow persistence
Smoke: 4/7 current application gates; prior Rig 1 handoff evidence retained separately
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 4 prior revisions (8a1c407d12e830a041a454d3bc668f4d94e104c9, c84008b5b0a1630d8543006b7529a7da1d7badd9, 9b69cb79429f551dda5629a18bc025dce8ced29b, e820f8f220632405b910f9ebd9d71e2e20a00e41); workflow evidence prepared before its final source commit

The current backend wave adds persistent workflow runs, approval checkpoints,
atomic evidence and recoverable workspace controls under the existing A1 dispatch.
All 66 Node and 18 Python regressions pass. Frontend execution and native
PocketBase compatibility remain unverified; source completion is not TEVV.
Earlier public pages, backend reuse and mission education are retained. PRs 19
and 20 merged earlier source, but those merge events are not acceptance evidence.
The owner set Rig 1 aside; its existing handoff remains historical and unchanged.

## §2 TASK RESULTS

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| A — Register original scope | PASS | Eight-area umbrella, registry and owner dispatch | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs_registry.yml, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md |
| B — Public pages | PARTIAL | Pricing, About, Docs, Blog, Contact and navigation | `npm --prefix apps/web test -- src/pages/__tests__/PublicPages.test.jsx` | 07_BUILD / 08_TEST | apps/web/src/pages/PricingPage.jsx, apps/web/src/pages/AboutPage.jsx, apps/web/src/pages/DocsPage.jsx, apps/web/src/pages/BlogPage.jsx, apps/web/src/pages/ContactPage.jsx |
| C — Component coverage | PARTIAL | Public/workspace interaction suites; 23 Vitest files inventoried; frontend execution remains blocked | `npm --prefix apps/web run test:coverage` | 08_TEST | apps/web/src/pages/__tests__/PublicPages.test.jsx, apps/web/vitest.config.js |
| D — Route loading | PARTIAL | Lazy routes, Suspense feedback and workspace error isolation | `npm --prefix apps/web run build` | 07_BUILD | apps/web/src/App.jsx |
| E — Mobile layouts | PARTIAL | Responsive shared navigation, controls and dialogs; new previews wrap at narrow widths | Production preview at 320, 375 and 1280 px after build | 07_BUILD | apps/web/src/components/site/Header.jsx, apps/web/src/components/ui/sheet.jsx |
| F — Telemetry adapters | PASS locally | Real-result mutation events/timing, shared release, supply collection and opt-in PocketBase hooks | `node --test tests/upgrade/*.test.mjs`; `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | 07_BUILD / 11_COMMIT | apps/pocketbase/pb_hooks/telemetry.js, scripts/ci/supply_chain.py |
| G — SEO generation | PASS locally | Public crawler assets and route-specific metadata generation | `node --test tests/upgrade/build.test.mjs` | 07_BUILD / 11_COMMIT | apps/web/public/robots.txt, apps/web/public/sitemap.xml |
| H — Theme | PARTIAL | Persisted system/light/dark controls; contrast tests pass; browser interaction remains unverified | `python -m unittest discover -s tests/upgrade -p 'test_theme_contrast.py'` | 07_BUILD / 08_TEST | apps/web/src/index.css |
| I — Accessibility | PARTIAL | Keyboard navigation, skip targets, labels and focus return; interaction tests authored | `npm --prefix apps/web test` | 07_BUILD / 08_TEST | apps/web/src/components/site/Header.jsx, apps/web/src/components/ui/sheet.jsx |
| J — Initial evidence/handoff | PASS | Original evidence and private PocketBase activation handoff retained | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT | .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md |
| K — Register backend reuse | PASS | Owner continuation recorded under the existing SRS and A1 dispatch | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md |
| L — Home backend flows | PARTIAL | Workspace summaries, evidence, published editions, verified corrections, source-separated revenue, challenge persistence/history; selectors pass, UI acceptance pending | `node --test tests/upgrade/workspace-summary.test.mjs`; `npm --prefix apps/web test -- src/pages/__tests__/HomePage.test.jsx` | 07_BUILD / 08_TEST | apps/web/src/pages/HomePage.jsx, apps/web/src/lib/workspaceSummary.js |
| M — Shared Field Manual | PARTIAL | Same authenticated catalogue and saved progress on Home, Docs and workspace; retry/demo/account tests authored | `npm --prefix apps/web test -- src/components/workspace/__tests__/TutorialCatalog.test.jsx src/contexts/__tests__/WorkspaceContext.test.jsx` | 07_BUILD / 08_TEST | apps/web/src/components/workspace/TutorialCatalog.jsx |
| N — Continuation evidence | PASS with validation blockers recorded | Runnable offline source check, updated context, memory and report | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`; `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT | .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs |
| O — Mission scope | PASS | Existing dispatch and registered umbrella extended with the owner’s mission request | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md |
| P — Mission data and policy | PARTIAL — local contracts pass | Optional fields, authenticated lifecycle enforcement, server-attributed approval/review, same-mission readable evidence; native runtime acceptance pending | `node --test tests/upgrade/mission-system.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/mission-policy.js, apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js |
| Q — Guided missions | PARTIAL — component execution unavailable | Purpose/safety/TEVV draft builder, explicit approval, evidence intake, review/failure paths, account isolation; shared how/why guidance | `npm --prefix apps/web test -- src/pages/workspace/__tests__/MissionsPage.test.jsx src/components/workspace/missions/__tests__/MissionFlow.test.jsx` | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/MissionsPage.jsx, apps/web/src/components/workspace/missions/MissionBuilder.jsx |
| R — Educational rewards | PARTIAL — selectors pass, browser acceptance pending | Bounded saved points, knowledge checks, worked example/review-coach bonuses, animation preference and reduced-motion CSS | `node --test tests/upgrade/mission-system.test.mjs`; mission component suite and browser checks | 07_BUILD / 08_TEST | apps/web/src/lib/missionLearning.js, apps/web/src/components/workspace/missions/MissionLearning.jsx |
| S — Mission evidence | PASS with acceptance blockers recorded | Updated dispatch, source checks, report/memory and how/why documentation | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; context and boundary gates | 06_PLAN / 11_COMMIT | docs/mission-system.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md |
| T — Rig 1 scope | PASS | Public handoff boundary registered under the existing SRS before writing the artifact | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md |
| U — Rig 1 handoff | PASS | CMAX-B requirements and acceptance cases for bridge selection, ingress, supervision, MCP and controlled MRs; private execution blocked | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT | .bits/handoffs/2026-09-15-bits-codegen-cmax-b-rig1-repo-loop.md |
| V — Workflow scope | PASS | Public workflow persistence and review scope registered before implementation | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| W — Run persistence | PARTIAL — local contracts pass | Immutable snapshots, bounded commands, approval roles, expected revisions, safe retries and atomic mission-linked evidence | `node --test tests/upgrade/workflow-runs.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/workflow-runs.js, apps/pocketbase/pb_hooks/workflow-policy.js, apps/pocketbase/pb_hooks/workflows.pb.js, apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js |
| X — Workflow desk | PARTIAL — client contracts pass, UI execution unavailable | Paginated history, approval filter, saved outcome forms, recoverable drafts and account/workspace/demo isolation | `node --test tests/upgrade/workflow-client.test.mjs`; targeted Vitest command below | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/WorkflowsPage.jsx, apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx, apps/web/src/lib/workflowRuns.js |
| Y — Workflow evidence | PASS with acceptance blockers recorded | Current source/contract checks, API and rollout documentation, context, boundary and memory evidence | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; context and boundary gates | 06_PLAN / 11_COMMIT | docs/workflow-system.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json |

Backend reuse inventory:

| Surface | Existing data reused | Resulting behavior |
|---|---|---|
| Home account state and glance | services, signals, missions, evidence | Active-workspace counts using the same mission/evidence selectors as Overview; unavailable reads stay unknown |
| Challenge Desk | challenge_submissions and useWorkspaceRecords mutations | Saves owner/workspace-scoped input, shows the returned status and recent receipts; no automation is claimed |
| Evidence Ledger | evidence | Recent records retain type, source, timestamp and receipt |
| Corrections | corrections | Only complete comparisons marked verified appear |
| Daily Edition | daily_editions | Latest published, non-future edition; drafts remain in the workspace |
| Support & Revenue | support_sources | Reported gross, fees, refunds, payout, period and last sync stay separate per source and currency |
| Home/Docs/Field Manual | tutorials and tutorial_progress | One shared catalogue and mutation flow; saved progress belongs to the authenticated account |
| Early access | early_access | Already persisted; no duplicate intake backend added |
| Commercial contact | Explicit user-sent email draft | No existing delivery backend was found to reuse; no false delivery confirmation added |

Private reads mount only after authentication. Workspace previews and forms
remount on account/workspace/demo changes; the provider binds results to the
current account and discards stale loads. Shared hooks discard late reads and
do not refresh a previous workspace after a pending mutation. Failed workspace
loads now offer retry instead of redirecting to onboarding. New private preview
regions are masked for Datadog replay and excluded from PostHog autocapture.
Backend reuse retained the collection rules and deployment authority. The mission continuation below adds an optional-field migration and request validation without changing any collection access rule.


Mission implementation and limits:

- `/app/missions` now saves purpose, scope, baseline/target, risk, authorization,
  data handling, recovery and four TEVV methods. Save drafts independently from
  approval; record work started, pause, review evidence, then verify or record an
  honest failed outcome. Revising an approved/paused plan clears its prior review
  and approval. Finished mission outcomes cannot be reopened through this API.
- PocketBase owns schema/transition checks, workspace write permissions and
  evidence access validation. Ownership/workspace cannot be reassigned. Approval
  and review identities/times come from the authenticated request, not the body.
  A verification requires readable source-backed evidence from the same mission
  and workspace for all four passing observations. It is a workspace assertion,
  not independent certification or tamper-proof proof of a business outcome.
- Home/Docs reuse remains intact. Mission instruction appears in Docs and the
  Field Manual; `docs/mission-system.md` explains the how, why, architecture,
  primary framework references, validation procedure and coordinated rollback.
- “wor3 voc” was not found in the repository. A clarification was requested;
  absent a reply it is provisionally interpreted as W3C Verifiable Credentials
  2.0. The guide explains issuer, subject, evidence and securing mechanisms.
  Downloads are explicitly unsigned learning records, not VCs or signed proofs.
- Saved planning contributes 30 points, four knowledge checks 60, and a complete
  observed review 10. Repeats cannot add points. Honest failures earn equal review
  credit. At 30/60 points, a worked TEVV example and review coach become available.
  These mission-level rewards grant no authority, money or qualification.
- The animation preference and system reduced-motion setting disable the brief
  step/progress/reward effects. Forms remount on account/workspace/demo changes;
  demo writes are blocked and private mission regions are masked from replay.

No mission was created in a live workspace and no deployment or migration was
applied to a shared backend. Native PocketBase acceptance is still required.

Workflow backend implementation and limits:

- Native authenticated commands create a workflow run from a saved active
  definition. Each run preserves its original steps and optional mission approval;
  subsequent definition edits apply to future runs. Activation no longer writes
  a browser timestamp. Only a real server start updates last_run; old activation
  dates remain untouched and are not shown as evidence of execution.
- Run collection writes are locked for ordinary users. A current owner/admin/editor
  can start, record or cancel; only an owner/admin can decide approval checkpoints.
  Membership must match one workspace/user row. Current source readability, step
  order, expected revision and mission approval are checked before persistence.
- A decision saves both the run event and its evidence in one transaction. Exact
  retries return the same result after JSON key reordering or a lost response.
  Stale or conflicting requests do not append evidence. Failure and cancellation
  retain a reason; terminal outcomes cannot be rewritten through these commands.
- The desk provides pages of 20 runs, workflow/status filters, explicit approval
  and outcome forms, immutable receipts, and links to the Mission Desk/Evidence
  Ledger. Failed saves retain inputs and request keys. Pending draft saves keep
  the form open. Account/workspace changes discard drafts and late responses;
  demo mode makes no run request. Private portal content is masked for replay.
- Workflow commands add bounded browser mutation and optional PocketBase request
  telemetry. The public adapters send no content, record IDs or credentials to
  telemetry and install no transport. History indexes match the pagination sort.
- Step kinds describe operator-performed work. A completed recorded run does not
  execute an external tool, verify its linked mission, issue a credential or
  prove an independent business outcome. Native SQL/JSVM and browser acceptance
  remain pending. docs/workflow-system.md defines the activation/retention checks.

## §3 SMOKE TEST RESULTS

These results were observed during the workflow backend continuation. Tests
execute local source; no shared backend, live workspace or deployment was used.

| # | Command | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Targeted workflow Vitest command below | Component workflows pass | vitest: not found | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Repository lint passes | Missing eslint-plugin-import | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Vite emits the application bundle | spawnSync vite ENOENT | FAIL — environment |
| 4 | `node --test tests/upgrade/*.test.mjs` | Node source suites pass | 66/66 pass, including 15 backend and 7 client workflow cases | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Python adapter/contrast suites pass | 18/18 pass | PASS |
| 6 | `python scripts/ci/agent_context.py --check` | Measured context matches source | 23 frontend test files; six pre-existing findings and four unwired gates retained | PASS after lock refresh |
| 7 | `python scripts/ci/verify_public_boundary.py` | Public boundary clear | 428 tracked files; zero failures; provider actor label not available locally | PASS |

Targeted frontend verification:

```bash
npm --prefix apps/web test -- src/pages/workspace/__tests__/WorkflowsPage.test.jsx src/components/workspace/workflows/__tests__/WorkflowRuns.test.jsx
npm --prefix apps/web run test:coverage
```

Failures 1–3 retain the missing-dependency root cause. Coverage also cannot
start because Vitest is absent. The earlier lock audit found eight declared
packages missing from the lock and disagreement with manifests; this wave changes
neither. No offline cache repair is available and no network installation,
dependency removal or gate bypass was attempted. A registry-enabled runner must
reconcile the lock with the declared manifests and install them, then rerun the
commands above, lint, build and the browser procedure in docs/workflow-system.md.
No applied source fix is claimed for unavailable packages.

The first context check after staging failed in the repo/tests sections because
the pre-staging lock inventoried only previously tracked files. agent_context.py
uses git ls-files. Regenerating after staging with
`python scripts/ci/agent_context.py --write` fixed the inventory; the subsequent
`python scripts/ci/agent_context.py --check` passed with all current files present.
This did not remove the six unrelated findings.

Selected production-source coverage was measured with the full Node suite:

```bash
node --test --experimental-test-coverage --test-coverage-include=apps/pocketbase/pb_hooks/workflow-policy.js --test-coverage-include=apps/pocketbase/pb_hooks/workflow-runs.js --test-coverage-include=apps/pocketbase/pb_hooks/workflows.pb.js --test-coverage-include=apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js --test-coverage-include=apps/web/src/lib/workflowRuns.js tests/upgrade/*.test.mjs
```

Observed aggregate: 100% lines, 97.53% branches, 98.46% functions. The four
backend files have 100% line/function coverage; the client includes an unexecuted
default crypto-key factory under Node. UI component coverage is not inferred.
The production-source suites check denied writes, foreign/unreadable records,
role row isolation, mission reapproval, step/revision conflicts, safe retries,
terminal outcomes, atomic rollback and migration reversal. Two telemetry tests
check workflow counters and normalized command latency without private fields.

Red/green evidence: the initial identical-retry test failed when stored JSON
object keys were reordered. Comparing scalar command fields independently of
JSON serialization order fixed the failing case. Reproduce with:

```bash
node --test --test-name-pattern='idempotency compares JSON' tests/upgrade/workflow-runs.test.mjs
```

`node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` parsed 185 frontend
modules with zero core errors after the final UI edits. This limited parser is
not repository lint, React execution, coverage or a browser test. UI suites now
cover pagination, filter races, pending draft recovery, approval consent,
retained observations, explicit cancellation, demo restrictions and late account
responses, but their execution remains blocked.

The local apps/pocketbase/pocketbase binary and a PocketBase executable on PATH
are both absent. The JSVM/transaction doubles do not prove native back-relation
rules, transaction isolation, registered callbacks or JSON behavior on PocketBase
0.28.4. Native concurrency, permission and rollback checks plus 320/375/1280 px,
theme and keyboard checks are specified in docs/workflow-system.md.

Historical evidence retained: mission policy/model coverage was 100% lines and
functions with 99.58% branches; workspace-summary coverage was 100% in all three
measures. Those modules' tests pass in the current full regression, but their
coverage percentages were not remeasured by this wave's selected-coverage command.
The prior Rig 1 handoff passed four documentation/governance checks; no private
runtime source was accessible and no readiness percentage is claimed.

## §4 MEMORY INGEST

Type A count: 138
Type B count: 227
Type C count: 20
IOO compliance: true
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

File vectors cover cumulative touched source. Edges match CGRF declarations;
each file has a relationship. Prior timestamps are preserved. Current events
record actual contract results and unavailable validation with real UTC times;
pre-commit events have null commit_sha. No memory endpoint was called.

## §5 CKET FILING

06_PLAN: docs/mission-system.md, docs/workflow-system.md and docs/api/README.md.
04_HYPOTHESIZE: umbrella/telemetry specs and SRS registry.
07_BUILD: public/workspace UI, data adapters, mission/workflow policy, commands, hooks and migrations.
08_TEST: component/account suites, mission/workflow policy, client and telemetry regressions.
11_COMMIT: context lock, task table, report/memory, source verifier, existing build/CI tools and handoffs.
13_SAVE: none.

The application/test paths follow the actual BuildAndDo AGENTS.md and public
path policy. CGRF headers: 74/74 files new since the original base, including
sibling metadata for JSON and PNG. This workflow wave adds 12 new files.
Existing provenance is preserved. REFLEX remains deferred to the private
post-merge validator; no CK/CAPS/CKS grade or signature was fabricated.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: PASS; zero public-boundary failures
Secret scan: PASS; zero scanner failures
Stripe mode: not applicable; no checkout or payment processing added
Actor label: actor:agent required; provider application remains a PR check
Risk / authority: A1 local source and review; no deployment or shared mutation

The new workflow_runs collection has workspace-scoped reads and locked ordinary
writes. Native authenticated commands apply explicit current role and source
read checks. No existing collection rule was relaxed. The earlier mission
migration adds optional fields and its hooks still enforce mission verification.
New workflow evidence never bypasses that review. No external automation,
contact delivery, payment service, private runtime or credential was added.

## §7 NEXT ACTIONS

Blockers: restore frontend dependencies and reconcile the pre-existing lock on a
registry-enabled runner; execute Vitest/coverage, official lint, build and browser
acceptance. Validate mission and workflow migrations/hooks on the pinned native
PocketBase runtime before activation, including real concurrent commands and
membership removal. Source contracts alone do not authorize a delivered status.

Handoffs requested: the existing IDE1 PocketBase telemetry activation note remains
at .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md. The existing
CMAX-B Rig 1 note is retained unchanged and deferred at the owner's request.
No live seat or issue message was sent.
Suggested next dispatch: dependency-enabled and native PocketBase acceptance of
this source wave; the operator supplies any new dispatch ID.
Bugs filed: none; no issue target was supplied and provider writes are unavailable.
The six pre-existing governance/gate findings remain in agent_context.py.

Workflow rollback: remove the new UI and commands together while retaining the
locked workflow_runs collection and its receipts. The explicit down migration
deletes that collection and all run data, requiring the deployment owner's
retention decision; Evidence Ledger rows remain. Pausing preserves definitions
with history. Old activation timestamps are not converted into invented runs.
Mission rollback: revert its UI and hooks together, retaining additive fields
unless the deployment owner explicitly decides their stored data can be removed.
No shared migration, rollback, deployment or telemetry activation ran here.
