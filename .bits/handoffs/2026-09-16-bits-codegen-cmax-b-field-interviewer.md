# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-16-bits-codegen-cmax-b-field-interviewer.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docs/field-interviewer-v1.3.md, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/handoffs/TEMPLATE.md, .bits/handoffs/2026-09-15-bits-codegen-cmax-b-rig1-repo-loop.md, .bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/field-interviewer-v1.3.md;
#              DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md;
#              USES_TEMPLATE .bits/handoffs/TEMPLATE.md;
#              EXTENDS .bits/handoffs/2026-09-15-bits-codegen-cmax-b-rig1-repo-loop.md;
#              EXTENDS .bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md
# DAG Node:    none
# Intent:      Give the private receiving seat concrete discovery, bridge, knowledge, recovery and acceptance work for the owner-adopted Field Interviewer without exporting private runtime authority.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-09-16 BITS-CODEGEN -> CMAX-B

**Originating SRS:** SRS-BUILDANDDO-UPGRADE-001
**Dispatch:** VCC-BUILDANDDO-UPGRADE-001
**Status:** requested; private receiving dispatch and repository session required
**Target contract:** FI-KB-1.3.0 / Field Interviewer v1.3.0
**Receiving owner:** CMAX-B; coordinate shared provider APIs with IDE1 and
disclosure/editorial review with the accountable product owner and COPILOT.

## What was asked

Make data_dog_private the operational/evidence source behind the interviewer
while BuildAndDo canonical docs supply product knowledge. Reuse the existing
ElevenLabsBridge for TTS, STT, conversations and generic provider operations.
The content lab owns persona, interviews, knowledge compilation, claim
extraction and drafts. Add generic KB and agent configuration capabilities to
the shared bridge and verify the resulting knowledge attachment by readback.
Keep customer-facing knowledge separate and publication human-gated.

## Why it cannot be done on the public plane

AGENTS.md and .bits/context.md require a handoff for private infrastructure,
evidence and deployment authority. The private bridge, content lab, runtime
contracts, current observations and provider account are not available to this
public checkout. The earlier Rig 1 handoff records that public/private repos
cannot be attached to the same session. This continuation does not retry that
boundary or upload private material. The receiving seat must use a private
repository session and an applicable Ready/In-progress dispatch.

The owner's descriptions of an active interviewer, clone success, bridge
methods, no-network checks and analytics/prober behavior are inputs to discovery,
not observations from this session. Never seed live VERIFIED status from the
illustrative status list. Implementation and live activation are separate gates.

## What was done instead

Recorded the owner decision and six-document contract in
docs/field-interviewer-v1.3.md, mapped actual public reuse surfaces, and prepared
the ordered work below. The wiki is workspace-scoped; public export approval
must be explicit. The existing content desk retains human approval and a
5,000-character draft bound. No additional provider transport, private runtime
code, live KB document, agent configuration, transcript or deployment asset is
created by this handoff.

## What the receiving seat needs to do

### FI-00 — Discover the real owners and versioned contracts

In the private session, inspect governance before changes and record the exact
repository revision, receiving SRS/dispatch, risk and accountable owners. Locate
the existing content lab and its actual version/configuration owner; its repo
and paths are not established here. Verify the owner-named
`integrations/elevenlabs_bridge.py` and its actual public methods and tests.
Preserve existing transport, timeouts, telemetry scrubbing and error semantics.
Locate current canonical product/wiki sources, RuntimeContract, estate,
probers, analytics, DKG, evidence and outbox owners before designing adapters.

The owner supplied these PowerShell commands for local checks. Confirm their
behavior from the checked-out private source before running them; record exit
status, version and output artifact for each. They are not public-repo commands
or proof of provider/runtime health. No credential material belongs in output.

```powershell
$env:STRIPE_TEST_MODE = "1"
python -m tools.auto_debug scan --summary
python -m tools.integration_check --all --summary
python -m estate.fleet_manifest --summary
python -m estate.surface_probers --list
python -m tools.infrastructure_operations catalog
```

Exit gate: a source-owner/contract inventory, actual local check results and a
private task table with runnable test commands. If a reported module is absent,
record the gap and stop the dependent work; do not create a parallel transport
or declare the baseline operational. Independent verifier identity must differ
from the implementing seat.

