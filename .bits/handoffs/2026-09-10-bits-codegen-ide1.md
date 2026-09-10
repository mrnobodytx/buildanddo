# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-10-bits-codegen-ide1.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-PB-METRICS-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     .bits/srs/SRS-BUILDANDDO-PB-METRICS-001.md
# EnumType:    Doc
# EnumEdges:   TRIGGERS cross-seat handoff;
#              DEPENDS_ON .bits/srs/SRS-BUILDANDDO-PB-METRICS-001.md
# Intent:      Record that server-side metrics need a telemetry sink this
#              repository has no authority to provision.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-09-10 BITS-CODEGEN -> IDE1

**Originating SRS:** SRS-BUILDANDDO-PB-METRICS-001 **Dispatch:** none issued

## What was asked

Emit server-side metrics from PocketBase on collection CRUD — record counts per
collection, API request latency, and forwarded errors — for the deployment on
the Hostinger VPS.

## Why it cannot be done on the public plane

The hook code is legal here; the thing that receives the metrics is not.

- A metrics sink must exist on the VPS: either a Datadog agent with its DogStatsD
  or logs intake reachable from the PocketBase process, or an outbound path to
  the us5 series intake holding a `DD_API_KEY`. Provisioning either is
  infrastructure and deployment authority, which the path policy assigns to the
  private GitLab mirror (`infra/`, `ops/private/` and secrets are forbidden
  prefixes in `.buildanddo/public/path-policy.json`).
- The credential itself can never be committed here, and this repository has no
  vault reference mechanism for the PocketBase runtime environment.
- The transport choice is not ours to make unilaterally: whether the agent
  scrapes structured stdout (already produced in production by
  `logs-forwarder.pb.js`) or the hook posts to the intake determines what the
  hook code has to look like.

## What was done instead

A specification only — `.bits/srs/SRS-BUILDANDDO-PB-METRICS-001.md`, status
`proposed`. No hook code was written, and specifically no `.go` file was added
to `pb_hooks/`: that directory is executed by PocketBase's JavaScript VM, so a
Go file there would be inert code masquerading as instrumentation.

## What the receiving seat needs to do

1. Decide the transport: host Datadog agent scraping PocketBase stdout, or
   direct HTTPS submission from the hook to the us5 series intake.
2. If agent-based, confirm the agent runs alongside PocketBase on the VPS and
   state which intake and port the hook may use.
3. If submission-based, place the API key in the PocketBase process environment
   as `BUILDANDDO_DD_API_KEY` by the same mechanism that already supplies
   `REACH_API_TOKEN` and `BUILDER_MAILER_API_KEY`, and confirm the variable name
   back to this repository so the spec can name it.
4. Confirm the environment tag value the backend should report for staging and
   production, so it matches what RUM already sends as `env`.
5. Verification once wired: create one record in a staging workspace collection
   and confirm `buildanddo.records.created{collection:*}` appears in Datadog on
   us5 within one flush interval.

## Blocking

Yes, partially. `SRS-BUILDANDDO-PB-METRICS-001` cannot be implemented or
verified until step 1 and step 4 are answered — a hook could be written blind,
but its acceptance evidence is unobtainable without a sink, and unverifiable
instrumentation is what this repository's evidence invariant exists to prevent.
The browser-side work in `SRS-BUILDANDDO-RUM-ACTIONS-001` is not blocked by this
and can proceed independently once dispatched.
