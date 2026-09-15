# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/workflow-system.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     apps/pocketbase/pb_hooks/workflow-runs.js, apps/pocketbase/pb_hooks/workflows.pb.js, apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js, tests/upgrade/workflow-runs.test.mjs
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workflow-runs.js; CONSUMES apps/pocketbase/pb_hooks/workflows.pb.js; CONSUMES apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js; VERIFIED_BY tests/upgrade/workflow-runs.test.mjs
# DAG Node:    none
# Intent:      Explain recorded workflow execution, its permission and retry boundaries, and the evidence needed before native activation.
# ───────────────────────────────────────────────────────────────

# Workflow runs and evidence

The Workflows desk stores repeatable procedures and the history of people
performing them. Each run keeps the steps saved at its start. Its decisions
record what happened, who recorded it, when, and an Evidence Ledger receipt.
Editing a workflow changes future runs without rewriting that history.

Activation makes a procedure eligible for a run. It does not record an execution
timestamp. The historical `last_run` values written by earlier activation UI are
left intact, but the desk derives execution history exclusively from saved runs.
Starting a recorded run writes a real start timestamp on the server.

## Use the desk

1. Save a draft workflow with up to 20 ordered steps. Choose the read, transform,
   approval, notify or record kind and describe the work and its boundaries.
   Edit and save legacy steps missing identifiers before starting them.
2. Activate the saved procedure, then inspect **Run history** before starting
   another run. Filter by workflow or **Awaiting approval**. History uses pages
   of 20 records and displays an unavailable state when its read fails.
3. Choose **Start a run**. Optionally link a mission that is already running
   with a recorded approval. The run copies the mission's approval receipt as
   well as the workflow steps.
4. Perform the current step. Record the observed result and its source. Confirm
   that the step was performed, or record an honest failure. Each successful
   decision saves both the run event and a new Evidence Ledger record.
5. At an approval checkpoint an owner or admin records an explicit approval or
   rejection with a rationale. Editors cannot bypass the checkpoint. A rejection
   ends the run as failed; an approval unlocks the following step.
6. Finish all steps or explicitly cancel with a reason. A finished run is
   terminal. Starting another run produces a separate history, not a rewrite.

Step kinds describe work the operator performs. They do not send messages,
invoke n8n, run an agent or start infrastructure. A completed run records the
operator's observations. It does not mark a mission verified, issue a credential
or establish independent TEVV. The Mission Desk retains its own evidence review.

## Backend contract

Both commands are relative to the existing PocketBase base URL and use native
PocketBase authentication. Run collection writes are locked for ordinary
accounts; the commands validate authority before writing with the transaction
app. Existing mission, workflow and evidence collection rules are preserved.

| Action | Endpoint | Required body |
|---|---|---|
| Start | `POST /api/buildanddo/workflow-runs` | `workspace`, `workflow`, `request_key`; optional `mission` |
| Decide | `POST /api/buildanddo/workflow-runs/{id}/decisions` | `workspace`, `request_key`, `revision`, `action`, `observation`; step decisions also require `step_id`, `outcome`, and an observation `source` for non-approval steps |
| Read history | `GET /api/collections/workflow_runs/records` | Standard PocketBase pagination/filter parameters |
| Read one run | `GET /api/collections/workflow_runs/records/{id}` | Standard PocketBase record read |

A start response is `{record, replayed}` with HTTP 201 for a new run or HTTP 200
for an identical retry. A decision returns the same envelope with HTTP 200.
Request keys contain 16–80 letters, digits, underscores or hyphens. The browser
uses a UUID and retains it while retrying the same inputs. Changing the proposed
inputs creates a new request key. Keys are not authorization credentials.

Decision `action` is `step` or `cancel`. Ordinary steps accept `passed` or
`failed` with a nonempty observation and source. Approval steps accept `approved`
or `rejected` and use a server-defined decision source. Cancellation accepts a
reason in `observation` and empty `step_id`, `outcome` and `source`. Observations
are bounded to 1,200 characters, sources to 160. Unknown body properties fail.

The stored run has `snapshot`, `events`, `next_step`, `revision`, `status`,
`started_at`, `finished_at`, and owner/workspace/workflow/optional mission
relations. The snapshot contains the original name, description, ordered steps,
workflow update timestamp and optional mission identity/approval timestamp.
An event retains the normalized submitted decision, authenticated account,
server time and evidence ID. No client-supplied author, timestamp or status is
accepted. Stored JSON object key ordering does not affect retry matching.