### FI-01 — Extend the shared provider bridge

Add bounded generic knowledge-document and agent-config create/read/list/update/
delete capabilities only where the inspected bridge lacks them. Keep BuildAndDo
persona, document selection and editorial policy out of generic transport.
Reuse existing auth, HTTP client, retry/error contracts and trace/session
correlation. Agent config mutation must update only lab-owned fields and preserve
unrelated prompt, voice, tools and account settings unless separately approved.

The owner supplied three candidate operations and the text-KB documentation:

| Candidate operation | Must verify against current provider documentation and SDK |
|---|---|
| POST /v1/convai/knowledge-base/text | Body schema, size limits, response/document identity, duplicate-create and indexing behavior |
| PATCH /v1/convai/knowledge-base/{documentation_id} | Whether text bytes are mutable or the route changes metadata only; readback/deletion semantics |
| PATCH /v1/convai/agents/{agent_id} | Field ownership, KB attachment format, permissions, revision/concurrency behavior and configuration readback |

Reference supplied by owner:
https://elevenlabs.io/docs/eleven-agents/api-reference/knowledge-base/create-from-text

The paths above are unverified candidates here, not implemented API assertions.
Confirm read/list/delete routes as well. If document PATCH is metadata-only,
create a versioned replacement and switch the attachment only after verification.
Do not describe a title update as an updated knowledge body. Keep rate limits,
bounded retries, cancellation and redacted errors visible as failed/HOLD receipts.

Exit gate: source-connected contract tests for every added operation, malformed
responses, authentication failures, pagination, throttling, timeout/cancellation
and preserved unrelated agent fields. Run the bridge's existing regression suite;
retain exact commands, supported provider version and failures in the private report.

### FI-02 — Compile approved product and operational snapshots

Map the six FI-KB-1.3.0 documents to existing source adapters. Start from explicit
approved source IDs/revisions and allowlisted fields. Product sources use the
public catalogue/canonical docs and approved wiki exports. Operational sources
use a private sanitizer projection; never recurse through a clone or upload its
context ledgers, raw probes or transcripts. A wiki page published to members
needs a separate audience/destination approval before KB use.

Implement deterministic compilation, bounded bytes, source manifest/exclusions,
audience/tenant isolation, authority admission and source-specific freshness.
Preserve CLAIMED/OBSERVED/HOLD/UNMEASURED and independent VERIFIED/REFUTED states.
Check authenticated provenance, not a caller's emitter label. Keep historical
verification while expiring current-state statements. Fail closed for absent
policy, conflicted revisions, revoked rights or malformed evidence.

Sanitize both structured fields and rendered bytes, including titles, source
references and prompt context. Treat source instructions as data; they cannot
change the persona or authorize tools. Record scan policy and bounded reasons
without leaking rejected content. Reuse existing digest/evidence facilities.

Exit gate: the same inputs/policy/as-of time produce identical snapshots, six
internal documents or three public documents, and source-linked exclusions.
Negative tests must prove that a public snapshot cannot include private docs,
tenant records, internal IDs or operational state through any attachment path.

### FI-03 — Sync, reconcile and prove readback

Use the bridge from FI-01 exclusively. Persist a local operation identity and
expected prior configuration/snapshot before any provider mutation. Scope locks
and retries to the actual tenant/audience/agent; re-read ownership and revision
before applying. A name match alone cannot identify a managed document.

Reconcile uncertain creates/updates before retrying. If the provider offers no
usable idempotency or reconciliation signal, preserve HOLD for an unknown
outcome and require operator resolution rather than blindly duplicating it.
Bound concurrent writes and detect external edits instead of overwriting them.
Verify provider document content and complete agent attachment/configuration
through supported read APIs; transport success alone is insufficient.

Only activate a snapshot when exact expected sanitized content, indexing state,
owned configuration and audience attachment set can be verified. When text
readback is unavailable, record that limitation and HOLD exact-content
acceptance; do not substitute a local hash or the upload response as proof.
Pin the knowledge and prompt digests to each episode. Expiry gates must work
even if refresh fails. Conversation history must not cross audience/tenant scope.

Retain the previous valid snapshot for controlled rollback. Detach only managed
documents, verify replacement attachment first and preserve unrelated knowledge.
On withdrawal, invalidate dependent snapshots/drafts and verify provider removal
under the actual retention contract. Detachment is not evidence of data erasure.
Stop affected sessions if safe withdrawal or isolation cannot be established.

