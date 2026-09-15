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
# DAG Node:    none
# Intent:      Distinguish implemented upgrade behavior from measured acceptance and blocked environment checks.
# ───────────────────────────────────────────────────────────────

# Dispatch implementation report

## §1 SUMMARY

Status: PARTIAL — connected source implemented; native, rendered and live acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-site-upgrades-20260914232924
Tasks: 34/65 cumulative phase gates complete; current source implementation covers BG–BM with 4/7 phase gates complete
Smoke: 4/7 application gates; native SDK/PDF gate remains failing on missing dependencies
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 10 earlier source revisions (8a1c407d12e830a041a454d3bc668f4d94e104c9, c84008b5b0a1630d8543006b7529a7da1d7badd9, 9b69cb79429f551dda5629a18bc025dce8ced29b, e820f8f220632405b910f9ebd9d71e2e20a00e41, af63ab4a64aa2708487e3a2f20b5c229e4da2d83, 203a08ced7348e551f810ed90b0a869b29532427, 858ccf52c82b58bdcd3b44db68b77e69c347d379, b609039afde504eae73bd969890a2e06c1a5b48e, 295725ac49a8131a888fb344322b32f9cfb6f2f6, 58772dee3296d6f73f2ee583ce639ba617848830); current research evidence prepared before its final source bookkeeping
Verify source identity: `git log -1 --format='%H %s'`

Discord and the website now submit to one protected workspace/mission research
queue. The bot resolves native Discord OAuth links and current workspace roles,
can propose missions and list existing evidence, and submits explicit search,
URL or file sources. The website reviews actual extraction results before
atomically creating one observed evidence record and its audit. Mission approval
and verification remain with the existing mission lifecycle.

The source worker uses selected self-hosted Firecrawl v1/v2 contracts, local
document extraction and a configured self-hosted transcription endpoint. It
records input digests, citations, processor/version, truncation and dated results
under fenced leases. No private deployment, credentials, live Discord message,
OAuth activation or provider operation was performed by this source session.

Merged PR 26 is the source baseline. Current checks pass 199 Node and 107 Python
cases with two native dependency skips. The targeted source checker passes 89
cases with those same two skips; its native-required variant correctly fails.
Native auth/rules/concurrency, browser/mobile/OAuth, deployed providers and
Discord gateway acceptance remain separate from the source fixtures.

## §2 TASK RESULTS

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

| Check | Command | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `npm --prefix apps/web test` (targeted research suites attempted) | Vitest executes | exit 127; Vitest unavailable | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Official repository lint executes | exit 2; eslint-plugin-import unavailable | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Vite produces production output | exit 1; spawnSync vite ENOENT | FAIL — environment |
| 4 | `node --test tests/upgrade/*.test.mjs` | No failing source contracts | 199/199 pass | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | No failing source contracts | 107 pass, two native dependency skips, 109 total | PASS for local source; native not covered |
| 6 | `python scripts/ci/agent_context.py --check` | Current measured context | Matches; 33 Vitest files, six earlier findings, four unwired gates | PASS |
| 7 | `python scripts/ci/verify_public_boundary.py` | No public-boundary failures | 530 files; zero failures | PASS |

Application smoke is 4/7. The dispatch stays in progress; missing environment
checks are not counted as passing tests. Prior lock-resolution findings are
retained in the earlier report/history; no dependencies or gates were weakened.

