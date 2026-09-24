# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/sprint-journey-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     docs/sprint-user-journey.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/sprint-journey-validation.json
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/sprint-user-journey.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/sprint-journey-validation.json
# Intent:      Retain source and runtime results for the ten sprint repairs without replacing deployment or submission acceptance.
# ───────────────────────────────────────────────────────────────

# Sprint user journey repair

## §1 SUMMARY

Status: PARTIAL — ten source outcomes implemented; runtime acceptance remains open.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Branch: dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm.
Tasks: 10/10 product source outcomes plus restored automatic governance.
Source behavior: 539/539 Node and 103/103 Python governance cases pass.
Smoke: 7/11 selected local command groups pass; four required runtime commands cannot start.
CKS Gate: existing dispatch target; no new score computed. CKS/CAPS/CK: pending.
Implementation: 2d5f7845eebd35f43e6f00a302f9601bb9b0ddf8. Evidence packaging is recorded separately.
Reviewed source identity: 90289e9d95be8f1b988de0f8eb4efe67e5bb6cd9e703b87b1ee1c633a4429eee.

## §2 TASK RESULTS

The audit, reason for each priority, acceptance limits and full receiving contract
are in `docs/sprint-user-journey.md`. Scope follows the existing sprint dependencies.

| Task | Result | Verify | Primary source | CKET |
|---|---|---|---|---|
| ST-0 Governance | PASS: automatic PR/label checks restored, candidate SHA binding retained; no GitLab gate removed | `python -m unittest tests.upgrade.test_gitlab_acceptance tests.upgrade.test_public_boundary -v` | `.github/workflows/pr-governance.yml` | 11_COMMIT |
| ST-1 Entry | Source PASS: native session validation, stale-account suppression, named onboarding selecting returned workspace | `node --test tests/upgrade/sprint-journey.test.mjs`; rendered onboarding/session tests | `apps/web/src/lib/authSession.js`, auth/onboarding components | 07_BUILD |
| ST-2 Collections | Source PASS: grouped predicates, exact scoped targets and discarded stale reads/writes | Same journey suite and `npm run test:coverage` | `apps/web/src/lib/workspaceRecords.js` | 07_BUILD |
| ST-3 Capture | Source PASS: exact receipt lookup beyond page one, frozen retry identity, queued cancellation and retained failure | Journey and business-execution Node suites; rendered capture cases | `apps/web/src/components/workspace/SourceCapture.jsx` | 07_BUILD |
| ST-4 Review | Source PASS: current-role, approved-plan, proposer and evidence-author prerequisites; native gate retained | Journey and mission-flow suites | `apps/web/src/lib/missionLearning.js`, mission review component | 07_BUILD |
| ST-5 Workflow | Implemented: durable link reloads latest readable run and revision; foreign/missing links stay unavailable | `npm run test:coverage` includes workflow link cases; static parser passes | `apps/web/src/components/workspace/workflows/WorkflowRunsPanel.jsx` | 07_BUILD |
| ST-6 Connections | Source PASS: select current binding, show and expire actual observed health | Journey suite; rendered expiry case | `apps/web/src/lib/connectorReadiness.js`, connection component | 07_BUILD |
| ST-7 ERP | Source PASS: add objective/contact/ID drilldowns to existing task search and triage; exact receipt/evidence links | Journey and business planning suites; ERP rendered cases | `apps/web/src/lib/businessPlanning.js`, ERP page | 07_BUILD |
| ST-8 Evidence | Source PASS: exact retained review comparison, safe source links and local download | Journey suite; rendered inspector cases | `apps/web/src/lib/evidenceInspection.js` | 07_BUILD |
| ST-9 Next work | Source PASS: priorities from readable records; missing reads and demo remain explicit | Journey suite | `apps/web/src/lib/workspaceJourney.js`, overview component | 07_BUILD |
| ST-10 Replay | Source PASS: complete bounded transactional read, existing business policy, result/content/leaf digests and integrity gaps | Journey suite; `python tests/upgrade/test_workspace_native.py --require-binary` | `apps/pocketbase/pb_hooks/workspace-replay.js` | 07_BUILD |

The source tests do not substitute for the unexecuted rendered/native checks.
All existing approval, RLS-equivalent PocketBase record rules, actor, coverage and
submission requirements remain in force. No account billing or release activation
was performed. The original production knowledge-ranking behavior is retained.

## §3 SMOKE TEST RESULTS

