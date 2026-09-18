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
#              CONSUMES docs/federal-foundry.md;
#              VALIDATES tests/upgrade/check_federal_foundry.py;
#              CONSUMES docs/field-interviewer-v1.3.md;
#              CONSUMES .bits/handoffs/2026-09-16-bits-codegen-cmax-b-field-interviewer.md;
#              VALIDATES .github/workflows/citadel-stack-telemetry.yml;
#              VALIDATES scripts/ci/emit_datadog_metrics.py;
#              VALIDATES tests/upgrade/test_datadog_metrics.py;
#              VALIDATES CONTRIBUTING.md;
#              VALIDATES .bits/handoffs/2026-09-16-bits-codegen-cmax-b-classrooms.md;
#              VALIDATES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json;
#              VALIDATES .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md;
#              VALIDATES .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md;
#              VALIDATES AGENTS.md;
#              VALIDATES apps/pocketbase/pb_hooks/classrooms.js;
#              VALIDATES apps/pocketbase/pb_hooks/classrooms.pb.js;
#              VALIDATES apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js;
#              VALIDATES apps/web/public/llms.txt;
#              VALIDATES apps/web/src/App.jsx;
#              VALIDATES apps/web/src/__tests__/AppRoutes.test.jsx;
#              VALIDATES apps/web/src/components/ProtectedRoute.jsx;
#              VALIDATES apps/web/src/components/auth/__tests__/LoginPage.test.jsx;
#              VALIDATES apps/web/src/components/auth/__tests__/ProtectedRoute.test.jsx;
#              VALIDATES apps/web/src/components/workspace/ProgressionPipeline.jsx;
#              VALIDATES apps/web/src/components/workspace/TutorialCatalog.jsx;
#              VALIDATES apps/web/src/components/workspace/WorkspaceLayout.jsx;
#              VALIDATES apps/web/src/components/workspace/__tests__/TutorialCatalog.test.jsx;
#              VALIDATES apps/web/src/hooks/__tests__/useClassrooms.test.jsx;
#              VALIDATES apps/web/src/hooks/useClassrooms.js;
#              VALIDATES apps/web/src/lib/classrooms.js;
#              VALIDATES apps/web/src/lib/datadogRum.js;
#              VALIDATES apps/web/src/lib/navigationIntent.js;
#              VALIDATES apps/web/src/lib/observability/config.js;
#              VALIDATES apps/web/src/lib/observability/runtime.js;
#              VALIDATES apps/web/src/lib/publicPages.js;
#              VALIDATES apps/web/src/lib/telemetry.js;
#              VALIDATES apps/web/src/pages/ClassroomLandingPage.jsx;
#              VALIDATES apps/web/src/pages/DocsPage.jsx;
#              VALIDATES apps/web/src/pages/LoginPage.jsx;
#              VALIDATES apps/web/src/pages/SignupPage.jsx;
#              VALIDATES apps/web/src/pages/__tests__/PublicPages.test.jsx;
#              VALIDATES apps/web/src/pages/workspace/ClassroomsPage.jsx;
#              VALIDATES apps/web/src/pages/workspace/__tests__/ClassroomsFlow.test.jsx;
#              VALIDATES docs/classrooms.md;
#              VALIDATES tests/upgrade/classroom-client.test.mjs;
#              VALIDATES tests/upgrade/classroom-fixture.mjs;
#              VALIDATES tests/upgrade/classroom-system.test.mjs;
#              VALIDATES tests/upgrade/test_classroom_native.py;
#              CONSUMES docs/blueprints.md;
#              VALIDATES tests/upgrade/check_blueprints.py;
#              VALIDATES tests/upgrade/check_decision_runtime.py;
#              CONSUMES docs/policy-intelligence.md;
#              VALIDATES tests/upgrade/check_policy_intelligence.py;
#              VALIDATES tests/upgrade/policy-intelligence.test.mjs;
#              CONSUMES .bits/handoffs/2026-09-18-bits-codegen-cmax-b-policy-intelligence.md;
#              CONSUMES docs/operator-plane.md;
#              CONSUMES .bits/handoffs/2026-09-18-bits-codegen-cmax-b-operator-plane.md;
#              VALIDATES tests/upgrade/test_operator_compiler.py;
#              VALIDATES tests/upgrade/operator-system.test.mjs;
#              VALIDATES tests/upgrade/operator-client.test.mjs;
#              VALIDATES apps/web/src/pages/workspace/__tests__/OperatorPage.test.jsx;
# DAG Node:    none
# Intent:      Distinguish implemented upgrade behavior from measured acceptance and blocked environment checks.
# ───────────────────────────────────────────────────────────────

# Dispatch implementation report

## Operator native acceptance and receiving handoff — 2026-09-18

### §1 SUMMARY

Status: PARTIAL — native acceptance is required and authored; installed and private runtime evidence remains open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-blueprint-phase-a-20260917-R9HXJV
Tasks: 2/3 accepted; native runtime execution remains partial
Smoke: 4/8 source/native/frontend groups
CKS Gate: not specified in the repository registry; CKS: pending
CAPS: pending; CK: pending
Source commits: 1 (e7969373867f07fd507386732ce579a09ffc4044)

The owner directed continued work in the attached repository. Four operator
cases now run inside the existing native suite CI matrix. They reuse the native
server lifecycle, auth and suite job protocol and inspect only disposable test
databases. Existing required check names remain stable. No private adapter,
dispatcher, runtime binding, provider credential or deployment was created.

### §2 TASK RESULTS

Task DX — Native operator acceptance
Status: PARTIAL
Output: Four new cases cover no-store/redacted read-only job snapshots, native
record visibility, current role/revocation, bounded pagination and missing stores.
A real fixture queue/claim transition is read through the operator endpoint;
read-only database fingerprints detect unintended work or receipt writes.
Verify: `python tests/upgrade/test_suite_native.py --require-binary`
Files: tests/upgrade/test_suite_native.py, .github/workflows/pr-governance.yml,
AGENTS.md, apps/web/src/components/workspace/ProgressionPipeline.jsx
CKET: 08_TEST, 11_COMMIT, 04_HYPOTHESIZE, 07_BUILD
The required command fails without PocketBase. All seven native suite/operator
cases skip under ordinary discovery; authored assertions are not native proof.

Task DY — Receiving scope and competition proof
Status: PASS for the public handoff
Output: The handoff records the managed provider's observed CNWB remote,
owner-supplied private dispatch/SRS, OP-00 inventory fields, one BuildAndDo
staging loop, distinct producer/verifier identities and the owner's merge hold.
Cultural Property and broader federal pursuits are deferred from that proof.
Verify: `rg -n 'gitlab.citadel-nexus.com/guilds/cnwb|VCC-BUILDANDDO-OPERATOR-RUNTIME-001|SRS-CN-BUILDANDDO-OPERATOR-RUNTIME-001|Merge hold|producer must differ' .bits/handoffs/2026-09-18-bits-codegen-cmax-b-operator-plane.md`
Files: docs/operator-plane.md, operator receiving handoff, current SRS/queue
CKET: 06_PLAN, 11_COMMIT, 04_HYPOTHESIZE
Private ref, registration/status, tenant/workspace, adapter inventory and live
readback remain unmeasured. The earlier attachment rejection was not retried.

Task DZ — Preserve measured acceptance
Status: PASS for available source evidence
Output: 347 Node cases pass; Python discovers 322 cases with 302 passing and
20 native skips. The focused operator subset passes 27 cases. Ruff, Python and
embedded-JavaScript syntax, 255-module source diagnostics and public governance
checks pass. All 110 earlier memory events are retained unchanged.
Verify: the commands and explicit limitations below
Files: measured context, dispatch report and memory
CKET: 04_HYPOTHESIZE, 11_COMMIT

### §3 SMOKE TEST RESULTS

| Check | Command | Expected | Actual |
| --- | --- | --- | --- |
| 1 | `node --test tests/upgrade/*.test.mjs` | Source cases pass | PASS: 347/347 |
| 2 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Source cases pass and native gaps are explicit | PASS for source: 302 pass, 20 skip, 0 failures/errors |
| 3 | `python scripts/ci/agent_context.py --check` | Measured lock matches | PASS; six pre-existing findings and four unwired gates remain |
| 4 | `python scripts/ci/verify_public_boundary.py` | Public path/secret boundary passes | PASS: 839 files; actor label not measured |
| 5 | `python tests/upgrade/test_suite_native.py --require-binary` | Native execution passes without skips | FAIL: PocketBase binary absent; exit 1 |
| 6 | `npm --prefix apps/web test -- src/pages/workspace/__tests__/OperatorPage.test.jsx src/pages/workspace/__tests__/MissionsPage.test.jsx src/pages/workspace/__tests__/BlueprintPage.test.jsx` | Rendered acceptance passes | FAIL: Vitest absent; exit 127 |
| 7 | `npm --prefix apps/web run lint` | Repository lint passes | FAIL: eslint-plugin-import absent; exit 2 |
| 8 | `npm --prefix apps/web run build` | Normal Vite artifact exists | FAIL: Vite ENOENT; exit 1 |

For check 5, no native binary or cached container image is available. The applied
source change places operator tests in the existing required native matrix for
both declared versions; it does not resolve local binary availability. Re-run
the same required command with its installed `BUILDANDDO_TEST_POCKETBASE` binding.

For checks 6–8, `npm ci --offline --ignore-scripts --no-audit --fund=false`
fails with ENOTCACHED because the lock's dependency archives are absent. The
manifest, lock and required gates remain intact. Provision the declared packages
in an allowed environment, then re-run the exact commands above. No network
installation, dependency substitute or source-only replacement is claimed.

Additional measured checks:

- `node --test tests/upgrade/operator-client.test.mjs tests/upgrade/operator-system.test.mjs`: 27/27 pass.
- `python -m ruff check tests/upgrade/test_suite_native.py` and `python -m ruff format --check tests/upgrade/test_suite_native.py`: PASS.
- `python -m py_compile tests/upgrade/test_suite_native.py`: PASS; the embedded fixture migration also passes Node syntax checking.
- `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`: PASS, 255 modules; this is not repository lint or rendered acceptance.
- The existing `dossier-native` CI matrix still invokes `test_suite_native.py --require-binary` for `compose` and `package`; four new operator methods are discovered. This source inspection is not a hosted matrix result.

The inspected PR head reports `Workers Builds: buildanddo` as failed, with zero
annotations and no diagnostic text. Datadog PR insights returns no analysis for
that head. No root cause or hosting fix is inferred from that missing evidence.
Build-generated fleet summaries remain the repository's historical projection;
running the asset generator does not measure current private fleet capacity.

### §4 MEMORY INGEST

Type A count: 555
Type B count: 1231
Type C count: 114
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

All 110 preceding events remain intact. Existing file vectors retain their
position; changed line counts, intent and declared dependencies are refreshed.
The native test adds two declared VALIDATES edges to the operator route and
projection. New events distinguish source passes from unavailable acceptance.

### §5 CKET FILING

06_PLAN: docs/operator-plane.md
04_HYPOTHESIZE: AGENTS.md, current SRS and measured context
07_BUILD: existing contribution-pipeline check description
08_TEST: existing native suite fixture and operator cases
11_COMMIT: existing CI step description, queue, receiving handoff, report, memory
13_SAVE: none
CGRF headers: no new repository files; existing native test dependencies/edges updated
REFLEX check: deferred to the existing post-merge owner

