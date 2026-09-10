# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-PB-METRICS-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-PB-METRICS-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     apps/pocketbase/pb_hooks/logs-forwarder.pb.js,
#              .bits/handoffs/2026-09-10-bits-codegen-ide1.md
# EnumType:    Doc
# EnumEdges:   PRODUCES buildanddo.records.created;
#              CONSUMES apps/pocketbase/pb_hooks/logs-forwarder.pb.js;
#              DEPENDS_ON .bits/handoffs/2026-09-10-bits-codegen-ide1.md
# Intent:      Specify server-side CRUD and latency telemetry for PocketBase,
#              and name the private-plane authority it cannot obtain here.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-PB-METRICS-001 — Server-side CRUD, latency and error telemetry

**Status:** proposed **Risk:** A2 **Seat:** unassigned

## Problem

Every signal this product emits today comes from a browser. RUM reports what the
user's tab saw; nothing reports what the API did. When a mission fails to save,
telemetry can prove the request failed and cannot say whether the record was
written, how long the write took, or whether the failure was validation, a rule
denial, or a database error. There is no server-side error stream, no request
latency distribution, and no count of writes per collection.

## Two facts that constrain any solution

These are the reason this spec exists instead of an implementation.

1. **PocketBase hooks in this repository are JavaScript, not Go.** Everything
   under `apps/pocketbase/pb_hooks/` is a `*.pb.js` file executed by
   PocketBase's embedded JSVM (goja). A `.go` file placed in that directory is
   never compiled and never runs — it would be inert code that looks like
   working instrumentation. Server-side telemetry here is either a `.pb.js`
   hook or a fork of the PocketBase binary, and the binary is not built on the
   public plane.
2. **The JSVM has no UDP socket, so DogStatsD is not reachable from a hook.**
   The available egress primitive is `$http.send` (already used by
   `builder-mailer.pb.js` and `reach-contact-sync.pb.js`). A hook can therefore
   submit metrics over HTTP to the Datadog series intake, or it can emit
   structured records that the host agent scrapes — it cannot speak StatsD.

## Intent

Give the API the same observability the browser already has, using the hook
runtime that actually exists, without putting a Datadog credential in this
repository or blocking a write on a telemetry call.

## Scope

- One `.pb.js` hook emitting counters on collection mutations — records created,
  updated and deleted — tagged with collection and environment.
- Request latency as a distribution tagged with endpoint and method, with
  endpoint normalised to the route pattern so per-record ids never become tag
  values.
- An error hook capturing failed mutations and unhandled hook exceptions with
  enough context to correlate to a RUM session, using the trace context RUM
  already propagates to this origin (`datadogRum.js` sets
  `allowedTracingUrls` for same-origin requests).
- A single transport decision, made once and documented in the hook: either
  batched `$http.send` to the Datadog series intake, or structured stdout
  records consumed by the host agent through the existing
  `logs-forwarder.pb.js` path. The second option needs no credential in the
  application and is the preferred default unless the receiving seat says
  otherwise.
- Non-blocking and fail-open: a telemetry failure must never fail, delay or
  roll back the user's write, and a missing configuration variable must
  disable emission silently.

## Out of scope

- Provisioning the Datadog agent, opening its intake, or placing `DD_API_KEY`
  on the Hostinger VPS. That is deployment and infrastructure authority, which
  lives on the private GitLab mirror — see
  `.bits/handoffs/2026-09-10-bits-codegen-ide1.md`.
- Any change to `pb_migrations/`. This spec adds no schema.
- APM distributed tracing inside PocketBase. That requires instrumenting the Go
  binary, not a hook, and is a separate spec if it is ever wanted.
- Touching `logs-forwarder.pb.js` production behaviour beyond reading from it.

## Acceptance evidence

1. Creating one record in a staging workspace collection increments
   `buildanddo.records.created` for that collection, and the metric is visible
   in Datadog on us5 within one flush interval.
2. Request latency appears as a distribution with a bounded endpoint tag set —
   evidence is a tag-cardinality query showing no record ids among tag values.
3. A forced hook exception is reported once, and the originating write still
   succeeds; evidence is the record present in the collection plus one error
   event.
4. With the transport variable unset, the same operations produce no telemetry
   egress and no error in the PocketBase log.

## Verification

```bash
rg -n "onRecordAfterCreateSuccess|onRecordAfterUpdateSuccess|onRecordAfterDeleteSuccess" apps/pocketbase/pb_hooks
python scripts/ci/verify_public_boundary.py
# staging only, requires the private-plane sink from the handoff:
# create one record, then query buildanddo.records.created in Datadog us5
```

## Notes for the implementing agent

Do not add a `.go` file to `pb_hooks/` — read fact 1 above before starting.
Batch before sending: one HTTP call per record write will make the API's tail
latency worse than the problem being measured. Environment must come from the
same resolver the rest of the backend uses (`$os.getenv`), and the tag set must
be finite — collection name yes, user id no, record id never.
