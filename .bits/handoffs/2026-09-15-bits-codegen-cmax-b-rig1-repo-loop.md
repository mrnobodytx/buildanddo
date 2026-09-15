# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-15-bits-codegen-cmax-b-rig1-repo-loop.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/handoffs/TEMPLATE.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md;
#              USES_TEMPLATE .bits/handoffs/TEMPLATE.md
# DAG Node:    none
# Intent:      Preserve the owner's Rig 1 execution requirements and testable private-seat handoff without adding runtime authority to the public site.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-09-15 BITS-CODEGEN -> CMAX-B

**Originating SRS:** SRS-BUILDANDDO-UPGRADE-001

**Dispatch:** VCC-BUILDANDDO-UPGRADE-001

**Status:** requested; private source access and execution dispatch required

**Receiving scope:** private `data_dog_private` runtime; coordinate backend ingress with IDE1

## What was asked

Install one governed runtime on Rig 1 and register existing GitLab clones with
it. Cloudflare verifies and queues minimal events. Rig 1 pulls those events,
assesses an exact commit, makes a governed mission decision, runs bounded stages
and produces evidence and a feature-branch MR for Runner/human verification.
MCP submits or inspects bounded work; a persistent supervisor owns execution.

```text
GitLab -> Worker (verify, allowlist, normalize) -> Queue
                                                  |
                                      outbound HTTP pull from Rig 1
                                                  |
                                     durable event receipt / registry
                                                  |
                                     existing runtime / supervisor
                                                  |
                                     feature branch -> MR -> Runner
                                                  |
                                          human / policy merge
```

The owner's first priority is a dedicated `BridgeGapStrategy` for
`citadel.bridge.progression/v2`. Reuse the existing assessor, bridge, dispatcher,
Bits driver, graph, evidence, Datadog transport and GitLab facilities after
inspecting their contracts. The owner identified three MCP entrypoints:
`assess_repo`, `bridge_sync`, `repo_loop`.

## Why it cannot be done on the public plane

AGENTS.md and .bits/context.md reserve infrastructure, deployment authority and
private evidence for the private plane and require a handoff. This checkout is
the public BuildAndDo application. Its in-progress A1 dispatch authorizes public
source work and this handoff, not a Rig 1 installation or shared mutation.

Observed in this session:

- The initial checkout was clean at mission commit
  `9b69cb79429f551dda5629a18bc025dce8ced29b`.
- No implementation of the named bridge strategies, assessor, trigger dispatcher
  or repository supervisor was found in the public source search below.
- The managed `clone_repository` request for `data_dog_private` returned:
  `public and private repositories cannot be used in the same session`.
  No private source was attached or inspected.

```bash
git show -s --format='%H %s' 9b69cb79429f551dda5629a18bc025dce8ced29b
rg -n 'CoverageGapStrategy|AdaptiveStrategy|BridgeGapStrategy|TriggerDispatcher|citadel\.bridge\.progression/v2|repo_loop|repo_assessor' apps scripts/ci services/praxis_evidence tests
```

The search is expected to produce no matches and exit 1 at this handoff revision.
The strategy mismatch, existing bridge behavior, current MCP timeout and extent
of implementation are owner-supplied descriptions awaiting source verification.
The stated 80–90% readiness is not a measured result of this session.

## What was done instead

Recorded this continuation in the existing registered SRS and dispatch before
filing this handoff. Preserved the committed application and its acceptance
limits. This artifact is the public stub: it contains requirements and proposed
tests, with no executable runtime, Worker configuration, project registration,
credential, deployment control or private evidence.

## What the receiving seat needs to do

### 1. Verify the private source and fix bridge selection first

Open a coding session whose primary repository is `data_dog_private`. Follow its
governance, record the checked-out commit and register the execution SRS/dispatch
before edits. Inventory the actual bridge serializer, strategy selection path,
driver defaults, trigger registrations, CLI argument parsers and MCP executor.
Record the exact schema discriminator and field types; do not infer them from
this handoff. Keep credential transport with the Datadog Control Agent.

