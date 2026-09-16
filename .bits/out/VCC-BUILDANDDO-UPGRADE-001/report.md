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
#              VALIDATES apps/web/tools/build.mjs;
#              VALIDATES apps/web/src/components/CountUp.jsx;
#              VALIDATES apps/web/src/components/Reveal.jsx;
#              VALIDATES apps/web/src/components/site/Hero.jsx;
#              VALIDATES apps/web/src/components/ui/accordion.jsx;
#              VALIDATES apps/web/src/components/ui/alert-dialog.jsx;
#              VALIDATES apps/web/src/components/ui/button.jsx;
#              VALIDATES apps/web/src/components/ui/context-menu.jsx;
#              VALIDATES apps/web/src/components/ui/dropdown-menu.jsx;
#              VALIDATES apps/web/src/components/ui/hover-card.jsx;
#              VALIDATES apps/web/src/components/ui/menubar.jsx;
#              VALIDATES apps/web/src/components/ui/navigation-menu.jsx;
#              VALIDATES apps/web/src/components/ui/popover.jsx;
#              VALIDATES apps/web/src/components/ui/select.jsx;
#              VALIDATES apps/web/src/components/ui/toast.jsx;
#              VALIDATES apps/web/src/components/ui/tooltip.jsx;
#              VALIDATES apps/web/src/pages/OnboardingPage.jsx;
#              CONSUMES docs/discord-bot.md;
#              CONSUMES scripts/discordbot/bot.py;
#              VALIDATES apps/web/tools/generate-community.mjs;
#              VALIDATES tests/upgrade/check_discordbot.py;
#              VALIDATES .github/workflows/pr-governance.yml;
#              CONSUMES docs/mission-research.md;
#              CONSUMES docs/private-dossiers.md;
#              CONSUMES docs/discord-activation.md;
#              VALIDATES tests/upgrade/test_dossier_native.py;
#              CONSUMES docs/mission-suite.md;
#              VALIDATES tests/upgrade/check_mission_suite.py;
#              VALIDATES tests/upgrade/test_suite_native.py;
#              CONSUMES docs/federal-foundry.md;
#              VALIDATES tests/upgrade/check_federal_foundry.py;
# DAG Node:    none
# Intent:      Distinguish implemented upgrade behavior from measured acceptance and blocked environment checks.
# ───────────────────────────────────────────────────────────────

# Dispatch implementation report

## §1 SUMMARY

Status: PARTIAL — federal compiler and source work packages implemented; hosted execution, research evidence and official acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924
Tasks: 6/6 current source phases; these counts do not measure scientific or submission completion
Smoke: 10/14 current check groups pass; four required environment checks unavailable, as detailed in §3
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 1 focused continuation; resolve final source identity using the command below
Verify source identity: `git log -1 --format='%H %s'`

The shared federal portfolio compiler prepares Influence Benchmarks, NAVAIR
Acquisition Analysis, Brain-Inspired Low-SWaP, Semantic ISR and Sentinel Maritime
as separately scoped research lanes. Each has a proposed registered SRS, builder
and independent-verifier packets, requirement and claim matrices, experiment
controls, draft proposal sections and explicit human gates. The catalogue
preserves the owner's opportunity descriptions as unverified until current
official topic, deadline, eligibility and submission references are reviewed.
The reported xTech submission is retained as owner-reported history only.

The async model interface accepts a runtime-supplied provider, model, version
and configuration fingerprint. It binds a verified execution dispatch and exact
task bytes, bounds one completion, preserves timeout/cancellation failures and
records model responses as unreviewed drafts. Tests exercise two independent
in-process adapter implementations; no real provider call or hosted Bits
dispatch was made. The source compiler creates ten PREPARED work packets, not
five running research projects.

Evidence checks bind public receipt bytes, declared identities, exact reviews,
requirement scope, metric units and repeated seeds. Claims cannot splice results
from different candidates. Comparisons require matching benchmark, dataset,
scenario and execution conditions; below-target measurements remain visible,
and ties or incomparable inputs never become an automatic promotion. Hash and
schema validation do not authenticate a reviewer or establish scientific truth.
All proposal projections remain HOLD with pending human approval.

Forty new tests pass with 97.53–100% statement coverage across five modules.
Full regression passes 256 Node and 192 Python cases, with nine native skips.
The existing suite checker passes 23 cases after extending its portable archive.
A clean extraction runs the actual portfolio CLI with the same source identity;
five YAML opportunities round-trip exactly, all 103 content hashes recorded in
the manifest match, and the 23-file package remains deterministic. Strict source typing,
Ruff and the 239-module JavaScript diagnostic pass.

Vitest, Vite, the official ESLint import plugin and PocketBase are unavailable.
Their required commands were attempted and failed before runtime acceptance.
Independent Python 3.11/3.12 CI now retains the generated public packets and
measured test reports; hosted results have not been observed. The receiving
operator must bind actual lane dispatches and model clients through the existing
Bits runtime, then run the experiments. Existing mission/native/browser and
private Sentinel acceptance states remain unchanged.

## §2 TASK RESULTS

### Current continuation — model-independent federal portfolio, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| CI — Register portfolio scope | PASS | Shared compiler registered before source edits; five proposed lane specifications reserve distinct future execution scopes | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | Registry, umbrella and five lane SRS specifications, dispatch and lock |
| CJ — Model-independent intake | PASS for source | Strict catalogue and async provider interface; runtime-bound provenance, separate verifier and bounded completion; two in-process adapter implementations | `python -m unittest tests.upgrade.test_federal_foundry.CatalogueTests tests.upgrade.test_federal_foundry.AdapterTests` | 07_BUILD / 08_TEST | apps/federal_foundry/catalog.py, protocol.py, opportunities.json and behavior tests |
| CK — Evidence projections | PASS for source | Exact-byte receipts, preserved failures, one-candidate claims, matched comparisons, draft proposal and pending human gates | `python -m unittest tests.upgrade.test_federal_foundry.EvidenceTests tests.upgrade.test_federal_foundry.ComparisonTests tests.upgrade.test_federal_foundry.CompilerTests` | 07_BUILD / 08_TEST | Evidence evaluator, compiler, CLI and behavior tests |
| CL — Portable package and CI intake | PASS for source; hosted execution open | Five lane draft sets, ten packets, fresh extraction and independent Python CI with retained artifacts | Fresh archive test and guide commands in §3 | 07_BUILD / 08_TEST / 11_COMMIT | Suite bundle, independent CI job, agent guidance and pipeline check description |
| CM — Source verification | PASS with runtime gaps recorded | 40 new tests with at least 97.53% statement coverage; full source regression, typing and source diagnostics pass | Commands in §3 | 08_TEST / 11_COMMIT | New foundry behavior/coverage runner and adjusted existing suite package regression |
| CN — Report and receiver contract | PASS for public artifacts | All 66 previous memory events preserved; metadata/edges, context and public boundary verified; operator intake is explicit | Commands in §4–§6 | 06_PLAN / 11_COMMIT | docs/federal-foundry.md, receiving handoff, report and memory |

