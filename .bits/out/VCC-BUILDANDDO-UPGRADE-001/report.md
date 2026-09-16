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
#              CONSUMES foundry/README.md;
#              VALIDATES foundry/shared/federal_foundry/portfolio.py;
#              VALIDATES tests/foundry/check_foundry.py;
# DAG Node:    none
# Intent:      Distinguish implemented upgrade behavior from measured acceptance and blocked environment checks.
# ───────────────────────────────────────────────────────────────

# Dispatch implementation report

## §1 SUMMARY

Status: PARTIAL — Federal R&D Foundry source complete; official, empirical and submission acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: bits/SRS-BUILDANDDO-UPGRADE-001-federal-foundry
Tasks: 6/6 current local source phases; federal opportunity and submission acceptance remain outside this source gate
Smoke: 9/13 current check groups pass; four pre-existing frontend tools remain unavailable, as detailed in §3
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 1 focused continuation; resolve final source identity using the command below
Verify source identity: `git log -1 --format='%H %s'`

BuildAndDo now has a public, offline Federal R&D Foundry with five isolated lanes:
DARPA DV026 Influence Benchmarks, NAVAIR Acquisition Analysis, DAF NV027
Brain-Inspired Low-SWaP, DARPA Semantic ISR and DIU Sentinel Maritime. Each lane
has a schema-validated opportunity, a complete authored artifact surface and an
empty machine result record. Unknown deadlines and all eligibility decisions are
preserved as unresolved. The planning brief is not relabeled as an official source.

The shared Python package tracks requirement state, compiles claim-to-evidence
support, defines typed asynchronous experiment and benchmark interfaces and emits
deterministic reviewer bundles. It rejects unknown identities, duplicate evidence,
malformed results, satisfied requirements without verified evidence and claims
promoted beyond their support. Two complete compilations produced identical bytes
without modifying lane source. A bundle always retains a human-review requirement.

Thirteen foundry tests pass. Executable shared modules measure 82.73–100% Python
trace statement coverage; strict mypy and Ruff pass. Existing regressions also
pass: 256 Node tests and 161 Python tests, with nine explicit native skips. The
repository still lacks Vitest, Vite and eslint-plugin-import, so web tests,
coverage, lint and build cannot start. No frontend source changed in this wave.

This source does not establish an official solicitation, deadline, eligibility,
measured lane performance, DP2 qualification, physical hardware feasibility,
pricing, certification, customer commitment or submission. Those remain named
human, empirical or receiving-environment gates.

## §2 TASK RESULTS

### Current continuation — Federal R&D Foundry, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| CJ — Register public foundry scope | PASS | Existing A2 dispatch extended before source; official, hardware, private and submission boundaries retained | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | umbrella SRS and dispatch queue |
| CK — Opportunity registry | PASS | Five semantic records validate; DV026 10-page/five-slide/$300K planning values, NAVAIR Docker, NV027 simulation, ISR DP2/hardware and Maritime prior-work boundaries are represented | `python -m unittest tests.foundry.test_foundry.RegistryTests` | 06_PLAN / 08_TEST | foundry/registry and schema |
| CL — Lane and template scaffolds | PASS | Every lane has all requested outputs, a slides workspace and JSON provenance; reusable templates retain human gates | same registry test command | 06_PLAN | foundry/templates and foundry/lanes |
| CM — Shared evidence contracts | PASS | Requirement and claim promotion fail closed; async runner and benchmark protocols accept bounded implementations | `python -m unittest tests.foundry.test_foundry.EvidenceTests tests.foundry.test_foundry.InterfaceTests` | 07_BUILD / 08_TEST | foundry/shared/federal_foundry |
| CN — Portfolio compiler | PASS | Two five-lane bundles are byte-identical; lane source is unchanged; output refuses overwrite and retains advisory status | `python -m unittest tests.foundry.test_foundry.PortfolioTests` | 07_BUILD / 08_TEST | portfolio compiler and CLI |
| CO — Verification and evidence | PASS with frontend blockers recorded | 13 foundry tests, per-module coverage, typing, lint, prior regressions, context, boundary and memory gates recorded | commands in §3 | 08_TEST / 11_COMMIT | foundry tests, report, memory and context lock |

### Prior continuation — callable mission suite and government learning, 2026-09-16

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

Current foundry checks (source, frontend and federal acceptance remain separate):

