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
Tasks: 16/33 acceptance gates complete; public upgrades, backend reuse, missions, workflow runs, delivery handoff and business learning
Smoke: 4/7 current application gates; native/browser and delivery acceptance pending
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 5 prior revisions (8a1c407d12e830a041a454d3bc668f4d94e104c9, c84008b5b0a1630d8543006b7529a7da1d7badd9, 9b69cb79429f551dda5629a18bc025dce8ced29b, e820f8f220632405b910f9ebd9d71e2e20a00e41, af63ab4a64aa2708487e3a2f20b5c229e4da2d83); business/learning evidence prepared before its final source commit

The current A2 source continuation adds editable ERP planning, a reviewed
content studio and 25 complete lessons shared by the web catalogue and an
additive PocketBase seed. All 86 Node and 18 Python regressions pass. Frontend
execution and native PocketBase compatibility remain unverified; source
completion is not TEVV. docs/business-learning.md defines the user flows and
remaining acceptance work.

PRs 19–21 merged earlier upgrades; the workflow revision and this continuation
remain outside the observed provider main. The candidate job is billing-blocked
and Cloudflare independently reports a failed build. The BuildAndDo delivery
handoff specifies equivalent validation and served-version checks for the
private seat. No remote merge, private-agent activation or deployment occurred.
The earlier Rig 1 runtime handoff remains deferred at the owner's request.

## §2 TASK RESULTS

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| A — Register original scope | PASS | Eight-area umbrella, registry and owner dispatch | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs_registry.yml, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md |
| B — Public pages | PARTIAL | Pricing, About, Docs, Blog, Contact and navigation | `npm --prefix apps/web test -- src/pages/__tests__/PublicPages.test.jsx` | 07_BUILD / 08_TEST | apps/web/src/pages/PricingPage.jsx, apps/web/src/pages/AboutPage.jsx, apps/web/src/pages/DocsPage.jsx, apps/web/src/pages/BlogPage.jsx, apps/web/src/pages/ContactPage.jsx |
| C — Component coverage | PARTIAL | Public/workspace interaction suites; 24 Vitest files inventoried; frontend execution remains blocked | `npm --prefix apps/web run test:coverage` | 08_TEST | apps/web/src/pages/__tests__/PublicPages.test.jsx, apps/web/vitest.config.js |
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
| Z — Delivery investigation | PASS | Provider main/PR ancestry and failed candidate/Cloudflare checks established | Provider and ancestry commands in the delivery handoff | 11_COMMIT | .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md |
| AA — Private delivery handoff | PASS for public artifact | Full source publication, equivalent private validation, authorized release and served-version requirements; receiving seat not activated | `python scripts/ci/verify_public_boundary.py`; `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT | .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md |
| AB — Business/learning scope | PASS | Owner continuation registered at A2 before source/schema edits | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| AC — Business data and policy | PARTIAL — local contracts pass | Additive ERP/content fields, server review receipts, workspace-local relations and identity-preserving curriculum seed; native acceptance pending | `node --test tests/upgrade/business-learning.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/business-policy.js, apps/pocketbase/pb_hooks/business.pb.js, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js |
| AD — ERP desk | PARTIAL — component execution unavailable | Editable measures, due dates, linked tasks/contacts, priority and search; failed saves retain data and returned identities | Targeted business Vitest command below; Node selector contracts | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/ErpPage.jsx, apps/web/src/lib/businessPlanning.js |
| AE — Content studio | PARTIAL — component execution unavailable | Editable outlines and safe previews, explicit review, editorial dates and recorded publication receipts; no external posting | Targeted business Vitest command below; Node policy contracts | 07_BUILD / 08_TEST | apps/web/src/components/workspace/ContentStudio.jsx, apps/web/src/components/workspace/StructuredContent.jsx, apps/web/src/pages/workspace/CommunitySocialPage.jsx |
| AF — First 25 tutorials | PARTIAL — source contracts pass | Five learning paths, complete structured bodies, searchable reader, safe references and progress recovery; browser/native acceptance pending | `node --test tests/upgrade/business-learning.test.mjs`; targeted business Vitest command below | 07_BUILD / 08_TEST | apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/web/src/components/workspace/TutorialReader.jsx, apps/web/src/lib/tutorialCurriculum.js |
| AG — Business/learning evidence | PASS with acceptance blockers recorded | User/retention documentation, extended delivery handoff and current context/boundary/CGRF/memory verification | Context, boundary and memory gates | 06_PLAN / 11_COMMIT | docs/business-learning.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json |

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

