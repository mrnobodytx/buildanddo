# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/research-assurance-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     docs/research-sprint.md, docs/test-assurance.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/research-assurance-validation.json, .bits/handoffs/2026-09-22-bits-codegen-research-assurance.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/research-sprint.md; CONSUMES docs/test-assurance.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/research-assurance-validation.json; CONSUMES .bits/handoffs/2026-09-22-bits-codegen-research-assurance.md
# Intent:      Preserve the implemented research and membership contracts, observed assurance results and outstanding runtime evidence for review.
# ───────────────────────────────────────────────────────────────

# Restricted research and test assurance — validation report

## §1 SUMMARY

Status: PARTIAL — source implemented; native/browser and external acceptance open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm
Tasks: 4/4 source phases; receiving runtime gates remain open
Smoke: 4/7 command gates pass; 3 frontend gates lack dependencies
CKS Gate: B+/75 target; CKS: pending
CAPS: pending; CK: pending
Commits: 1 implementation at report capture (6a829f33a6cd3504e83d9047986b83744f1a1169)

Government work now requires both a current operator-owned paid membership and
operator approval, in addition to native account and workspace permissions.
The provisional price is USD 100/month. The owner specified USD 100 without a
cadence; confirm cadence and billing terms before activation. No checkout,
payment, membership grant, deployment or external submission occurred here.

The shared decision/foundry owners provide local Army point/refresh demos,
recorded market controls, exact polynomial checks and a ten-day plan. Eight
assurance profiles retain source outcomes and unavailable runtimes explicitly.
Supplied opportunity identifiers, dates, parameters, prizes and leaderboard
figures remain OWNER_SUPPLIED_UNVERIFIED. The research results are advisory.

`research-assurance-validation.json` retains exact commands, UTC times, source
and log digests, observed coverage, matrix results and replay observations.
Short/failing logs are complete; larger logs have labelled excerpts and their
complete-log digests. The source binding includes the actual tested files.
Earlier broad suites precede a terminal-blank-line cleanup of the research plan;
the only bound byte difference is recorded, and focused research, export/replay
and the full assurance matrix were rerun on the final bytes. These local results
are not a hosted GitLab or clean-candidate eighteen-profile acceptance export.

## §2 TASK RESULTS

### QA — restricted government work

Status: source PASS; native and rendered acceptance BLOCKED.

The protected government desk serves the plan, premium lessons and starter only
after current native workspace and paid/approved membership checks. Trusted
membership records have locked ordinary CRUD APIs. Clients cannot grant access
through profile fields, workspace roles or payment assertions. Checks cover
premium learning, classrooms, mission-suite reads/commands, cached retries,
worker sponsorship and completion. Account/workspace switches discard stale UI
responses; expiry and visibility refresh membership. General lessons and earned
certificates retain their existing availability. Work intentionally saved in
ordinary shared mission/evidence records follows that workspace's sharing rules.

Membership and tutorial migrations refuse unexpected schemas, grant no members
and preserve receipts on rollback. The contact flow prepares a fixed-recipient
membership enquiry; it neither sends it nor charges or activates a user.

Files: government hooks/migration, existing learning/classroom/suite/access
owners, government desk/gate, workspace routing and enquiry surfaces.
CKET: 07_BUILD / 08_TEST.
Verify: `node --test tests/upgrade/government-access.test.mjs tests/upgrade/government-client.test.mjs tests/upgrade/commercial-enquiry.test.mjs`.
The full Node source suite passes 611 cases. It adds 30 membership/client cases
and one enquiry regression. The final membership/retry diagnostic passed 48/48
cases without changing source; those cases overlap the full suite.

### QB — bounded research sprint

Status: local computation/replay PASS; official/model/GPU acceptance unmeasured.

Decision Packages retain objectives, alternatives, constraints, assumptions,
risks, evidence, bias checks, tradeoffs, flip conditions and revision history.
Missing/stale/conflicting support and tied scores abstain. Rehashed fabricated
approval is rejected. Semantic relations reuse the canonical Twin vocabulary.
The point demo recommends an option and changed evidence flips it; the real
retained BuildAndDo release example stays HOLD. Independent review and human
authorization remain separate and unmeasured.

Two six-agent/two-asset scripted market controls retain prompts, actions and
failures. Both replay 36 orders. Truthful control utility is 858 with 100 percent
allocative efficiency; shaded control utility is 769 with 89.62703963 percent.
These are synthetic control computations, not hosted-model or DARPA attainment.
Behavior classifiers remain UNMEASURED. Separate proposal skeletons and exact
requirement/capability/evidence/gap crosswalks are generated from the shared plan.

