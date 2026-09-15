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
Tasks: 18/37 acceptance gates complete; cumulative source upgrades and workspace integration repair
Smoke: 4/7 application gates; native/browser and delivery acceptance pending
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 6 prior source revisions (8a1c407d12e830a041a454d3bc668f4d94e104c9, c84008b5b0a1630d8543006b7529a7da1d7badd9, 9b69cb79429f551dda5629a18bc025dce8ced29b, e820f8f220632405b910f9ebd9d71e2e20a00e41, af63ab4a64aa2708487e3a2f20b5c229e4da2d83, 203a08ced7348e551f810ed90b0a869b29532427); integration evidence prepared before its final source commit

The current A2 repair addresses three measured disconnects: an undefined icon
that breaks the shared workspace layout, missing member access to workspaces
and evidence, and previous-work summaries that omit saved receipts. Reads now
retain unavailable/truncated state, independent panels do not cancel each other,
and account/workspace/demo changes discard private page state and late history.
All 110 Node and 18 Python tests pass. Frontend and native acceptance remain open.

PR 22 has merged the earlier workflow and business/learning source. The current
baseline includes it; earlier statements that those revisions await publication
are historical. Its failed governance/Cloudflare checks provide no deployment
receipt. This turn performs no remote merge, shared migration, private-agent
activation or release. The complete source-to-runtime acceptance procedure is
in docs/workspace-integration.md and the existing private delivery handoff.

