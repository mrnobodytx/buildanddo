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
Tasks: 6/14 acceptance gates complete; source covers the eight original areas and the authorized backend reuse continuation
Smoke: 4/7
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 1 prior implementation (8a1c407d12e830a041a454d3bc668f4d94e104c9); continuation evidence is recorded before its commit

The original upgrade was merged through PR 19 on 2026-09-15. The owner then
requested reuse of backend functions from the signed-in sections. This report
covers the cumulative source and distinguishes measured checks from acceptance
that still needs the frontend dependencies. Merge is not evidence of TEVV.
The registered umbrella and dispatch remain in progress.

## §2 TASK RESULTS

| Phase | Status | Result | Verify | CKET |
|---|---|---|---|---|
| A — Register original scope | PASS | Eight-area umbrella, registry and owner dispatch | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT |
| B — Public pages | PARTIAL | Pricing, About, Docs, Blog, Contact and navigation | `npm --prefix apps/web test -- src/pages/__tests__/PublicPages.test.jsx` | 07_BUILD / 08_TEST |
| C — Component coverage | PARTIAL | Public/workspace interaction suites; 21 Vitest files inventoried; frontend execution remains blocked | `npm --prefix apps/web run test:coverage` | 08_TEST |
| D — Route loading | PARTIAL | Lazy routes, Suspense feedback and workspace error isolation | `npm --prefix apps/web run build` | 07_BUILD |
| E — Mobile layouts | PARTIAL | Responsive shared navigation, controls and dialogs; new previews wrap at narrow widths | Production preview at 320, 375 and 1280 px after build | 07_BUILD |
| F — Telemetry adapters | PASS locally | Real-result mutation events/timing, shared release, supply collection and opt-in PocketBase hooks | `node --test tests/upgrade/*.test.mjs`; `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | 07_BUILD / 11_COMMIT |
| G — SEO generation | PASS locally | Public crawler assets and route-specific metadata generation | `node --test tests/upgrade/build.test.mjs` | 07_BUILD / 11_COMMIT |
| H — Theme | PARTIAL | Persisted system/light/dark controls; contrast tests pass; browser interaction remains unverified | `python -m unittest discover -s tests/upgrade -p 'test_theme_contrast.py'` | 07_BUILD / 08_TEST |
| I — Accessibility | PARTIAL | Keyboard navigation, skip targets, labels and focus return; interaction tests authored | `npm --prefix apps/web test` | 07_BUILD / 08_TEST |
| J — Initial evidence/handoff | PASS | Original evidence and private PocketBase activation handoff retained | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT |
| K — Register backend reuse | PASS | Owner continuation recorded under the existing SRS and A1 dispatch | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT |
| L — Home backend flows | PARTIAL | Workspace summaries, evidence, published editions, verified corrections, source-separated revenue, challenge persistence/history; selectors pass, UI acceptance pending | `node --test tests/upgrade/workspace-summary.test.mjs`; `npm --prefix apps/web test -- src/pages/__tests__/HomePage.test.jsx` | 07_BUILD / 08_TEST |
| M — Shared Field Manual | PARTIAL | Same authenticated catalogue and saved progress on Home, Docs and workspace; retry/demo/account tests authored | `npm --prefix apps/web test -- src/components/workspace/__tests__/TutorialCatalog.test.jsx src/contexts/__tests__/WorkspaceContext.test.jsx` | 07_BUILD / 08_TEST |
| N — Continuation evidence | PASS with validation blockers recorded | Runnable offline source check, updated context, memory and report | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`; `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | 11_COMMIT |

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
Existing collection rules, migrations, and deployment authority are unchanged.

## §3 SMOKE TEST RESULTS

| # | Command | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Targeted Vitest command below | Component/account/route suites pass | `vitest: not found` | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Repository lint passes | Missing eslint-plugin-import | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Vite emits the application bundle | `spawnSync vite ENOENT` | FAIL — environment |
| 4 | `node --test tests/upgrade/*.test.mjs` | Node suites pass | 22/22 pass | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Python adapter/contrast suites pass | 18/18 pass | PASS |
| 6 | `python scripts/ci/agent_context.py --check` | Measured context matches source | 21 Vitest files; 6 pre-existing findings, 4 unwired gates retained | PASS |
| 7 | `python scripts/ci/verify_public_boundary.py` | Public boundary clear | 404 files; zero failures; provider actor label not available locally | PASS |

The attempted targeted frontend command is reproducible as:

```bash
npm --prefix apps/web test -- src/pages/__tests__/HomePage.test.jsx src/components/workspace/__tests__/TutorialCatalog.test.jsx src/contexts/__tests__/WorkspaceContext.test.jsx src/hooks/__tests__/useWorkspaceRecords.test.js src/__tests__/AppRoutes.test.jsx
```

Failures 1–3 are the carried-forward missing-dependency problem. The local npm
cache has no matching Vitest, React, Testing Library, jsdom or Vite packages.
The baseline lockfile omits eight declared packages and disagrees with the
manifests; no manifest or lockfile change was made in this continuation. The prior
offline installation attempt failed with ENOTCACHED. No network installation,
resolution fabrication, dependency removal or gate bypass was attempted.
A registry-enabled runner must reconcile the declared manifests and lock, install
dependencies, then rerun the failed gates, coverage and browser acceptance.

Additional measured evidence:

- `node --test --experimental-test-coverage --test-coverage-include=apps/web/src/lib/workspaceSummary.js tests/upgrade/workspace-summary.test.mjs`: 7/7 tests, 100% lines, branches and functions for the summary helper.
- The revenue test initially failed because JavaScript parses a null sync date as the Unix epoch. Requiring a nonempty string before date parsing fixed it. The same test then passed; unknown/pending sources never count as reported amounts.
- `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`: 174 frontend modules parse; no undefined-binding or duplicate-key findings. This limited ESLint core check is not repository lint, React execution, coverage or a browser test.
- The initially attempted Bun no-bundle parser could not write its output (`ENOENT`). The reproducible ESLint core checker above supplies the syntax check without claiming a successful bundle.
- Existing Python mypy/collector-coverage results from the initial upgrade remain historical evidence; they are not newly claimed frontend coverage.

Not verified: actual Vitest results or frontend coverage, application browser
behavior, mobile and keyboard acceptance, native PocketBase hooks, production
Datadog/RUM/DORA or deployment. The Node PocketBase suites use JSVM contract
doubles. No live workspace, seat-event publication or external service activation
was performed.

## §4 MEMORY INGEST

Type A count: 111
Type B count: 167
Type C count: 9
IOO compliance: true
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

File vectors cover the cumulative source diff. Relationship vectors match CGRF
headers exactly. Prior events retain their timestamps; continuation events record
observed checks and the unresolved environment failure. Events preceding the
current commit have null commit_sha. No memory endpoint was called.

## §5 CKET FILING

04_HYPOTHESIZE: umbrella and telemetry specs, SRS registry.
07_BUILD: public/workspace UI, shared data selectors, account isolation and existing telemetry adapters.
08_TEST: public, workspace, component, account-isolation and Node/Python suites.
11_COMMIT: context, task table, report/memory, offline source verifier, build/CI tools and existing handoff.
13_SAVE: none.

These application/test paths follow the actual BuildAndDo AGENTS.md and public
path policy. CGRF headers: 50/50 files new since the original
base, including sibling metadata for JSON and PNG. The continuation adds
7 new files. Existing provenance is preserved.
REFLEX validation remains on the private post-merge plane.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: PASS; zero public-boundary failures
Secret scan: PASS; zero scanner failures
Stripe mode: not applicable; no checkout or payment processing added
Actor label: actor:agent required; provider application remains a PR check
Risk / authority: A1 local source and review; no deployment or shared mutation

No collection or access rule was added or relaxed. No contact-delivery service,
external payment connector or automation runner was invented. The existing
private PocketBase telemetry activation handoff remains separate from source
implementation.

## §7 NEXT ACTIONS

Blockers: restore frontend dependencies and reconcile the baseline lock on a
registry-enabled runner; run Vitest/coverage, official lint, build and browser
acceptance. Native PocketBase/Datadog activation still needs its owner plane.
Handoffs requested: IDE1 — .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md.
Suggested next dispatch: dependency-enabled acceptance of this dispatch; the
operator supplies any new dispatch ID.
Bugs filed: none; no issue target was supplied and provider writes are unavailable.
Pre-existing unregistered COMMUNITY/WITNESS specs and unwired operational gates
remain visible in agent_context.py.
