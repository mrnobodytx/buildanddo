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
Tasks: 4/10 acceptance gates complete; source implementation covers all eight requested areas
Smoke: 4/7
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 0 (this evidence artifact describes the working tree before its publishing commit)

The owner explicitly authorized this single-PR umbrella, the new registry entry
and dispatch, and implementation of the four previously proposed telemetry specs.
Registry/spec statuses remain in progress. Delivery and TEVV are not claimed.

## §2 TASK RESULTS

| Task | Status | Output | Verify | Files / CKET |
|---|---|---|---|---|
| A — Scope and dispatch | PASS | Umbrella spec, registered scope and owner task table | `python scripts/ci/agent_context.py --check` | .bits/srs/, .bits/queue/, registry; 04_HYPOTHESIZE / 11_COMMIT |
| B — Public pages | PARTIAL | Pricing, About/Team, Docs, Blog and Contact; public and mobile navigation | `npm --prefix apps/web test` | apps/web/src/pages/, components/site/; 07_BUILD |
| C — Component coverage | PARTIAL | Ten new Vitest suites cover all workspace routes, public flows, save/retry, themes and keyboard access; 80% thresholds on new feature modules | `npm --prefix apps/web run test:coverage` | apps/web/src/**/__tests__/; 08_TEST |
| D — Route loading | PARTIAL | Every page is lazy, with accessible Suspense feedback and a persistent workspace shell | `npm --prefix apps/web run build` | App.jsx, RouteLoading.jsx; 07_BUILD |
| E — Mobile | PARTIAL | One working sidebar dialog, responsive toolbars/forms, bounded dialogs, wrapping content | Production preview at 320, 375 and 1280 px | WorkspaceLayout.jsx, shared controls and styles; 07_BUILD |
| F — Telemetry | PASS (adapters) | Real-result CRUD actions/timing, per-page errors, supply reporting, shared release identity and opt-in PB hooks | `node --test tests/upgrade/*.test.mjs` and `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | apps/pocketbase/pb_hooks/, browser observability, scripts/ci/, public workflows; 07_BUILD / 11_COMMIT |
| G — SEO | PASS (generator) | Nine public routes in sitemap/robots; crawler-readable social heads, canonical URLs, JSON-LD and a local social image | `node --test tests/upgrade/build.test.mjs` | publicPages.js, generate-seo.mjs, public/; 07_BUILD / 11_COMMIT |
| H — Theme | PARTIAL | Persisted system/light/dark selection in Header and Settings; paper, auth and workspace tokens; 14 text pairs pass 4.5:1 | `python -m unittest discover -s tests/upgrade -p 'test_theme_contrast.py'`; Vitest theme suite and preview still required | ThemeControls.jsx, index.css, SettingsPage.jsx; 07_BUILD / 08_TEST |
| I — Accessibility | PARTIAL | Skip link, labeled controls, focus-visible styling, dialog focus return, sidebar keyboard tests | `npm --prefix apps/web test`; keyboard preview still required | navigation and dialog components; 07_BUILD / 08_TEST |
| J — Evidence and handoff | PASS | Reproducible memory validator, evidence report and IDE1 activation handoff | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; public boundary check | .bits/out/, .bits/handoffs/; 11_COMMIT |

Route coverage exposed and repaired existing undefined Capability Passport routing
and Roadmap form bindings/duplicate declarations. Roadmap completion now requires
an evidence receipt. These fixes are required for the routes and workflows this
dispatch validates.

## §3 SMOKE TEST RESULTS

| # | Command | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `npm --prefix apps/web test` | Vitest suites pass | `vitest: not found` | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Repository lint passes | Missing eslint-plugin-import | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Lazy chunks and dist/apps/web/index.html | Vite executable absent | FAIL — environment |
| 4 | `node --test --experimental-test-coverage tests/upgrade/*.test.mjs` | Adapter suites pass | 15/15 pass; 99.61% lines, 94.19% branches across exercised source modules | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py' -v` | Python adapter/contrast suites pass | 18/18 pass, including 14 contrast subcases | PASS |
| 6 | `python scripts/ci/agent_context.py --check` | Measured lock current | Current measured lock; pre-existing findings retained | PASS |
| 7 | `python scripts/ci/verify_public_boundary.py` | Public boundary and secret scan clear | PASS; zero boundary/secret failures | PASS |

Failures 1–3 share one root cause: this sandbox has no installed frontend
node_modules and its offline cache cannot supply the missing packages.
`npm ci --offline --ignore-scripts` returns ENOTCACHED. The existing
package-lock.json also disagrees with the web dependency/devDependency manifests
and lacks eight declared packages: both Datadog browser SDKs, three Testing Library
packages, @vitest/coverage-v8, jsdom and vitest. This dispatch adds no npm dependency.

The real gate `python scripts/ci/supply_chain.py --skip-audit --check-lock`
correctly fails that existing drift. No audit ran against a registry; vulnerability
counts are unknown. No lock entries were invented, packages removed or gates
bypassed. The new build wrapper prints spawn failures, and CI now reports lock
agreement before installation. Dependency restoration remains unresolved: a
registry-enabled follow-up must refresh the lock using the declared manifests,
then run npm ci and the three failed gates plus test:coverage. A green install
alone is insufficient acceptance evidence.

Additional observed checks:

- `mypy --strict scripts/ci/supply_chain.py tests/upgrade/test_theme_contrast.py .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` passes.
- `python -m trace --count --summary --missing --coverdir /tmp/upgrade-python-coverage --module unittest discover -s tests/upgrade -p 'test_*.py'` reports 80% line coverage for the new supply collector. This is Python standard-library trace coverage, not pytest-cov or frontend coverage.
- `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` validates memory counts, file lines, CGRF relationships and IOO.
- `git diff --check` is clean.

Native PocketBase, production Datadog/RUM/DORA, application screenshots, mobile
viewport behavior and browser keyboard interaction were not verified here. Node
JSVM contract doubles execute the real hook source, but do not prove native hook
compatibility or ingestion. The social image was rasterized and visually checked;
that image is not evidence that the application works.

## §4 MEMORY INGEST

Type A count: 101
Type B count: 148
Type C count: 4
IOO compliance: true
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

File vectors cover every changed file. Relationship vectors match the CGRF
headers. Real local verification events are recorded with timezone-aware times;
commit_sha is null because the payload precedes the publishing commit. No memory
endpoint was called; ingestion stays in the dispatch/post-merge flow.

## §5 CKET FILING

04_HYPOTHESIZE: umbrella spec, referenced-spec status notes and registry.
07_BUILD: public pages, shared UI/theme, mutation adapters, PocketBase hooks and social assets.
08_TEST: public/workspace/component Vitest suites and Node/Python adapter suites.
11_COMMIT: build/CI generators, public workflows, task table, handoff and report/memory artifacts.
13_SAVE: none.

The actual BuildAndDo AGENTS.md authorizes these public application/test paths;
its React/Vite/PocketBase conventions take precedence over mirror-only defaults.
CGRF headers: 43/43 new files (JSON and PNG use sibling metadata).
REFLEX check: deferred to the private post-merge pipeline.
Existing CGRF owner, creation and SRS provenance is retained; changed action
relationship declarations now name the canonical CRUD vocabulary.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; license terms were not verified in this dispatch; commercial contact licensing@citadel-nexus.com
Hard-NO scan: PASS; zero boundary/secret failures
Secret scan: PASS; zero boundary/secret failures
Stripe mode: not applicable; no checkout or payment processing was added
Actor label: actor:agent required; provider application must be verified on the PR
Risk / authority: A1 local source and PR review; no deploy or shared mutation

No golden data, infrastructure, private evidence, credentials, signing code,
NATS bridge, host configuration or new deployment authority is introduced.
Existing public CI boundaries and the exactly-one-actor gate remain enforced.
The PB metrics sink is a handoff, not an active integration.

## §7 NEXT ACTIONS

Blockers: frontend dependency restoration/lock regeneration; frontend tests,
coverage, build and browser acceptance; native PB/sink verification on its owner plane.
Handoffs requested: IDE1 — .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md.
Suggested next dispatch: dependency-enabled acceptance for VCC-BUILDANDDO-UPGRADE-001;
assign the follow-up ID through the operator rather than manufacturing one here.
Bugs filed: none; no issue target was supplied and provider comment writes are unavailable.
Pre-existing out-of-scope findings: unregistered COMMUNITY/WITNESS specs and
unwired evidence/operational CI scripts remain visible in agent_context.py.

Before merge: regenerate the lock on a registry-enabled runner, obtain passing
web coverage/lint/build, confirm actor:agent, review a production preview in both
themes at mobile/desktop widths, exercise menus/dialogs with the keyboard and
verify real Datadog release/action events under the normal environment authority.

Rollback: revert the PR commit and rebuild. Theme preference is device-local.
The PB hooks default off and require no schema/data rollback. Turning off
BUILDANDDO_TELEMETRY_TRANSPORT stops their emissions independently of a code revert.