## §2 TASK RESULTS

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| A — Register original scope | PASS | Eight-area umbrella, registry and owner dispatch | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs_registry.yml, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md |
| B — Public pages | PARTIAL | Pricing, About, Docs, Blog, Contact and navigation | `npm --prefix apps/web test -- src/pages/__tests__/PublicPages.test.jsx` | 07_BUILD / 08_TEST | apps/web/src/pages/PricingPage.jsx, apps/web/src/pages/AboutPage.jsx, apps/web/src/pages/DocsPage.jsx, apps/web/src/pages/BlogPage.jsx, apps/web/src/pages/ContactPage.jsx |
| C — Component coverage | PARTIAL | Public/workspace interaction suites; 25 Vitest files inventoried; frontend execution remains blocked | `npm --prefix apps/web run test:coverage` | 08_TEST | apps/web/src/pages/__tests__/PublicPages.test.jsx, apps/web/vitest.config.js |
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
| X — Workflow desk | PARTIAL — client contracts pass, UI execution unavailable | Paginated history, approval filter, saved outcome forms, recoverable drafts and account/workspace/demo isolation | `node --test tests/upgrade/workflow-client.test.mjs`; workflow Vitest procedure in docs/workflow-system.md | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/WorkflowsPage.jsx, apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx, apps/web/src/lib/workflowRuns.js |
| Y — Workflow evidence | PASS with acceptance blockers recorded | Current source/contract checks, API and rollout documentation, context, boundary and memory evidence | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; context and boundary gates | 06_PLAN / 11_COMMIT | docs/workflow-system.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json |
| Z — Delivery investigation | PASS | Provider main/PR ancestry and failed candidate/Cloudflare checks established | Provider and ancestry commands in the delivery handoff | 11_COMMIT | .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md |
| AA — Private delivery handoff | PASS for public artifact | Full source publication, equivalent private validation, authorized release and served-version requirements; receiving seat not activated | `python scripts/ci/verify_public_boundary.py`; `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT | .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md |
| AB — Business/learning scope | PASS | Owner continuation registered at A2 before source/schema edits | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| AC — Business data and policy | PARTIAL — local contracts pass | Additive ERP/content fields, server review receipts, workspace-local relations and identity-preserving curriculum seed; native acceptance pending | `node --test tests/upgrade/business-learning.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/business-policy.js, apps/pocketbase/pb_hooks/business.pb.js, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js |
| AD — ERP desk | PARTIAL — component execution unavailable | Editable measures, due dates, linked tasks/contacts, priority and search; failed saves retain data and returned identities | Business Vitest procedure in docs/business-learning.md; Node selector contracts | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/ErpPage.jsx, apps/web/src/lib/businessPlanning.js |
| AE — Content studio | PARTIAL — component execution unavailable | Editable outlines and safe previews, explicit review, editorial dates and recorded publication receipts; no external posting | Business Vitest procedure in docs/business-learning.md; Node policy contracts | 07_BUILD / 08_TEST | apps/web/src/components/workspace/ContentStudio.jsx, apps/web/src/components/workspace/StructuredContent.jsx, apps/web/src/pages/workspace/CommunitySocialPage.jsx |
| AF — First 25 tutorials | PARTIAL — source contracts pass | Five learning paths, complete structured bodies, searchable reader, safe references and progress recovery; browser/native acceptance pending | `node --test tests/upgrade/business-learning.test.mjs`; business Vitest procedure in docs/business-learning.md | 07_BUILD / 08_TEST | apps/pocketbase/pb_migrations/data/starter-tutorials.json, apps/web/src/components/workspace/TutorialReader.jsx, apps/web/src/lib/tutorialCurriculum.js |
| AG — Business/learning evidence | PASS with acceptance blockers recorded | User/retention documentation, extended delivery handoff and current context/boundary/CGRF/memory verification | Context, boundary and memory gates | 06_PLAN / 11_COMMIT | docs/business-learning.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json |
| AH — Integration scope | PASS | Current merged PR 22 baseline reconciled; defects and A2 repair scope registered | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| AI — Shared workspace/evidence access | PARTIAL — source contracts pass | Current members can discover workspaces and read shared receipts; author/current-role write checks; custom rules are preserved | `node --test tests/upgrade/workspace-integration.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/evidence-policy.js, apps/pocketbase/pb_hooks/evidence.pb.js, apps/pocketbase/pb_migrations/1789800000_restore_workspace_evidence_access.js |
| AJ — Connected history and rendering | PARTIAL — source contracts pass, React execution unavailable | Fix the missing layout icon, surface evidence/runs and incomplete reads, refresh after saves and discard stale private state | `node --test tests/upgrade/work-history.test.mjs tests/upgrade/source-checker.test.mjs tests/upgrade/workflow-runs.test.mjs`; targeted Vitest below | 07_BUILD / 08_TEST | apps/web/src/lib/workHistory.js, apps/web/src/hooks/usePreviousWork.js, apps/web/src/components/workspace/PreviousWorkNote.jsx, apps/web/src/components/workspace/WorkspaceLayout.jsx |
| AK — Integration evidence | PASS with acceptance blockers recorded | Connected client/server/history regression; current Node/Python, context, boundary, CGRF and memory evidence; native/browser handoff | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; context and boundary gates | 06_PLAN / 11_COMMIT | docs/workspace-integration.md, .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md |

The earlier phases remain listed with their observed limits. This continuation
does not convert authored UI tests into passing acceptance or operator-recorded
work into external automation. Earlier full implementation descriptions live
in the source specifications, docs/mission-system.md, docs/workflow-system.md,
docs/business-learning.md and the preserved memory events.

Current connection repairs:

- WorkspaceLayout imports its rendered Plus icon. A key on page content resets
  private drafts on account, workspace and demo changes while retaining the
  navigation shell. An unreadable domain expansion is shown as unavailable.
- The new migration changes only list/view rules on workspaces and evidence.
  Current membership enables shared reads; workspace management stays with the
  owner. Ordinary evidence writes/deletes require the author and a current
  writable role. An optional linked mission must be readable in that workspace.
  Custom read rules stop migration before either collection changes. Replay and
  down retain data. These are source contracts awaiting native rule acceptance.
- Mission history combines seat events and evidence; workflow history combines
  seat events and recorded runs. Queries group 40 subjects and cap each source
  at 200 rows. Missing, failed and truncated sources stay distinct. A run receipt
  does not fabricate a seat event or complete its linked mission.
- Shared reads disable PocketBase SDK automatic cancellation between panels;
  the existing request guards and new history scope guards discard late results.
  Successful mission/run writes refresh their summaries and workflow definitions.
  Demo/anonymous history performs no backend read. Retry is explicit on incomplete
  history. UI tests exercise these paths but cannot execute in this environment.

## §3 SMOKE TEST RESULTS

| # | Command | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Targeted integration Vitest command below | Real layout/history/workflow interactions pass | vitest: not found | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Official lint passes | Missing eslint-plugin-import | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Production bundle emitted | spawnSync vite ENOENT | FAIL — environment |
| 4 | `node --test tests/upgrade/*.test.mjs` | Source contract regressions pass | 110/110 pass | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Adapter/contrast regressions pass | 18/18 pass | PASS |
| 6 | `python scripts/ci/agent_context.py --check` | Measured context matches source | 25 frontend test files; six findings/four unwired gates retained | PASS |
| 7 | `python scripts/ci/verify_public_boundary.py` | Public paths and contents pass | 450 tracked files; zero failures; actor not inferred | PASS |

```bash
npm --prefix apps/web test -- src/components/workspace/__tests__/PageBoundary.test.jsx src/components/workspace/__tests__/WorkspaceHistory.test.jsx src/components/workspace/workflows/__tests__/WorkflowRuns.test.jsx src/hooks/__tests__/useWorkspaceRecords.test.js
npm --prefix apps/web run test:coverage
```

Failures 1–3 and coverage cannot start because the declared frontend packages
are missing. No product change is presented as a repair for unavailable tools.
The lock check below fails with eight missing package resolutions and two
manifest dependency-group mismatches. A registry-enabled runner must reconcile
the declared manifests and lock, install packages, then rerun the same web gates.
No package was removed, resolution fabricated or network installation attempted.

```bash
python scripts/ci/supply_chain.py --skip-audit --check-lock --output /tmp/buildanddo-integration-supply.json
```

The first eight history regressions failed on the previous implementation and
passed after connecting receipts, retaining failed/truncated state and isolating
reads. The limited checker found the missing Plus import before its repair.
Three checker regressions cover unresolved JSX names, valid lexical bindings and
removal of the actual icon import. Reproduce the current green regressions:

```bash
node --test tests/upgrade/work-history.test.mjs tests/upgrade/source-checker.test.mjs
node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs
```

The checker now parses 192 frontend modules with no core or JSX binding errors.
It is a limited static check, not official lint, React execution or browser proof.
The connected regression passes commands from the real browser helper through
the server transaction implementation to the real history reader. It loses
responses after successful saves, retries, and asserts one run and one evidence
receipt visible on both subjects. The mission remains running until its own
review. Storage/SDK doubles establish this source connection; they do not prove
PocketBase JSVM execution, collection rules or transaction concurrency.

Selected production-source coverage:

```bash
node --test --experimental-test-coverage --test-coverage-include=apps/pocketbase/pb_hooks/evidence-policy.js --test-coverage-include=apps/pocketbase/pb_hooks/evidence.pb.js --test-coverage-include=apps/pocketbase/pb_migrations/1789800000_restore_workspace_evidence_access.js --test-coverage-include=apps/web/src/lib/workHistory.js tests/upgrade/*.test.mjs
```

Observed aggregate: 100% lines, 96.83% branches, 100% functions. Nine access
cases exercise roles, author retention, foreign/unreadable missions, current
membership, hook wiring, migration replay/down and refusal of custom rules.
Eleven history cases cover real receipts, pagination limits, denied/malformed
responses, scope changes and independent requests. The full suite retains the
mission, workflow, business/learning and telemetry regressions.

PocketBase is absent from apps/pocketbase/pocketbase and PATH. Native 0.28.4
acceptance must cover owner/editor/viewer/unrelated/removed accounts, back-relation
read rules, installed request hooks, simultaneous commands and up/down. Browser
checks at 320/375/1280 px, both themes, keyboard navigation and account/workspace
switching remain unexecuted. See docs/workspace-integration.md for the matrix.

## §4 MEMORY INGEST

Type A count: 163
Type B count: 292
Type C count: 28
IOO compliance: true
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

Existing events and provenance are retained. Current file vectors reflect exact
line counts; every vector has a declared relationship. The four new events
record failed regressions, connected source tests, unavailable acceptance and
the observed governance checks with real UTC timestamps. Pre-commit events use
null commit_sha. No memory endpoint, signing or ingestion workflow was invoked.

## §5 CKET FILING

06_PLAN: docs/workspace-integration.md; earlier mission/workflow/business/API documentation retained.
04_HYPOTHESIZE: existing upgrade SRS continuation.
07_BUILD: workspace layout, scoped readers/history UI, evidence policy/request hooks and read-rule migration.
08_TEST: access/history/checker/connected-workflow regressions and authored component suites.
11_COMMIT: task table, report/memory, measured context, offline checker and existing delivery handoff.
13_SAVE: none.

Paths follow the actual BuildAndDo AGENTS.md and public path policy. This repair
adds eight files. CGRF headers are present on all 96 files new since the original
base, including sibling metadata for JSON/PNG. Existing provenance is preserved.
REFLEX remains deferred to the private post-merge validator; all grades/signatures
remain pending. Verify headers and relationships with the memory command above.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: PASS; zero public-boundary failures
Secret scan: PASS; zero scanner failures
Stripe mode: not applicable; no checkout or payment processing added
Actor label: actor:agent required; not applied by this session
Risk / authority: A2 reviewed source/access-rule changes; no shared mutation or deployment

The explicitly authorized membership repair changes two collection read rules
with a reversible migration, preserving native create/update/delete rules.
Evidence request hooks constrain author identity, workspace role and mission
relations. This scope adds no credentials, external connector, private runtime,
live database edit or direct message to another seat. Private execution and
delivery still require the receiving repository's actual controls and evidence.

## §7 NEXT ACTIONS

Blockers: frontend dependencies and manifest/lock alignment; official lint,
Vitest/coverage and Vite build; isolated native PocketBase 0.28.4 rule/hook,
transaction and migration acceptance; browser/mobile/theme/keyboard checks.
No staging or production behavior is claimed from these source tests.

Handoffs requested: the existing IDE1 telemetry note and CMAX-B/IDE1 BuildAndDo
delivery note remain public artifacts, not activated seats. The delivery note
now includes this integration repair, coordinated hook/migration activation and
matching built/served release identity. The earlier Rig 1 handoff remains deferred.
Suggested next dispatch: private-runner validation of the complete published
source revision followed by authorized release and served-flow verification.
The operator supplies that private execution dispatch in its own repository.
Bugs filed: none; no issue target was supplied and provider writes are unavailable.
Six pre-existing governance/gate findings remain visible in agent_context.py.

Rollback: restore owner-only list/view rules using the new migration's down
before removing evidence request hooks. The down changes no field, record or
receipt. Reverting UI/readers does not require deleting data. Older additive
mission/workflow/business migrations retain their documented retention decisions;
do not apply their destructive downs as part of this access repair's rollback.
No shared migration, rollback, release or private-agent activation ran here.