### Prior continuation — callable mission suite and government learning, 2026-09-16

Status: PARTIAL — callable mission suite and curriculum implemented; native/browser and deployed acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924
Tasks: 5/6 current source phase gates; CF rendered acceptance remains open; historical phase counts are not product completion
Smoke: 10/14 current check groups pass; four required environment checks unavailable, as detailed in §3
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 1 focused continuation; resolve final source identity using the command below
Verify source identity: `git log -1 --format='%H %s'`

BuildAndDo now has one authenticated mission-suite API and a portable Python
worker for an operator-selected CPU box. The API owns current mission permissions,
source rights, immutable inputs/results, leases, retry receipts and reviewed
Evidence Ledger attachments. The worker performs bounded maritime analysis and
government-submission readiness review using the existing research transport and
evidence-epoch implementation. It creates no additional authentication, NNC,
Merkle authority, service manager or government submission mechanism.

The government mission starter saves through the existing proposed/approved/
running lifecycle. Eight substantive tutorials, exercises and quizzes share the
website and public Discord catalogue, bringing the catalogue to 33 lessons.
The suite desk provides configuration, PDF metadata and requirement review,
queue/status/recovery and explicit human attachment as observed evidence.
Maritime candidates remain HOLD; readiness means declared evidence is ready for
human review, with no portal receipt or compliance certification.

Source regression passes 256 Node and 152 Python tests, with nine native cases
skipped. The suite-specific checker passes 23 tests with 87.96–99.55% statement
coverage per Python module. Selected JavaScript coverage is 100% lines, 86.64%
branches and 98.92% functions. A freshly unpacked archive executes both explicit
synthetic scenarios and replays MATCH with the same source fingerprint. These
results establish portable source behavior, not a deployed box or live feed.

Nineteen rendered cases and three native suite cases are authored. The sandbox
lacks Vitest, Vite, the official lint plugin and PocketBase. Independent source
CI runs on Python 3.11/3.12; both declared PocketBase versions have required
native suite gates. Hosted results and box activation have not been observed.
The receiving handoff covers actual application release, box selection, native
identity, supervision, browser acceptance, telemetry and rollback. Earlier
Sentinel plans and their 13 unexecuted work orders retain their acceptance state.

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| CC — Register source scope | PASS | Owner's revised package/mission scope registered before implementation | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | SRS, registry, dispatch and lock |
| CD — Mission API and persistence | PASS for source; native acceptance open | Scoped controls/runs/receipts, current auth, revision/lease recovery and reviewed observed evidence; 18 system cases | `node --test tests/upgrade/suite-system.test.mjs` | 07_BUILD / 08_TEST | Suite hooks, migration and source fixtures |
| CE — Portable worker and replay | PASS for source | 23 tests, exact source closure, two actual unpacked synthetic executions and matching replay | `python tests/upgrade/check_mission_suite.py`; package procedure in docs/mission-suite.md | 07_BUILD / 08_TEST | apps/mission_suite and Python behavior/packaging tests |
| CF — Mission and government tutorials | PARTIAL — source tests pass | Eight lessons, mission starter, suite desk, account cleanup and human evidence review; 11 client/curriculum cases pass, 19 rendered cases unexecuted | `node --test tests/upgrade/suite-client.test.mjs tests/upgrade/government-learning.test.mjs`; `npm --prefix apps/web test` | 07_BUILD / 08_TEST | Government curriculum/migration, suite UI/client/hook, mission/tutorial entry points |
| CG — Verify source and retain acceptance gaps | PASS with blockers recorded | 256 Node, 152 Python passes; coverage, typing/static checks and archive evidence; four missing runtime checks | Commands in §3 | 08_TEST / 11_COMMIT | Behavior, native and rendered tests; independent CI source/native jobs |
| CH — Report, memory and box handoff | PASS | All 60 baseline events preserved; public boundaries, context and declared metadata verified | Commands in §4 and §6 | 06_PLAN / 11_COMMIT | docs/mission-suite.md, new box handoff, report and memory |

### Prior continuation — Sentinel Maritime narrative and Astra contract, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| BY — Register continuation | PASS | Existing owner-authorized dispatch and SRS extended before artifacts; merged planning baseline reconciled | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs_registry.yml, SRS spec, queue and context lock |
| BZ — Narrative and semantic alignment | PASS | Seven paper sections map to 15 slides; company/official claims qualified; candidate, rights and proof semantics reconciled | Planning audit in §3 | 06_PLAN | docs/sentinel-maritime/white-paper.md, blueprint.md, contracts.md, integrity.md, system-plan.json and sidecar |
| CA — Discovery-first work orders | PASS | 13 orders x 23 fields, 55 section mappings, 24 negative requirements and mandatory return/rollback/effect contracts | Same audit, including eight rejected corruptions | 06_PLAN / 11_COMMIT | docs/sentinel-maritime/implementation-contract.md, work-orders.json and sidecar; existing maritime handoff |
| CB — Public evidence and history | PASS | Document audit, context, boundary and memory consistency; prior 56 Type C events retained | Commands in §3 and §4 | 11_COMMIT | .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md and memory.json |