### §6 GOVERNANCE

Entity: Citadel Nexus Inc.
License posture: unchanged; no legal or licensing file modified
Hard-NO scan: no private implementation, infrastructure or deployment-control files added
Secret scan: public boundary passes; no private credential access
Stripe mode: not applicable; no checkout code changed
Actor: actor:agent required on publication; label application unverified
Authority: A2 public test/CI/docs source; disposable native fixture scope only
Verify boundary: `python scripts/ci/verify_public_boundary.py`

### §7 NEXT ACTIONS

Keep the branch on the owner's merge hold. Native/rendered acceptance, lint,
build, measured OP-00, one NXC read, the staging loop, distinct producer/verifier
receipts and public/private boundary evidence are all required. Source test
success does not clear the missing gates.

Use the supplied receiving SRS/dispatch in a GitLab-capable CNWB session with
observed ref, registered authority and permitted tenant/workspace. First return
OP-00, then prove one BuildAndDo evidence blocker through staging and UI readback.
No source body, credentials or procurement-sensitive material should enter the
public cockpit. No additional federal lane or private integration is implemented.

Handoff: .bits/handoffs/2026-09-18-bits-codegen-cmax-b-operator-plane.md
Bugs filed: none; no external messages were sent.

## Read-first operator continuation — 2026-09-18

### §1 SUMMARY

Status: PARTIAL — public operator review loop implemented; private connections and native/rendered acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-blueprint-phase-a-20260917-R9HXJV
Tasks: 5/5 public source phases addressed; OP-00–OP-09 receiving acceptance remains pending
Smoke: 4/7 dispatch gates pass; three frontend gates cannot start
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: source 26f73df57db15927a101fb8e86ad5d28317ab156; report/memory bookkeeping recorded separately
Verify source identity: `git log --format='%H %s' -- apps/federal_foundry/operator.py`

The Operator page reads scoped workspace decisions, ordinary work and dated
integration observations, with explicit source coverage. The existing foundry
compiler discovers reusable public source before proposing work, preserves the
Phase A extraction contract and prepares existing builder/verifier packets.
An explicit review proposal uses the native mission command and durable receipt.
Neither compilation nor import starts a worker, approves a plan or mints VERIFIED.

The first slice adds no dependency, document parser, queue, authority policy,
database collection or private control plane. The ten requested system categories
remain unknown where no current workspace observation supports their state.
Five catalog lanes have unverified deadlines; Cultural Property's official notice
and the intended six-opportunity inventory have not been supplied. Prepared tasks
and example capacity figures do not establish actual dispatch or readiness.

### §2 TASK RESULTS

Task DS — Inspect existing owners
Status: PASS for repository scope
Output: Reused research extraction, the federal catalog/protocol, suite archive,
current workspace membership and native mission receipts.
Verify: `python scripts/ci/agent_context.py --check`
Files: existing SRS/queue, docs/operator-plane.md, receiving handoff
CKET: 04_HYPOTHESIZE, 06_PLAN, 11_COMMIT

Task DT — Compile source-backed operator blueprints
Status: PASS for source
Output: Eight capability groups, five unverified deadlines and ten prepared task
packets, with zero hosted dispatches. Optional extraction remains unchanged.
Verify: `python tests/upgrade/check_federal_foundry.py`
Verify: `python -m apps.federal_foundry operator --output /tmp/operator-review-new`
Files: apps/federal_foundry/operator.py, existing CLI/archive, compiler tests
CKET: 07_BUILD, 08_TEST

Task DU — Read bounded workspace state
Status: PASS for source; native acceptance open
Output: Independently paged, currently authorized summaries; standalone workflow
approvals remain visible; missing/stale/future observations cannot become health.
Verify: `node --test tests/upgrade/operator-system.test.mjs`
Files: operator.pb.js, workspace-operator.js, backend tests/fixture
CKET: 07_BUILD, 08_TEST

Task DV — Review, export and propose
Status: PARTIAL — client behavior verified; rendered acceptance unavailable
Output: Human decisions precede ordinary work; the existing blueprint page exports
raw extraction for compilation. Imported proposals retain integrity and provenance.
Proposal retries and unchanged recompilation recover one native mission.
Verify: `node --test tests/upgrade/operator-client.test.mjs tests/upgrade/blueprint-client.test.mjs`
Verify: `npm --prefix apps/web test -- src/pages/workspace/__tests__/OperatorPage.test.jsx src/pages/workspace/__tests__/MissionsPage.test.jsx src/pages/workspace/__tests__/BlueprintPage.test.jsx`
Files: operator page/client, blueprint export, mission selection, routes and tests
CKET: 07_BUILD, 08_TEST

