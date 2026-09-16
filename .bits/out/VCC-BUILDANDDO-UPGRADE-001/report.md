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
# DAG Node:    none
# Intent:      Distinguish implemented upgrade behavior from measured acceptance and blocked environment checks.
# ───────────────────────────────────────────────────────────────

# Dispatch implementation report

## §1 SUMMARY

Status: PARTIAL — Sentinel Maritime public planning complete; private implementation and earlier runtime acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924
Tasks: 42/76 cumulative phase gates complete; current BU–BX public planning continuation has 4/4 complete gates
Smoke: 4/4 public planning checks; earlier application smoke remains 4/7 with native/frontend acceptance pending
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: planning inspection baseline aab43b3ed686b70df7c304d02566f0e93606dfd6; current planning evidence prepared before its focused bookkeeping
Verify source identity: `git log -1 --format='%H %s'`

The owner's Sentinel Maritime design is recorded as SM-BL-1.0 in
docs/sentinel-maritime/blueprint.md, contracts.md and integrity.md, with a
machine-readable system-plan.json and private receiving handoff. The inventory
has 33 components, 12 planes, 32 planned flow edges and 12 pinned public source
fingerprints. It keeps proposed REUSE/EXTEND/BUILD separate from source evidence
and runtime acceptance. Eleven commitment definitions form an acyclic graph;
operational roots, image identities and live SBOM admission remain uncomputed.

The baseline preserves the product scope, cue/admission/outcome semantics,
15 metric definitions, rehearsal plan, commercial/security boundaries and a
15-slide claim map. Official DIU requirements are explicitly awaiting references.
The public epoch is evidence-only and the candidate manifest covers source;
neither establishes the private release authority asserted in the supplied brief.
No application/runtime code changed in this planning continuation. Reproduce the
inventory audit with the runnable block in docs/sentinel-maritime/integrity.md;
current governance checks appear in §3.

The prior website's My dossier and five private Discord commands share one
personal encrypted entity store under canonical PocketBase user identity.
Explicit notes retain dates and source references; owners can recall, correct
and remove content. Workspace administrators cannot access another user's
dossier. Saved receipts prevent duplicate writes and resurrection after deletion.
No passive channel collection, inferred entity matching or mission verification
is added. Source, native acceptance and deployed activation remain separate.

The read-only doctor inspects existing local prerequisites without printing
values, authenticating, synchronizing commands, sending messages or starting
services. Compose starts web/PocketBase only; the actual bot/worker launcher is
not in the checkout. Both declared PocketBase versions now have independent
required native CI coverage; their hosted results were not observed here.

Historical dossier-wave source evidence: 227 Node tests passed; 129 Python tests passed
with six native skips. The targeted Python checker passes 111 cases with two
native skips and at least 83.72% trace statement coverage per module. Selected
JavaScript coverage is 99.85% lines, 92.87% branches and 99.04% functions.
Native PocketBase/SDK/PDF, rendered/mobile/OAuth, providers and runtime activation
remain unverified. Earlier source waves are preserved below as historical work.

## §2 TASK RESULTS

### Current continuation — Sentinel Maritime planning, 2026-09-16

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

Current planning validation:

| Check | Runnable verification | Expected and observed |
|---|---|---|
| 1. Planning inventory | Run the bash audit block in docs/sentinel-maritime/integrity.md from the repository root | PASS: 33 component IDs, 12 planes, 32 planned edges, 12 pinned source fingerprints, 11 acyclic commitment definitions, 15 slide anchors; no runtime/SBOM/root/benchmark/official-requirement admission claim |
| 2. Context | `python scripts/ci/agent_context.py --check` | PASS: inventory matches; six pre-existing findings and four unwired gates retained |
| 3. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 557 tracked files; current planning files remain within public paths with no scanner failures |
| 4. Memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS: file vectors, source counts, declared edges, IOO and retained event history |

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

Type A count: 290
Type B count: 606
Type C count: 56
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Prior history: all 53 dossier-baseline Type C events are preserved without rewriting; this includes the earlier 47-event research history.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

Reproduce prior-event preservation:

```bash
python - <<'PY'
import json
import subprocess
from pathlib import Path
path = '.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json'
baseline = json.loads(subprocess.check_output(['git', 'show', 'aab43b3ed686b70df7c304d02566f0e93606dfd6:' + path], text=True))
old = [row for row in baseline['vectors'] if row['type'] == 'C']
new = [row for row in json.loads(Path(path).read_text())['vectors'] if row['type'] == 'C']
assert len(old) == 53 and new[:len(old)] == old
print('PASS: all 53 baseline events preserved without rewriting.')
PY
```

## §5 CKET FILING

06_PLAN: current docs/sentinel-maritime/blueprint.md, contracts.md, integrity.md, system-plan.json and sidecar; earlier private-dossier/activation and Discord/research documentation retained
04_HYPOTHESIZE: registered umbrella SRS and contribution governance
07_BUILD: private dossier hooks/migration, web components/client/hook, bot bridge and doctor
08_TEST: connected source fixtures, rendered flow/hook tests and native acceptance runner
11_COMMIT: current public maritime handoff, dispatch, context and report/memory; earlier CI and community handoff retained
13_SAVE: none
CGRF headers: 6/6 new this planning continuation; 203/203 cumulative files created since the original base
REFLEX check: deferred to private post-merge validator; no signing values fabricated
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: zero public-boundary violations
Secret scan: clean under the repository boundary scanner
Stripe mode: not applicable; no checkout/payment code
Actor label: actor:agent required; not applied by this session
Risk / authority: current A0 public planning within the A2 source dispatch; no private implementation or operating authority
Verify: `python scripts/ci/verify_public_boundary.py`

No key generation/provisioning, bot login, Discord synchronization/message,
private service deployment, shared database migration, live OAuth/provider call
or seat message occurred. Runtime key custody, transport, native acceptance and
backup retention remain operator responsibilities. Server-side encryption is
not end-to-end encryption or physical erasure of existing backups.

## §7 NEXT ACTIONS

Maritime receiving work: CMAX-B/IDE1 must verify the proposed private bases,
canonical Merkle/SBOM owner and actual candidate/runtime proof; resolve official
DIU requirements and source/recipient rights; register implementation separately.
Handoff: .bits/handoffs/2026-09-16-bits-codegen-cmax-b-sentinel-maritime.md.
No receiving dispatch, external submission, service launch, data acquisition,
government integration, root admission or CUI processing was performed. The
15-slide content map is ready for a qualified deck; unverified operating and
solicitation claims cannot be promoted to established facts.

Planning rollback: revert the public artifacts or record an owner-reviewed new
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