### Prior continuation — Sentinel Maritime baseline 1.0, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| BU — Register owner-authored scope | PASS | Existing dispatch extended before planning artifacts; public epoch and candidate limits inspected | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs_registry.yml, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| BV — Freeze product and inventory | PASS | Owner-authored baseline, semantic contracts, 33 components, 12 planes, 15 metrics and 15-slide claim map | Run the inventory audit bash block in docs/sentinel-maritime/integrity.md | 06_PLAN | docs/sentinel-maritime/blueprint.md, contracts.md, system-plan.json and sidecar |
| BW — Integrity and private handoff | PASS | Separate release/rights/epoch domains; source fingerprints checked; no new Merkle or live SBOM; explicit receiving proof obligations | Same inventory audit, including source hashes and commitment DAG | 06_PLAN / 11_COMMIT | docs/sentinel-maritime/integrity.md, .bits/handoffs/2026-09-16-bits-codegen-cmax-b-sentinel-maritime.md |
| BX — Preserve governance evidence | PASS | Prior Type C events preserved; context, boundary and memory checks pass | `python scripts/ci/agent_context.py --check`; `python scripts/ci/verify_public_boundary.py`; `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT | .bits/context.lock.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md and memory.json |

### Prior dossier continuation — 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| BN — Register scope and inspect activation | PASS | Existing SRS/dispatch extended before source work; local PR 27 baseline reconciled | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs_registry.yml, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| BO — Private persistence | PARTIAL — local tests pass | Locked native APIs, authenticated encryption, owner/revision fencing, content-free receipts and retained rollback | `node --test tests/upgrade/dossier-system.test.mjs`; native command below | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/private-dossier.js, dossier-vault.js, dossier.pb.js, apps/pocketbase/pb_migrations/1790200000_private_dossiers.js |
| BP — Discord dossiers | PARTIAL — local tests pass | Five private commands use native account links, current membership, expiring intent and delivery recovery; no read cache | `python -m unittest discover -s tests/upgrade -p 'test_discordbot_dossier.py'` | 07_BUILD / 08_TEST | scripts/discordbot/dossier.py, scripts/discordbot/bot.py |
| BQ — Website dossier | PARTIAL — client tests pass | Personal context, recall, note correction/deletion, revision review, history, account cleanup and masked dialogs; 16 rendered tests authored | `node --test tests/upgrade/dossier-client.test.mjs`; rendered command below | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/DossierPage.jsx, apps/web/src/components/workspace/DossierEditors.jsx, apps/web/src/lib/privateDossier.js, apps/web/src/hooks/usePrivateDossier.js |
| BR — Startup diagnostics | PASS | Seven source cases; current process prerequisites FAIL, runtime/launcher UNVERIFIED; factual operator handoff | `python -m unittest discover -s tests/upgrade -p 'test_discordbot_doctor.py'`; `python -m scripts.discordbot.doctor` | 07_BUILD / 08_TEST / 06_PLAN | scripts/discordbot/doctor.py, docs/discord-activation.md, docs/private-dossiers.md |
| BS — Verification | PASS with acceptance blockers recorded | Full source regression, per-module coverage, Ruff, strict core typing and source diagnostics; native CI requires actual runtimes | Commands in §3 | 08_TEST / 11_COMMIT | tests/upgrade/dossier-*.mjs, test_discordbot_dossier.py, test_discordbot_doctor.py, test_dossier_native.py, .github/workflows/pr-governance.yml |
| BT — Evidence and handoff | PASS | Prior 47 Type C events preserved; refreshed memory, context and public boundary | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT | .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md, memory.json, .bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md |

### Earlier phases — retained source history

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| A — Register original scope | PASS | Eight-area umbrella, registry and owner dispatch | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs_registry.yml, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md |
| B — Public pages | PARTIAL | Pricing, About, Docs, Blog, Contact and navigation | `npm --prefix apps/web test -- src/pages/__tests__/PublicPages.test.jsx` | 07_BUILD / 08_TEST | apps/web/src/pages/PricingPage.jsx, apps/web/src/pages/AboutPage.jsx, apps/web/src/pages/DocsPage.jsx, apps/web/src/pages/BlogPage.jsx, apps/web/src/pages/ContactPage.jsx |
| C — Component coverage | PARTIAL | Public/workspace interaction suites; 33 Vitest files inventoried; frontend execution remains blocked | `npm --prefix apps/web run test:coverage` | 08_TEST | apps/web/src/pages/__tests__/PublicPages.test.jsx, apps/web/vitest.config.js |
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
| AJ — Connected history and rendering | PARTIAL — source contracts pass, React execution unavailable | Fix the missing layout icon, surface evidence/runs and incomplete reads, refresh after saves and discard stale private state | `node --test tests/upgrade/work-history.test.mjs tests/upgrade/source-checker.test.mjs tests/upgrade/workflow-runs.test.mjs`; targeted Vitest in docs/workspace-integration.md | 07_BUILD / 08_TEST | apps/web/src/lib/workHistory.js, apps/web/src/hooks/usePreviousWork.js, apps/web/src/components/workspace/PreviousWorkNote.jsx, apps/web/src/components/workspace/WorkspaceLayout.jsx |
| AK — Integration evidence | PASS with acceptance blockers recorded | Connected client/server/history regression; current Node/Python, context, boundary, CGRF and memory evidence; native/browser handoff | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; context and boundary gates | 06_PLAN / 11_COMMIT | docs/workspace-integration.md, .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md |
| AL — Administration scope | PASS | PR 23 reconciled; workspace roles/community/control scope registered before source edits | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| AM — Current membership and row access | PARTIAL — source contracts pass | Remove stale-author bypasses; enforce current writer roles and immutable scope; close native management writes | `node --test tests/upgrade/workspace-administration.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/workspace-record-policy.js, apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js |
| AN — Audited administration | PARTIAL — source contracts pass | Owner/admin grant boundaries, profile/feature settings, closed integration requests, revision/retry checks and atomic audit | `node --test tests/upgrade/workspace-administration.test.mjs tests/upgrade/workspace-control-client.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/workspace-administration.js, apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790000000_workspace_administration.js |
| AO — Wiki and forums | PARTIAL — source contracts pass | Private drafts, administrator publication, moderated topics/replies, feature gates, current-role checks and retention | `node --test tests/upgrade/workspace-community.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/workspace-community.js |
| AP — Administration and integrations UI | PARTIAL — frontend execution unavailable | Shared Settings/Community/Operations controls, member grants, audit, requested/observed integration state and uncertain-save recovery | AdministrationFlow Vitest suite in docs/workspace-administration.md | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/AdminPage.jsx, apps/web/src/components/workspace/IntegrationControls.jsx, apps/web/src/hooks/useWorkspaceControl.js |
| AQ — Wiki/forum UI | PARTIAL — frontend execution unavailable | Safe readers, draft forms, moderation, locked replies and bounded pages; account/workspace/demo isolation | CommunityFlow and useWorkspaceControl Vitest suites in docs/workspace-administration.md | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/WikiPage.jsx, apps/web/src/pages/workspace/ForumsPage.jsx |
| AR — Complete-wave verification | PASS with acceptance blockers recorded | 144 Node/18 Python tests and limited source parsing pass; frontend/native failures remain explicit | Node/Python/web commands below | 08_TEST / 11_COMMIT | tests/upgrade/workspace-administration.test.mjs, tests/upgrade/workspace-community.test.mjs, tests/upgrade/workspace-control-client.test.mjs |
| AS — Administration evidence/handoff | PASS for public artifact | Current context, boundary, provenance, report/memory and private execution acceptance contract | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 06_PLAN / 11_COMMIT | docs/workspace-administration.md, .bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md |
| AT — Motion scope | PASS | PR 24 baseline reconciled; all 50 areas and Settings registered before edits | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| AU — Shared policy and lifecycle | PASS locally | Bounded tokens, OS precedence, personal storage/migration, category limits and interruptible visible activity | `node --test tests/upgrade/motion-system.test.mjs` | 07_BUILD / 08_TEST | apps/web/src/lib/motion/preferences.js, apps/web/src/lib/motion/runtime.js, tests/upgrade/motion-system.test.mjs |
| AV — Shared UI and existing effects | PARTIAL — rendered acceptance pending | Common controls/portals/navigation/themes and platform effects consume the same preferences; static and cleanup paths retained | MotionRuntime Vitest command in docs/motion-system.md | 07_BUILD / 08_TEST | apps/web/src/contexts/MotionContext.jsx, apps/web/src/motion.css, apps/web/src/components/motion/MotionPrimitives.jsx |
| AW — Editorial, learning and records | PARTIAL — rendered acceptance pending | Public explanation, measured reading, lesson steps, title continuity, keyed lists, exact data and saved-state emphasis | MotionRuntime and mission Vitest commands in docs/motion-system.md | 07_BUILD / 08_TEST | apps/web/src/components/motion/EditorialStory.jsx, apps/web/src/components/motion/ReadingProgress.jsx, apps/web/src/components/motion/StepSequence.jsx |
| AX — Organized settings and usage | PARTIAL — catalogue source passes; UI unexecuted | Six groups, 14 categories, seven local previews and all 50 searchable usage entries; public controls and workspace tab | `node --test tests/upgrade/motion-system.test.mjs`; MotionSettings Vitest suite | 07_BUILD / 08_TEST | apps/web/src/components/motion/MotionSettings.jsx, apps/web/src/components/motion/MotionPlayground.jsx, apps/web/src/lib/motion/catalog.js |
| AY — Motion evidence | PASS with acceptance blockers recorded | 163 Node/18 Python tests; current context/boundary/provenance and explicit frontend/browser limits | Node/Python/frontend commands below; memory verifier | 06_PLAN / 11_COMMIT | docs/motion-system.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json |
| AZ — Discord scope | PASS | Existing public bot found and umbrella extended before source changes | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| BA — Public HTTP | PASS | Fixed resources, worker/request/body bounds, shared reads, caching, cancellation and dated evidence | `python -m unittest discover -s tests/upgrade -p 'test_discordbot_public.py'` | 07_BUILD / 08_TEST | scripts/discordbot/public_data.py, scripts/discordbot/contracts.py |
| BB — Commands and teaching | PASS | All 25 authored lessons, quizzes, public page search, evidence states and scope failures | `python -m unittest discover -s tests/upgrade -p 'test_discordbot_commands.py'` | 07_BUILD / 08_TEST | scripts/discordbot/catalogue.py, scripts/discordbot/service.py |
| BC — Discord adapter | PARTIAL | Private replies, controls, expiry, retry and registration contracts pass with an explicit SDK double | `python tests/upgrade/check_discordbot.py --require-sdk` | 07_BUILD / 08_TEST | scripts/discordbot/bot.py, tests/upgrade/test_discordbot_adapter.py |
| BD — Shared public feed | PASS locally | Real build generator selects only public source fields and the same release identity | `node --test tests/upgrade/discord-catalogue.test.mjs` | 11_COMMIT / 08_TEST | apps/web/tools/generate-community.mjs, apps/web/tools/build.mjs |
| BE — Discord evidence | PASS with open runtime gates | Source tests, measured coverage, core typing, lint and documentation; missing native/frontend tools recorded | `python tests/upgrade/check_discordbot.py` | 06_PLAN / 08_TEST | docs/discord-bot.md, tests/upgrade/check_discordbot.py |
| BF — Governance and handoff | PASS | Current source report, preserved memory history and explicit private activation responsibilities | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT | .bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json |
| BG — Research scope | PASS | Existing registered umbrella extended before source changes | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md |
| BH — Research persistence | PASS local source; native acceptance pending | Current membership, protected originals, lease fencing, audited retries and atomic evidence attachment | `node --test tests/upgrade/mission-research.test.mjs` | 07_BUILD / 08_TEST | apps/pocketbase/pb_hooks/mission-research.js, apps/pocketbase/pb_hooks/research-policy.js, apps/pocketbase/pb_hooks/research.pb.js, apps/pocketbase/pb_migrations/1790100000_mission_research.js |
| BI — Discord mission/evidence | PARTIAL | Thirteen connected tests pass; SDK/live acceptance pending | `python -m unittest discover -s tests/upgrade -p 'test_discordbot_research.py'` | 07_BUILD / 08_TEST | scripts/discordbot/research.py, scripts/discordbot/bot.py, tests/upgrade/test_discordbot_research.py |
| BJ — Web research and account linking | PARTIAL | Twelve client contracts pass; twelve rendered tests authored but unavailable | `node --test tests/upgrade/research-client.test.mjs`; frontend commands below | 07_BUILD / 08_TEST | apps/web/src/pages/workspace/ResearchPage.jsx, apps/web/src/hooks/useMissionResearch.js, apps/web/src/lib/missionResearch.js, apps/web/src/lib/discordAccount.js, apps/web/src/components/workspace/DiscordAccountLink.jsx |
| BK — Processing | PARTIAL | Real local HTTP/text/DOCX and provider/worker contracts pass; native PDF and deployed providers unverified | `python -m unittest discover -s tests/upgrade -p 'test_research_runtime.py'` | 07_BUILD / 08_TEST | apps/research/, tests/upgrade/test_research_runtime.py |
| BL — Verification | PASS with unavailable gates recorded | Regression, red/green fixes, statement coverage, core typing, lint and CI policy checks | Commands below | 08_TEST / 11_COMMIT | tests/upgrade/check_discordbot.py, .github/workflows/pr-governance.yml |
| BM — Evidence and handoff | PASS | Current context/provenance/memory and concrete private receiving requirements | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 06_PLAN / 11_COMMIT | docs/mission-research.md, docs/discord-bot.md, .bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md |