Task DW — Preserve evidence and receiving scope
Status: PASS for available public evidence; private work pending
Output: Current regression, coverage, typing, provenance and boundary checks;
all 104 earlier memory events retained exactly. OP-00–OP-09 identify receiving work.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`
Files: report, memory, measured context, queue, SRS, docs and receiving handoff
CKET: 04_HYPOTHESIZE, 06_PLAN, 11_COMMIT

### §3 SMOKE TEST RESULTS

| Gate | Command | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| 1 | `npm --prefix apps/web test` | Rendered tests execute | Exit 127: Vitest absent | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Repository ESLint executes | Exit 2: eslint-plugin-import absent | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Vite produces the web bundle | Exit 1: spawnSync vite ENOENT | FAIL — environment |
| 4 | `node --test tests/upgrade/*.test.mjs` | All source cases pass | 347 pass, zero skips/failures | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Source regression has no failures | 318 discovered: 302 pass, 16 native dependency skips | PASS for available source |
| 6 | `python scripts/ci/agent_context.py --check` | Lock matches repository | Pass; six existing findings/four unwired gates retained | PASS |
| 7 | `python scripts/ci/verify_public_boundary.py` | No boundary or secret findings | Pass across 839 tracked files; actor label not queried | PASS |

The final Node run also enabled the built-in coverage flag for the operator
backend/client and blueprint client. All three have 100% line coverage; branch
coverage is 92.50%, 96.60% and 91.28%, respectively. The 27 operator cases execute
actual hooks against explicit storage/transport doubles and real Python compiler
output; they do not establish native PocketBase acceptance.

`python tests/upgrade/check_federal_foundry.py` passes all 66 cases, including 26
operator cases, without skips. Compiler statement coverage is 349/351 (99.43%);
the CLI is 95/97 (97.94%). Existing foundry modules range from 99.5–100%.
The trace report makes no Python branch-coverage claim. The suite archive test
compiles after extraction without the checkout on its import path.

The final CLI publication and JS import smoke inspected eight capabilities,
five unknown deadlines and ten prepared packets; both output manifest hashes
matched retained bytes and the browser accepted the plan. Zero hosted dispatches,
live model calls, campaign runs or actual workspace commands were performed.
The compiler's native Linux no-replace publication ran successfully here.

Strict mypy passes seven source files:
`python -m mypy --strict --follow-imports=silent --explicit-package-bases apps/federal_foundry apps/mission_suite/bundle.py`.
Ruff passes the changed Python source/tests:
`python -m ruff check apps/federal_foundry/operator.py apps/federal_foundry/__main__.py apps/mission_suite/bundle.py tests/upgrade/test_operator_compiler.py tests/upgrade/check_federal_foundry.py`.
The existing source diagnostic,
`node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`, parses 255 modules
with zero static errors. These checks do not replace repository ESLint, browser
rendering or a production build.

Fourteen new operator rendered cases and two mission-link cases remain unrun;
the existing blueprint rendered case now also checks raw extraction export.
The native skips retain the previously absent pypdf/PocketBase requirements.
No dependency was downloaded or replaced to turn an unavailable check green.
For each of smoke failures 1–3, the remedy is to provision the repository's
existing locked dependencies in the authorized validation environment and rerun
the same command above. No source workaround was applied. Root npm wrappers also
cannot start because concurrently is absent; the direct web commands expose the
underlying dependency failures.

Targeted red/green evidence:

- Standalone workflows were incorrectly made dependent on a mission; mixed
  standalone/linked approval cases now retain both native scopes.
- Future-created seat events no longer enter current change/activity projections.
- Operator mission links now resolve only against the existing readable list;
  they cannot approve, fetch a foreign mission or trigger a transition.
- A shaped but elevated success response formerly exhausted the inner receipt
  while blocking the outer retry state. Refresh and reproposal now recover the
  same native mission instead of leaving a stuck wrapper or creating a duplicate.
- A role downgraded during a snapshot formerly returned the original editor
  role. A failing-then-passing test now observes the final viewer role.
- Public-path reservation could adopt a concurrent symlink or real directory.
  Publication now atomically moves a complete, bound private candidate with
  Linux renameat2(RENAME_NOREPLACE). Tests retain foreign files/directories,
  verify the published inode and fail closed when atomic support is unavailable.

Recheck those regressions with the operator Node suites and
`python -m unittest discover -s tests/upgrade -p test_operator_compiler.py`.
Independent review confirmed the publication, receipt-recovery and final-role
findings were addressed; it did not perform native or rendered acceptance.

### §4 MEMORY INGEST

Type A count: 555
Type B count: 1229
Type C count: 110
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
History: all 104 preceding Type C vectors retained exactly
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

### §5 CKET FILING

06_PLAN: operator documentation and existing blueprint/foundry instructions
04_HYPOTHESIZE: existing upgrade SRS acceptance
07_BUILD: existing foundry/archive extensions, workspace hook, browser client/page and route integration
08_TEST: compiler, hook/client, export and rendered interaction cases
11_COMMIT: queue, measured context, receiving handoff, report and memory
13_SAVE: none
CGRF headers: 12/12 new repository files have matching owner, SRS, dispatch, intent, relationships and pending stamps
REFLEX check: deferred to the existing post-merge owner

Stage values follow this repository's public application conventions. The local
dispatch verifier checks file counts, provenance, IOO and declared relationships.

### §6 GOVERNANCE

Entity: Citadel Nexus Inc.
License posture: unchanged; no legal or licensing file modified
Hard-NO scan: no forbidden/private/deployment-control paths added
Secret scan: public-boundary scan passes; no credential access performed
Stripe mode: not applicable; no checkout code changed
Actor: actor:agent required on publication; no label application claimed
Authority: source A2; compiled plan A0; native proposed mission retains its normal incomplete A1 default until the existing plan/approval workflow
Verify boundary: `python scripts/ci/verify_public_boundary.py`

### §7 NEXT ACTIONS

Blockers: actual private repository/ref/paths and receiving dispatch for NXC,
Sentinel, telemetry/cloud readers and fleet/model dispatch; official Cultural
Property notice, amendments, permitted datasets and opportunity deadlines;
provisioned native/backend/frontend acceptance environment.
Handoff requested: CMAX-B with IDE1 coordination in
.bits/handoffs/2026-09-18-bits-codegen-cmax-b-operator-plane.md.
Suggested next dispatch: receiving owner assigns an ID for OP-00–OP-09; no
private dispatch is created or represented as approved here.
Bugs filed: none externally; existing context findings are retained without
unrelated repairs or messages.

Rollback removes the public source feature through normal review while retaining
created mission proposals and command receipts. No database rollback is needed.
The portable source fingerprint changes; private bindings remain fenced until
their normal authorized update. Production deployment, external email, proposal
submission, financial commitments, credentials, destructive actions and contract
attestations still require explicit human approval in the receiving process.

## Policy intelligence public continuation — 2026-09-18

### §1 SUMMARY

Status: PARTIAL — public domain pack and review consumer implemented; private Sentinel and rendered acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-blueprint-phase-a-20260917
Tasks: 5/5 public source phases addressed; PI-00–PI-10 receiving acceptance remains pending
Smoke: 4/7 dispatch gates pass; three frontend commands cannot start
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: source 9a683567aac0414bc245760f868abe096355557c; report/memory bookkeeping recorded separately
Verify source identity: `git log --format='%H %s' -- apps/research/policy`

BuildAndDo can now import bounded policy observations, review exact sources and
corrections, match tenant watches, assemble a daily brief and explicitly propose
a source-review mission. The compiler extends the existing research Processor
and strict JSON contracts. The consumer reuses native workspace authorization
and the existing replayable research command. It adds no dependency, migration,
authority rule, provider client, broker, graph database or delivery transport.

OBSERVED, ATTRIBUTED, ANALYZED and UNRESOLVED remain separate source annotations.
Hashes establish retained bytes, not authenticity, correctness or verification.
All candidate delivery is `not_connected`; proposals cannot approve or execute
work. The reproducible small-business scenario is synthetic and cannot write
missions. A local import is not a live feed or an authenticated Sentinel export.

The owner's intended `sentinel.citadel-nexus.com/policy` route and private
`services/policy_intelligence/` integration are not present in this checkout.
The actual repository/path and receiving dispatch were requested. The handoff
defines dependent work against the existing private owners rather than inventing
runtime interfaces. No government fetch, email, NATS event, private service,
deployment, shared seat event or procurement response was performed.

### §2 TASK RESULTS

| Task | Status | Output | Verify | Files / logical CKET stage |
|---|---|---|---|---|
| DN — reuse and scope | PASS | Existing A2 dispatch extended before code; research, mission and Sentinel handoff boundaries inspected | `python scripts/ci/agent_context.py --check` | SRS, queue and context; 04_HYPOTHESIZE / 11_COMMIT |
| DO — reusable domain pack | PASS for source | Strict neutral observations, quoted graph edges, correction/conflict history, literal watches, candidates and bounded daily briefs | `python tests/upgrade/check_policy_intelligence.py` | apps/research/policy and Python tests; 07_BUILD / 08_TEST |
| DP — BuildAndDo consumer | PASS for source; rendered acceptance pending | Account/workspace-scoped imports, source/category/search views, temporary bookmarks, watch edits, export and explicit replayable review proposals | `node --test tests/upgrade/policy-intelligence.test.mjs` | PolicyPage, policy client, route/navigation, demo and tests; 07_BUILD / 08_TEST |
| DQ — receiving integration contract | PASS for public artifact; private execution blocked | PI-00–PI-10 cover discovery, sources, canonical bus, graph/search, verification, Sentinel views, delivery, mission outcome and telemetry | `rg -n 'PI-0[0-9]|PI-10|Blocking input' .bits/handoffs/2026-09-18-bits-codegen-cmax-b-policy-intelligence.md` | docs and CMAX-B/IDE1 handoff; 06_PLAN / 11_COMMIT |
| DR — measured acceptance and retained history | PASS for available evidence | Source regression, coverage, typing, provenance and boundary evidence; all preceding events retained | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | report, memory and lock; 11_COMMIT |

### §3 SMOKE TEST RESULTS

| # | Command | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `npm --prefix apps/web test -- --run src/pages/workspace/__tests__/PolicyPage.test.jsx` | Six rendered policy cases pass through the dispatch's web test entry point | Cannot start: `vitest: not found` | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Repository lint passes | Cannot load `eslint-plugin-import` | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Vite produces the web bundle | `Unable to start Vite: spawnSync vite ENOENT` | FAIL — environment |
| 4 | `node --experimental-test-coverage --test-coverage-include=apps/web/src/lib/policyIntelligence.js --test tests/upgrade/*.test.mjs` | All source regressions pass | 319 passing; no failures or skips | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Available Python regressions pass | 292 discovered; 276 passing, 16 native dependency skips | PASS with skips |
| 6 | `python scripts/ci/agent_context.py --check` | Measured context matches | Match; six existing findings and four unwired gates remain | PASS |
| 7 | `python scripts/ci/verify_public_boundary.py` | No public-boundary failures | 827 tracked files; zero failures | PASS |

For failures 1–3, the root cause is unavailable existing frontend packages. No
manifest, dependency version or gate was changed to bypass them; no runtime fix
was applied. Repeat the same commands in the provisioned dependency environment,
including the full `npm --prefix apps/web test` dispatch gate. Static source
parsing and Node fixtures do not establish rendering, browser interaction,
package resolution or a successful bundle. No screenshot or hosted observation
is represented as validation.

Additional observed checks:

- `python tests/upgrade/check_policy_intelligence.py`: 26/26 passing with no
  skips. The Processor test uses an explicit Firecrawl response fixture. The
  gate records per-module trace statement coverage in
  `reports/coverage/policy-intelligence.json`; Python branch coverage is not
  measured. pytest and coverage.py are not installed.
- `node --test tests/upgrade/policy-intelligence.test.mjs`: 15 passing tests
  compare Python/browser projections and exercise actual existing PocketBase
  handlers through the repository's transactional storage fixture. Covered
  cases include malformed/foreign packs, byte tampering, inert hostile text,
  source correction/conflict lineage, watch windows, daily cadence, current-role
  revocation, uncertain responses and proposal recovery. No native PocketBase
  or live account is inferred from the fixture.
- Selected browser client coverage under the full Node command: 100.00% lines,
  95.28% branches and 100.00% functions. This does not measure PolicyPage rendering.
- `python -m mypy --strict --follow-imports=silent --explicit-package-bases apps/research/policy`:
  all four new Python modules pass. Checking imported modules without the scoped
  option exposed 12 pre-existing diagnostics in scripts/ci/evidence_epoch.py;
  they were not changed and full imported-tree typing is not claimed.
- `python -m ruff check apps/research/policy tests/upgrade/test_policy_intelligence.py tests/upgrade/check_policy_intelligence.py`:
  passes after removing two unused test imports. The same six files were
  formatted with Ruff. Formatting is not behavioral acceptance.
- `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`: 252 modules
  parsed with zero static errors. The existing CI discovery commands include
  the new Node and Python suites without a workflow or gate change.
- `python -m apps.research.policy demo --output /tmp/buildanddo-policy-review-final-20260918`:
  observed successful four-file standalone bundle, five synthetic observations,
  four current observations and eight review candidates. policy.json exactly
  matches apps/web/src/data/policy-demo.json. Choose a new output directory on
  rerun; overwriting is intentionally rejected. Tests also compare two fresh
  bundles byte-for-byte and verify every manifest file hash.

| New Python module | Covered / executable statement lines | Coverage |
|---|---:|---:|
| apps/research/policy/__main__.py | 78 / 79 | 98.73% |
| apps/research/policy/contracts.py | 261 / 263 | 99.24% |
| apps/research/policy/demo.py | 64 / 64 | 100.00% |
| apps/research/policy/pipeline.py | 286 / 288 | 99.31% |

The proposal-recapture regression was observed red and then green. Unchanged
source content kept its candidate key, but its changed capture timestamp in the
saved mission description caused the native command to reject a retry. The
description now uses stable content identity and leaves capture timestamps and
derived conflict state in the reviewed packet. Reimport, reload and unchanged
recapture recover the original mission; changing content or watch scope creates
a distinct candidate. The runnable regression is the Node case named
`unchanged recrawls` in policy-intelligence.test.mjs.

An earlier negative watch test assumed that empty keywords alone made a watch
invalid even when entity filters were present. The test was corrected to clear
both match groups; the permitted entity-only behavior was preserved. The final
brief test distinguishes source truncation from shortening an excerpt for display.

### §4 MEMORY INGEST

Type A count: 543
Type B count: 1179
Type C count: 104
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Prior history: all 98 preceding Type C events preserved without modification
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

The new events distinguish implemented public source, observed fixture checks,
missing frontend dependencies and unexecuted private integration. No CK, CAPS,
live-source, reviewer, delivery or procurement result is manufactured.

Reproduce the history-preservation check against the iteration baseline:

```bash
python - <<'PY'
import json
from pathlib import Path
import subprocess
path = '.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json'
before = json.loads(subprocess.check_output(['git', 'show', 'ae581666589e047021fc09fb63676ec93e02fc8a:' + path], text=True))
after = json.loads(Path(path).read_text())
prior = [entry for entry in before['vectors'] if entry['type'] == 'C']
current = [entry for entry in after['vectors'] if entry['type'] == 'C']
assert len(prior) == 98 and current[:98] == prior
print('PASS: all 98 prior events retained.')
PY
```

### §5 CKET FILING

06_PLAN: docs/policy-intelligence.md
04_HYPOTHESIZE: existing SRS and measured context updated
07_BUILD: public research policy modules, workspace consumer and synthetic demo
08_TEST: Python/Node/rendered test sources and statement-coverage checker
11_COMMIT: queue, receiving handoff, report and memory
13_SAVE: none
CGRF headers: 15/15 new files; JSON uses its sibling .cgrf.yaml
REFLEX check: deferred to the existing post-merge owner

Stage values follow this repository's public application conventions. Every new
file declares its SRS, dispatch, pending stamps, owner, intent and relationships.
The dispatch verifier checks the retained vector/edge declarations and line counts.

### §6 GOVERNANCE

Entity: Citadel Nexus Inc.
License posture: unchanged; no legal or licensing file modified
Hard-NO scan: no forbidden paths or private/deployment-control files added
Secret scan: repository public-boundary scan passes; no secret access performed
Stripe mode: not applicable; no checkout code changed
Actor: actor:agent required on PR publication; no label application claimed
Authority: source A2; imported observations and mission proposals remain unverified
Verify boundary: `python scripts/ci/verify_public_boundary.py`

### §7 NEXT ACTIONS

Blockers: actual Sentinel repository/ref/paths, existing adapter owners and
receiving dispatch; provisioned frontend and native runtime acceptance.
Handoff requested: CMAX-B with IDE1 coordination in
.bits/handoffs/2026-09-18-bits-codegen-cmax-b-policy-intelligence.md.
Suggested next dispatch: receiving owner assigns an ID for PI-00–PI-10; none
was created or represented as approved by this public session.
Bugs filed: none; pre-existing imported typing/context findings were retained
without an external message or unrelated repair.

Private acceptance must mount Sentinel, ingest actual approved official sources,
bind the existing bus/NXC/DKG/FTS/FAISS owners, verify source and interpretation,
persist watches/bookmarks/shares, produce consented delivery receipts and follow
a real signal through review, evidence and independently verified outcome.
No local demonstration resolves those requirements. Rollback removes the public
route/consumer; it must retain any user-created missions and native audit records.

## Blueprint Phase A source continuation — 2026-09-17

### §1 SUMMARY

Status: PARTIAL — Phase A source implemented; native PDF/PocketBase and rendered UI acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: bits/SRS-BUILDANDDO-UPGRADE-001-blueprint-phase-a-20260917
Tasks: 5/5 source phases addressed; native and rendered acceptance pending
Smoke: 4/7 dispatch gates pass; three frontend commands cannot start
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: source c1d8d9d621caf776c92edef100f5c3f6afde9159; follow-up report/memory bookkeeping is recorded separately
Verify source identity: `git log --all --format='%H %s' -- apps/research/blueprints.py`

Specification PDFs previously produced only a flat research excerpt. Workspace
editors can now upload a PDF, follow its existing research job, inspect extracted
requirements and dependencies, review advisory BDR assessments, and download a
proposed mission or challenge definition. The structured result retains source
SHA-256, section/context provenance, parser version, page count, timestamp,
confidence, unresolved questions and truncation. The text-first extractor adds
no model or Python dependency and leaves documents.py unchanged.

The POST endpoint returns a queued receipt and GET returns completed observations.
This preserves the protected upload store, leased Python worker and PocketBase
authorization already used by mission research. A0 results cannot mint VERIFIED;
the current default decision rules abstain on this workload, so unknown scores
remain null and the page displays “Needs review.” Proposal export creates a local
JSON file; it does not create, approve or execute a mission.

All production changes passed the available source and regression checks. The
native PDF/backend and seven rendered UI cases are authored but cannot execute
with the packages available in this sandbox. Source completion is not hosted or
native acceptance. No live workspace, model endpoint or deployment was changed.

### §2 TASK RESULTS

| Task | Status | Output | Verify | Files / logical CKET stage |
|---|---|---|---|---|
| DI — reuse and authority | PASS | Existing in-progress A2 research/workspace scope recorded before implementation | `python scripts/ci/agent_context.py --check` | SRS, dispatch and context; 04_HYPOTHESIZE / 11_COMMIT |
| DJ — parser and A0 assessment | PASS for source | Stable/existing requirement IDs, MoSCoW/type inference, section provenance, bounded topology, flat fallback and five typed decisions per requirement | `python tests/upgrade/check_blueprints.py` | research extension and decision workload; 07_BUILD / 08_TEST |
| DK — persistent workspace flow | PASS for source | Scoped multipart intake, protected download, shared queue, atomic completion, retry/cancel and saved retrieval | `node --test tests/upgrade/blueprint-system.test.mjs` | PocketBase hooks/migration and connected worker tests; 07_BUILD / 08_TEST |
| DL — review and proposal export | PASS for source; rendered acceptance pending | Route/navigation, upload/status, context, dependencies, advisory scores and account/workspace isolation | `node --test tests/upgrade/blueprint-client.test.mjs` | workspace client/page and tests; 07_BUILD / 08_TEST |
| DM — evidence and regression | PASS for available evidence | Source checks, preserved history, context and boundary reports; missing native/UI gates explicitly retained | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | report/memory/guide; 06_PLAN / 11_COMMIT |

### §3 SMOKE TEST RESULTS

The following is the existing dispatch smoke block, with no failed check counted
as a pass. A storage/transport double is not a running PocketBase instance.

| # | Command | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | `npm --prefix apps/web test` | Rendered web suite passes | Cannot start: `vitest: not found` | FAIL — environment |
| 2 | `npm --prefix apps/web run lint` | Repository lint passes | Cannot load `eslint-plugin-import` | FAIL — environment |
| 3 | `npm --prefix apps/web run build` | Vite writes the web bundle | `Unable to start Vite: spawnSync vite ENOENT` | FAIL — environment |
| 4 | `node --test tests/upgrade/*.test.mjs` | All source regressions pass | 304 passing, no failures or skips | PASS |
| 5 | `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Available Python regressions pass | 266 discovered, 250 passing, 16 native dependency skips | PASS with skips |
| 6 | `python scripts/ci/agent_context.py --check` | Measured context matches | Match; six existing findings and four unwired gates remain | PASS |
| 7 | `python scripts/ci/verify_public_boundary.py` | No public-boundary violations | 812 tracked files, no failures | PASS |

For failures 1–3, the root cause is unavailable frontend dependencies. No package
version or dependency manifest was changed to work around them. There is no
applied runtime fix in this source session. The new verify commands are the same
commands above in the existing provisioned dependency environment; use
`npm --prefix apps/web test -- --run src/pages/workspace/__tests__/BlueprintPage.test.jsx`
for the seven focused rendered cases. The source diagnostic below does not stand
in for these commands.

Additional observed checks:

- `python tests/upgrade/check_blueprints.py`: 50 passing, five dependency skips.
  The real Processor/Worker path is exercised through the existing Node handler
  and transactional storage fixture, including a lost completion response and a
  source-hash mismatch. The sample PDF has valid cross-reference offsets; native
  text extraction is explicitly deferred because pypdf is absent.
- `node --test tests/upgrade/blueprint-*.test.mjs`: 12 backend and eight connected
  client cases are included in the passing 304-case regression. These cover role
  revocation, cross-workspace and guest denial, upload/lease/retry identity,
  locked native APIs, result validation, rollback, proposal export and inert
  source markup. They do not claim a real JSVM or rendered browser session.
- `python tests/upgrade/check_decision_runtime.py`: 49 passing, two native PDF
  skips. All six decision modules clear the existing statement-coverage gate.
- `python tests/upgrade/check_discordbot.py --include-research`: 137 passing,
  four skips; every measured module clears 80% statement coverage, ranging from
  88.27% to 100%. The blueprint tests are included in the existing research gate.
- `mypy --strict --explicit-package-bases apps/research/blueprints.py apps/research/processing.py apps/research/contracts.py apps/research/worker.py apps/decision/workloads/blueprint_evaluation.py`:
  passes for all five changed production modules.
- `ruff check apps/research apps/decision/workloads/blueprint_evaluation.py tests/upgrade/blueprint_fixture.py tests/upgrade/test_blueprints.py tests/upgrade/test_blueprints_native.py tests/upgrade/check_blueprints.py`:
  passes.
- `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`: 249 JS/JSX modules
  parse without static errors. This checks syntax and bindings, not rendering,
  package resolution or repository lint.
- `python -m unittest discover -s tests/upgrade -p test_blueprints.py`: after
  finalizing the binary fixture, 26 passing and two native PDF skips. The binary
  comment prevents text-line conversion from invalidating PDF byte offsets.

| Changed Python module | Covered / executable statement lines | Coverage |
|---|---:|---:|
| apps/research/blueprints.py | 311 / 339 | 91.74% |
| apps/research/processing.py | 138 / 156 | 88.46% |
| apps/research/contracts.py | 116 / 118 | 98.31% |
| apps/research/worker.py | 143 / 162 | 88.27% |
| apps/decision/workloads/blueprint_evaluation.py | 86 / 88 | 97.73% |

These are standard-library trace statement counts using the repository's
existing pattern. pytest and pytest-cov are unavailable; branch coverage is not
claimed. The runnable coverage summary is `reports/coverage/blueprints.json`.

A targeted red/green regression caught a lowercase dependency sentence being
joined to the preceding sentence. Allowing lowercase sentence starts restores
the correct outgoing dependency. The final parser suite covers numbered,
uppercase and bold headings; explicit and content-hash IDs; MoSCoW/prohibitions;
components and directed relations; unresolved questions; section/raw context;
confidence; flat fallback; source limits; and inert command-like text. A0 tests
reject elevated authority and forged verification and preserve null abstentions.

Native acceptance command:
`BUILDANDDO_TEST_POCKETBASE=/absolute/path/to/the/existing/pocketbase python tests/upgrade/check_blueprints.py --require-native`.
It requires the already-declared pypdf dependency and the existing PocketBase
binary. Those dependencies are absent here; the authored tests cover real PDF
extraction/encryption, HTTP multipart upload, worker storage/readback, protected
source retrieval, native API denial and migration down/up. No native result is
claimed. The original document parser, decision router, authority hook and
research dependency manifest have no diff against this session's base.

### §4 MEMORY INGEST

Type A count: 528
Type B count: 1133
Type C count: 98
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

All 92 pre-session events are preserved. New events record the source work,
observed tests and unavailable acceptance without replacing historical evidence.
File vectors match current line counts, and relationship vectors match their
CGRF declarations. Binary PDF provenance uses its accompanying CGRF YAML file.

### §5 CKET FILING

- 04_HYPOTHESIZE: current SRS acceptance and observed source outcome.
- 06_PLAN: `docs/blueprints.md`, including API, limits, native verification and
  retention-preserving rollback instructions.
- 07_BUILD: research extension, decision workload, PocketBase hooks/migration,
  workspace client/page and route/navigation changes in the repository's existing
  source locations.
- 08_TEST: parser/decision/worker and native tests, Node backend/client fixtures,
  rendered page tests, sample PDF with companion header and coverage integration.
- 11_COMMIT: dispatch, context lock, cumulative report/memory and PDF-aware
  provenance verifier.
- 13_SAVE: no new file.

CGRF headers: complete on all 19 new files, including binary companion provenance.
REFLEX check: deferred to the existing post-merge process; no CK signature minted.
The logical stage labels follow the current BuildAndDo source conventions.

### §6 GOVERNANCE

Entity: Citadel Nexus Inc.
Authority: existing A2 source dispatch; per-requirement evaluation fixed at A0
Actor: actor:agent required on PR creation; no label application claimed here
License posture: unchanged; no new third-party dependency or license change
Hard-NO scan: public boundary passes; original parser and decision policy unchanged
Secret scan: no secret-prefix findings in added source; no vault/history audit claim
Stripe mode: not applicable; no checkout code touched
CKS / CAPS / CK: pending

Source text remains untrusted data. It is never interpolated into runtime policy,
passed as top-level decision answers, evaluated as code, or promoted to approval.
Both the worker adapter and saved-result boundary require A0 and verified=false.
Workspace membership, source-owner revocation, worker leases and protected-file
authorization retain the existing policies.

### §7 NEXT ACTIONS

Blockers: pypdf/PocketBase native checks and frontend test/lint/build dependencies
Handoffs requested: none; existing worker and private activation boundaries apply
Suggested next dispatch: run native and rendered Phase A acceptance in the
provisioned environment, then review default-rule coverage before numerical BDR
assessments are relied upon
Bugs filed: none; no external issue or seat message was sent

Rollback/compensation: stop the shared worker before rolling source back. The
migration's down path removes its feature marker and retains all uploads,
observations, retry keys and the blueprint discriminator; disabled jobs are
excluded from the shared queue. Reapplying the migration restores the marker.
No migration deletes user material. Follow the exact retained-data procedure in
`docs/blueprints.md`; hosted rollback was not performed.

## Earlier continuation report — preserved

## §1 SUMMARY

Status: PARTIAL — classroom source implemented; rendered, native, deployed and media acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-governance-telemetry
Tasks: 4/4 source phases addressed; DG rendered acceptance and DF native acceptance pending
Smoke: 4/7 dispatch gates pass; 8/12 current check groups pass and four cannot run without missing dependencies
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: one focused classroom continuation; verify source identity below
Verify source identity: `git log -1 --format='%H %s'`

The owner reported that classrooms did not work or appear on the website.
Inspection found authored lessons but no classroom route, room schema or join
API in this public checkout. The new public and workspace pages expose native
PocketBase classrooms with scheduled/live/ended host controls, shared lesson
sections, expiring attendance and saved discussion. Room links survive sign-in,
signup and onboarding without granting another workspace's access. Public
navigation, Home, Docs, the Field Manual and crawler output expose the entry.

Twenty connected source tests pass; selected backend, migration, client and
navigation/privacy modules have 100% V8 lines and 95.35–98% branches. Full
regression passes 276 Node and 201 Python cases, with 12 native skips. The
246-module source diagnostic, strict typing and Ruff pass. These results do
not establish browser rendering, a deployed backend or an operating media stream.

The required web test, lint and build commands cannot run because Vitest,
eslint-plugin-import and Vite are absent; native classroom acceptance fails to
start without PocketBase. Nine rendered and three hook cases, three native
cases and the existing auth/route/tutorial suites carry the receiving checks.
No screenshot or two-account live acceptance is claimed. Voice/video remains
explicitly disconnected pending the existing media service's join contract.
The guide and CMAX-B/IDE1 handoff record installation and acceptance obligations.

## §2 TASK RESULTS

### Current continuation — classroom source, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| DE — Inspect and register | PASS | In-progress A2 authority verified; no prior room implementation; existing lesson/auth/workspace patterns reused | Context gate and source guide | 04_HYPOTHESIZE / 11_COMMIT | SRS, queue |
| DF — Shared room policy | PASS for source; native acceptance pending | Host lifecycle, revisions, scoped reads, generation-fenced attendance, discussion and atomic recovery; raw APIs locked | `node --test tests/upgrade/classroom-system.test.mjs` | 07_BUILD / 08_TEST | Hooks, additive migration, Node/native tests |
| DG — Website and entry flow | PARTIAL | Public/workspace routes, navigation, shared reading and room controls implemented; safe sign-in destinations; JSX/hook execution unavailable | `node --test tests/upgrade/classroom-client.test.mjs`; rendered commands in docs/classrooms.md | 07_BUILD / 08_TEST | UI, client, auth, telemetry and related suites |
| DH — Evidence and handoff | PASS for public artifacts | Available regressions, context, boundary and memory recorded; prior events retained; actual media and installed acceptance assigned to receiving owners | Current commands in §3 and provenance in §4 | 06_PLAN / 11_COMMIT | Guide, handoff, report, memory, context, CI |

### Prior continuation — telemetry summary, 2026-09-16

Status: PARTIAL — governance and telemetry source complete; live private-state ingestion unverified
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: bits/SRS-BUILDANDDO-UPGRADE-001-governance-telemetry
Tasks: 4/4 source phases complete; scheduled ingestion awaits runner-local aggregate state
Smoke: 9/9 available source and governance checks pass; no live Datadog request made
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: one focused continuation; verify with the command below
Verify source identity: `git log -1 --format='%H %s'`

Agent authorization now follows effect: A0 reads are free, A1 additive changes
may self-authorize by atomically creating their SRS, registry entry and dispatch,
A2 shared mutations require pre-existing authority, and A3 external effects or
secret access always require a human dispatch. One SRS, dispatch, PR and actor
label remain mandatory for every A1+ code change.

The scheduled collector reads only aggregate runner-local projections and maps
them to the requested assessment, fleet, incident, surface-proof, evidence,
provider, governance-session and content-draft series. All points carry the
required `env`, `service` and `team` tags. Missing inputs, malformed JSON,
missing `DD_API_KEY` and intake failures are SKIP outcomes with exit code zero.
No private state is committed. This sandbox exercised dry-run and transport
doubles only; it did not perform or verify a Datadog submission.

### Prior continuation — governance fast-path and Citadel telemetry, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| DA — Tiered authorization | PASS | A0–A3 effects and the A1 atomic self-authorization trail agree across machine, IDE and contributor guidance | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | Governance guidance, registry comments and measured context |
| DB — Aggregate metric collector | PASS for source | Twenty requested series are produced from complete fixtures with bounded tags; partial/malformed inputs omit only affected measurements | `python -m unittest tests.upgrade.test_datadog_metrics` | 08_TEST / 11_COMMIT | Collector and focused tests |
| DC — Scheduled emission | PASS for source; live intake unverified | Hourly/manual workflow uses the existing Datadog secret and configurable runner-local paths; hosted clean runners safely no-op | Workflow test and collector dry run in §3 | 11_COMMIT | Scheduled workflow |
| DD — Evidence and boundary | PASS | Context lock, public boundary, static checks, regressions, report and memory updated without private state or external writes | Commands in §3–§4 | 11_COMMIT | Context, dispatch, report and memory |

### Prior continuation — Field Interviewer public handoff, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| CX — Register and inspect reuse | PASS | Existing dispatch records the owner decision; public product/wiki/editorial boundaries inspected | Document/source audit and context check in §3 | 04_HYPOTHESIZE / 11_COMMIT | SRS and queue |
| CY — Define the receiving contract | PASS for public artifact | Six knowledge documents and FI-00 through FI-05 receiving work; no private implementation claim | Document/source audit in §3 | 06_PLAN / 11_COMMIT | docs/field-interviewer-v1.3.md and .bits/handoffs/2026-09-16-bits-codegen-cmax-b-field-interviewer.md |
| CZ — Preserve evidence | PASS for public artifact | Public source references and prior event history retained | Four documentation gates in §3 | 11_COMMIT | Report, memory and context |

### Prior continuation — PR 31 integration summary, 2026-09-16

Status: PARTIAL — source integration resolved; Workers build diagnostics and frontend build acceptance remain open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-UPGRADE-001-federal-foundry
Tasks: 2/3 integration phases complete; CU and CV pass, CW diagnostics complete with external build acceptance open
Smoke: 13/15 local check groups pass; dependency lock and web build fail for the recorded existing blockers; external Workers failure remains separate
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: one focused base-branch integration; resolve final source identity with the command below
Verify source identity: `git log -1 --format='%H %s'`

PR 31 incorporates its actual main base, including PR 30's model-independent
federal portfolio compiler, proposed lane SRS scopes and portable package
extension. Both independent Python CI jobs and both contribution-check
entries remain present. The five conflicts are reconciled semantically:
source guidance keeps both workflows, context is regenerated from the merged
tracked tree, and the report and memory retain both parents' evidence.

The two entry points remain explicit. apps.federal_foundry prepares bounded
builder/verifier work packages for runtime-assigned lane dispatches;
foundry.shared.federal_foundry executes the five public synthetic reference
workloads and compiles measured review exports. Their passing source contracts
do not establish official requirements, qualification or submission approval.

On the integrated tree, 70 foundry, 40 portfolio, 23 portable suite and 256
Node cases pass (389 total). Strict typing passes 24 source modules; Ruff
and the 239-module web diagnostic pass. Context, all 743 public source paths
and 477 file metadata vectors with 985 declared edges pass their gates. All
83 distinct historical events remain verbatim, with two new observed events.

GitHub check 104836645636 (Workers Builds: buildanddo) reports failure for PR
head 7920518ac04371f6a2db5f7c1928ed77b2991116 but publishes no error text or
annotations. PR insights and the exact-job Datadog log lookup returned no data.
The Cloudflare build log has been requested. Local npm build cannot start
because concurrently is absent; the unchanged dependency lock has ten failures
also present on main. Neither observation is attributed to the hosted failure.

### Prior continuation — PR 31 integration, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| CU — Reconcile main | PASS | All five conflicts resolved; both source implementations, CI jobs and parent event streams retained | Parent/conflict audit in §3 and history audit in §4 | 04_HYPOTHESIZE / 07_BUILD / 11_COMMIT | Governance, contribution checklist, context, report and memory |
| CV — Verify integrated source | PASS | 70 foundry, 40 federal portfolio, 23 portable suite and 256 Node tests pass; typing, lint and source checks pass | Commands in §3 | 08_TEST / 11_COMMIT | Existing coverage and source gates |
| CW — Diagnose Workers and finalize evidence | PARTIAL | GitHub exposes failure without diagnostics; local build/dependency limitations reproduced; Cloudflare log requested | Provider and local build commands in §3 | 11_COMMIT | Dispatch report and preserved memory |

Historical outcomes below describe the source each preceding continuation
validated. They are retained as evidence history; the integration
table in §3 describes checks run during that earlier integration wave.

### Prior continuation — executable Federal R&D Foundry, 2026-09-16

Status: COMPLETE for the public foundry execution substrate; scientific qualification and external submission remain separate acceptance
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: bits/SRS-BUILDANDDO-UPGRADE-001-federal-foundry
Tasks: 5/5 current local execution phases CP–CT
Smoke: 13/13 current local check groups; historical frontend/native acceptance remains unresolved
CKS Gate: B+ (global minimum)
CKS: pending
CAPS: pending
CK: pending
Commits: one focused execution continuation after the initial foundry implementation
Verify source identity: `git log -1 --format='%H %s'`

The foundry runs five lanes through real local child processes, bounded parallel
comparisons, input/source verification, deterministic replay and measured portfolio
exports. Ten registered candidates ran 60/60 attempts using explicit public
synthetic fixtures. The self-contained archive contains 574 files, including five
technical paper sources, 25 briefing slides, measured reports, a standalone HTML
portfolio and complete inputs, logs and receipts. Re-exporting the saved campaign
produced byte-identical ZIPs; an independent NAVAIR computational replay matched.

The reference workloads implement seeded auction clearing, BM25 and cosine TF-IDF
retrieval, dense and event-gated projection, full-scene and ROI-delta reconstruction,
and ordered/shuffled observations through the existing public mission-suite engine.
Each lane has a frozen plan, metrics, denominators and descriptive seed statistics.
Requirement and claim promotion checks actual evidence bytes, scope and outcomes.
Failed, cancelled, stale, foreign or tampered campaigns cannot become completed
review bundles.

Seventy foundry tests pass with 90.62–100% trace statement coverage in every
executable module. All 15 source modules pass strict typing; Ruff lint and format
pass. The reused mission-suite coverage checker passes 23 tests, all 256 Node
regressions pass, and the web diagnostic parses 239 modules without errors.
An independent Python 3.11/3.12 CI job executes foundry gates and retains the review
ZIP. Local execution used Python 3.12; hosted results have not been observed.

These are reproducible reference results on public synthetic inputs. Official
requirements, eligibility, representative scientific validation, physical hardware,
private Sentinel/NNC and federal submission approval remain open. Historical
frontend/native acceptance remains recorded below with its original limitations.

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| CP — Validate evidence contracts | PASS | Published schemas, finite outcomes, scoped reviews, artifact bytes and atomic updates; stale plan and evidence corruption reject | `python -m unittest discover -s tests/foundry -p 'test_validation.py'` | 07_BUILD / 08_TEST | Models, registry, validation, evidence and tests |
| CQ — Execute bounded experiments | PASS | Real children retain exact inputs, bounded logs, timeouts, cancellation and replay | `python -m unittest discover -s tests/foundry -p 'test_execution.py'` | 07_BUILD / 08_TEST | Runner, interfaces, CLI and process tests |
| CR — Compare reference workloads | PASS | Ten candidates, three seeds and two repeats produce 60 completed attempts | Campaign commands in §3; `python -m unittest discover -s tests/foundry -p 'test_workloads.py'` | 06_PLAN / 07_BUILD / 08_TEST | Fixtures, plans, algorithms and benchmark harness |
| CS — Compile observed evidence | PASS | 574-file export with reports, five papers, 25 slides, HTML and receipts; repeat ZIP equality and corruption rejection | Export/replay commands in §3 and complete source suite | 06_PLAN / 07_BUILD / 08_TEST | Compiler, reporting, lane authoring and campaign tests |
| CT — Record acceptance | PASS for local source | 70 tests, coverage, typing/style, related regression and governance; independent CI added | Thirteen groups in §3; measured record in §4 | 04_HYPOTHESIZE / 08_TEST / 11_COMMIT | CI, ci:test descriptions, SRS, queue, validation, report and memory |

### Prior continuation — Federal R&D Foundry scaffold, 2026-09-16

| Phase | Status | Result | Verify | CKET | Files |
|---|---|---|---|---|---|
| CJ — Register public foundry scope | PASS | Existing A2 dispatch extended before source; official, hardware, private and submission boundaries retained | `python scripts/ci/agent_context.py --check` | 04_HYPOTHESIZE / 11_COMMIT | umbrella SRS and dispatch queue |
| CK — Opportunity registry | PASS | Five semantic records validate; DV026 10-page/five-slide/$300K planning values, NAVAIR Docker, NV027 simulation, ISR DP2/hardware and Maritime prior-work boundaries are represented | `python -m unittest tests.foundry.test_foundry.RegistryTests` | 06_PLAN / 08_TEST | foundry/registry and schema |
| CL — Lane and template scaffolds | PASS | Every lane has all requested outputs, a slides workspace and JSON provenance; reusable templates retain human gates | same registry test command | 06_PLAN | foundry/templates and foundry/lanes |
| CM — Shared evidence contracts | PASS | Requirement and claim promotion fail closed; async runner and benchmark protocols accept bounded implementations | `python -m unittest tests.foundry.test_foundry.EvidenceTests tests.foundry.test_foundry.InterfaceTests` | 07_BUILD / 08_TEST | foundry/shared/federal_foundry |
| CN — Portfolio compiler | PASS | Two five-lane bundles are byte-identical; lane source is unchanged; output refuses overwrite and retains advisory status | `python -m unittest tests.foundry.test_foundry.PortfolioTests` | 07_BUILD / 08_TEST | portfolio compiler and CLI |
| CO — Verification and evidence | PASS with frontend blockers recorded | 13 foundry tests, per-module coverage, typing, lint, prior regressions, context, boundary and memory gates recorded | commands in §3 | 08_TEST / 11_COMMIT | foundry tests, report, memory and context lock |

### Prior continuation — model-independent federal portfolio, 2026-09-16

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

Current classroom checks:

| Check | Runnable verification | Expected / observed |
|---|---|---|
| 1. Classroom source behavior | `node --test tests/upgrade/classroom-system.test.mjs tests/upgrade/classroom-client.test.mjs` | PASS: 20/20, actual browser adapter and backend source with the existing storage double |
| 2. New source coverage | Coverage command below | PASS: four selected modules 100% V8 lines, 95.35–98% branches; JSX, hook and native route runtime excluded |
| 3. Complete Node regression | `node --test tests/upgrade/*.test.mjs` | PASS: 276/276 |
| 4. Complete Python regression | `python -m unittest discover -s tests/upgrade -p 'test_*.py' -q` | PASS for available source: 213 discovered, 201 pass, 12 native skips |
| 5. Source diagnostics and typing | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`; `python -m mypy --strict --follow-imports=silent tests/upgrade/test_classroom_native.py`; `python -m ruff check tests/upgrade/test_classroom_native.py` | PASS: 246 modules, no static errors; strict typing and Ruff pass |
| 6. Rendered classroom/auth/route tests | Targeted `npm --prefix apps/web test -- ...` command in docs/classrooms.md | FAIL to start: Vitest absent; nine flow and three hook cases plus updated auth/route/tutorial checks unexecuted |
| 7. Repository web lint | `npm --prefix apps/web run lint` | FAIL to start: eslint-plugin-import absent; source diagnostic is not a substitute |
| 8. Production web build | `npm --prefix apps/web run build` | FAIL to start Vite: ENOENT; public sitemap/LLM index generation completed with the new route; no built UI acceptance |
| 9. Native classroom acceptance | `python tests/upgrade/test_classroom_native.py --require-binary` | FAIL to start: BUILDANDDO_TEST_POCKETBASE unavailable; three native cases remain unexecuted |
| 10. Context | `python scripts/ci/agent_context.py --check` | PASS: seven pipelines, 40 web test files, six retained findings and four unwired gates |
| 11. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 764 tracked public files, zero failures; actor label not applied here |
| 12. Memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS: current metadata, declared edges, line counts and all 89 preceding events retained |

The first classroom source run passed 9/10 cases: the lesson picker also returned
six legacy summary-only records without supported bodies. Filtering the picker
and validating selected lesson bodies fixed that failure; the same scenario
then passed and all 20 final source cases pass. Initial strict typing reported
three unparameterized native-response dictionaries; explicit response types
fixed those diagnostics and the strict check passes. Both findings remain in
the evidence record. No failing assertion is described as an environment skip.

The four remaining failures share unavailable runtime dependencies. The receiving
runner must install the repository's declared frontend dependencies and supply
the existing native test binary, then execute the exact commands above. This
session made no network install attempt or dependency-lock substitution. CI now
requires the native classroom test in the existing two-runtime matrix; neither
authored tests nor a prepared job establish a hosted pass. No media endpoint,
authentication token, stream, provider SDK or activation evidence was invented.

```bash
node --test --experimental-test-coverage --test-coverage-include='**/pb_hooks/classrooms*.js' --test-coverage-include='**/1790400000_classroom_rooms.js' --test-coverage-include='**/web/src/lib/classrooms.js' --test-coverage-include='**/web/src/lib/navigationIntent.js' tests/upgrade/classroom-system.test.mjs tests/upgrade/classroom-client.test.mjs
```

Historical governance and Citadel telemetry checks:

| Check | Runnable verification | Expected / observed |
|---|---|---|
| 1. Focused behavior | `python -m unittest tests.upgrade.test_datadog_metrics` | PASS: 9/9; complete 20-series extraction, discovery, state mapping, partial/malformed state, missing key, empty state, failed/successful transport doubles and workflow binding |
| 2. New-source coverage | `python -m trace --count --summary --missing --coverdir <temporary-directory> --module unittest tests.upgrade.test_datadog_metrics` | PASS: 90% trace statement coverage for `scripts.ci.emit_datadog_metrics` |
| 3. Strict typing | `python -m mypy --strict --explicit-package-bases scripts/ci/emit_datadog_metrics.py tests/upgrade/test_datadog_metrics.py` | PASS: no issues in two files |
| 4. Python lint/format | `python -m ruff check scripts/ci/emit_datadog_metrics.py tests/upgrade/test_datadog_metrics.py`; `python -m ruff format --check scripts/ci/emit_datadog_metrics.py tests/upgrade/test_datadog_metrics.py` | PASS |
| 5. Python regression | `python -m unittest discover -s tests/upgrade -p 'test_*.py' -q` | PASS: 210 tests; nine explicit native skips |
| 6. Node regression | `node --test --test-reporter=dot tests/upgrade/*.test.mjs` | PASS: exit 0 |
| 7. Collector local run | `python scripts/ci/emit_datadog_metrics.py --dry-run` | PASS: empty public checkout produces zero series and no request; full payload is covered by check 1 |
| 8. Measured context | `python scripts/ci/agent_context.py --check` | PASS: seven pipelines, collector wired into CI, six retained findings and four unwired historical gates |
| 9. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 748 public files; zero failures; provider actor-label enforcement not run locally |

No current check failed. The tests use synthetic aggregate projections and
transport doubles; they do not contain private records or establish live
Datadog ingestion. On the hosted default runner, absent state is an intentional
SKIP. A runner carrying current aggregate projections must bind the documented
repository variables before the hourly workflow emits operational series.

Prior Field Interviewer documentation checks:

| Check | Runnable verification | Expected / observed |
|---|---|---|
| 1. Document/source/history audit | Embedded Python command below | PASS: six document definitions, six pinned source references, six receiving steps, two headers and all 85 preceding events |
| 2. Context | `python scripts/ci/agent_context.py --check` | PASS: current inventory, six retained findings and four unwired gates |
| 3. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 745 tracked files; zero failures; provider actor-label enforcement not run |
| 4. Memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS: metadata, declared edges, IOO and source line counts; historical events retained |

All four documentation gates passed without a failed check.
No executable application or provider module changes in this wave. The audit
checks documentation structure, source identity and history, not runtime
behavior. Private implementation tests and real KB/configuration readback are
receiving acceptance; they have not run here. The PowerShell commands in the
handoff are owner-supplied private checks and were not executed in this repo.
Historical foundry, web, native and Workers results below retain their scope.

```bash
python - <<'PYINTERVIEW'
from pathlib import Path
import importlib.util
import json
import re
import subprocess

base = 'c55212b4389689dbf69d713e8e0bfa5209ce2e96'
doc = Path('docs/field-interviewer-v1.3.md')
handoff = Path('.bits/handoffs/2026-09-16-bits-codegen-cmax-b-field-interviewer.md')
spec = importlib.util.spec_from_file_location('dispatch_verify', '.bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py')
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
for source, stage in ((doc, '06_PLAN'), (handoff, '11_COMMIT')):
    header = verify.header_fields(source)
    assert header['File'] == source.as_posix() and header['Stage'] == stage
    assert header['Dispatch'] == 'VCC-BUILDANDDO-UPGRADE-001'
    assert header['SRS'] == 'SRS-BUILDANDDO-UPGRADE-001'
    assert header['Owner'] == 'Citadel Nexus Inc.'
    assert header['CAPS'] == header['CK'] == 'pending'
    for dependency in header['Depends'].split(','):
        assert Path(dependency.strip()).is_file(), dependency
    assert not re.search(r'^(?:<{7}|={7}|>{7})(?: |$)', source.read_text(), re.M)
content = doc.read_text()
rows = [line.split('|')[1:-1] for line in content.splitlines() if line.startswith('| ')]
keys = ('core-contract', 'product', 'architecture-glossary', 'operational-system-map', 'current-verified-state', 'recent-build-journal')
documents = [row for row in rows if row[0].strip() in keys]
assert [row[0].strip() for row in documents] == list(keys)
assert all(row[-1].strip() == 'public / internal' for row in documents[:3])
assert all(row[-1].strip() == 'internal' for row in documents[3:])
sources = [row[0].strip() for row in rows if row[0].strip().startswith(('apps/', 'docs/'))]
assert len(sources) == 6
for source in sources:
    assert Path(source).read_bytes() == subprocess.check_output(['git', 'show', base + ':' + source]), source
assert re.findall(r'^### (FI-[0-9]{2}) ', handoff.read_text(), re.M) == [f'FI-{i:02d}' for i in range(6)]
for heading in ('What was asked', 'Why it cannot be done on the public plane', 'What was done instead', 'What the receiving seat needs to do', 'Blocking'):
    assert '## ' + heading in handoff.read_text()
assert 'FI-KB-1.3.0' in content and 'FI-KB-1.3.0' in handoff.read_text()
subprocess.run(['git', 'diff', '--quiet', base, '--', 'apps', 'foundry', 'tests', 'scripts', '.github', 'AGENTS.md', 'package.json', 'package-lock.json'], check=True)
memory_path = '.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json'
prior = json.loads(subprocess.check_output(['git', 'show', base + ':' + memory_path]))
current = json.loads(Path(memory_path).read_text())
old = [row for row in prior['vectors'] if row['type'] == 'C']
new = [row for row in current['vectors'] if row['type'] == 'C']
assert len(old) == 85 and new[:len(old)] == old
print('PASS: six knowledge documents, six pinned source references, six receiving steps, both CGRF headers and all 85 prior events; application/runtime source unchanged.')
PYINTERVIEW
```

Historical PR 31 integration checks (observed on that merged source):

| Check | Runnable verification | Expected / observed |
|---|---|---|
| 1. Conflict and parent audit | Bash/Python audit below; `git diff --name-only --diff-filter=U` | PASS: no unmerged entries or conflict markers; actual PR head and fetched main are the two integration parents |
| 2. Executable foundry | `python tests/foundry/check_foundry.py` | PASS: 70/70; 90.62–100% trace statement coverage across 14 executable modules |
| 3. Incoming federal portfolio | `python tests/upgrade/check_federal_foundry.py` | PASS: 40/40; 97.53–100% trace statement coverage across five modules |
| 4. Portable mission suite | `python tests/upgrade/check_mission_suite.py` | PASS: 23/23 |
| 5. Node regressions | `node --test tests/upgrade/*.test.mjs` | PASS: 256/256 |
| 6. Strict Python typing | `python -m mypy --strict --explicit-package-bases --follow-imports=silent foundry/shared/federal_foundry apps/federal_foundry apps/mission_suite` | PASS: 24 source files |
| 7. Python lint | `python -m ruff check foundry/shared/federal_foundry tests/foundry apps/federal_foundry apps/mission_suite/bundle.py tests/upgrade/test_federal_foundry.py tests/upgrade/check_federal_foundry.py tests/upgrade/test_mission_suite.py` | PASS |
| 8. Foundry formatting | `python -m ruff format --check foundry/shared/federal_foundry tests/foundry` | PASS: 21 files |
| 9. Web source diagnostic | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` | PASS: 239 modules, zero static errors; no rendered acceptance |
| 10. CI and checklist reconciliation | YAML/source audit below | PASS: both independent Python 3.11/3.12 jobs, required artifact uploads and both contribution checklist entries |
| 11. Context lock | `python scripts/ci/agent_context.py --check` | PASS: regenerated from the integrated tracked inventory; six existing findings and four unwired gates retained |
| 12. Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 743 tracked files, zero scanner failures; provider actor-label gate remains unobserved |
| 13. Memory/provenance/history | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; §4 parent audit | PASS: 477 file vectors, 985 declared edges, complete IOO and no orphans; all 83 distinct parent events preserved |
| 14. Dependency lock | `python scripts/ci/supply_chain.py --skip-audit --check-lock` | FAIL: two manifest-group differences and eight missing resolutions, identical to main |
| 15. Root web build | `npm run build` | FAIL before build: concurrently is absent; no Vite/concurrently cache entries are available locally |

Checks 14–15 do not pass. The lock and all three package manifests are identical
to main, so this integration did not introduce those failures. The public
boundary and actor gate are retained. Registry access is unavailable in this
sandbox; dependency versions/integrity records are not fabricated, and a source
parse is not relabeled as a production build. The Workers root cause remains
unknown until the real Cloudflare error log is available; no CI success or
hosted deployment is inferred from a resolved merge.

Inspect the exact reported external check (read-only):

~~~bash
gh pr view 31 --json headRefOid,baseRefName,baseRefOid,mergeable,mergeStateStatus,statusCheckRollup
gh api repos/mrnobodytx/buildanddo/check-runs/104836645636 --jq '{id,name,head_sha,status,conclusion,output,details_url}'
gh api repos/mrnobodytx/buildanddo/check-runs/104836645636/annotations
~~~

Observed: failure; output.text is null, annotations_count is zero and the
annotation list is empty. The only diagnostic link is Cloudflare build
9c6aa10e-8ce6-4f07-a150-92b564a2d0b8 for worker buildanddo. Datadog was checked
from 2026-09-16 14:15 to 15:00 UTC with the exact check/build job IDs and build
URL, across all indexes, with no matching logs. No error category can be
established from that absence. Private build-control investigation remains
with the existing delivery owner; no Cloudflare configuration was changed.

Reproduce the integration contract after updating the PR:

~~~bash
python - <<'PYINTEGRATION'
from pathlib import Path
import re
import subprocess
import yaml
for parent in ('7920518ac04371f6a2db5f7c1928ed77b2991116', '223491820b1dc940080fbf2b5440f201f3a825b1'):
    subprocess.run(['git', 'merge-base', '--is-ancestor', parent, 'HEAD'], check=True)
assert not subprocess.check_output(['git', 'ls-files', '-u'], text=True).strip()
for name in ('.bits/context.lock.json', '.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json', '.bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md', 'AGENTS.md', 'apps/web/src/components/workspace/ProgressionPipeline.jsx'):
    assert not re.search(r'^(?:<{7}|={7}|>{7})(?: |$)', Path(name).read_text(), re.M), name
jobs = yaml.safe_load(Path('.github/workflows/pr-governance.yml').read_text())['jobs']
for name, uploads_expected in (('foundry', 1), ('federal-foundry', 2)):
    job = jobs[name]
    assert job['strategy']['matrix']['python'] == ['3.11', '3.12']
    assert not any(key in job for key in ('needs', 'if'))
    assert not job.get('continue-on-error')
    assert not any(step.get('continue-on-error') for step in job['steps'])
    uploads = [step for step in job['steps'] if str(step.get('uses', '')).startswith('actions/upload-artifact@')]
    assert len(uploads) == uploads_expected
    assert all(step['with']['if-no-files-found'] == 'error' for step in uploads)
component = Path('apps/web/src/components/workspace/ProgressionPipeline.jsx').read_text()
assert 'Federal foundry execution, evidence integrity, replay and portfolio exports' in component
assert 'Federal portfolio packets, provider-independent adapters, evidence checks' in component
guidance = Path('AGENTS.md').read_text()
assert 'federal portfolio coverage' in guidance and 'foundry execution/replay/export coverage' in guidance
print('PASS: both parents, resolved conflicts, required CI jobs and contribution checks.')
PYINTEGRATION
~~~

Historical base-branch federal portfolio checks (source and required runtime gates remain separate):

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

Historical PR-head execution checks:

| Check | Runnable verification | Expected / observed |
|---|---|---|
| 1. Behavior and coverage | `python tests/foundry/check_foundry.py` | PASS: 70/70, 90.62–100% trace statement lines in all 14 executable modules, real processes and a complete campaign |
| 2. Strict typing | `python -m mypy --strict --follow-imports=silent foundry/shared/federal_foundry` | PASS: all 15 source modules; imported legacy modules retain separate validation |
| 3. Python lint | `python -m ruff check foundry/shared/federal_foundry tests/foundry` | PASS with Ruff 0.14.8 |
| 4. Formatting | `python -m ruff format --check foundry/shared/federal_foundry tests/foundry` | PASS: 21 Python files |
| 5. Node regression | `node --test tests/upgrade/*.test.mjs` | PASS: 256/256 |
| 6. Reused mission-suite regression | `python tests/upgrade/check_mission_suite.py` | PASS: 23/23 and at least 87.96% module statement coverage |
| 7. Web diagnostic | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` | PASS: 239 modules, zero static errors; no browser claim |
| 8. Campaign and receipt verification | Run/verify commands below | PASS: five lanes, ten candidates, 60/60 attempts and verified plans/source/inputs |
| 9. Export, ZIP and replay | Compile/verify/replay below; campaign and process tests in check 1 | PASS: 574 files, 25 slides, identical repeat ZIPs and fresh computational replay MATCH |
| 10. CI structure | YAML audit below | PASS: independent mandatory Python 3.11/3.12 job and required archive; hosted execution unobserved |
| 11. Context | `python scripts/ci/agent_context.py --check` | PASS: staged inventory; six existing findings and four unwired gates retained |
| 12. Boundary | `python scripts/ci/verify_public_boundary.py` | PASS: 727 tracked files, zero boundary or detected secret-literal failures |
| 13. Memory and provenance | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS: metadata, edges, line counts, IOO and prior events |

Reproduce with new output directories:

~~~bash
python -m foundry.shared.federal_foundry run --all --jobs 4 --output /tmp/foundry-rerun
python -m foundry.shared.federal_foundry verify /tmp/foundry-rerun
python -m foundry.shared.federal_foundry compile --runs /tmp/foundry-rerun --output /tmp/foundry-rerun-review --archive /tmp/foundry-rerun-review.zip
python -m foundry.shared.federal_foundry verify /tmp/foundry-rerun-review
python -m foundry.shared.federal_foundry replay /tmp/foundry-rerun/navair-acquisition-analysis/runs/bm25/seed-17/repeat-1 --output /tmp/foundry-rerun-replay
~~~

Final output: /tmp/federal-foundry-completed-yiz9n41c/review. Its review.zip is
732382 bytes, SHA-256 1f7b5bc7fe761f0126f30201002467a91c2257eec99e7bb3a32363b8d5ebad9c.
Both exports of this saved campaign matched. The replay computation fingerprint
is 3ded03a50441c0897f74026b179279bd68b43200aee6342598907980420c8d4e.
Fresh campaigns record new timestamps and resource observations; computational
replay and same-input exports are the byte-equality contracts.

| Lane | Observed fixture measurement | Limit |
|---|---|---|
| DV026 | Truthful achieved/optimal value 1.0; shaded mean 0.952781760233 across three seed groups | Scripted per-asset unit bids, not LLM agents or an influence classifier |
| NAVAIR | Both rankers nDCG@3 and recall@3 equal 1.0 over six judged queries | Nine synthetic descriptions, not an official acquisition corpus |
| NV027 | Dense 4096 vs gated 512 projection multiplications; both accuracy 1.0; gating adds 1024 feature checks | Operation counts, not watts, energy or device performance |
| Semantic ISR | Full packets 9842 bytes vs ROI 2884; relevant recall 1.0 and position MAE at most 0.05 | Given annotations/relevance, not video detection, codecs or hardware |
| Maritime | Both orderings replay identically over five observations, three entities and two HOLD candidates; zero admitted | Existing public engine, not private Sentinel/NNC or live feeds |

Statistics average repetitions within each seed, then summarize three seed means.
Timing is measured with tracemalloc while other validation could run; resources
are descriptive and do not measure power or GPU memory. Coverage uses Python
trace statement lines; pytest and branch coverage remain unavailable locally.

CI audit:

~~~bash
python - <<'PYCI'
from pathlib import Path
import yaml
job = yaml.safe_load(Path('.github/workflows/pr-governance.yml').read_text())['jobs']['foundry']
assert job['strategy']['matrix']['python'] == ['3.11', '3.12']
assert 'needs' not in job and 'if' not in job and not job.get('continue-on-error', False)
assert job['timeout-minutes'] == 10
for step in job['steps']:
    assert not step.get('continue-on-error', False)
assert 'secrets.' not in str(job)
uploads = [step for step in job['steps'] if step.get('uses', '').startswith('actions/upload-artifact@')]
assert len(uploads) == 1 and uploads[0]['with']['if-no-files-found'] == 'error'
assert uploads[0]['with']['retention-days'] == 14
print('PASS: independent foundry matrix and required artifact.')
PYCI
~~~

Observed failures and applied fixes:

- The result parser admitted invented outcomes and boolean/non-finite metrics.
  Negative tests failed before production validation was tightened; the current
  validation suite rejects them.
- A saved campaign initially remained compilable after its plan was edited. A
  real twelve-attempt regression failed; verification now compares the frozen and
  currently registered plans. Verify:
  `python -m unittest tests.foundry.test_campaign.CampaignFailureTests.test_saved_campaign_cannot_be_compiled_under_an_edited_plan`.
- A valid argv with repeated strings executed but its verifier rejected duplicate
  values. The red regression now passes with ordered repetitions and typed argv.
  Verify:
  `python -m unittest tests.foundry.test_execution.ExecutionTests.test_explicit_argv_can_contain_repeated_arguments`.
- Initial test assumptions about adapter attributes and JSON tuple representation
  were corrected against the actual protocols without relaxing production policy.
- Following every legacy import with strict mypy also reports twelve pre-existing
  errors in the unchanged evidence-epoch module. Foundry CI checks all foundry
  modules strictly and delegates imported legacy diagnostics to their own suites;
  the reused mission-suite coverage checker passes.
- Initial Ruff findings were formatting and unused imports. Targeted corrections
  were followed by clean lint, formatting, typing and the final 70-test suite.

Historical web tests, coverage, lint and build below are not newly successful
checks. Vitest, Vite and eslint-plugin-import remain absent. The only frontend
edit synchronizes the existing ci:test checklist with the new job. Native
PocketBase, hosted CI, browser and scientific/hardware acceptance are not claimed.

Historical scaffold checks:



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

All 89 preceding events remain verbatim and in order, including both telemetry
events. Three current events record the corrected lesson-picker failure, final
source tests and the runtime dependencies that prevented acceptance. They claim
no deployed classroom or live media result.

Type A count: 508
Type B count: 1093
Type C count: 92
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
Parent history: 77 PR-head events and 72 main events, with 66 identical shared events, produce 83 distinct historical events; preserve all original event fields and each parent's event order.
Measured execution retained: .bits/out/VCC-BUILDANDDO-UPGRADE-001/foundry-validation.json
Historical parent counts: PR head 461 A / 938 B / 77 C; incoming main 339 A / 740 B / 72 C.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`


Verify preservation of this continuation's baseline:

```bash
python - <<'PYCLASSROOMHISTORY'
import json
from pathlib import Path
import subprocess
path = '.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json'
old = json.loads(subprocess.check_output(['git', 'show', 'e705e85e9d7250d4af292074b81e7baaf2d7e2ce:' + path]))
now = json.loads(Path(path).read_text())
old_events = [row for row in old['vectors'] if row['type'] == 'C']
now_events = [row for row in now['vectors'] if row['type'] == 'C']
assert len(old_events) == 89 and now_events[:89] == old_events
print('PASS: all 89 baseline events preserved verbatim and in order.')
PYCLASSROOMHISTORY
```

Reproduce preservation of both parents' event streams:

~~~bash
python - <<'PYMEM'
import json
from pathlib import Path
import subprocess
path = '.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json'
current = [row for row in json.loads(Path(path).read_text())['vectors'] if row['type'] == 'C']
for ref, expected in (('7920518ac04371f6a2db5f7c1928ed77b2991116', 77), ('223491820b1dc940080fbf2b5440f201f3a825b1', 72)):
    old = [row for row in json.loads(subprocess.check_output(['git', 'show', ref + ':' + path], text=True))['vectors'] if row['type'] == 'C']
    assert len(old) == expected
    assert all(event in current for event in old)
    positions = [current.index(event) for event in old]
    assert positions == sorted(positions)
print('PASS: all parent events preserved verbatim and in parent order.')
PYMEM
~~~

## §5 CKET FILING

Current classroom continuation:
06_PLAN: docs/classrooms.md, contributor guide and generated public route references
04_HYPOTHESIZE: umbrella SRS and AGENTS.md gate description
07_BUILD: classroom hooks/migration, client/hook/pages, navigation/auth, tutorial links and bounded telemetry
08_TEST: Node source, native Python, rendered flow/hook and related existing regression suites
11_COMMIT: CI native gate, queue, receiving handoff, context, report and memory
13_SAVE: none
New files: 16/16 carry CGRF provenance; source/memory audit verifies their headers
REFLEX: deferred to private post-merge validation; CK/CAPS remain pending
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

Historical governance and telemetry continuation:
06_PLAN: none
04_HYPOTHESIZE: AGENTS.md, CLAUDE.md, context, registry and umbrella SRS continuation
08_TEST: tests/upgrade/test_datadog_metrics.py
11_COMMIT: scheduled workflow, collector, queue, measured context, report and memory
13_SAVE: none
New artifacts: workflow, collector and test with CGRF headers
REFLEX: deferred to private post-merge validation; CK/CAPS remain pending
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

Historical integration filing:

06_PLAN: retain both foundry guides, public fixtures, plans, lane artifacts and portable suite documentation
04_HYPOTHESIZE: merged agent guidance, umbrella integration acceptance, registry and five incoming proposed lane specifications
07_BUILD: both existing public foundry packages, incoming portable suite extension and merged contribution checklist
08_TEST: retain both foundry behavior/coverage runners and all existing suite/regression tests
11_COMMIT: both independent CI jobs, dispatch, regenerated context, combined report and reconciled memory
13_SAVE: none
New files authored for this integration: 0; both parents' CGRF provenance remains intact
REFLEX check: deferred to private post-merge validator; no signing values fabricated
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corporation)
License posture: unchanged; commercial contact licensing@citadel-nexus.com
Hard-NO scan: zero public-boundary violations
Secret scan: clean under the repository boundary scanner
Stripe mode: not applicable; no checkout/payment code
Actor label: actor:agent required; not applied by this session
Risk / authority: A2 public classroom source, additive migration, auth/navigation and CI changes under the existing owner dispatch; private installation, media integration and deployment require the receiving authority
Verify: `python scripts/ci/verify_public_boundary.py`

No secret access, live provider call, media session, Datadog submission,
deployment, shared database mutation or seat message occurred. Node tests use
synthetic classroom data in the existing storage double. Native accounts exist
only in the authored disposable-test seed; that binary did not run here. Room
content and identities remain outside new metric payloads and public catalogues.
The public mirror continues to ignore and reject private `state/` artifacts.

Historical portfolio scope: The federal compiler made no model calls, scheduled no hosted work and sent no
external messages or submissions. It changed no shared database, private runtime
or key material. Provider selection and identity verification belong to the
receiving runtime; scientific validity, eligibility and final claims require
observed evidence and human approval. This source continuation neither validates
nor changes prior dossier encryption, service activation or deployment claims.

## §7 NEXT ACTIONS

Current classroom acceptance: CMAX-B with IDE1 must run the declared frontend
and native tests, apply the registered migration/hooks through the actual
release process and perform the two-account website check in docs/classrooms.md.
The owner must identify the existing voice/video service and join contract
before media implementation; shared lesson state cannot stand in for a stream.
No private receiving dispatch or deployment approval is fabricated.

Handoff: .bits/handoffs/2026-09-16-bits-codegen-cmax-b-classrooms.md.
Blockers: Vitest/Vite/lint dependencies, native PocketBase binary, installed
revision/account evidence and the canonical media interface.
Suggested next dispatch: receiving-owner classroom installation and media
discovery, followed by the verified existing-service integration.
Out-of-scope bugs filed: none; six prior context findings retained.
Rollback: restore the prior UI through the release owner; the classroom down
migration disables its protocol while preserving room and discussion history.
This source run created no external state requiring compensation.

Historical telemetry activation: configure `CITADEL_TELEMETRY_RUNNER` and the
`CITADEL_*` aggregate projection paths for a runner that actually carries the
current system assessment state. Keep `DD_API_KEY` in the existing CI secret.
The hosted clean-runner default correctly emits SKIP until those bindings exist.
Confirm the first accepted batch in Datadog before claiming live integration;
no source blocker remains. Out-of-scope bugs filed: none.

Rollback: disable the scheduled workflow or revert this focused change. No
operational data, runtime service or database needs compensation because this
session made no external write.

Prior interviewer work: CMAX-B must accept the private repository handoff,
verify the existing content lab and ElevenLabsBridge, register the receiving
execution dispatch and implement FI-00 through FI-05. IDE1 coordinates generic
bridge APIs; the product owner/COPILOT owns disclosure and editorial review.
The prepared document does not dispatch a seat, grant provider mutation authority
or attest that an agent is live. Blockers and the exact required return are in
.bits/handoffs/2026-09-16-bits-codegen-cmax-b-field-interviewer.md.

Suggested next dispatch: receiver-assigned Field Interviewer v1.3.0 execution;
no private dispatch ID is fabricated here. Out-of-scope bugs filed: none.

Rollback: withdraw these two public planning artifacts through normal review;
no provider KB, agent, service or data needs rollback because none was changed.

Historical integration and research acceptance:

Current integration: synchronize this prepared result through the coding-agent
Update PR button. Hosted mergeability and check results can change only after
that update; this sandbox does not publish refs. Apply exactly one actor label,
actor:agent, through the repository UI; only Bits AI was present at inspection.

Current blockers: Cloudflare's actual build error log is not exposed by GitHub
or the scoped telemetry lookup. The dependency-enabled build owner must also
regenerate the real npm lock and run npm ci, web tests, lint and build; ten
existing lock failures and missing local executables remain explicit. This
integration does not infer those failures caused Workers Builds: buildanddo.
No private deployment controls, dependency integrity hashes or success statuses
are invented. Keep the existing delivery handoff for private build investigation.

Historical reference-workload continuation:

The common public execution substrate is complete for its registered reference
workloads. It runs, retains, compares, verifies, replays and compiles all five
lanes through the documented CLI. Further scientific work needs a separate lane
SRS, current official opportunity bytes, rights-cleared inputs and preregistered
acceptance. Shared changes must retain the five-lane regression.

Remaining opportunity gates: current deadlines and eligibility for all lanes;
LLM-agent/classifier studies for DV026; representative corpus, expert judgments
and Docker acceptance for NAVAIR; trained architectures and physical power/device
measurements for NV027; EO/video detectors, codecs, hardware and DP2 evidence for
Semantic ISR; official DIU constraints, private Sentinel/NNC and live operating
acceptance for Maritime. Local reference results do not resolve these gates.

Handoffs requested: none in this execution wave; existing private runtime handoffs
remain applicable. Suggested next dispatch: a scoped DV026 agent/classifier study
using the measured market baseline and approved sources. Bugs filed outside
scope: none. Hosted matrix results remain unobserved; CI retains the review
archive only after its required gates pass.

Historical portfolio receiving contract (public reference results do not satisfy hosted or official acceptance):

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

Prior mission-suite receiving acceptance:

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
