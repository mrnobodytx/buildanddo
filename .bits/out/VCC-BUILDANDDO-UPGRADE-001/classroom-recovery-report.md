# --- CGRF Header ------------------------------------------------
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/classroom-recovery-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     docs/classrooms.md, tests/upgrade/classroom-recovery.test.mjs, .bits/out/VCC-BUILDANDDO-UPGRADE-001/classroom-recovery-validation.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json, .bits/handoffs/2026-09-30-bits-codegen-cmax-b-classroom-recovery.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/classrooms.md; CONSUMES tests/upgrade/classroom-recovery.test.mjs; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/classroom-recovery-validation.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json; CONSUMES .bits/handoffs/2026-09-30-bits-codegen-cmax-b-classroom-recovery.md
# Intent:      Retain the reproduced classroom failures, measured source repair and unexecuted runtime acceptance without claiming the live classroom is fixed.
# ----------------------------------------------------------------

# Classroom recovery report

## §1 SUMMARY

Status: PARTIAL for live acceptance; public source repair complete.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Risk: A2. Actor: actor:agent.
Smoke: 157/157 targeted Node cases pass without skips; 20 exercise this repair.
CKS Gate/CKS/CAPS/CK: pending. Review publication remains managed by the session UI.

Older live classes now remain discoverable beyond ended-room history. Discovery
follows live/scheduled pages, bounds concurrent work, prevents overlapping polls
and names an incomplete workspace. Replacing a native session or returning to a
room creates a new client lifetime; old reads, receipts, retries and attendance
cannot populate or block it. Token refresh and list pagination preserve valid
uncertain-save recovery. Backend membership, revisions and media authority remain
the same contracts.

The user did not specify the failing page or error. These reproduced source
defects do not establish the original live symptom's complete cause. No browser,
native server, media provider, hosted GitLab or deployment result is asserted.

## §2 TASK RESULTS

| Task | Status | Result and verification |
|---|---|---|
| CR-1: Reproduce discovery/session failures | PASS | Eight of the initial ten regression cases fail against unchanged baseline hooks; two existing invariants pass. Their names and baseline are retained in classroom-recovery-validation.json. |
| CR-2: Repair and preserve classroom contracts | Source PASS; rendered pending | Run the Node command below: 157 pass, including 20 new source regressions. Seven React regressions are authored but unexecuted. |
| CR-3: Evidence, source governance and runtime handoff | Source checks recorded below; runtime open | Run readiness, submission, context, public boundary and memory checks below; follow the classroom recovery handoff. |

The offline harness executes the actual hook bodies and imports the actual browser
adapter. Requests pass through registered production route callbacks into the
existing classroom service and transactional storage double. Native authentication
middleware is declared but not executed by the double. Hook scheduling is not
React rendering. Existing media suites use provider/browser substitutes.

## §3 SMOKE TEST RESULTS

```bash
node --test --test-isolation=none --experimental-test-coverage --test-coverage-include='**/apps/web/src/hooks/useClassrooms.js' --test-coverage-include='**/apps/web/src/hooks/useOpenClasses.js' --test-reporter=tap tests/upgrade/classroom-system.test.mjs tests/upgrade/classroom-client.test.mjs tests/upgrade/classroom-presence.test.mjs tests/upgrade/classroom-media.test.mjs tests/upgrade/classroom-media-client.test.mjs tests/upgrade/classroom-media-lifetime.test.mjs tests/upgrade/classroom-telemetry.test.mjs tests/upgrade/classroom-recovery.test.mjs
npm run test --prefix apps/web -- --run src/hooks/__tests__/useClassrooms.test.jsx src/hooks/__tests__/useOpenClasses.test.jsx src/pages/workspace/__tests__/ClassroomsFlow.test.jsx
python -m unittest tests.upgrade.test_classroom_native
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
```

