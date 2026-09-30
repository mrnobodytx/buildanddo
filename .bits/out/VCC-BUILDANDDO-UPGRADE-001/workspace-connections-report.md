# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/workspace-connections-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     tests/upgrade/workspace-connections.test.mjs, apps/web/src/lib/connectorReadiness.js, docs/workspace-administration.md, docs/workspace-assistant.md, docs/workflow-system.md, .bits/handoffs/2026-09-30-bits-codegen-ide1-workspace-connections.md
# EnumType:    Doc
# EnumEdges:   VERIFIED_BY tests/upgrade/workspace-connections.test.mjs; CONSUMES apps/web/src/lib/connectorReadiness.js; CONSUMES docs/workspace-administration.md; CONSUMES docs/workspace-assistant.md; CONSUMES docs/workflow-system.md; CONSUMES .bits/handoffs/2026-09-30-bits-codegen-ide1-workspace-connections.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Retain reproduced workspace connection failures, source repairs and receiving-runtime gaps without treating source checks as live service activation.
# ───────────────────────────────────────────────────────────────

# Workspace connection repair report

## §1 SUMMARY

Status: PARTIAL for runtime acceptance; source repairs implemented.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Risk: A2. Actor: actor:agent.
Tasks: 3/3 source phases. Smoke: 344/344 targeted Node cases.
CKS Gate/CKS/CAPS/CK: pending. Review publication is managed by the session UI.

The resumed request expands the previous voice repair to disconnected workspace
systems. The iteration baseline and its voice safeguards remain intact. No live
service, credentials, deployment or private-repository evidence was inspected or
changed. The owner's report of 84 private tests remains attributed context.

## §2 TASK RESULTS

| System / connection | Observed defect or limit | Result |
|---|---|---|
| Integration management to operator observations | An open desk retained `current: true` after the backend's fifteen-minute freshness window; no direct observation refresh existed. | Source repaired: shared freshness rule, fifteen-second display updates and a read-only refresh available to viewers. Configuration receipts still require the requested revision. |
| Workspace Buddi to existing inference | The UI reported missing configuration while allowing session/chat POSTs; failed connection reads could leave sending enabled. | Source repaired: configuration loading/failure/absence pause sends and retain drafts. An explicit recheck restores use. Configured endpoints can still fail inference; no healthy-provider claim is made. |
| Workflow action to current receipt | Older polls could erase a newer receipt; a failed reload retained dispatch eligibility; stale run/step reads could trigger the wrong review update. | Source repaired: request sequence and scope checks, failure recovery, stable retry identities and current permission gating. |
| Execution to enclosing review | The execution child did not report its busy state, leaving cancellation available during dispatch. | Source repaired: the enclosing review/dialog receives busy state; cancellation and competing revision changes pause until the request settles. |
| Workflow to mission/evidence | The mission link opened the generic desk and evidence identifiers were plain text. | Source repaired: saved IDs reach existing scoped record routes. Destination permissions remain unchanged. |
| Signals to mission proposals and workflow receipts | Existing server/client contracts were inspected through their connected suites. | Regression controls pass for proposals, recorded outcomes, native role checks and receipt identity. Actual native/browser deployment remains unmeasured. |
| Public Buddi voice | Earlier consent, cancellation, timeout and hang-up repairs are preserved. | The current regression selection includes the 23 voice cases. Real voice/public-tool/post-call acceptance remains in its earlier handoff. |
| Provider activation | Nine provider definitions are exposed; the inspected business worker implements Firecrawl/n8n. Saving requests cannot provision executors. | Receiving-owner work remains; no live health result is invented for any provider. |

WC-1 reproduced nine failing cases and one passing control before repair.
WC-2 now passes all eighteen dedicated cases, including additional overlap,
uncertainty, unmount, permission and parent-lock controls. WC-3 retains the source
and runtime boundary in this report, the reviewed readiness contract and handoff.

## §3 SMOKE TEST RESULTS

Use Node 22 from `.nvmrc`:

```bash
node --test tests/upgrade/workspace-connections.test.mjs
node --test tests/upgrade/workspace-connections.test.mjs tests/upgrade/workspace-administration.test.mjs tests/upgrade/workspace-control-client.test.mjs tests/upgrade/workspace-assistant.test.mjs tests/upgrade/workspace-integration.test.mjs tests/upgrade/business-execution.test.mjs tests/upgrade/workflow-client.test.mjs tests/upgrade/workflow-runs.test.mjs tests/upgrade/signal-mission.test.mjs tests/upgrade/sprint-journey.test.mjs tests/upgrade/public-action-telemetry.test.mjs tests/upgrade/read-failure-telemetry.test.mjs
node --test --experimental-test-coverage --test-coverage-include=apps/web/src/lib/connectorReadiness.js tests/upgrade/workspace-connections.test.mjs tests/upgrade/sprint-journey.test.mjs
npm --prefix apps/web test -- src/components/workspace/__tests__/WorkspaceAssistant.test.jsx src/pages/workspace/__tests__/AdministrationFlow.test.jsx src/components/workspace/workflows/__tests__/WorkflowRuns.test.jsx
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
```

| Check | Observed result and limits |
|---|---|
| Dedicated production-handler regressions | PASS: 18 cases. Initial red run: 1 pass, 9 failures covering stale health, premature assistant sends and workflow readback/permission races. |
| Connected source regression selection | PASS: 344 cases on Node 22.17.0, zero failures or skips. Backend storage, SDK and hook doubles are explicit; this is not native or rendered acceptance. |
| Shared connector-readiness coverage | PASS: 100% lines, 92% branches and 100% functions, measured over 46 selected cases. This measures the imported helper only, not JSX component coverage. |
| Changed source/test syntax and bindings | PASS: nine JS/JSX/MJS modules through the existing `check-source.cjs` diagnostic. Full repository lint remains separate. |
| Rendered suites | BLOCKED: attempted command exited 127; React, Vitest, Vite and ElevenLabs dependencies are absent. Added/revised rendered connection, draft, navigation and dispatch-lock cases have not executed here. |
| Full lint/build, native PocketBase and live providers | NOT RUN in this continuation: the locked frontend dependencies/native binary and receiving runtime are unavailable. Prior build/native limits remain open. |
| Readiness, context, public boundary and memory | PASS: both readiness checks, context, 1,824-file public boundary and cumulative memory. The existing 62 context findings, including 32 unwired gates, remain visible; this inventory is not a count of proven broken services. These checks do not establish deployment or milestone acceptance. |

The default sandbox blocked required Node/Python subprocess behavior. The broader
run was stopped and repeated with authorized local process access; all 344 cases
then passed. No internet dependency installation or external request was used.

## §4 MEMORY INGEST

Payload: .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json.
Type A: 990. Type B: 2,590. Type C: 252. IOO: PASS. DKG orphans: 0.
Existing event order and historical observations are retained; this
continuation appends its observed regressions, passing checks and runtime limits.
Use the dispatch `verify.py` command above for exact counts and source matching.

## §5 CKET FILING

04_HYPOTHESIZE: the existing upgrade spec. 06_PLAN: integration, assistant and
workflow guides. 07_BUILD: existing connection/assistant/workflow components and
the shared readiness helper. 08_TEST: the new handler suite and existing rendered
suites. 11_COMMIT: dispatch, reviewed bindings, report, handoff and memory.
All three new files carry CGRF headers. REFLEX remains the post-merge owner's check.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. The pre-existing registered A2 upgrade dispatch covers
these source repairs. No permissions, migrations, secrets, checkout behavior or
deployment controls changed. Exactly one `actor:agent` review label is required.
No live seat event or external issue/comment was fabricated or sent.

Rollback: restore the prior accepted frontend through the release owner while
retaining requests, conversations, jobs and evidence. No database migration or
provider-side compensation is required by this source change.

## §7 NEXT ACTIONS

Receiving owners: IDE1 / CMAX-B and existing provider operators. Follow
.bits/handoffs/2026-09-30-bits-codegen-ide1-workspace-connections.md for locked
rendered checks, disposable native journeys and exact-candidate provider readback.
The earlier public voice activation handoff remains applicable. Source repairs
and refreshed bindings do not complete live integrations or sprint acceptance.