| Additional check | Command | Observed result |
|---|---|---|
| Connected source coverage | `node --test --experimental-test-coverage --test-coverage-include='apps/pocketbase/pb_hooks/mission-research.js' --test-coverage-include='apps/pocketbase/pb_hooks/research-policy.js' --test-coverage-include='apps/pocketbase/pb_migrations/1790100000_mission_research.js' --test-coverage-include='apps/web/src/lib/missionResearch.js' --test-coverage-include='apps/web/src/lib/discordAccount.js' tests/upgrade/mission-research.test.mjs tests/upgrade/research-client.test.mjs` | 31/31; 99.87% lines, 85.18% branches, 94.44% functions; every selected module exceeds 80% in each measure |
| Bot/research source | `python tests/upgrade/check_discordbot.py --include-research` | 89 pass, two native skips; per-module statement gate PASS |
| Required native SDK/PDF | `python tests/upgrade/check_discordbot.py --include-research --require-sdk --require-pdf` | FAIL, exit 1; Discord.py and pypdf unavailable; neither skip becomes native acceptance |
| Python lint | `python -m ruff check apps/research scripts/discordbot tests/upgrade/*discord*.py tests/upgrade/*research*.py` | PASS |
| New Python typing | `python -m mypy --strict --explicit-package-bases apps/research scripts/discordbot/research.py` | PASS; six source files |
| Complete SDK typing | `python -m mypy --strict --explicit-package-bases apps/research scripts/discordbot` | FAIL; missing discord import and ten resulting untyped SDK errors |
| Python branch coverage | `python -m pytest tests/upgrade/test_discordbot_*.py tests/upgrade/test_research_runtime.py --cov=scripts/discordbot --cov=apps/research --cov-branch --cov-fail-under=80` | Cannot run; pytest unavailable |
| Web coverage | `npm --prefix apps/web run test:coverage` | Cannot run; Vitest unavailable |
| Limited source diagnostic | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` | PASS; 225 modules, zero static errors; does not render UI or replace repository lint |
| Provenance and memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS; 263 file vectors, 520 edges, 47 events |

Python trace statement lines measure actual source execution under local HTTP,
document subprocesses and explicit backend/transport fixtures. They do not
measure branches, native PocketBase transactions or the Discord gateway.

| Module | Statement coverage |
|---|---|
| apps/research/contracts.py | 98.25% |
| apps/research/documents.py | 83.72% |
| apps/research/processing.py | 90.57% |
| apps/research/transport.py | 98.21% |
| apps/research/worker.py | 88.05% |
| scripts/discordbot/bot.py | 91.35% |
| scripts/discordbot/catalogue.py | 96.79% |
| scripts/discordbot/contracts.py | 99.43% |
| scripts/discordbot/public_data.py | 97.32% |
| scripts/discordbot/research.py | 92.49% |
| scripts/discordbot/service.py | 99.56% |

Red/green evidence and applied fixes:

- `python -m unittest discover -s tests/upgrade -p 'test_research_runtime.py' -k unclaimable`
  initially failed because every bounded poll restarted before the same 200
  unclaimable jobs. The worker now resumes later pages; the next eligible job
  processes on the following poll. The same regression passes.
- `python -m unittest discover -s tests/upgrade -p 'test_discordbot_research.py' -k unicode_document`
  initially recorded failure for long non-BMP text: escaped child JSON and
  JavaScript UTF-16 bounds disagreed with Python code-point counts. Shared
  character-safe truncation now fits both boundaries, marks truncation, preserves
  the original-byte digest and reaches ready through the actual handler source.
  The same regression passes.
- `node --test --test-name-pattern='file downloads' tests/upgrade/mission-research.test.mjs`
  initially allowed file access after the linked mission became unreadable.
  Downloads now recheck mission readability for members and leased workers;
  unused uploads are owner-only. The same regression and full connected suites
  pass. Native PocketBase file-token enforcement still requires native acceptance.
- Combined SDK-double discovery initially created distinct exception classes
  when patch.dict restored newly imported modules. Importing shared research
  modules before the SDK patch fixes the fixture lifecycle; the complete checker
  passes its source tests without broadening production exception handling.
  An incorrect fixture import and a limiter-count test expectation were also
  corrected; the full Node/Python commands above pass.

Unresolved failures: declared native SDK/PDF and frontend dependencies are absent;
complete SDK typing and pytest/branch coverage consequently remain unavailable.
The receiving runner must install declared dependencies and rerun the exact
commands above. The independent CI job has been parsed and checked to require
both native dependencies and corresponding ci:test descriptions, with no login,
credentials, skip suppression or continue-on-error. Its hosted result is unobserved.

The current interpreter is Python 3.12.13 and local Node is 24.13.0. CI uses
Python 3.12 and Node 22; that runner's results are still required. Native
PocketBase 0.28.4, Discord OAuth/SDK/gateway, rendered mobile/keyboard/theme,
served revision, self-hosted Firecrawl/transcription and real resource limits
remain receiving-runtime checks. No browser screenshot or live result is claimed.

## §4 MEMORY INGEST

Type A count: 263
Type B count: 520
Type C count: 47
IOO compliance: true
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

All 41 baseline Type C events are preserved without rewriting their historical
facts. New events record source results, the observed red/green fixes and native
environment limits. No direct memory service write occurred.

## §5 CKET FILING

06_PLAN: docs/mission-research.md and updated docs/discord-bot.md
04_HYPOTHESIZE: existing umbrella spec/registry and contribution governance
07_BUILD: research backend/migration, Python processors, bot bridge and web flow
08_TEST: connected source, transport/storage fixtures and rendered suites
11_COMMIT: CI, dispatch, context, report, handoff and memory payload
13_SAVE: none
CGRF headers: 27/27 new this continuation; 176/176 cumulatively
REFLEX validator: deferred to the private validator; no signing values fabricated
Verify paths and headers: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: zero public-boundary violations
Secret scan: clean under the repository boundary scanner
Stripe mode: not applicable; no checkout/payment code
Actor label: actor:agent required; not applied by this session
Risk / authority: A2 public application source, additive schemas and isolated tests
Verify boundary: `python scripts/ci/verify_public_boundary.py`

Credentials are read only through existing native runtime bindings at explicit
startup. Discord identity is resolved through native OAuth links, not typed IDs
or Discord roles. Review creates observed evidence, never verification. No
shared database operation, Discord message/registration, token provisioning,
private infrastructure, seat event or provider activation was performed here.

## §7 NEXT ACTIONS

Blockers: native SDK/PDF, full typing/branch coverage, frontend dependencies,
native PocketBase and OAuth/rule/concurrency/file acceptance, actual provider
contracts and controlled test-server/served-version evidence.
Handoffs requested: CMAX-B/IDE1/community operator via
.bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md.
No receiving seat was activated. The existing delivery handoff also applies.
Suggested next dispatch: receiver-owned native research and controlled provider
acceptance; its private dispatch ID belongs to that receiving owner.
Bugs filed: none; no provider write. Six earlier context findings remain visible.

Rollback: the research down migration removes its protocol marker and retains
protected files, submissions, audit history and observed evidence links. Do not
down unrelated migrations or restore older membership permissions. Coordinate
complete frontend/bot/worker bundles and registered commands with the private
operator. docs/mission-research.md contains the actual contracts and test sequence.
