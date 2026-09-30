# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/buddi-connection-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     apps/web/src/components/voice/TalkToBuddi.jsx, apps/web/src/components/voice/VoiceSession.jsx, tests/upgrade/public-action-telemetry.test.mjs, .bits/handoffs/2026-09-30-bits-codegen-cmax-b-buddi-activation.md
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/components/voice/TalkToBuddi.jsx; CONSUMES apps/web/src/components/voice/VoiceSession.jsx; VERIFIED_BY tests/upgrade/public-action-telemetry.test.mjs; CONSUMES .bits/handoffs/2026-09-30-bits-codegen-cmax-b-buddi-activation.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# DAG Node:    none
# Intent:      Retain observed Buddi connection regression results and explicit rendered and live acceptance limits for the public source candidate.
# ───────────────────────────────────────────────────────────────

# Buddi connection recovery report

## §1 SUMMARY

Status: PARTIAL for acceptance; source repair implemented.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Risk: A2. Actor: actor:agent.
Smoke: 143/143 targeted Node cases. CKS Gate/CKS/CAPS/CK: pending.

The primary repository is mrnobodytx/buildanddo. The user requested improved
connections, integrations and Buddi usage after a supporting-system handoff.
The supplied 84-test result is attributed context, not evidence from this run.
No provider settings, credentials, deployed website or post-call receiver were
changed. Review publication and branch naming are managed by the session UI.

## §2 TASK RESULTS

| Task | Status | Output and verification |
|---|---|---|
| BV-1: Reproduce connection defects | PASS | Twelve targeted failures before the repair: duplicate starts, obsolete permission results, repeated terminal callbacks, unhandled SDK rejections, absent timeout and unconfirmed hang-up. Run the voice selection below. |
| BV-2: Repair cancellation and recovery | Source PASS | Twenty-three voice handler cases pass; consent/lazy loading/agent identity stay intact. Six rendered regression cases were added but require the locked frontend dependencies. |
| BV-3: Retain integration acceptance | PARTIAL | The source contract and receiving handoff name actual browser/provider work. Readiness bindings, boundary and memory checks are required below; they do not establish runtime acceptance. |

Code: apps/web/src/components/voice (07_BUILD).
Tests: the existing voice __tests__ files and
tests/upgrade/public-action-telemetry.test.mjs (08_TEST).

## §3 SMOKE TEST RESULTS

Use Node 22 from `.nvmrc`:

```bash
node --test --test-name-pattern='voice' tests/upgrade/public-action-telemetry.test.mjs
node --test tests/upgrade/public-action-telemetry.test.mjs tests/upgrade/public-api.test.mjs tests/upgrade/staging-contract.test.mjs
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
```

| Check | Expected | Observed |
|---|---|---|
| Voice regression selection | No obsolete updates; bounded recovery | PASS: 23 cases |
| Public actions, public API contracts and staging contracts | Existing privacy, route and header contracts preserved | PASS: 143 cases on Node 22.17.0, zero failures or skips |
| Changed JS/JSX source diagnostic | No syntax or binding errors | PASS: five modules through the existing check-source.cjs inspectSource function and locally installed ESLint; not full repository lint |
| Readiness/context/public boundary/memory | Current source binding and valid provenance | PASS: both readiness checks, context binding, 1,821-file public boundary and cumulative memory validator |
| Rendered voice tests and coverage | Real React behavior and at least 80% new-code coverage | BLOCKED: React, Vitest and the ElevenLabs SDK are not installed |
| Repository lint and production build | Locked frontend toolchain completes | BLOCKED: repository lint plugins and Vite are not installed |
| Live voice, public-tool and post-call acceptance | Same-candidate actual provider readback | NOT RUN: receiving runtime work |

The initial red run had 8 passes and 12 expected regression failures. Fixes bind
permission completion to the current attempt, fence SDK callbacks after a
terminal event or unmount, catch asynchronous SDK errors, release a transport
that finishes opening late, and distinguish confirmed hang-up from failure.
Three additional cases cover end timeout, late rejection and synchronous close
failure. The final selection has 23 passes.

The default sandbox denied Node workers and loopback test sockets. The same
repository tests passed with permitted local process/socket access; no live
backend or internet connection was used. The empty Node coverage report for
virtual JSX handlers does not measure component coverage and is not accepted.
The handler harness executes production closures with hook/SDK/clock doubles;
it is not rendered browser evidence. No native PocketBase suite ran.

## §4 MEMORY INGEST

Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json.
Type A count: 987. Type B count: 2,568. Type C count: 248.
IOO compliance: PASS. DKG orphans: 0. The cumulative metadata now matches current
source, including inherited stale line counts; historical Type C events remain
unchanged. Only observed source results and runtime limits were appended. Run
the dispatch verify.py command above to reproduce these checks.

## §5 CKET FILING

04_HYPOTHESIZE: existing upgrade spec. 07_BUILD: existing voice components.
08_TEST: existing rendered and handler regression suites. 11_COMMIT: dispatch,
readiness/context bindings, handoff, report and memory. Both new Markdown files
carry CGRF headers. REFLEX validation remains the post-merge owner's check.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. The pre-existing registered A2 upgrade dispatch
covers this public source repair. No secret, private evidence, deployment
control or live seat event is added. The existing public-boundary gate remains
required; exactly one actor:agent label is required at review publication.
No checkout or payment behavior changed. No CK/CAPS/CKS value is asserted.

Rollback: revert this source repair and release the prior accepted website
artifact through the normal owner. No migration, provider setting or post-call
configuration needs compensation.

## §7 NEXT ACTIONS

CMAX-B / IDE1 and the private integration owner receive
.bits/handoffs/2026-09-30-bits-codegen-cmax-b-buddi-activation.md.
Run the rendered checks and build, then verify permitted same-candidate voice,
public tools and post-call receipts through the existing release and integration
owners. Source repair and source-binding refresh do not mark the sprint or live
integration complete. No out-of-scope issue was filed.
