# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/learning-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     docs/interactive-learning.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/learning-validation.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/interactive-learning.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/learning-validation.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# DAG Node:    none
# Intent:      Record observed interactive-learning source checks and distinguish certificate rendering from unrun application and native acceptance.
# ───────────────────────────────────────────────────────────────

# Interactive tutorials, certificates and persistent growth

## §1 SUMMARY

Status: PARTIAL — implementation complete; native and rendered application acceptance pending
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Authority: owner-requested A2 public source continuation
Tasks: 4/4 source phases implemented; TL3 runtime acceptance remains open
Smoke: 425/425 broader Node cases; 43/43 targeted learning/classroom cases
CKS Gate: B+/75 target; CKS: pending; CAPS: pending; CK: pending
Branch/commits: inspect `git branch --show-current` and `git log -1 --format=fuller`

## §2 TASK RESULTS

| Task | Status | Result | Verify | CKET |
|---|---|---|---|---|
| TL1 — durable tutorial contract | PASS for source | Frozen enrollment, ordered sections, practice, server-graded answer and one atomic certificate/progress update | `node --test tests/upgrade/tutorial-learning-system.test.mjs` | 07_BUILD, 08_TEST |
| TL2 — interactive Field Manual | PARTIAL acceptance | Resumable guided reader, wrong-answer feedback, downloadable certificate and personal growth across existing catalogue surfaces | `node --test tests/upgrade/tutorial-learning-client.test.mjs`; targeted React command below | 07_BUILD, 08_TEST |
| TL3 — isolation and acceptance | PARTIAL acceptance | Contract tests and exported-certificate browser check pass; native and full web tools unavailable | Native, web and certificate commands below | 08_TEST |
| TL4 — governance and retention | PASS for recorded source | Preserved prior history, current context, retained rollback, required CI gate and explicit gaps | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`; context/boundary checks | 04_HYPOTHESIZE, 06_PLAN, 11_COMMIT |

The ordinary reader and its historical completions remain. Only guided completion
earns a certificate and 100 learning points. The native collection is locked;
client-supplied identities, points, states and certificates cannot award credit.
Repeated enrollment/review and uncertain-response retries retain the same award.
Learning levels and milestones are derived from distinct completed records. No
mission verification or independently audited contributor reputation is changed.

## §3 SMOKE TEST RESULTS

| Check | Command | Observed result |
|---|---|---|
| Targeted regression | `node --test tests/upgrade/tutorial-learning*.test.mjs tests/upgrade/classroom-client.test.mjs tests/upgrade/classroom-system.test.mjs` | PASS, 43/43; includes 23 learning cases and existing classroom/privacy regression |
| Broader Node regression | `node --test tests/upgrade/*.test.mjs` | PASS, 425/425 in the broader run; subsequent installation/privacy cases were run in the targeted gate |
| Measured source coverage | `node --test --experimental-test-coverage --test-coverage-include=apps/pocketbase/pb_hooks/tutorial-learning.js --test-coverage-include=apps/pocketbase/pb_hooks/tutorial-learning.pb.js --test-coverage-include=apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js --test-coverage-include=apps/web/src/lib/tutorialLearning.js tests/upgrade/tutorial-learning*.test.mjs` | PASS, 100% lines in all four implementation modules; React coverage unavailable |
| Static web diagnostic | `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs` | PASS, 286 parsed modules; zero static errors; does not replace repository lint |
| Python test source | `python -m ruff check tests/upgrade/test_tutorial_learning_native.py`; `python -m compileall -q tests/upgrade/test_tutorial_learning_native.py` | PASS |
| Rendered React | `npm --prefix apps/web test -- src/components/workspace/__tests__/InteractiveTutorial.test.jsx src/components/workspace/__tests__/TutorialCatalog.test.jsx` | BLOCKED, exit 127: Vitest absent; eight new rendered cases authored, none executed |
| Native learning | `python tests/upgrade/test_tutorial_learning_native.py --require-binary` | BLOCKED, exit 1: no PocketBase binary; four native cases authored, none executed |
| Web lint | `npm --prefix apps/web run lint` | BLOCKED, exit 2: eslint-plugin-import absent |
| Web build | `npm --prefix apps/web run build` | BLOCKED, exit 1: Vite absent |
| Offline dependency recovery | `npm ci --offline --ignore-scripts --no-audit --no-fund` | BLOCKED: ENOTCACHED; required package archive unavailable locally; dependency files unchanged |
| Context | `python scripts/ci/agent_context.py --check` | PASS after tracking new files and refreshing the lock; six existing findings retained |
| Public boundary | `python scripts/ci/verify_public_boundary.py` | PASS; no new private path or secret included |
| Dispatch memory | `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py` | PASS after refreshing metadata and preserving prior events |

The focused tests were first run red before the migration and command files
existed. Initial fixture failures during implementation came from selecting an
old seed row and keeping a reference after transaction rollback; the fixtures
were corrected to select the actual tutorial identity and re-read rolled-back
state. No production assertion was removed to make those cases pass. Final review also
isolated retries to each open tutorial so an unconfirmed save cannot follow a
learner into another lesson; the added rendered regression remains unrun with
the other React cases.

The final certificate HTML was generated by `certificateDocument()` from an
actual completion command against the explicit synthetic storage fixture. A
local browser observed no horizontal overflow at 320px and 1280px, no scripts,
and no external resources. Print media retained the certificate on one page.
This validates the exported artifact only, not the React application or native
PocketBase execution. Regenerate it using `learningFixture().finish()` from
`tests/upgrade/tutorial-learning-fixture.mjs` and the production export helper;
open the resulting local HTML at both widths and in print preview.

Missing tools were not replaced with simulated acceptance. The native learning
test is now required by the existing CI PocketBase version matrix. Hosted CI,
deployment, real account completion and cross-device runtime checks were not run.

## §4 MEMORY INGEST

Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
Counts: its final `summary` contains current Type A/B/C counts and is checked by
`python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.
IOO compliance: true. DKG orphans: 0. All 141 preceding Type C events are retained.
New events distinguish source passes, missing runtime tools and synthetic
certificate rendering. Source line counts and declared edges are refreshed.

## §5 CKET FILING

- 04_HYPOTHESIZE: existing SRS continuation and CI tag description in AGENTS.md.
- 06_PLAN: interactive learning guide and existing learning guide update.
- 07_BUILD: PocketBase schema/routes/commands, guided reader, growth, client,
  shared catalogue and telemetry URL redaction.
- 08_TEST: command/client/React/native learning tests and the storage fixture.
- 11_COMMIT: dispatch, CI gate, context lock, report, validation and memory.

New files carry CGRF headers; JSON validation uses its matching sidecar.
REFLEX: deferred to the existing receiving pipeline; no CK signature generated.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc.
Risk: A2; source and disposable synthetic validation only.
Existing public/private and actor-label gates retained. Actor label: `actor:agent`
required when publishing; no external label mutation performed here.
No live deployment, shared database, credential, payment or reputation operation.
Stripe: not applicable; no checkout code changed. License posture: unchanged.
Secret/public boundary: validated by the repository scanner.

## §7 NEXT ACTIONS

Run the required native gate on both declared PocketBase versions and the authored
React tests, repository lint and normal build in a dependency-equipped runner.
Before rollout, validate keyboard/focus, light/dark and reduced-motion behavior,
then install the additive migration and matching hooks/web source through the
existing release owner. No rollout authority is implied by this report.

Rollback: restore the previous UI/hooks while retaining learning data. The
migration's explicit down disables the new protocol and retains checkpoints,
certificates and legacy progress; up restores access to the retained records.
Existing six governance findings and unrelated operational gaps are unchanged.