| Check | Expected | Observed |
|---|---|---|
| Existing classroom baseline | No source regressions | PASS: 137 Node cases before repair |
| Targeted red/green | Broken cases become passing without relaxing authority | Eight initial failures: hidden older class, 20/44 discovered rooms, unreported later-page failure, overlapping polls, revived workspace result, same-account session leakage, stuck returned-room save and obsolete callbacks. All pass after repair. |
| Final classroom source | No failures/skips | PASS: 157 tests; 20 new cases additionally cover pagination limits/concurrency, empty permission-filtered pages, replayed effects, lost replies, native refresh, auth guards, no-store responses and stripped lesson answers |
| Changed-hook coverage | At least 80% source coverage | PASS: both hooks 100% lines/functions; useClassrooms 97.39% branches, useOpenClasses 83.82% branches. This measures transformed source execution with hook doubles, not React/DOM coverage. |
| Limited JS/JSX diagnostic | Parsed source and valid bindings | PASS: five changed executable/test modules, zero errors via existing check-source.cjs inspectSource. This is not the repository lint suite. |
| Source governance and provenance | Reviewed bindings, public boundaries and memory | PASS: 12 readiness milestones, 11 internal submission checkpoints of 12 planned, context binding, 1,844-file boundary and memory validation; the 62 pre-existing findings and 32 unwired gates remain explicit |
| Rendered classroom suites | Native React lifecycle and controls | BLOCKED: npm test exits 127 (vitest unavailable); module resolution independently confirms React and Vitest missing. Seven new rendered cases are retained. |
| Native classroom suite | Real PocketBase auth/storage | NOT RUN: all ten cases skip without BUILDANDDO_TEST_POCKETBASE; no native pass is counted |
| Historical broadcast case-study evidence | Original retained revision is locally inspectable | BLOCKED: separate broadcast-lessons suite passes 12/13; its historical binding test cannot read revision 7301df8cd79a4e9b36a148512dce9fb687323a63. Existing evidence and gate remain unchanged. |
| Production bundle / full frontend lint | Locked project toolchain | NOT RUN: local Vite, React and ESLint packages are absent; global ESLint only supplies the limited diagnostic |
| Hosted/runtime/media acceptance | Independent actual environment evidence | NOT RUN: receiving owner work |

Runtime: Node 24.13.0, Python 3.12.13. The repository requests Node 22; receiving
CI must repeat acceptance on that declared runtime. Default Node worker isolation
hid per-case output in this sandbox; `--test-isolation=none` executes the same
actual cases locally. Global ESLint is resolved via its existing local NODE_PATH;
no dependency install or network request is used.

The initial route-invariant test addressed a nonexistent fixture field; correcting
it to the existing `lesson.check` contract confirmed the invariant passes before
repair. It is excluded from the eight product regressions. A later callback test
distinguishes prohibited old callbacks from a valid fresh-session GET triggered
by rerender. Neither adjustment weakens a production boundary.

Source hashes, test names and observation scope are retained in the sibling
validation JSON. The mandatory source-node runner discovers *.test.mjs, including
the new regression suite. Source-binding refreshes acknowledge reviewed bytes
only; they do not mark a milestone, deployed classroom or media session complete.

## §4 MEMORY INGEST

Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json.
Type A count: 1,013. Type B count: 2,650. Type C count: 255.
All 252 prior Type C events are preserved in their original order. IOO completeness,
declared edges and zero orphans are checked by the dispatch verify.py command
above. Three new events record the reproduced failure, source validation and
unexecuted acceptance boundary with actual timestamps.

## §5 CKET FILING

04_HYPOTHESIZE: existing upgrade SRS acceptance.
06_PLAN: classroom guide and sprint-closure receiving requirements.
07_BUILD: existing discovery and classroom hooks.
08_TEST: source regression suite and existing React hook suites.
11_COMMIT: dispatch, reviewed readiness/context bindings, report, validation,
handoff and cumulative memory. Every new file has a CGRF header or JSON sidecar.
REFLEX validation remains the private post-merge check.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. This continuation uses the existing in-progress A2
classroom dispatch. No secret, private evidence, golden/infrastructure file,
deployment-control change, external message or live seat event is introduced.
Exactly one actor:agent label is required when the review is synchronized; no
label application is claimed by this source session. Checkout/payment behavior
is unchanged. CK/CAPS/CKS remain pending.

Rollback: revert the two public hooks through normal review/release governance.
There is no schema or stored-record migration. A command already accepted by the
backend remains real history; browser cancellation does not roll it back.

## §7 NEXT ACTIONS

Follow .bits/handoffs/2026-09-30-bits-codegen-cmax-b-classroom-recovery.md.
CMAX-B must obtain the reported page/error, run the authored React/native checks,
confirm the matching deployed routes/migrations and measure actual host/listener
media with independent readback. No external activation or publication was done.
No out-of-scope product bug or runtime cause is inferred from missing tools or
historical repository objects. The prior media-corpus continuation is preserved.