| Check | Runnable verification | Expected / observed |
|---|---|---|
| 1. Foundry behavior and coverage | `python tests/foundry/check_foundry.py` | PASS: 13/13; each executable shared module has 82.73–100% trace statement coverage |
| 2. Strict typing | `python -m mypy --strict foundry/shared/federal_foundry` | PASS: seven source files, no issues |
| 3. Python lint | `python -m ruff check foundry/shared/federal_foundry tests/foundry` | PASS |
| 4. Existing Node regression | `node --test --test-reporter=dot tests/upgrade/*.test.mjs` | PASS: 256/256 |
| 5. Existing Python regression | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | PASS: 161 discovered, nine native skips |
| 6. Diff whitespace | `git diff --check` | PASS |
| 7. Context | `python scripts/ci/agent_context.py --check` | PASS after final staged inventory regeneration; six existing findings and four unwired gates retained |
| 8. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS after staging; foundry is an allowed public prefix and no forbidden or secret-like files are present |
| 9. Memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS: current counts, IOO, CGRF edges and prior event history agree |
| 10. Rendered web tests | `npm --prefix apps/web test` | FAIL before tests: Vitest executable is absent |
| 11. Web coverage | `npm --prefix apps/web run test:coverage` | FAIL before tests: Vitest executable is absent; foundry coverage is measured separately by check 1 |
| 12. Repository web lint | `npm --prefix apps/web run lint` | FAIL before lint: eslint-plugin-import is absent |
| 13. Web build | `npm --prefix apps/web run build` | FAIL after deterministic data generation: Vite executable is absent |

The first foundry run exposed an incomplete evidence index in one isolated test
and two assertions coupled to scaffold rather than generated wording. Those
fixtures were corrected; the full 13-test gate then passed. Strict typing next
identified four generic JSON-list paths and absent PyYAML type stubs. Runtime
list guards now preserve validation, and only the third-party untyped import is
scoped as such. Strict mypy passes. No production evidence rule was weakened.

The first cached diff check found an extra blank line at EOF in files produced
by the scaffold batch. A bounded formatting pass normalized only `foundry/` and
`tests/foundry/` to one terminal newline; `git diff --cached --check` then passed.

The first memory refresh recalculated a pre-existing PNG using binary split-lines,
but this dispatch records PNG line counts as zero. The PNG entry was restored to
that established convention; the complete memory verifier then passed.

Ruff's format-only check identified six Python files with noncanonical wrapping.
The formatter changed layout only; behavior, coverage, strict typing, lint and
the cached diff check passed afterward.

Pytest/pytest-cov and coverage.py are unavailable, so their commands fail before
collection. The checked-in standard-library trace gate follows the repository's
existing mission-suite pattern and enforces at least 80% statement coverage per
executable module. It does not claim branch, provider, hardware or portal coverage.

Prior callable mission-suite checks (source and required runtime gates remain separate):

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

Type A count: 430
Type B count: 872
Type C count: 72
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Prior history: all 66 baseline Type C events are preserved without rewriting, including earlier planning, dossier, research and mission-suite evidence.
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

06_PLAN: foundry README, opportunity registry/schema, reusable templates and five complete lane scaffold trees
04_HYPOTHESIZE: umbrella SRS continuation; earlier specifications retained
07_BUILD: importable shared requirement, evidence, runner, benchmark and portfolio compiler modules
08_TEST: foundry behavior suite and per-module standard-library trace coverage gate
11_COMMIT: dispatch queue, measured context lock and cumulative report/memory
13_SAVE: none
CGRF provenance: 106/106 new source, registry, template, lane and test files; JSON files use sibling sidecars
REFLEX check: deferred to private post-merge validator; no signing values fabricated
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: zero public-boundary violations
Secret scan: clean under the repository boundary scanner
Stripe mode: not applicable; no checkout/payment code
Actor label: actor:agent required; not applied by this session
Risk / authority: owner-authorized A2 public source and local validation; no official-source approval, shared deployment, hardware operation or government submission authority
Verify: `python scripts/ci/verify_public_boundary.py`

No key generation, live provider call, controlled-data ingest, hardware run,
private deployment, shared database mutation, federal portal interaction or seat
message occurred. The compiler cannot approve eligibility, claims, certifications,
costs, rights, team statements or a final package.

## §7 NEXT ACTIONS

Foundry next action: assign a separate registered SRS to each `research/*` lane,
attach the current official opportunity bytes and complete eligibility review,
then preregister and run the first bounded experiment. Promote reusable mechanics
through `research/common-federal-evidence`; do not merge lane results laterally.
The first compiled bundles correctly remain not evidence-complete.

Lane blockers: all five lack a verified current deadline and eligibility decision.
Influence lacks market/agent/classifier runs; NAVAIR lacks a rights-cleared corpus
and container benchmark; NV027 lacks a preregistration and scientific results;
Semantic ISR additionally lacks EO data and physical edge-hardware receipts;
Maritime lacks official DIU instructions, representative rights-cleared data and
private Sentinel/NNC runtime acceptance. Handoffs requested: none in this public
scaffolding wave. Suggested next dispatch: one lane-specific SRS for the DV026
market-kernel baseline after official-source review. Bugs filed: none.

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