| Current role | Read runs | Start/record/cancel | Approve/reject checkpoint |
|---|---|---|---|
| Workspace owner or admin | Yes | Yes | Yes |
| Editor | Yes | Yes | No |
| Viewer | Yes | No | No |
| Removed member or outside account | No | No | No |

Membership lookup binds user, workspace and role to one membership row. The
custom commands also check native readability of source records. All step
transitions are ordered. Revision mismatch returns HTTP 409 before creating
evidence. Reusing a request key for different inputs or a different decision
author also returns 409. Identical retries recover the saved result, including
after a run has finished; they do not append evidence again.

When linked to a mission, further work requires that mission to remain running
under the same approval. Pausing, reapproving or removing the mission prevents
continued steps. Cancellation remains available so interrupted work can be
closed honestly. The run does not mutate the mission's status or review.

## Integrity and recovery

Each new run and its workflow timestamp are saved in one transaction. Each
decision and its new evidence record are saved in one transaction. A failed
save rolls back both writes. An uncertain network result must be retried using
the same inputs/key; the browser avoids claiming that nothing was written.
Two tabs using the same revision cannot both advance the run. A database lock
or interrupted connection may require a retry; the unique start key protects
against duplicate persistence.

Run state has no ordinary direct update/delete API. The normal workflow delete
hook rejects definitions with run history; pause them instead. Evidence Ledger
records retain their existing editable semantics, while run events keep a copy
of the submitted observation even if that separate record later changes.
Workspace deletion cascades run history; trusted backend/superuser access still
has administrative authority. These receipts are not cryptographic attestations.

The UI binds commands and reads to the initiating account, workspace and demo
state. Late responses cannot reopen another workspace's dialogs. Demo mode
never sends a run command. Private forms and receipts are masked for replay
and excluded from PostHog autocapture.

Browser mutation telemetry uses `workspace.workflow_run.create` and
`workspace.workflow_run.update` with outcome/duration. Opt-in PocketBase stdout
telemetry includes committed run counters and bounded command endpoint latency.
Names, observations, evidence IDs and account IDs are excluded from telemetry.
Collectors remain optional; no transport or credentials are installed here.

## Verification and activation

Run the production-source contracts locally:

```bash
node --test tests/upgrade/workflow-runs.test.mjs tests/upgrade/workflow-client.test.mjs tests/upgrade/pocketbase-metrics.test.mjs
node --test --experimental-test-coverage --test-coverage-include=apps/pocketbase/pb_hooks/workflow-policy.js --test-coverage-include=apps/pocketbase/pb_hooks/workflow-runs.js --test-coverage-include=apps/pocketbase/pb_hooks/workflows.pb.js --test-coverage-include=apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js --test-coverage-include=apps/web/src/lib/workflowRuns.js tests/upgrade/*.test.mjs
npm --prefix apps/web test -- src/pages/workspace/__tests__/WorkflowsPage.test.jsx src/components/workspace/workflows/__tests__/WorkflowRuns.test.jsx
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Node executes the actual helpers, commands, hook registration and migration
with transaction and record contract doubles. It tests rollback, lost-response
retries, reordered stored JSON, current membership, approval restrictions,
step/revision conflicts, terminal outcomes and mission approval changes. These
results do not establish native PocketBase SQL/JSVM behavior or UI acceptance.

Before activation, the backend owner must validate on an isolated PocketBase
0.28.4 instance using its normal migration and account provisioning process:

- Apply the migration twice, validate the read back-relation for owner/admin/
  editor/viewer and removed members, and verify that direct run writes fail.
- Send concurrent identical starts and two distinct decisions with the same
  revision. Observe one durable start and at most one advancing decision, then
  retry any database-busy/transport failure with its original request key.
- Verify one evidence record per accepted decision and none after transaction
  rollback. Check native JSON serialization, registered callbacks and API errors.
- Verify a paused/reapproved mission blocks work but allows cancellation, and
  that finishing a workflow never changes mission verification state.
- Exercise dialogs at 320, 375 and 1280 px in both themes: Tab/Shift-Tab, Escape,
  focus return, long observations, pagination, retries and account changes.

The repository report records the observed command results and remaining
environment blockers. Source, migration and hooks must be reviewed together;
the source dispatch itself performs no shared migration or deployment.

For source rollback, remove the new UI/commands together while retaining the
run collection with direct writes locked. This preserves history for recovery.
The explicit down migration deletes the new collection and its run data;
only use it after the deployment owner decides retention. Existing evidence
rows remain. Old activation dates are never converted into invented run records.