Earlier phase results retain their original acceptance limits. Current source
and native/provider contracts are documented in docs/mission-research.md.

## §3 SMOKE TEST RESULTS

Current federal checks (source and required runtime gates remain separate):

| Check | Runnable verification | Expected / observed |
|---|---|---|
| 1. Node regression | `node --test tests/upgrade/*.test.mjs` | PASS: 256/256 |
| 2. Python regression | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | PASS for available source: 192 passes, nine native skips out of 201; skipped cases are not runtime acceptance |
| 3. Federal behavior and coverage | `python tests/upgrade/check_federal_foundry.py` | PASS: 40/40, no skips; five modules at 97.53–100% trace statement coverage |
| 4. Existing portable suite coverage | `python tests/upgrade/check_mission_suite.py` | PASS: 23/23; CLI 98.82%, bundle 97.40%, engine 99.55%, worker 87.96% statement lines |
| 5. Python typing and lint | `mypy --strict --explicit-package-bases --follow-imports=silent apps/federal_foundry apps/mission_suite/bundle.py`; `ruff check apps/federal_foundry apps/mission_suite/bundle.py tests/upgrade/test_federal_foundry.py tests/upgrade/check_federal_foundry.py tests/upgrade/test_mission_suite.py` | PASS: six source modules typed; source and changed tests lint clean |
| 6. Static web and CI contracts | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`; CI audit below | PASS: 239 modules, no static errors; independent Python 3.11/3.12 job with two required artifact uploads |
| 7. Package and generated artifacts | `python -m unittest tests.upgrade.test_federal_foundry.CompilerTests.test_portable_archive_runs_the_real_cli_from_fresh_extraction_without_repository_paths`; YAML/artifact audit below | PASS: clean extraction runs the real CLI; same source identity; 105 files, ten PREPARED packets; all hashes and five YAML round-trips match; 23-file archive |
| 8. Rendered web tests | `npm --prefix apps/web test` | FAIL/unavailable: Vitest missing; no rendered acceptance claimed |
| 9. Repository web lint | `npm --prefix apps/web run lint` | FAIL/unavailable: eslint-plugin-import missing |
| 10. Web build | `npm --prefix apps/web run build` | FAIL/unavailable: Vite cannot start; generator output is not a built website |
| 11. Native suite API | `python tests/upgrade/test_suite_native.py --require-binary` | FAIL/unavailable: PocketBase binary missing |
| 12. Context | `python scripts/ci/agent_context.py --check` | PASS: six retained findings and four unwired gates |
| 13. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 606 tracked files, zero scanner failures; provider actor-label check not executed |
| 14. Memory and provenance | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; preservation check in §4 | PASS: current file/edge counts, IOO and all 66 prior events preserved |

The new coverage checker writes reports/coverage/federal-foundry.json and
reports/junit/federal-foundry.xml. It uses Python trace statement lines, not
branch coverage. All evidence fixtures and model adapters are explicitly
synthetic; no research campaign or physical/device benchmark ran.

| Module | Covered / measured statements | Percent |
|---|---|---|
| apps/federal_foundry/__main__.py | 79/81 | 97.53 |
| apps/federal_foundry/catalog.py | 190/190 | 100.00 |
| apps/federal_foundry/compiler.py | 385/385 | 100.00 |
| apps/federal_foundry/evidence.py | 401/403 | 99.50 |
| apps/federal_foundry/protocol.py | 200/201 | 99.50 |

Observed red/green evidence: the first new suite found that a completed baseline
measurement below the target was excluded from comparisons. The evaluator now
ranks matched observed measurements while retaining `meets_target: false`;
actual failed experiments remain unrankable. The targeted regression failed
then passed:
`python -m unittest tests.upgrade.test_federal_foundry.ComparisonTests.test_baseline_below_target_is_still_a_valid_comparison_and_is_reported_as_below_target`.
The same first run contained a corrupt-fixture setup error that prevented
validation from being reached; the fixture now mutates the valid receipt after
creation. Both cases and the complete 40-test suite pass. No threshold, failure
or independent-review rule was relaxed to satisfy the tests.

Environment checks 8–11 remain unavailable for the exact missing components
shown above. No installation workaround, live model result or hosted CI pass is
inferred. Runtime intake and native/browser acceptance are receiving-operator
work. Source package expansion changes its fingerprint; existing worker bindings
must use their normal reviewed update and stale bindings remain fenced.

Re-running the report commands caught an incorrect catalogue key in the YAML
audit example: it used lanes where the source schema names opportunities. The
example now reads the actual key; the same compile, hash and YAML verification
passes. The compiler and its already-passing behavior tests were unchanged.

Reproduce the independent CI contract audit (PyYAML is available locally):

```bash
python - <<'PY'
from pathlib import Path
import yaml
job = yaml.safe_load(Path('.github/workflows/pr-governance.yml').read_text())['jobs']['federal-foundry']
assert not job.get('needs') and not job.get('continue-on-error')
assert job['strategy']['matrix']['python'] == ['3.11', '3.12']
assert not any(step.get('continue-on-error') for step in job['steps'])
uploads = [step for step in job['steps'] if str(step.get('uses', '')).startswith('actions/upload-artifact@')]
assert len(uploads) == 2
assert all(step['with']['if-no-files-found'] == 'error' for step in uploads)
print('PASS: independent federal CI and required artifact retention.')
PY
```

Reproduce fresh compilation and YAML/hash inspection without a hosted service:

```bash
python - <<'PY'
from hashlib import sha256
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import yaml
from apps.federal_foundry.catalog import load_catalog
with TemporaryDirectory() as temporary:
    output = Path(temporary) / 'portfolio'
    result = json.loads(subprocess.check_output([sys.executable, '-m', 'apps.federal_foundry', 'compile', '--output', str(output), '--at', '2026-09-16T12:00:00Z'], text=True))
    assert (result['opportunities'], result['tasks'], result['files']) == (5, 10, 105)
    manifest = json.loads((output / 'portfolio-manifest.json').read_text())
    for item in manifest['files']:
        assert sha256((output / item['path']).read_bytes()).hexdigest() == item['sha256']
    catalogue = load_catalog()
    for lane in catalogue['opportunities']:
        assert yaml.safe_load((output / lane['id'] / 'opportunity.yaml').read_text()) == lane
    assert result['hosted_dispatches_created'] == 0 and result['submission_authorized'] is False
    print('PASS: five YAML round-trips, all generated hashes, ten prepared packets.')
