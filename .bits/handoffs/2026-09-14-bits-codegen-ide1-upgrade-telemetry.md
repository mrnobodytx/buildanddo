# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-14-bits-codegen-ide1-upgrade-telemetry.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     apps/pocketbase/pb_hooks/metrics.pb.js
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/metrics.pb.js
# DAG Node:    none
# Intent:      Separate public telemetry adapters from privately authorized sink and native runtime activation.
# ───────────────────────────────────────────────────────────────

# PocketBase telemetry activation handoff

From: BITS-CODEGEN
To: IDE1
Dispatch: VCC-BUILDANDDO-UPGRADE-001
SRS: SRS-BUILDANDDO-UPGRADE-001 (public scope of SRS-BUILDANDDO-PB-METRICS-001)
Status: requested; no host or shared environment was changed

## Public implementation

The opt-in hooks in apps/pocketbase/pb_hooks/metrics.pb.js count committed creates,
updates and deletes, count failed writes separately, and time collection requests.
The helper in apps/pocketbase/pb_hooks/telemetry.js emits structured console logs
only when BUILDANDDO_TELEMETRY_TRANSPORT=stdout. The default does nothing.
No network client, credentials, timer, collection or migration was added.

The envelope is message=buildanddo.telemetry with data.metric, data.type,
data.value, data.tags and data.context. Counter names are
buildanddo.records.created, buildanddo.records.updated,
buildanddo.records.deleted and buildanddo.records.errors. Request durations use
buildanddo.request.duration, type=distribution, in milliseconds. Collection,
operation, outcome, method, normalized endpoint and environment tags are bounded.
Record identifiers, query values, bodies, account identities and auth collections
are excluded. Valid traceparent identifiers are context fields, never metric tags.

## Work requiring private authority

1. Run the adapters against the pinned PocketBase 0.28.4 JSVM. Verify actual
   callback availability, routing order, committed and rolled-back writes,
   validation/auth failures, HTTP error responses, and middleware latency.
2. Choose and configure the host log sink under a separate authorized dispatch.
   Translate counter/distribution envelopes into Datadog metrics without adding
   private control files or a key to this public repository. Set the host's
   environment tag and enable stdout transport only after validating ingestion.
3. Perform one create, update and delete in an authorized test workspace. Verify
   three successful counters, an independent rejected-write error, a duration
   distribution and trace correlation. Verify that disabling the sink or helper
   cannot fail or replay the application operation.
4. Capture native/runtime evidence and update the PB-METRICS specification status
   through the normal private/public handoff. Source adapter tests alone do not
   authorize a delivered status or a claim of live ingestion.

## Current evidence and rollback

`node --test tests/upgrade/pocketbase-metrics.test.mjs` executes the actual helper
and hook source in a JSVM contract double. It verifies outcomes, bounded fields,
helper/logging failure isolation and single delegation. A native server and a
Datadog sink were not available in this coding environment.

Disable BUILDANDDO_TELEMETRY_TRANSPORT to stop emissions immediately. Revert the
hook files if needed; this change has no schema or data rollback. Any host change
is outside this A1 source-only dispatch.