Add a failing regression that feeds a real, sanitized v2 bridge fixture through
the driver's normal baseline-loading and strategy-selection path. It must expose
the reported nonempty-gaps/zero-selected-targets condition before the fix.

Implement a dedicated strategy with these acceptance requirements:

- Recognize the actual `citadel.bridge.progression/v2` envelope and validate
  gap shapes, types and required fields. Unsupported versions and malformed
  baselines produce an explicit blocked/error receipt.
- Interpret `type`, `detail`, `scope`, `subject`, `priority` and `blocks` using
  the bridge's actual semantics. Resolve a service/file/component target through
  the trusted repository/assessment index. A repository scope or prose subject
  is not automatically a runnable service name or filesystem path.
- Preserve priority and blocker meaning, apply deterministic ordering and
  deduplicate resolved targets. Explain unmapped and out-of-scope gaps in the
  receipt. An empty valid feed may mean no work; unresolved gaps must not be
  reported as a successful empty assessment.
- Wire the strategy into the path used by the default bridge baseline. A class
  tested in isolation is insufficient. Preserve coverage/adaptive strategies
  for the baseline formats they already support.

### 2. Normalize and ingest GitLab events

Use the existing private edge stack. The Worker verifies the webhook using its
established secret mechanism, enforces a project/event allowlist, validates
bounded fields and queues only the minimal envelope. Exclude repository blobs,
diffs, issue/comment text, raw payload logging and GitLab write credentials.

The envelope carries source, normalized event type, project ID, ref, full commit
ID when applicable, event UUID, timestamp and correlation ID. Map source `gitlab`
plus type `push` to dispatcher reason `gitlab.push`. Support these reasons:

```text
gitlab.push
gitlab.merge_request.opened
gitlab.merge_request.updated
gitlab.pipeline.failed
gitlab.pipeline.success
gitlab.issue.agent
```

Define event-specific fields from actual GitLab payload fixtures. In particular,
an issue event must carry a bounded issue identity and obtain a policy-approved
revision on Rig 1; it cannot invent a SHA. Branch deletion and unsupported events
receive explicit ignored receipts. Issue selection requires an authorized actor
and trigger policy; arbitrary issue text never becomes execution authority.

Use the existing dispatcher's pattern, cooldown and governed PromptRecord path.
Keep idempotency separate from cooldown: a later distinct event at the same SHA
can be meaningful. Define the deduplication key from project, event type and
verified delivery identity. Reject collisions with conflicting immutable fields.

Rig 1 uses the Queue HTTP pull interface and makes only outbound connections.
Persist the validated envelope and its deduplication receipt durably before
acknowledging the delivery. If persistence fails, allow redelivery. After that
handoff, the supervisor owns durable retries; do not hold a queue delivery open
for the whole agent mission. Specify retry limits, visibility behavior and the
dead-letter/operator path using the actual Queue API. Tunnel is optional and
must not be required for the pull path. NATS publication stays on Rig 1.

### 3. Resolve registered clones and supervise persistent stages

Maintain project-to-clone mapping only on Rig 1 under private authority. Webhook
fields must never choose a local path, Git remote URL, command, SRS or dispatch.
Validate registration, canonical path, permitted refs and repository identity.
Fetch through the registered remote and verify the full commit object belongs
to the permitted project/ref before assessment. Preserve dirty developer trees;
reject unsafe checkout conditions rather than resetting them.

Bind assessment, graph, plan, diff, tests and MR provenance to an immutable
snapshot of that commit. Use per-project/clone locking and fenced stage leases
so concurrent deliveries or restarted workers cannot mutate the same checkout.
Run repository-controlled build/test code within the existing isolation policy.

Persist the owner's requested stages in order:

```text
INGEST -> SNAPSHOT -> ASSESS -> GRAPH -> COMPARE -> PLAN -> DISPATCH
       -> BUILD -> TEST -> TEVV -> MR -> OBSERVE -> LEARN
```