PY
```

Historical suite checks (prior continuation; retained without relabeling as current evidence):

| Check | Runnable verification | Expected / observed |
|---|---|---|
| 1. Node regression | `node --test tests/upgrade/*.test.mjs` | PASS: 256/256 |
| 2. Python regression | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | PASS for available source: 152 passes, nine native skips out of 161; skipped cases are not runtime acceptance |
| 3. Selected JavaScript coverage | Command below | PASS: 29 cases; 100% lines, 86.64% branches, 98.92% functions across the selected policy/client/migrations |
| 4. Portable Python coverage | `python tests/upgrade/check_mission_suite.py` | PASS: 23/23; CLI 98.82%, bundle 97.37%, engine 99.55%, worker 87.96% statement lines |
| 5. Python source typing/lint | `python -m mypy --strict --explicit-package-bases --follow-imports=silent apps/mission_suite`; `python -m ruff check apps/mission_suite tests/upgrade/test_mission_suite.py tests/upgrade/test_suite_native.py tests/upgrade/check_mission_suite.py` | PASS: four source modules typed; checked source/tests lint clean |
| 6. Web source diagnostic | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` | PASS: 239 modules, zero static errors; does not replace repository lint or rendered tests |
| 7. Portable archive | `python -m unittest discover -s tests/upgrade -p 'test_mission_suite.py'`; package/replay instructions in docs/mission-suite.md | PASS: repeat archives match; unpacked identity matches source; both explicit synthetic scenarios execute and replay MATCH; no activation |
| 8. Rendered web tests | `npm --prefix apps/web test` | FAIL/unavailable: Vitest missing; 19 new rendered cases remain unexecuted |
| 9. Repository web lint | `npm --prefix apps/web run lint` | FAIL/unavailable: eslint-plugin-import missing |
| 10. Web build | `npm --prefix apps/web run build` | FAIL/unavailable: Vite cannot start; generated projections are not a built website |
| 11. Native suite API | `python tests/upgrade/test_suite_native.py --require-binary` | FAIL/unavailable: PocketBase binary missing; three native suite cases remain unexecuted |
| 12. Context | `python scripts/ci/agent_context.py --check` | PASS: six existing findings and four unwired gates retained |
| 13. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 590 tracked files; zero boundary or secret-scan failures |
| 14. Memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS: file counts, IOO, declared edges and all 60 baseline events preserved |

```bash
node --test --experimental-test-coverage --test-coverage-include='apps/pocketbase/pb_hooks/*suite*.js' --test-coverage-include='apps/pocketbase/pb_migrations/1790[34]*.js' --test-coverage-include='apps/web/src/lib/missionSuite.js' tests/upgrade/suite-system.test.mjs tests/upgrade/suite-client.test.mjs tests/upgrade/government-learning.test.mjs
```

The existing Discord/research source checker also passes 111 cases with two
native skips and at least 83.72% statement coverage per module:
`python tests/upgrade/check_discordbot.py --include-research`. It exercises all
33 lessons and quizzes through the public catalogue without private reads.

Observed failures and fixes:

- API read-back omitted the exact worker result string, so reserializing display
  JSON could change numeric spelling and the replay hash. A connected worker
  regression first failed on the missing canonical field. Authorized detail now
  retains `result_canonical` alongside its hash and parsed display value; the same
  API round trip replays MATCH. Verify: `python -m unittest tests.upgrade.test_mission_suite.WorkerTests.test_one_box_worker_completes_the_real_api_chain_and_recovers_lost_claim`.
- A targeted lease regression failed because PocketBase DateField values use a
  space separator while observation inputs require ISO UTC. Only stored lease
  reads now normalize that native representation; strict external timestamps
  remain required. Red then green: `node --test --test-name-pattern='native PocketBase date-field' tests/upgrade/suite-system.test.mjs`.
- Initial source fixture tests exposed a research-schema dependency and an array
  helper shadowing the DB pagination helper; suite schema access is now separate
  and the bounded array helper has its own name. Missing rights return a typed
  denial. The 18 suite system cases pass after these fixes.
- The full catalogue regression first expected 25 lessons, then exercised 66
  commands inside one channel's rate window. It now expects 33 and advances an
  injected clock while retaining the real rate limiter and cache. The complete
  161-test Python discovery passes with nine explicit native skips.
- Ruff found an unused test import and standalone native-runner import ordering;
  the unused import was removed, and only the three imports requiring the script
  path bootstrap carry the documented E402 exception. Source/test Ruff passes.
- Runtime checks 8–11 cannot execute because dependencies/binary are missing.
  No replacement runtime was substituted. Native-required CI and the receiving
  handoff provide the unresolved installation/acceptance steps; source checks
  do not promote these failures into passes. The pre-existing dependency lock
  mismatch remains outside this continuation and is recorded in prior evidence.

Historical document validation (prior continuation):

| Check | Runnable verification | Expected and observed |
|---|---|---|
| 1. Document and inventory audit | Run the bash audit block in docs/sentinel-maritime/integrity.md, or the extractor below | PASS: 33 components, 12 planes, 42 proposed edges, 12 unchanged fingerprints; 11 root and 14 cue-artifact definitions; seven paper sections/15 slides; 13 orders x 23 fields; 55 source sections; 24 negative requirements; eight corruptions rejected |
| 2. Context | `python scripts/ci/agent_context.py --check` | PASS: inventory matches; six pre-existing findings and four unwired gates retained |
| 3. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 561 tracked files; current documents remain within public paths with no scanner failures |
| 4. Memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS: file vectors, source counts, declared edges, IOO and retained event history |

One final context precheck failed because the lock's tracked-file count preceded
staging the four new documents. Root cause: registration-time context generation
measured 557 tracked files; the final inventory contained 561. Applied fix:
`python scripts/ci/agent_context.py --write` after staging the documents.
Retest: `python scripts/ci/agent_context.py --check` passes with the same six
pre-existing findings and four unwired gates. No application gate was weakened.

Reproduce the audit directly from its checked-in source block:

```bash
python - <<'PY'
import re
from pathlib import Path
text = Path('docs/sentinel-maritime/integrity.md').read_text()
blocks = re.findall(r"```bash\npython - <<'PY'\n(.*?)\nPY\n```", text, re.S)
assert len(blocks) == 1
exec(compile(blocks[0], 'sentinel-maritime-planning-audit', 'exec'), {})
PY
```

The audit rejects a missing work-order field, skipped discovery, remote-write
grant, missing negative requirement, fabricated runtime acceptance, duplicated
brief mapping and two proof cycles. It also checks the five demo windows agree
between blueprint and paper. These are eight local in-memory corruptions of the
planning artifacts; they are not executed maritime security tests.

These are documentation/inventory checks. No maritime detector, source adapter,
new Merkle implementation or application runtime was executed. No additional
application coverage is claimed. Native and frontend gates below are historical
dossier-wave results; they were not rerun for this documentation-only change.

Historical application smoke:

| Gate | Runnable command | Expected | Actual |
|---|---|---|---|
| 1. Web interaction tests | `npm --prefix apps/web test` | Rendered user flows pass | FAIL: Vitest absent; targeted dossier/route run fails before execution |
| 2. Official web lint | `npm --prefix apps/web run lint` | Repository lint passes | FAIL: eslint-plugin-import absent |
| 3. Production build | `npm --prefix apps/web run build` | Vite produces the site artifact | FAIL: Vite executable absent |
| 4. Node source regression | `node --test tests/upgrade/*.test.mjs` | All cases pass | PASS: 227/227, including 19 dossier backend/migration and 9 connected browser-client cases |
| 5. Python source regression | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Available source cases pass; explicit native skips | PASS: 129 passes / 135 discovered; six skips are SDK, PDF and four PocketBase cases |
| 6. Context lock | `python scripts/ci/agent_context.py --check` | Inventory matches source | PASS: six retained findings, four unwired gates |
| 7. Public boundary | `python scripts/ci/verify_public_boundary.py` | No forbidden public paths or detected secret literals | PASS: 551 tracked files, zero failures; provider actor label not tested locally |

The three application smoke failures have the same unavailable dependency root
causes as the preceding wave. No package or lock workaround was applied. The
receiving dependency-enabled runner must execute these exact gates before
acceptance. Static diagnostics cannot substitute for rendering or a build.

Additional measured checks:

| Check | Command | Observed result and limit |
|---|---|---|
| Python source coverage | `python tests/upgrade/check_discordbot.py --include-research` | PASS: 111 cases, two native skips; new dossier module 97.55%, doctor 97.65%; minimum across modules 83.72% trace statements |
| Required native SDK/PDF | `python tests/upgrade/check_discordbot.py --include-research --require-sdk --require-pdf` | FAIL: Discord.py and pypdf absent; same 111 source passes do not satisfy native gate |
| Required PocketBase | `python tests/upgrade/test_dossier_native.py --require-binary` | FAIL: BUILDANDDO_TEST_POCKETBASE executable unavailable; no native test ran |
| Python branch coverage | `python -m pytest tests/upgrade/test_discordbot_dossier.py tests/upgrade/test_discordbot_doctor.py --cov=scripts/discordbot --cov-branch --cov-fail-under=80` | FAIL before collection: pytest absent; trace statement coverage is reported separately |
| Core typing | `python -m mypy --strict --explicit-package-bases scripts/discordbot/dossier.py scripts/discordbot/doctor.py apps/research/contracts.py apps/research/documents.py apps/research/processing.py apps/research/worker.py` | PASS: six source modules; complete SDK typing still requires Discord.py |
| Python lint | `python -m ruff check scripts/discordbot apps/research tests/upgrade/test_discordbot_*.py tests/upgrade/test_dossier_native.py tests/upgrade/research_support.py tests/upgrade/check_discordbot.py` | PASS |
| JavaScript source coverage | See exact command below | PASS: 59 connected cases; 99.85% lines, 92.87% branches, 99.04% functions over five selected modules |
| Source diagnostics | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` | PASS: 231 modules, zero static errors; includes new test syntax, not execution |
| Rendered dossier acceptance | `npm --prefix apps/web run test -- --run src/pages/workspace/__tests__/DossierFlow.test.jsx src/hooks/__tests__/usePrivateDossier.test.jsx src/__tests__/AppRoutes.test.jsx` | FAIL before execution: Vitest absent; 11 page and five hook cases remain authored, unverified |
| Web coverage | `npm --prefix apps/web run test:coverage` | FAIL: Vitest absent; new modules retain 80% CI thresholds |
| Bot startup doctor | `python -m scripts.discordbot.doctor --component bot` | Expected local FAIL here: missing SDK/token, private bridge disabled; launcher and runtime UNVERIFIED |
| Worker startup doctor | `python -m scripts.discordbot.doctor --component worker` | Expected local FAIL here: missing token/parser/backend configuration; launcher and runtime UNVERIFIED |

```bash
node --test --experimental-test-coverage --test-coverage-include='**/dossier-vault.js' --test-coverage-include='**/private-dossier.js' --test-coverage-include='**/1790200000_private_dossiers.js' --test-coverage-include='**/privateDossier.js' --test-coverage-include='**/research-policy.js' tests/upgrade/dossier-system.test.mjs tests/upgrade/dossier-client.test.mjs tests/upgrade/mission-research.test.mjs tests/upgrade/research-client.test.mjs
```

Observed red/green fixes: the shared OAuth path queried a native ExternalAuth
model as an API record collection. A regression first failed, then passed after
using findFirstExternalAuthByExpr with a native expression. A second regression
failed when non-enumerable request properties disappeared during object spread;
the transactional adapter now passes the required native event properties
explicitly. Reproduce both with:

```bash
node --test --test-name-pattern='native ExternalAuth' tests/upgrade/dossier-system.test.mjs
```

Source review also corrected a missing closure in a newly authored rendered
fixture and bounded its text queries to the selected-entity region. The static
diagnostic passes afterward; absent Vitest means no rendered red/green claim.
Tests cover encrypted persistence/corruption, owner isolation, relinking,
revision conflicts, atomic rollback, deleted-content replay and delivery loss.
Node uses an explicit crypto/storage boundary double and Python an SDK transport
double; neither establishes native PocketBase encryption or Discord compatibility.

The independent native CI matrix parses correctly and requires both declared
PocketBase versions (package 0.39.8; Compose 0.28.4), with no continue-on-error,
secret inputs or dependency on the web job. It reuses the existing Dockerfile
only on the hosted runner. The isolated test applies actual hooks and migrations,
then tests native auth, locked APIs, model lookup, crypto and concurrent retries.
Its test migration seeds a link; real Discord OAuth is still receiving acceptance.
Verify hosted results and receiving runtime through docs/discord-activation.md;
no hosted success, browser screenshots or shared activation is claimed here.

## §4 MEMORY INGEST

Type A count: 339
Type B count: 740
Type C count: 72
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Prior history: all 66 baseline Type C events are preserved without rewriting, including the callable suite, narrative, planning, dossier and research evidence.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

Reproduce prior-event preservation:

```bash
python - <<'PY'
import json
import subprocess
from pathlib import Path
path = '.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json'
baseline = json.loads(subprocess.check_output(['git', 'show', 'c307edb65bde32034e53799c2d757cf2e585d1f9:' + path], text=True))
old = [row for row in baseline['vectors'] if row['type'] == 'C']
new = [row for row in json.loads(Path(path).read_text())['vectors'] if row['type'] == 'C']
assert len(old) == 66 and new[:len(old)] == old
print('PASS: all 66 baseline events preserved without rewriting.')
PY
```

## §5 CKET FILING

06_PLAN: docs/federal-foundry.md and updated portable suite guide; earlier Sentinel planning retained
04_HYPOTHESIZE: five proposed lane specifications, umbrella SRS, registry and agent work-package guidance
07_BUILD: apps/federal_foundry, expanded suite package closure and existing pipeline check description
08_TEST: 40 federal behavior tests, per-module coverage runner and adjusted suite package regression
11_COMMIT: independent federal CI, CMAX-B intake handoff, dispatch, context and report/memory
13_SAVE: none
CGRF headers: 16/16 new this continuation; 252/252 cumulative files created since the original base
REFLEX check: deferred to private post-merge validator; no signing values fabricated
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: zero public-boundary violations
Secret scan: clean under the repository boundary scanner
Stripe mode: not applicable; no checkout/payment code
Actor label: actor:agent required; not applied by this session
Risk / authority: owner-authorized A2 public compiler/application source and local validation; no shared deployment, hosted task launch, native account provisioning or government submission authority
Verify: `python scripts/ci/verify_public_boundary.py`

The federal compiler made no model calls, scheduled no hosted work and sent no
external messages or submissions. It changed no shared database, private runtime
or key material. Provider selection and identity verification belong to the
receiving runtime; scientific validity, eligibility and final claims require
observed evidence and human approval. This source continuation neither validates
nor changes prior dossier encryption, service activation or deployment claims.

## §7 NEXT ACTIONS

Current federal intake: the receiving Bits operator assigns a distinct
Ready/In-progress execution dispatch and repository session per lane, verifies
the current official topic and rights, and binds any selected LLM client to the
public ModelAdapter contract. Builder/verifier seats must differ. Exercise one
real bounded completion with runtime-derived provenance, then run the actual
candidate experiments and preserve measurement/review receipts. No lane has
research-result evidence or an assigned hosted execution dispatch in this change.
Handoff: .bits/handoffs/2026-09-16-bits-codegen-cmax-b-federal-foundry.md.

Suggested next dispatch: a receiver-assigned SRS-BUILDANDDO-FEDERAL-INFLUENCE-001
execution dispatch for current-topic validation, frozen market benchmark and
first candidate experiment; the other four registered scopes may proceed in
their own sessions when their dispatches are ready. This is a recommendation,
not a fabricated VCC database row or live scheduler call.
Out-of-scope bugs filed: none; the six prior context findings are retained.

Federal rollback: stop intake of these prepared packets and revert the focused
public compiler/package change through the normal release owner. Preserve
existing evidence and reviews. The extended archive has a different source
fingerprint; update installed worker bindings only through their existing
operator review. There is no new runtime service or database migration to undo.
All five proposal outputs remain HOLD until their actual evidence and human
gates are satisfied.

Earlier mission-suite acceptance:

Current package acceptance: the BuildAndDo application/box operator must accept
its native PocketBase release and the rendered mission flow, select an existing
CPU box, bind the approved native user and exact source package, then observe a
real queue → worker → human review → evidence result and replay. The guide gives
exact inputs and commands; no Sentinel repository is required for this bounded
package. Independent CI retains a downloadable worker archive only after source
gates pass. Hosted CI results and actual activation have not been observed.
Handoff: .bits/handoffs/2026-09-16-bits-codegen-cmax-b-mission-suite.md.

Package rollback: disable the worker binding or mission suite and stop the
worker under its existing supervisor. Restore the application through its normal
release owner. The suite down migration retains runs and receipts while removing
protocol markers; re-up validates schema and restores them. Lesson rollback
retains lessons and progress. Do not delete replay/evidence history or loosen
native authentication to recover service.

Separate Sentinel implementation blocker: a receiving private dispatch with the actual
Sentinel repository and accountable owners for SM-WO-00. CMAX-B/IDE1 must accept
discovery and reuse/path/auth/integrity mappings before code, then follow the
13 work orders and mandatory return in SM-EXEC-1.0. No Astra seat is activated.
Official DIU references, dated company facts, source/recipient rights and one
rendered self-contained submission remain publication acceptance work.
Handoff: .bits/handoffs/2026-09-16-bits-codegen-cmax-b-sentinel-maritime.md.
No receiving dispatch, external submission, service launch, data acquisition,
government integration, root admission or CUI processing was performed. The
seven-part paper and 15-slide map share one qualified narrative; unverified
operating, commercial and solicitation claims cannot become established facts.

Historical planning rollback: revert the public artifacts or record an owner-reviewed new
baseline version with superseded decisions. No runtime, database, dependency,
release or policy mutation needs compensation. Preserve historical source
fingerprints and governance events.

Earlier application acceptance remains open:

Blockers: native Discord/PDF/PocketBase, frontend dependencies and browser
acceptance; actual service launcher, runtime key binding, OAuth and providers.
Handoffs requested: CMAX-B/IDE1/community operator through
.bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md.
No receiving seat was activated. Suggested next dispatch: receiver-owned native
dossier/Discord acceptance and identification of the existing launcher; the
receiving owner supplies its own dispatch ID. Bugs filed: none; no provider
write. Six pre-existing context findings remain visible.

Rollback: restore complete bot/web bundles under the receiving release process
and coordinate registered command definitions. The dossier down migration
retains encrypted content and deletion receipts while disabling its protocol;
re-up restores the marker only after schema checks. Preserve required keys and
backup policy. Do not drop receipt history or roll back unrelated workspace or
research evidence. Exact contracts and receiving tests are in
docs/private-dossiers.md and docs/discord-activation.md.
