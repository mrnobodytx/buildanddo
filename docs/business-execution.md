# ─── CGRF Header ───────────────────────────────────────────────
# File:         docs/business-execution.md
# Stage:        06_PLAN
# SRS:          SRS-BUILDANDDO-UPGRADE-001
# CAPS:         pending
# CK:           pending
# Dispatch:     VCC-BUILDANDDO-UPGRADE-001
# Seat:         BITS-CODEGEN
# Owner:        Citadel Nexus Inc.
# Created:      2026-09-21
# Depends:      apps/pocketbase/pb_hooks/business-actions.js, apps/mission_suite/business_worker.py, scripts/ci/submission_readiness.py
# EnumType:     Doc
# EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/business-actions.js; DEPENDS_ON apps/mission_suite/business_worker.py; DEPENDS_ON scripts/ci/submission_readiness.py
# DAG Node:     none
# Intent:       Define the end-to-end business action protocol, native authorization and evidence needed to activate and verify it.
# ───────────────────────────────────────────────────────────────

# Bounded business execution

An approved workflow can now create a real ERP task, capture one public source
through Firecrawl, or call one registered n8n operation. A returned result creates
retained evidence and advances the frozen workflow step atomically. It never
marks the mission verified. The source is public application code; installing
migrations, binding providers and running shared workers require the receiving
operator's dispatch.

## User journey

1. Capture an allowed public HTTPS source in Signals using an installed Firecrawl
   binding. Reload its result and inspect the source URL, digest and receipt.
   An unchanged capture reuses the signal; each attempted capture retains its own
   job. The source text is an observation, not an established fact.
2. Propose a mission from the saved signal. Complete purpose, limits, baseline,
   target, rollback and independent-review requirements. A human approves the
   plan and records work started.
3. Create a workflow with an approval checkpoint first and an **Execute** step.
   Choose ERP task creation, Firecrawl or a registered n8n operation. Start a run
   linked to the running mission; an owner or administrator reviews its frozen
   inputs at the checkpoint.
4. Execute that exact step. ERP writes its task and evidence in the native
   transaction. External actions wait for the registered worker. The run shows
   queued, dispatched, failed, succeeded or HOLD observations.
5. Inspect the task, provider result and evidence. A different authenticated
   account performs all four TEVV checks against the original approved plan.
   The Daily Edition uses the resulting review timestamp, and Execution Replay
   reads the retained history without repeating effects.

## Native protocol and isolation

`GET /api/buildanddo/workspaces/{workspace}/business` reads bounded receipt pages.
`POST` on the same path accepts `{action, request_key, revision, payload}`. Native
PocketBase users, current membership and record visibility apply on every call.
Browser input never supplies its own user, worker, callback URL or release identity.

The existing administration audit store makes commands transactional and
replayable. An effect is unique per workspace/run/frozen step. A second enqueue,
including one after a lost response, returns the existing job. Actions cannot
substitute a manual "passed" observation for an executable step. Source capture
uses the account, workspace and explicit retry identity.

| Action | Required effect |
|---|---|
| `source.capture` | Enqueue an allowed public URL using a registered read binding |
| `action.enqueue` | Execute or enqueue the current approved frozen workflow step |
| `action.claim` | Register a worker lease before dispatch; at most three claims |
| `action.begin` | Recheck approval, role, run/config revision, release and health, then persist dispatch |
| `action.complete` | Retain the exact provider result, evidence and run event together |
| `action.hold` | Preserve an uncertain dispatched effect for reconciliation |
| `action.cancel` | Cancel undispatched work; dispatched work remains uncertain |
| `action.reconcile` | Retain a readback of an already issued effect |
| `integration.observe` | Store a fresh probe for the current registered configuration |

`business_jobs` is locked against ordinary collection CRUD. Read routes additionally
apply current mission/run/evidence visibility. The worker lease is returned only
to its registered account. The original requester must still have write access
before dispatch. ERP relations must be readable in the same workspace. Executed
ERP tasks retain their mission, execution and evidence links; ordinary updates
cannot erase or substitute those links. Reviewed and execution evidence cannot
be edited or deleted; record a separate correction and a new review instead.