Business planning, content and learning implementation:

- ERP objectives carry a success measure and due date. Tasks can be edited,
  prioritized and linked to readable same-workspace objectives and contacts.
  Search, explicit states and overdue views use saved records; unavailable
  reads remain unknown. Forms retain input after failure. When an old backend
  drops newly submitted fields, the UI reports an incomplete save and retains
  the returned record ID, avoiding a second create on retry.
- The content studio supports blog, tutorial and social drafts from an audience
  brief. Outlines are deterministic writing prompts, with explicit confirmation
  before replacing copy. Preview uses React text nodes and structured elements.
  Owner/admin review requires four checks and a note, attributed by the server.
  Reviewed copy must return to draft before changes; planned dates do not run a
  scheduler. An owner/admin can record a checked HTTPS publication URL with an
  attributed receipt. Published history is retained through ordinary requests.
- Twenty-five authored lessons cover five paths: foundations, operations,
  missions/workflows, content production and practice/improvement. Each has
  outcomes, rationale, preparation, instruction, a worked example, exercise,
  knowledge check and references. Public/demo readers make no PocketBase calls.
  Signed-in readers combine saved lessons with starter previews; saving requires
  a real catalogue ID and known account progress. Reviewing completion does not
  downgrade it. A lost create response reloads progress before retrying.
- One versioned JSON asset supplies both previews and the migration. The seed
  hydrates only unchanged legacy summaries, preserves their IDs/progress, uses
  stable IDs for new lessons and never overwrites an existing body on replay.
  The asset must accompany the migration. The explicit down preserves tutorial
  identities/progress and the approved select value, but removes new field data;
  ordinary application rollback should retain the schema and receipts.
- Existing collection rules, workspace roles and auth remain authoritative.
  Demo writes are disabled; account/workspace changes discard private drafts
  and late responses. Ordinary editorial request hooks do not provide the
  workflow commands' revision/idempotency guarantees. Native simultaneous
  request acceptance is specified in docs/business-learning.md.

Delivery investigation:

- At 2026-09-15T04:24:05Z, provider main and local origin/main both resolved to
  ff8af6c81090eaa016155f418c6fd98076ee8cfb. The four session revisions through
  e820f8f220632405b910f9ebd9d71e2e20a00e41 are ancestors; workflow revision
  af63ab4a64aa2708487e3a2f20b5c229e4da2d83 is not. The older open staging PR 18
  is outside this session's reviewed source and was not bundled.
- Candidate run 34924483806/check 104239502387 did not start because GitHub
  reported an account billing lock. Main's Cloudflare check 104239520899 failed
  independently; its underlying build log is unavailable here. A skipped DORA
  workflow and a source merge are not deployment receipts.
- Provider branch metadata reported no protection or required status contexts
  at inspection time. No rules were changed, and sandbox provider access is
  read-only. The Create/Update PR flow must publish the remaining source.
  The private repository cannot be attached to this public session; no private
  runtime, runner capability or dispatch channel was verified or activated.
- The handoff targets the complete subsequently published PR head, including
  this business/learning wave. It retains boundary, actor, lock, test, build,
  native and browser gates for private execution without GitHub Actions. A
  release must produce version.json and show the same identity in the served
  staging/production application before delivery can be claimed.

## §3 SMOKE TEST RESULTS

These results were observed during the business/learning continuation. Tests
execute local source; no shared backend, live workspace or deployment was used.

