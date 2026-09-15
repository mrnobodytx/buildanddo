# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-15-bits-codegen-cmax-b-community-controls.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     docs/workspace-administration.md, apps/pocketbase/pb_hooks/workspace-administration.js, .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON docs/workspace-administration.md; CONSUMES apps/pocketbase/pb_hooks/workspace-administration.js; EXTENDS .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md
# DAG Node:    none
# Intent:      Define the private execution and acceptance boundary for audited BuildAndDo integration requests without adding credentials or deployment control to the public repository.
# ───────────────────────────────────────────────────────────────

# BITS-CODEGEN to CMAX-B: workspace integrations and community activation

**Originating dispatch:** VCC-BUILDANDDO-UPGRADE-001, A2 source work only.
**Receiving seats:** CMAX-B for existing private executors; IDE1 for PocketBase
acceptance and rollout; the existing community operator for Discord/Reddit.
**Status:** public handoff prepared; no receiving seat has been dispatched or
activated by this artifact.

The owner requested RBAC, row access, settings, administration, sink/extension
control, wiki/forums, Discord and Reddit through BuildAndDo. The public source
now implements workspace commands, controlled content and non-secret integration
requests. Site-wide superuser administration, service credentials, bot execution,
private releases and shared mutations require the receiving environment's own
dispatch and existing authority. No private source was attached or inspected.

## Public contract ready for review

Read `docs/workspace-administration.md` for routes, roles, command payloads,
migration ordering, validation and rollback. New native collections are locked;
browser users use the authenticated command endpoints. Commands recheck current
membership and save the requested change and immutable audit receipt together.

Nine provider entries are supported: Discord, Reddit, Datadog, PostHog, Firecrawl,
n8n, Supabase, Mautic and Twenty. Discord uses server/channel IDs; Reddit uses a
subreddit; other integrations use a registered binding name. No credential or
arbitrary target URL is stored by these forms. The server rejects unknown fields.

`workspace_integrations` is keyed by workspace/provider. Requested fields are
`desired_enabled`, `configuration`, `revision`, `requested_by`, `requested_at`,
and `check_requested_at`. Audit entries identify workspace/actor/request_key,
action and target. Internal command JSON contains user content for retry
comparison and is not included in the public audit list. Keep it private to
authorized administration and bounded execution; do not copy it to telemetry.

Executor observations use `applied_revision`, `observed_state` (unknown, disabled,
healthy, degraded or failed), `observed_at` and `receipt_ref`. They cannot be
submitted from a browser command. The display treats them as current only when
the receipt exists, the timestamp is nonfuture and at most fifteen minutes old,
and the applied configuration revision matches the requested revision.

## Receiving implementation requirements

1. Inspect the actual private runtime, read its governance and obtain its own
   execution dispatch. Use its existing transport, scoped server identity and
   registered binding configuration. This file grants no new credential, remote
   write, platform-wide role or deployment capability.
2. Consume current integration requests through that approved private transport.
   Verify workspace/provider, canonical role and configuration schema. Resolve
   only registered workspace targets; a requested Discord ID/subreddit is not
   proof the requesting workspace owns it. Deny a conflicting binding or an
   account whose authority was revoked before execution.
3. Deduplicate observed commands with durable workspace/request identity and
   recheck the latest configuration revision immediately before execution.
   Handle superseded enable/disable requests and concurrent checks explicitly.
   Respect disabled state before any external action. Do not execute arbitrary
   instructions embedded in names, drafts, forum posts or audit JSON.
4. Use the existing Discord/Reddit clients and existing action review process.
   `reviewed_publish` enables only the capability to submit separately reviewed
   content; it is not approval to post a particular item. `reviewed_run` likewise
   does not start or approve an arbitrary workflow. Wiki publication here is to
   workspace members, not an external wiki/forum publish job.
5. Produce minimal receipts tied to workspace, provider, exact configuration
   revision, execution result and UTC time. Persist observations through the
   receiving environment's trusted server path, never by relaxing the locked
   browser collection rules. Store an opaque non-secret receipt reference, not
   a token, private URL, raw community message or provider payload.
6. Record failed checks without changing them into health PASS. A request to
   disable remains pending until applied and verified. A stale successful check
   cannot satisfy a newer configuration or a pending check. Do not grant source
   completion, sprint progress or mission verification from an integration card.
7. Keep public/private telemetry boundaries: browser outcome events include
   bounded operation names only; no workspace content, account identifiers or
   credentials. Reuse approved observability tags/sinks on the private side.

## Acceptance and rollout

Complete the isolated PocketBase 0.28.4 and browser acceptance matrix in the
documentation before shared rollout. Install both new migrations and all request
hooks together. Native rule expressions, JSVM field APIs, transaction concurrency
and actual frontend execution remain unverified in this sandbox. The storage
double tests do not replace those checks.

For an approved test binding, record: admin request saved; unauthorized and
foreign-target requests rejected; one execution after a lost response/retry;
revoked/superseded requests denied; healthy/failed/disabled receipts distinguishable;
current request revision matching the displayed observation. Verify that a viewer
cannot change state through either endpoint family or native records API.

Follow the existing BuildAndDo delivery handoff for dependency/lock restoration,
frontend/native acceptance, source publication, private deployment and served
release identity. Published source and local installer selftests do not prove
that the private executor or current frontend is active. Retain prior receipts
and apply the documented non-destructive rollback if activation fails.