| Check | Expected | Observed | Result |
|---|---|---|---|
| Full Node upgrade suite | Every case passes, no skipped work | 539 pass, zero fail/skip | PASS |
| Journey coverage subset | Behavior passes and new executable modules meet 80% | 28 pass; seven modules 95.45–100% V8 line coverage | PASS |
| Shared knowledge fixtures | Stable ties and explicit recency preserve original ordering assertions | 26 cases pass | PASS |
| Python governance/replay/submission suites | Required policy and evidence checks retained | 103 cases pass | PASS |
| Offline source diagnostic | No syntax, undefined name or JSX binding error | 337 modules, zero errors; not rendered or official lint | PASS |
| Strict mypy | Touched Python modules typed | Both pass | PASS |
| Ruff lint/format | Touched Python modules clean | Both pass | PASS |
| `npm run test:coverage` | Rendered cases and required coverage execute | Exit 127: Vitest missing | BLOCKED |
| `npm run lint` | Locked web lint executes | Exit 127: concurrently missing | BLOCKED |
| `npm run build` | Build artifact produced | Exit 127: concurrently missing | BLOCKED |
| Native required workspace journey | Real auth, record rules, executed ERP export on declared runtime | Exit 1: PocketBase missing | BLOCKED |

The 28-case and 26-case subsets are included in the 539 cases; do not sum them.
Source approval alone does not establish the eighteen-profile acceptance matrix.

Retained red/green evidence:

- Restored automatic-trigger test failed against the prior manual-only workflow.
  Both triggers and all candidate-pinned validation jobs now pass the check.
- The first connected ERP replay tried the locked raw business collection view.
  It now reuses the existing command API read policy, excludes lease capability,
  and checks the original reported result digest. The executed chain passes.
- The initial Node 22 run could not resolve the installed diagnostic ESLint.
  Supplying its existing local module path restored the source diagnostic;
  this did not install or replace locked web dependencies.
- A later full run retained 537 passes and one knowledge-ordering failure. The
  shared fixture used wall-clock save timestamps. A controlled one-millisecond
  difference reproduced it. Injected fixture time now tests both equal timestamps
  and explicit recency, without changing production rank, retries or assertions.
- Strict mypy found one old unparameterized dictionary annotation in the touched
  native test. The annotation is now explicit; both touched Python files pass.
- The four runtime commands retain their missing-package/binary failures. Supply
  the declared dependencies on the authorized runner and rerun the same commands;
  no skip, mock or reduced threshold satisfies these gates.

## §4 MEMORY INGEST

Type A: 756. Type B: 1701. Type C: 177.
IOO: complete. DKG orphans: 0. All 171 prior event vectors retained unchanged.
Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## §5 CKET FILING

06_PLAN: `docs/sprint-user-journey.md` and current sprint documentation.
04_HYPOTHESIZE: current instructions, context and SRS continuation.
07_BUILD: native replay, scoped client helpers and their existing UI integration.
08_TEST: journey regressions, rendered/native cases and deterministic fixture time.
11_COMMIT: restored public workflow, reviewed locks, queue, memory and this report.
CGRF: present on every new file; JSON has its sibling header. REFLEX: post-merge.
Verify source/readiness with `python scripts/ci/hostinger_readiness.py --check`
and `python scripts/ci/agent_context.py --check`.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. License posture: unchanged.
Authority: existing A2 SRS/dispatch; no remote writes or private infrastructure.
Restricted paths: no private release root, signing, credential or deployment-control mutation.
Secret scan: incremental additions and public boundary pass.
Stripe: not touched; no checkout or payment-mode claim.
Actor: `actor:agent` is required on the receiving review; no label was applied here.
Governance inventory retains its 22 unwired gates and two unregistered-spec findings.
Verify: `python scripts/ci/verify_public_boundary.py` and
`python scripts/ci/submission_readiness.py --check`.

## §7 NEXT ACTIONS

1. Run locked web coverage/lint/build and both disposable PocketBase profiles on
   the authorized GitLab runner, retaining complete acceptance artifacts.
2. Verify candidate delivery, trusted review metadata, one actor label and exact
   revision statuses. Preserve the existing private CI handoff; obtain the separate
   Cloudflare diagnostic from its owner.
3. Complete actual registered Firecrawl/n8n health, capture, bounded effects and
   reconciliation; bind inference only under the existing receiving authority.
4. Capture same-candidate deployment, browser and product evidence, independent
   real outcome grading, organizer requirements and owner review. The new local
   mission export cannot satisfy these by itself.

No live action, hosted check, deployment, final submission or independent
qualification is claimed. Raw command logs remain session-local; committed
validation retains hashes and measured results rather than replacing the required
hosted evidence bundle.