| # | Command | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Targeted business Vitest command below | ERP/content/reader interactions pass | vitest: not found | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Repository lint passes | Missing eslint-plugin-import | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Vite emits the application bundle | spawnSync vite ENOENT | FAIL — environment |
| 4 | `node --test tests/upgrade/*.test.mjs` | Node source suites pass | 86/86 pass, including 20 new business/learning cases | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Python adapter/contrast suites pass | 18/18 pass | PASS |
| 6 | `python scripts/ci/agent_context.py --check` | Measured context matches source | 24 frontend test files; six pre-existing findings and four unwired gates retained | PASS after lock refresh |
| 7 | `python scripts/ci/verify_public_boundary.py` | Public boundary clear | 442 tracked files; zero failures; actor label not applied by this session | PASS |

Targeted frontend verification:

```bash
npm --prefix apps/web test -- src/pages/workspace/__tests__/BusinessDesks.test.jsx src/components/workspace/__tests__/TutorialCatalog.test.jsx src/pages/__tests__/HomePage.test.jsx
npm --prefix apps/web run test:coverage
```

Failures 1–3 retain the missing-dependency root cause. Coverage also cannot
start because Vitest is absent. The earlier lock audit found eight declared
packages missing from the lock and disagreement with manifests; this wave changes
neither. No offline cache repair is available and no network installation,
dependency removal or gate bypass was attempted. A registry-enabled runner must
reconcile the lock with the declared manifests and install them, then rerun the
commands above, lint, build and the browser procedures in docs/business-learning.md
and docs/workflow-system.md.
No applied source fix is claimed for unavailable packages.

The measured context inventories tracked files. It was regenerated after staging
this wave using `python scripts/ci/agent_context.py --write`, then checked with
all 442 files present. The six unrelated findings remain. The earlier workflow
wave's pre-staging inventory mismatch and its fix are retained in event history.

Selected production-source coverage was measured with the full Node suite:

```bash
node --test --experimental-test-coverage --test-coverage-include=apps/pocketbase/pb_hooks/business-policy.js --test-coverage-include=apps/pocketbase/pb_hooks/business.pb.js --test-coverage-include=apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js --test-coverage-include=apps/web/src/lib/businessPlanning.js --test-coverage-include=apps/web/src/lib/tutorialCurriculum.js tests/upgrade/*.test.mjs
```

Observed aggregate: 100% lines, 96.41% branches and 100% functions across the
five selected source files. Component coverage is not inferred. Twenty new
cases check complete lesson structure, safe references, legacy/custom catalogue
merge, progress retention, objective/task selectors, draft outlines, incomplete
backend responses, seed replay/down and identity collision, workspace relation
denials, editorial authority, forged receipts and hook registration.

Historical red/green evidence: the initial workflow identical-retry test failed when stored JSON
object keys were reordered. Comparing scalar command fields independently of
JSON serialization order fixed the failing case. Reproduce with:

```bash
node --test --test-name-pattern='idempotency compares JSON' tests/upgrade/workflow-runs.test.mjs
```

`node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` parsed 191 frontend
modules with zero core errors after the final UI edits. This limited parser is
not repository lint, React execution, coverage or a browser test. UI suites now
cover ERP linked edits, retained draft inputs, old-schema responses, outline
replacement, review/receipt controls, anonymous/demo reading, full lesson bodies,
completion retention, lost-response progress recovery and account changes. Their
execution remains blocked. Earlier mission/workflow suites remain included.

The local apps/pocketbase/pocketbase binary and a PocketBase executable on PATH
are both absent. The JSVM/transaction doubles do not prove native back-relation
rules, transaction isolation, registered callbacks or JSON behavior on PocketBase
0.28.4. Native seed asset/field compatibility, concurrency, permission and rollback
checks plus 320/375/1280 px, theme and keyboard checks are specified in
docs/business-learning.md and docs/workflow-system.md.

Historical evidence retained: workflow source coverage was 100% lines, 97.53%
branches and 98.46% functions; mission policy/model coverage was 100% lines and
functions with 99.58% branches; workspace-summary coverage was 100% in all three
measures. Those modules' tests pass in the current full regression, but their
coverage percentages were not remeasured by this wave's selected command.
The prior Rig 1 handoff passed four documentation/governance checks; no private
runtime source was accessible and no readiness percentage is claimed.