The FHERMA lane provides exact integer negacyclic multiplication, explicit ring
selection, every-coefficient candidate comparison and internal median timing
gates. The prerequisite doctor remains BLOCKED. No CUDA/cuPQC kernel or official
GPU timing is claimed. The receiving owner must supply the official interface,
coefficient modulus/ring, starter, SDK, hardware and benchmark receipts.

Files: apps/decision/packages.py, apps/federal_foundry, existing market evaluator
and shared research-sprint plan.
CKET: 07_BUILD / 08_TEST / 06_PLAN.
Verify: `python -m unittest tests.upgrade.test_research_sprint -v` and
`python tests/upgrade/check_federal_foundry.py`.
The 44 research cases pass; the portable portfolio gate passes 110 overlapping
cases. Statement coverage is 99.31 percent for Decision Packages and 100 percent
for episodes, polynomial and sprint modules; CLI coverage is 98.84 percent.

Generate into a new directory and replay:

```bash
python -m apps.federal_foundry sprint --output state/research/review-001
python -m apps.federal_foundry verify-sprint state/research/review-001
```

The observed standalone export checked 79 manifest entries successfully. It
contains split decision/evidence/assumption/risk/verification/approval artifacts,
escaped HTML, revision history and a bounded source inventory, not a complete
runtime SBOM. Exact observation time and manifest are in the validation JSON.

### QC — eight-category assurance

Status: source PASS; full matrix HOLD, 2 PASS / 6 BLOCKED.

| Profile | Final result | Scope |
|---|---|---|
| Learner journey | BLOCKED | Browser learning/classroom plus native mission/review and browser readback |
| Security / isolation | BLOCKED | 30 source cases pass; native raw-API membership checks need PocketBase |
| Evidence / authority | PASS | 35 source decision, polynomial, export and CLI cases |
| Failure / recovery of requests | PASS | 9 model-action and 18 suite-retry source cases |
| Accessibility | BLOCKED | Bounded names, headings, keyboard/focus and 200 percent text checks |
| Browser / device compatibility | BLOCKED | Chromium, Firefox, WebKit at 390/1280 CSS pixels |
| Load / sustained operation | BLOCKED | Disposable concurrent/retry and measured heartbeat/read fixture |
| Backup / restoration | BLOCKED | Hashed offline restoration within the runner's own disposable data tree |

The source-only security/evidence/failure run passes all three selected profiles.
The recorder has 20 regression cases. The final focused research/recorder run
passes 64/64 cases. These totals overlap broader regression and coverage runs.
Required GitLab source assurance and an explicit full-runtime matrix for both
PocketBase declarations are configured; hosted execution is not established.
The original eighteen Day-21 profiles and eleven milestone requirements remain.

Files: tests/assurance, source validation and submission GitLab jobs, existing
native fixtures, source tests and documentation.
CKET: 08_TEST / 11_COMMIT / 06_PLAN.
Verify: `python -m unittest tests.upgrade.test_assurance_runner -v`;
`python -m tests.assurance.run --source-only --profiles security,evidence,failure --output state/assurance/source-001`;
`python -m tests.assurance.run --pocketbase /path/to/pocketbase --output state/assurance/full-001`.
Use new output directories and the prerequisites in docs/test-assurance.md.
The journey is partly API driven; compatibility uses emulated viewports;
accessibility is not WCAG certification; fixture load/restore is not production
capacity or disaster-recovery acceptance.

### QD — evidence and receiving actions

Status: source bookkeeping PASS; overall runtime acceptance PARTIAL.

The public-boundary, source-context, readiness, submission-policy and memory
checks pass. All 196 historical Type C events remain unchanged. Exact final
source, broad-suite whitespace differences, the failed restricted-run attempt,
successful rerun and blocked frontend/native/GPU requirements are retained.

