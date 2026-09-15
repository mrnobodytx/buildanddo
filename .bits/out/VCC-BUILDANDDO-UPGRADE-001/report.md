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
Tasks: 10/21 acceptance gates complete; original upgrades, backend reuse, mission education and public Rig 1 handoff
Smoke: 4/7 application gates (retained mission evidence); 4/4 public Rig 1 handoff gates
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: 3 prior implementations (8a1c407d12e830a041a454d3bc668f4d94e104c9, c84008b5b0a1630d8543006b7529a7da1d7badd9, 9b69cb79429f551dda5629a18bc025dce8ced29b); Rig 1 handoff changes are not committed in this run

The original upgrade was merged through PR 19 on 2026-09-15. The owner then
requested reuse of backend functions from the signed-in sections. This report
covers the cumulative source and distinguishes measured checks from acceptance
that still needs the frontend dependencies. Merge is not evidence of TEVV.
The registered umbrella and dispatch remain in progress. PR 20 merged the backend reuse; the owner then requested guided mission building, NIST TEVV, OWASP, educational rewards and animation. No merge event is treated as validation evidence.

The Rig 1 continuation adds a public CMAX-B handoff. The managed repository
service refused to attach the private runtime to this public session. Runtime
implementation is blocked on a private primary-repository session and its own
execution dispatch. No private source, implementation readiness percentage or
runtime test result was verified here.

## §2 TASK RESULTS

| Phase | Status | Result | Verify | CKET |
|---|---|---|---|---|
| A — Register original scope | PASS | Eight-area umbrella, registry and owner dispatch | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT |
| B — Public pages | PARTIAL | Pricing, About, Docs, Blog, Contact and navigation | `npm --prefix apps/web test -- src/pages/__tests__/PublicPages.test.jsx` | 07_BUILD / 08_TEST |
| C — Component coverage | PARTIAL | Public/workspace interaction suites; 22 Vitest files inventoried; frontend execution remains blocked | `npm --prefix apps/web run test:coverage` | 08_TEST |
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
| O — Mission scope | PASS | Existing dispatch and registered umbrella extended with the owner’s mission request | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT |
| P — Mission data and policy | PARTIAL — local contracts pass | Optional fields, authenticated lifecycle enforcement, server-attributed approval/review, same-mission readable evidence; native runtime acceptance pending | `node --test tests/upgrade/mission-system.test.mjs` | 07_BUILD / 08_TEST |
| Q — Guided missions | PARTIAL — component execution unavailable | Purpose/safety/TEVV draft builder, explicit approval, evidence intake, review/failure paths, account isolation; shared how/why guidance | `npm --prefix apps/web test -- src/pages/workspace/__tests__/MissionsPage.test.jsx src/components/workspace/missions/__tests__/MissionFlow.test.jsx` | 07_BUILD / 08_TEST |
| R — Educational rewards | PARTIAL — selectors pass, browser acceptance pending | Bounded saved points, knowledge checks, worked example/review-coach bonuses, animation preference and reduced-motion CSS | `node --test tests/upgrade/mission-system.test.mjs`; mission component suite and browser checks | 07_BUILD / 08_TEST |
| S — Mission evidence | PASS with acceptance blockers recorded | Updated dispatch, source checks, report/memory and how/why documentation | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; context and boundary gates | 06_PLAN / 11_COMMIT |
| T — Rig 1 scope | PASS | Public handoff boundary registered under the existing SRS before writing the artifact | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT |
| U — Rig 1 handoff | PASS | CMAX-B requirements and acceptance cases for bridge selection, ingress, supervision, MCP and controlled MRs; private execution blocked | Handoff gates below | 11_COMMIT |

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

## §3 SMOKE TEST RESULTS

The application results below are retained from the committed mission revision.
This continuation changes only .bits governance/evidence and does not rerun or
upgrade the recorded frontend, browser or native-runtime acceptance claims.