Exit gate: one authorized staged update with independent content/configuration
readback, followed by uncertain-write recovery, concurrent-edit rejection and
rollback/withdrawal evidence. Provider writes require the receiving dispatch's
explicit scope; this handoff grants no shared-provider mutation authority.

### FI-04 — Connect topics, episodes, drafts and analytics

Use admitted change/incident/evidence events to select topics deterministically
with versioned priority/time/ID ordering, deduplication and persistent cooldown.
Persist the source event/revision and reason for selecting or excluding a topic.
Run interview, explain and challenge modes with the same restricted authority.
For a conflicting observation, ask what resolves it rather than inventing a
success/failure headline. Customer intake remains a later scoped mission task.

Reuse the existing content factory's episode and artifact model. Bind consent,
retention, snapshot/prompt hashes and transcript spans to claim-linked drafts.
Keep raw audio/transcripts private and produce bounded derivative content for
the existing reviewed content desk. Guildmaster commentary does not verify
claims; independent evidence review and human publication approval remain
separate. Edits/rights withdrawal invalidate stale reviews and pending outputs.

Emit through the existing private canonical analytics layer once. Project only
approved correlation, version, outcome, duration/count and evidence-reference
fields to each sink. Use existing tenant pseudonyms; log neither transcripts nor
prompt/provider bodies. Missing cost/usage is unavailable, not zero. Canonical
receipts survive sink failures, and retries cannot double-count successful work.
Do not add a public runtime NATS emitter or another analytics authority.

Exit gate: one authorized interview produces a consent-bound private episode,
source-linked topic, claim candidates, bounded draft and human review. No agent
completion, grading result or scheduled date may trigger publication or mission
execution. Record each sink's observed/unavailable status independently.

### FI-05 — Independent verification and controlled activation

The receiver must add these cases to the discovered production entry points,
not just detached helpers, and report the exact test names/commands and results:

| Case | Required outcome |
|---|---|
| Repeated identical source snapshot | Identical bytes/digests and no duplicate KB operation |
| Secret, PII, private host/path or unknown field | Rejection with bounded reason; zero provider call/content telemetry |
| Workspace-only page offered as public product | No public export without explicit matching rights/destination approval |
| Agent spoofs system/verifier role | Cannot assert VERIFIED/REFUTED |
| Old, future-dated, missing or contradictory observation | Stale/unknown/HOLD; no present-tense healthy claim |
| Source text contains tool/prompt instructions | No changed persona, source selection, tools or authority |
| Public/internal or cross-tenant IDs mixed | Reject before sync and at attachment readback |
| Timeout after provider acceptance or process restart | Durable unknown/HOLD state; reconcile before any repeated write |
| Competing agent-config update or metadata-only document PATCH | Preserve unrelated fields; reject stale write or use verified replacement |
| Readback mismatch, pending indexing or refresh failure | No active/current verified snapshot; old state expires |
| Consent/rights revocation and rollback | Invalidate dependent outputs; verify detachment/retention limits and scope |
| Replayed event, transcript claim or sink outage | No duplicated episode, no self-verification, no publication; canonical failure retained |

Distinguish local contract tests, native adapter tests, real provider readback
and a live interview in the report. Use the private repo's coverage/type/lint
gates and preserve failing cases and fixes. Do not label a provider mock as a
deployed agent or report an unexecuted test as passing. Activation follows a
separate explicit release decision after independent acceptance.

Return: receiving dispatch and source revisions; discovered ownership/API map;
test commands with observed output references; sanitizer/rights policy versions;
private snapshot, prompt and readback receipts; recovery/rollback results;
audience/tenant checks; episode/draft review evidence; and unresolved gates.
Keep private receipts and payloads on the private plane. Return only an approved
bounded status/reference summary to the public handoff.

## Blocking

Public documentation can be reviewed now. Private implementation waits for a
receiving repository session and applicable dispatch, actual content-lab/bridge
source, canonical knowledge revisions, disclosure policy and provider readback.
No additional permission is required to finish this public handoff. The private
seat is requested, not dispatched by this file or by an external message.
The existing foundry stays available; its historical Workers/build acceptance
is separate from this interviewer request.