Files: this report, validation/sidecar, memory.json, reviewed source locks and
.bits/handoffs/2026-09-22-bits-codegen-research-assurance.md.
CKET: 11_COMMIT / 04_HYPOTHESIZE.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` and the governance
commands below. Byte bindings and historical preservation are asserted by the
retained validation capture, not inferred from successful transport.

## §3 SMOKE TEST RESULTS

| Command | Expected | Observed | Result |
|---|---|---|---|
| `npm --prefix apps/web test` | Rendered tests execute | Vitest absent, exit 127 | FAIL: dependency unavailable |
| `npm --prefix apps/web run lint` | Locked lint executes | eslint-plugin-import absent, exit 2 | FAIL: dependency unavailable |
| `npm --prefix apps/web run build` | Frontend bundle | Vite absent under Node 22, exit 1 | FAIL: dependency unavailable |
| `node --test tests/upgrade/*.test.mjs` | No source failures | 611 passed, none skipped | PASS |
| `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | No source failures | 834 passed, 32 skipped; 866 total | PASS with runtime gaps |
| `python scripts/ci/agent_context.py --check` | Current source inventory | Matches; 24 existing findings, 22 unwired gates | PASS |
| `python scripts/ci/verify_public_boundary.py` | No boundary violations | No failures | PASS |

Frontend failure remedy: provision the existing locked development dependencies
on the receiving runner, then rerun the unchanged npm commands. No dependency
install, gate reduction or frontend success is inferred here. The 32 Python
skips are existing tests: 26 PocketBase, five PDF-parser and one Discord SDK case.

A restricted assurance rerun recorded Node test-file failures without individual
case output. The same source passed 48/48 membership/retry cases with approved
local fixture subprocess permissions; the complete matrix then returned the
expected 2 PASS / 6 BLOCKED. The failed logs remain in the validation record.
No application source change was needed for that runner discrepancy.

Adding the three retained evidence files changed the tracked-file inventory.
The context check reported that drift; regenerating with
`python scripts/ci/agent_context.py --write` and rerunning `--check` restores the
current binding without changing any application code or existing findings.

The 29 existing foundry workload/execution cases also pass. Strict mypy on six
production modules, selected Ruff/format checks and the 343-module frontend
source diagnostic pass. The diagnostic is not locked lint or rendered testing.
Readiness and internal submission policy pass through
`python scripts/ci/hostinger_readiness.py --check` and
`python scripts/ci/submission_readiness.py --check`. Official requirements remain
unverified. Full Day-21, live Praxis, deployment and billing acceptance were not
rerun or promoted by this continuation.

## §4 MEMORY INGEST

Type A count: 821
Type B count: 1885
Type C count: 205
IOO compliance: complete
DKG orphans: 0
Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json

Preserve all 196 historical Type C events verbatim. Refreshed file metadata and
edges match current CGRF declarations. New events describe observed local runs,
blocked acceptance, synthetic replay and the implementation record. CK/CAPS stay
pending; the payload does not grant authority or write to the Memory service.

## §5 CKET FILING

04_HYPOTHESIZE: existing AGENTS, SRS and context.
06_PLAN: docs/research-sprint.md and docs/test-assurance.md.
07_BUILD: decision/foundry, protected membership/learning hooks and web surfaces.
08_TEST: assurance matrix, research/membership regressions and native/UI cases.
11_COMMIT: existing dispatch/CI, handoff, source bindings, report and memory.
13_SAVE: none.
CGRF headers: 31/31 new files covered by headers or JSON sidecars.
REFLEX validation remains with the existing post-merge owner.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc.
License posture: unchanged; the repository's existing licensing applies.
Authority: registered A2 public source; actor:agent required.
Boundary scan: PASS; the remote actor label is not measured by this local check.
Secret handling: no credentials added; boundary scan reports no violations.
Stripe mode: not applicable; no checkout or payment-processing code is introduced.
Official notice and eligibility status: OWNER_SUPPLIED_UNVERIFIED.
Seat/runtime effects: no live seat message, external write, hosted model, payment,
deployment, government submission or GPU benchmark performed.

## §7 NEXT ACTIONS

CMAX-B/CI runs both native/browser profiles, rendered tests/lint/build and the
unchanged Day-21 matrix on the exact candidate. IDE1 reviews membership migration
and denial/expiry/revocation behavior before authorized activation. The owner
confirms price cadence, tier admission and invoice/renewal/cancellation terms;
only the trusted operator provisions membership after payment and approval.

The proposal owner authenticates notices and eligibility. The research owner
binds approved model versions, sampling settings and budget and obtains distinct
verification. The GPU owner supplies the official FHERMA starter/SDK/hardware and
correctness/timing receipts before continuation decisions. Independent reviewers
must replace synthetic demo inputs with scoped evidence for consequential use.

Handoff: .bits/handoffs/2026-09-22-bits-codegen-research-assurance.md.
Suggested next dispatch: receiving CI/native/browser validation on this candidate;
no dispatch ID or authorization is invented. Bugs filed: none; no remote comments
were sent. Existing unrelated context findings remain visible and unchanged.