## §4 MEMORY INGEST

Type A count: 152
Type B count: 263
Type C count: 24
IOO compliance: true
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

File vectors cover cumulative touched source. Edges match CGRF declarations;
each file has a relationship. Prior timestamps are preserved. Current events
record actual contract results and unavailable validation with real UTC times;
pre-commit events have null commit_sha. No memory endpoint was called.

## §5 CKET FILING

06_PLAN: docs/mission-system.md, docs/workflow-system.md, docs/business-learning.md and docs/api/README.md.
04_HYPOTHESIZE: umbrella/telemetry specs and SRS registry.
07_BUILD: public/workspace UI, data adapters, mission/workflow/business policy, commands, hooks, migrations and authored curriculum.
08_TEST: component/account suites, mission/workflow/business policy, curriculum, client and telemetry regressions.
11_COMMIT: context lock, task table, report/memory, source verifier, existing build/CI tools and handoffs.
13_SAVE: none.

The application/test paths follow the actual BuildAndDo AGENTS.md and public
path policy. CGRF headers: 88/88 files new since the original base, including
sibling metadata for JSON and PNG. This business/delivery wave adds 14 new files.
Existing provenance is preserved. REFLEX remains deferred to the private
post-merge validator; no CK/CAPS/CKS grade or signature was fabricated.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: PASS; zero public-boundary failures
Secret scan: PASS; zero scanner failures
Stripe mode: not applicable; no checkout or payment processing added
Actor label: actor:agent required; not applied by this session
Risk / authority: A2 reviewed schema/source additions; no deployment or shared mutation

The new workflow_runs collection has workspace-scoped reads and locked ordinary
writes. Native authenticated commands apply explicit current role and source
read checks. No existing collection rule was relaxed. The earlier mission
migration adds optional fields and its hooks still enforce mission verification.
New workflow evidence never bypasses that review. No external automation,
contact delivery, payment service, private runtime or credential was added.
Business request hooks reuse the same authority helpers for ERP relations,
editorial review and account-owned learning progress; collection rules remain
unchanged. The content studio records an operator's publication assertion and
does not claim the external platform's publication time or execute a post.

## §7 NEXT ACTIONS

Blockers: restore frontend dependencies and reconcile the pre-existing lock on a
registry-enabled runner; execute Vitest/coverage, official lint, build and browser
acceptance. Validate mission, workflow and business/learning migrations/hooks on
the pinned native PocketBase runtime before activation, including the bundled
seed file, real concurrent requests and membership removal. Source contracts
alone do not establish a delivered status. Provider writes and private-agent
activation are unavailable here; the candidate billing lock and independent
Cloudflare build failure must be handled through the delivery handoff.

Handoffs requested: the existing IDE1 PocketBase telemetry activation note remains
at .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md. The existing
CMAX-B Rig 1 note is retained unchanged and deferred at the owner's request.
The new CMAX-B/IDE1 delivery note is
.bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md. It is a
public artifact for a private session, not a dispatched live seat event.
No live seat or issue message was sent.
Suggested next dispatch: equivalent private-runner validation of the complete
published PR head, authorized release and served-version/flow checks on staging
and production; the operator supplies the private execution dispatch ID.
Bugs filed: none; no issue target was supplied and provider writes are unavailable.
The six pre-existing governance/gate findings remain in agent_context.py.

Workflow rollback: remove the new UI and commands together while retaining the
locked workflow_runs collection and its receipts. The explicit down migration
deletes that collection and all run data, requiring the deployment owner's
retention decision; Evidence Ledger rows remain. Pausing preserves definitions
with history. Old activation timestamps are not converted into invented runs.
Mission rollback: revert its UI and hooks together, retaining additive fields
unless the deployment owner explicitly decides their stored data can be removed.
Business rollback: revert UI and request hooks together while retaining the
additive fields and seed. Explicit down removes new planning/lesson/receipt
contents and requires a retention decision and backup; lesson IDs, progress
and historical approved states remain. Never present old status labels as
review or publication receipts after rollback.
No shared migration, rollback, deployment or telemetry activation ran here.