The bridge may already perform assessment; inspect and reuse that orchestration
instead of assessing the same snapshot twice. Each transition records input
identity, attempt, timestamps, outcome and evidence references. Define resumable,
retryable, blocked, cancelled and terminal states. Cancellation and time/resource
limits propagate to child processes. A no-work policy decision ends with a
receipt before dispatch; a failed gate cannot advance to MR.

Before any side effect, persist an operation identity and reconcile prior
outcomes on restart. This is required for crashes after an MR was created but
before its response was saved. Test both crash windows: before a side effect and
after the effect but before the stage receipt. Never fabricate CK stamps,
signature material, acceptance evidence or a successful transport result.

### 4. Add thin MCP adapters and controlled publication

Adapt existing assessor and bridge CLI entrypoints using validated argument
arrays and registered repository identities. Reuse the current bounded executor.
`repo_loop` submits work to the supervisor or returns its status/receipt promptly;
the MCP process must not own the daemon or wait for the whole mission. Confirm
the reported 300-second subprocess cap from source and test disconnect recovery.

Use the runtime's existing GitLab write client, credentials and dispatch gates.
Publish an authorized feature branch and MR only after local tests and TEVV.
Runner verification must refer to the same resulting head; changed heads require
fresh verification. Keep merge authority with the configured human/policy gate.
Detect self-generated webhook events and apply a bounded feedback policy so an
agent MR cannot create an endless chain of follow-up missions.

### 5. Return measured acceptance evidence

Create focused tests named for `bridge_gap`, `gitlab_trigger`, `repo_loop` and
`mcp_repo` in the private repository's existing Python test layout. The receiving
seat can run the following selection after those tests exist; it has not run here:

```bash
python -m pytest -q -k 'bridge_gap or gitlab_trigger or repo_loop or mcp_repo'
```

Also run the private repository's required full gates and edge test runner.
Record their actual commands, versions and selected test counts. Required cases:

| Area | Acceptance evidence |
|---|---|
| Bridge contract | Red/green default-driver regression; unknown schema; malformed gap; unmapped scope/subject; deterministic priorities/blockers; legacy-strategy regression |
| Edge and triggers | All six event mappings; invalid verification/project; malformed ref/SHA; deleted ref; issue without SHA; duplicate and conflicting delivery; cooldown behavior |
| Queue | Persist-before-ack; storage outage; ack failure/redelivery; restart after receipt; bounded retries and dead-letter disposition |
| Snapshot | Unknown project; path/shell input rejection; foreign or missing commit; dirty clone; concurrent events; moved ref preserves recorded snapshot identity |
| Supervisor | Crash before/after each side effect; lease expiry and stale worker; stage timeout/cancellation; failed TEVV blocks MR; no-work receipt; no duplicate dispatch/MR |
| MCP | CLI argument parity; bounded return; failed command propagation; daemon survives client disconnect; no arbitrary path or timeout bypass |
| End to end | Authorized test event reaches one governed result, matching Runner evidence and correlated receipts; invalid event reaches no executor |

Supply source/test evidence before seeking installation approval. Native Queue,
GitLab, Rig 1, NATS and Datadog acceptance requires the receiving dispatch's
explicit shared-environment authority. Keep operational receipts private; return
a public-safe summary with the source revision, test results and remaining gaps.

Rollback requirements: stop ingestion/dispatch, cancel or drain leased stages,
retain durable receipts for deduplication, and reconcile existing branches/MRs.
Disable trigger registrations before replaying deliveries. Reverting runtime
code alone does not undo a completed external side effect.

## Blocking

Rig 1 execution is blocked on the private primary-repository session and its
execution dispatch. No installation, private patch, Worker/Queue activation or
MR was produced here. This handoff records a request; no seat event or external
message was sent. Public mission planning/review source remains intact, with
frontend dependency, browser and native PocketBase acceptance still pending as
recorded in .bits/out/VCC-BUILDANDDO-UPGRADE-001/report.md.