| # | Command | Expected | Observed | Result |
|---|---|---|---|---|
| 1 | Targeted Vitest command below | Component/account/route suites pass | `vitest: not found` | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Repository lint passes | Missing eslint-plugin-import | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Vite emits the application bundle | `spawnSync vite ENOENT` | FAIL — environment |
| 4 | `node --test tests/upgrade/*.test.mjs` | Node suites pass | 42/42 pass | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Python adapter/contrast suites pass | 18/18 pass | PASS |
| 6 | `python scripts/ci/agent_context.py --check` | Measured context matches source | 22 Vitest files; 6 pre-existing findings, 4 unwired gates retained | PASS |
| 7 | `python scripts/ci/verify_public_boundary.py` | Public boundary clear | 415 files; zero failures; provider actor label not available locally | PASS |

The attempted targeted frontend command is reproducible as:

```bash
npm --prefix apps/web test -- src/pages/workspace/__tests__/MissionsPage.test.jsx src/components/workspace/missions/__tests__/MissionFlow.test.jsx
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

- `node --test tests/upgrade/mission-system.test.mjs`: 20/20 mission tests pass. The full Node regression is 42/42. Contract checks cover permissions, malformed/oversized JSON, unsaved approval, frozen targets, terminal states, foreign/unreadable evidence, reward repetition, unsigned exports and up/down migration behavior.
- `node --test --experimental-test-coverage --test-coverage-include=apps/web/src/lib/missionLearning.js --test-coverage-include=apps/pocketbase/pb_hooks/mission-policy.js --test-coverage-include=apps/pocketbase/pb_hooks/missions.pb.js --test-coverage-include=apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js tests/upgrade/*.test.mjs`: Node reports 100% lines/functions and 99.58% branches for the selected mission source. JSVM contract coverage does not establish native PocketBase compatibility or frontend component coverage.
- Red/green: a boolean `false` plan bypassed shape validation by being treated as a missing draft. Requiring `null` specifically fixed the failing malformed-plan assertion; the mission suite then passed.
- Red/green: evidence IDs `toString`, `constructor` and `__proto__` could collide with an object-based lookup cache. The dedicated rejection test failed before replacing the cache with a `Set`; it then passed. Reproduce with `node --test --test-name-pattern='prototype property names' tests/upgrade/mission-system.test.mjs`.
- Frontend component coverage was attempted separately and also stopped at `vitest: not found`. The new suites and 80% thresholds are authored but their results are not claimed.

Historical evidence retained from backend reuse:

- `node --test --experimental-test-coverage --test-coverage-include=apps/web/src/lib/workspaceSummary.js tests/upgrade/workspace-summary.test.mjs`: 7/7 tests, 100% lines, branches and functions for the summary helper.
- The revenue test initially failed because JavaScript parses a null sync date as the Unix epoch. Requiring a nonempty string before date parsing fixed it. The same test then passed; unknown/pending sources never count as reported amounts.
- `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`: 180 frontend modules parse; no undefined-binding or duplicate-key findings. This limited ESLint core check is not repository lint, React execution, coverage or a browser test.
- The initially attempted Bun no-bundle parser could not write its output (`ENOENT`). The reproducible ESLint core checker above supplies the syntax check without claiming a successful bundle.
- Existing Python mypy/collector-coverage results from the initial upgrade remain historical evidence; they are not newly claimed frontend coverage.

Not verified: actual Vitest results or frontend coverage, application browser
behavior, mobile and keyboard acceptance, native PocketBase hooks, production
Datadog/RUM/DORA or deployment. The Node PocketBase suites use JSVM contract
doubles. No live workspace, seat-event publication or external service activation
was performed.

Rig 1 handoff gates for this continuation: all four PASS. The public boundary
check includes 415 tracked files and the new handoff checked separately below.

| Gate | Command | Acceptance |
|---|---|---|
| Context | `python scripts/ci/agent_context.py --check` | Measured registry/context agree; existing six findings remain visible |
| Public boundary | `python scripts/ci/verify_public_boundary.py` plus the handoff scan below | Tracked source and the new untracked handoff satisfy the same policy and secret patterns |
| Memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | Current file counts, IOO and CGRF edges agree |
| Diff | `git diff --check` | No whitespace errors in the tracked diff |

The boundary CLI inventories tracked files (415 at the iteration baseline).
Before staging, scan the new handoff explicitly with the repository policy and
the scanner's actual secret patterns:

```bash
python - <<'PY'
import json
import runpy
from pathlib import Path

path = Path('.bits/handoffs/2026-09-15-bits-codegen-cmax-b-rig1-repo-loop.md')
policy = json.loads(Path('.buildanddo/public/path-policy.json').read_text())
scanner = runpy.run_path('scripts/ci/verify_public_boundary.py')
name = path.as_posix()
assert name.startswith(tuple(policy['public_allowed_prefixes']))
assert not any(name.lower() == p.rstrip('/').lower() or name.lower().startswith(p.lower()) for p in policy['public_forbidden_prefixes'])
assert path.name not in policy['forbidden_file_names']
assert all(not pattern.search(path.read_text()) for _, pattern in scanner['SECRET_PATTERNS'])
assert all(line == line.rstrip() for line in path.read_text().splitlines())
print('PASS: new handoff path and content satisfy the public boundary')
PY
```

The handoff supplies a reproducible public-source inventory and receiving-seat
test matrix. Its future private pytest selection is a requirement, not an
executed test result. No external seat message, queue delivery, runtime command,
GitLab write or installation occurred.

## §4 MEMORY INGEST

Type A count: 124
Type B count: 196
Type C count: 17
IOO compliance: true
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

File vectors cover the cumulative source diff. Relationship vectors match CGRF
headers exactly. Prior events retain their timestamps; continuation events record
observed checks and the unresolved environment failure. Events preceding the
current commit have null commit_sha. No memory endpoint was called.

## §5 CKET FILING

06_PLAN: docs/mission-system.md.
04_HYPOTHESIZE: umbrella and telemetry specs, SRS registry.
07_BUILD: public/workspace UI, guided mission components, mission policy/hooks/migration, data selectors, account isolation and telemetry adapters.
08_TEST: public/workspace/component/account suites, mission policy/migration/reward tests and Node/Python adapters.
11_COMMIT: context, task table, report/memory, offline source verifier, build/CI tools, PocketBase activation handoff and Rig 1 CMAX-B handoff.
13_SAVE: none.

These application/test paths follow the actual BuildAndDo AGENTS.md and public
path policy. CGRF headers: 62/62 files new since the original
base, including sibling metadata for JSON and PNG. The mission continuation adds
11 new files; the Rig 1 continuation adds one handoff with a 11_COMMIT header.
Existing provenance is preserved.
REFLEX validation remains on the private post-merge plane.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: PASS; zero public-boundary failures
Secret scan: PASS; zero scanner failures
Stripe mode: not applicable; no checkout or payment processing added
Actor label: actor:agent required; provider application remains a PR check
Risk / authority: A1 local source and review; no deployment or shared mutation

The mission migration adds optional fields to an existing collection. No collection or access rule was added or relaxed. Request hooks enforce mission invariants in addition to native authentication and rules. No contact-delivery service,
external payment connector or automation runner was invented. The existing
private PocketBase telemetry activation handoff remains separate from source
implementation.

## §7 NEXT ACTIONS

Blockers: restore frontend dependencies and reconcile the baseline lock on a
registry-enabled runner; run Vitest/coverage, official lint, build and browser
acceptance. Validate the mission migration, request hooks and permission failures on the actual pinned PocketBase runtime before activation. PocketBase/Datadog activation still needs its owner plane.
Handoffs requested: IDE1 — .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md.
CMAX-B — .bits/handoffs/2026-09-15-bits-codegen-cmax-b-rig1-repo-loop.md.
Rig 1 blocker: private data_dog_private session and execution dispatch; public
and private repositories cannot be attached to this same sandbox. Validate the
reported bridge-gap mismatch against private source before other runtime work.
Suggested next dispatch: dependency-enabled acceptance of this dispatch; the
operator supplies any new dispatch ID. Rig 1 runtime work needs a separate
private dispatch and source/test evidence before installation approval.
Bugs filed: none; no issue target was supplied and provider writes are unavailable.
Pre-existing unregistered COMMUNITY/WITNESS specs and unwired operational gates
remain visible in agent_context.py.

Mission rollback: revert UI and hooks together while retaining additive fields to
preserve plans/reviews. The explicit down migration deletes the new field data and
requires the deployment owner's retention decision. No shared rollback ran here.

Rig 1 handoff rollback: remove only the added handoff and this continuation's
governance/evidence entries. There is no runtime or external state to roll back
from this continuation. Private installation must supply its own durable-receipt
and side-effect reconciliation plan.