## Worker and connector contracts

The operator binds each process to one workspace and one connector. PocketBase's
`BUILDANDDO_BUSINESS_BINDINGS` is an array of `{workspace, provider, binding,
worker, operations}` entries. `operations` is required for n8n and contains only
reviewed aliases. The worker account must hold a current writer role. Matching
configuration is requested through the existing Integrations page; a name alone
never establishes health.

The worker's `BUILDANDDO_BUSINESS_WORKER` JSON has exactly `workspace`, `provider`,
`binding`, `health_path`, `operations`, and `reconcile_path`. `operations` maps
aliases to fixed relative provider paths. n8n requires a read-only reconciliation
path. Firecrawl uses the existing research Processor and source-admission policy.
Operator-owned base URLs are `BUILDANDDO_POCKETBASE_URL` and
`BUILDANDDO_BUSINESS_PROVIDER_URL`; runtime-only secret bindings are
`BUILDANDDO_WORKER_TOKEN` and `BUILDANDDO_BUSINESS_PROVIDER_TOKEN`. Do not place
credentials or private endpoint inventories in Git or browser configuration.

The explicit receiving invocation is:

```bash
python -m apps.mission_suite.business_worker --once
python -m apps.mission_suite.business_worker --once --reconcile
```

No worker is activated by installing the source. The operator supplies the real
provider paths and validates their data rights before running either command.
A health GET must return a recognizable successful observation; its digest,
time and configuration revision are retained. Disabled bindings are not probed.
A stale, unavailable or changed binding cannot begin an effect.

n8n receives `buildanddo.business-effect/v1` with workspace, effect_key, operation,
input, mission, run and the declared release context. Its adapter must durably
deduplicate `effect_key` and return `{effect_key, status, execution_id, summary}`.
A failed status still requires the same effect identity and execution ID. The
reconciliation GET returns that existing receipt; it must never execute work.
These are contracts for an existing receiving integration, not a generated n8n
installation or proof that a live workflow is configured.

## Uncertainty and release evidence

Provider calls happen only after `dispatched` is stored. A timeout, HTTP error or
lost response can occur after a remote effect, so it becomes HOLD. Dispatched or
held work is never claimable again. Cancellation after dispatch preserves the
unknown outcome; a later receipt remains evidence but cannot advance a cancelled
run. A new attempt requires review of what happened first. This is at-most-once
issuing with explicit uncertainty, not a claim of distributed exactly-once effects.

PocketBase may receive a runtime `BUILDANDDO_RELEASE_CONTEXT` JSON with exactly
`candidate_sha`, `source_sha256`, `artifact_tree_sha256`, `dispatch`, and
`environment` (staging, production or fixture). Each job freezes it. Missing
context remains null; a changed declaration stops undispatched older work. It is
an operator declaration, not a signature or deployment proof. Submission compares
it with independent release captures and the exact native result.

At `/app/replay`, export the page containing the demonstrated action. Its
`buildanddo.business-replay/v1` export retains recorded state and explicitly says
it does not establish independent verification. The replay's action output must
be the UTF-8, sorted-key, compact JSON bytes of `job.result.reported`, without an
added newline. Its SHA-256 must equal the native `result_sha256`. Preserve the
actual start/finish times, input limit, evidence ID and worker identity.
`execution_kind` is `native` for ERP and `worker` for external jobs. The full
submission check rejects substitutions, missing release context and mismatches.

## Validation and recovery

Run `node --test tests/upgrade/business-execution.test.mjs tests/upgrade/business-client.test.mjs` as one command, then
`python -m unittest tests.upgrade.test_business_worker` and the required native
workspace matrix. Rendered workflow, ERP and replay checks remain separate from
storage/transport doubles. A real provider result and a distinct verifier are
required before a deployed milestone can pass.

Ship migrations `1790700000`, `1790800000`, all matching hooks and the frontend
as one reviewed candidate. The business migration preserves receipts, tasks,
signals and provenance when rolled back; removing its protocol marker disables
execution. Reapplying validates retained fields and indices. Stop the receiving
worker and disable its binding before source rollback; reconcile already-issued
effects and keep their history. Never delete a migration or hand-edit shared data.
