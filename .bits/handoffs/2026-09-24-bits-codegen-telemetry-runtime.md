# --- CGRF Header ------------------------------------------------
# File:        .bits/handoffs/2026-09-24-bits-codegen-telemetry-runtime.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     docs/telemetry-coverage.md, docs/hostinger-sprint-closure.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/telemetry-coverage.md; CONSUMES docs/hostinger-sprint-closure.md
# Intent:      Assign operational telemetry activation and exact-release verification without mistaking local tests for external delivery or authority.
# ----------------------------------------------------------------

# Telemetry receiving work

Receiving owners: IDE1/backend, observability owner, CI/release owner and CMAX-B.
This is a handoff request, not a grant to change production, load secrets, create
monitors, delete events or deploy. The source session did none of those actions.
The supplied audit's corrected PostHog visit is historical; Datadog receipt and
the current state of all reported outages must be measured again.

## Activation order

1. Run the locked React/Vite and SDK contract suites plus disposable PocketBase
   0.39.8 checks under both declared profiles. Exercise middleware priority,
   native response/error shapes, logger persistence, current user permissions
   and the intentional unavailable-health 503 response. Do not replace these
   with the passing JSVM doubles.
2. Use existing private configuration management to supply the public browser
   inputs to the release build. Both controllers must refuse a keyless or stale
   artifact before copy. Execute real minified and unminified fixtures, then
   verify the exact served JS/HTML/manifest, release and environment. Never print
   input values in diagnostics. Preserve the last accepted rollback artifact.
3. Configure the existing journald/stdout shipper with service, environment and
   version tags before selecting stdout telemetry. Confirm access and retention
   policy. Source now preserves native `_logs` writes and forwards sanitized
   fields; do not restore the old raw journal/persistence suppression behavior.
4. Enable `BUILDANDDO_TELEMETRY_TRANSPORT=stdout` only through the receiving
   dispatch. Read back sanitized `buildanddo.telemetry` request/counter lines,
   `buildanddo.forwarded` diagnostic summaries and decision timing separately.
   Native log-level, IP/auth logging, old journal rotation/permissions and
   retention need explicit privacy review; no blanket settings migration was made.
5. Inspect the mailer, dossier and assistant configuration under private authority.
   A source logger does not configure or repair those providers. Confirm current
   failures before selecting them as positive controls; the old classroom outage
   is not a current control. Fix configuration through its existing owner, then
   observe the same paths recover.

## Vendor readback contract

Bind every check to the manifest's exact release, environment and a short absolute
time window. Retain the query, result, observation time and sanitized references.
Do not promote DECLARED to MEASURED from a browser request or HTTP acceptance alone.

| Source | Required positive control | Required negative control |
|---|---|---|
| RUM | Actual full-load and in-app route views from the accepted release | Never-sent action name in the same release/window |
| PostHog | Web pageviews on both routes, trusted release/env and canonical sections | Never-sent event; exclude agent probe traffic and declared synthetics from human funnels |
| Browser failure | One authorized real failure or isolated staged fault gives `section.failure` with section/reason | Valid empty read, cancelled request and stale account result give no backend-failure event |
| Mutation | Accepted receipt, forbidden/conflict, malformed-response and lost-response recovery have distinct outcomes | Invalid receipt never reports success; retry does not duplicate the native record |
| Backend | Searchable request duration/status plus bounded cause diagnostic from the same backend release | Unknown text search returns no rows; no IP/body/query/credential fields in sampled payloads |
| Media | Browser connection state and actual inbound counters, separately from signalling acceptance | Late cancelled join and rejected track cannot imply delivery |
| Discord | Personless command/control stderr rows arrive under its service | Input/answer/private identity never appears in the shipped fields |

Use the site's own approved routes/accounts and retain human approval for sensitive
forms. Password-reset request acceptance is not proof of mail delivery. Public
enquiry activation is not proof of sending. Do not deliberately break production
to create a positive control.

## Alerts and synthetics

- Add a scheduled browser heartbeat for production and staging. Use the initial
  `telemetry_test=heartbeat` marker and verify `declared_synthetic` in PostHog;
  use native synthetic-session metadata in RUM. The declaration is not an
  authority claim. Validate the runner's actual browser automation markers.
- Alert on a missing expected heartbeat result AND missing matching vendor view,
  not on ordinary low human traffic. The audit's healthy seven-hour quiet period
  makes a zero-human-view monitor unsuitable.
- Test the heartbeat/no-data alert against an isolated keyless or blocked-intake
  fixture, and confirm recovery against the configured artifact. Do not disable
  the artifact guard to publish an intentionally broken build to a shared site.
- Add reviewed thresholds for RUM `error_source: react_render`, section failures,
  same-origin API outage signals, CSP violations and sanitized backend failures.
  Keep state-transition counts separate from request-attempt counts.
- Add header assertions for both vendor intake origins, authenticated section
  journeys and unavailable-health behavior. Correct the mislabelled existing
  check and wiki assertion only after reviewing their actual configuration.
- Cover the audit's previously unvisited routes with authorized fixtures. Read
  back each monitor definition and first executed synthetic result; source
  configuration is not proof a monitor or schedule exists.

## Boundaries and rollback

The edge worker is not materialized here. Its code, Logpush/tail setup and CSP
deployment belong to its receiving repository. The separate OCN receipt-telemetry
branch must be reviewed by its owner; this session neither rebased nor published
it. OCN signing/auth and its health response remain unchanged.

Do not delete the reported historical seat events without a separately authorized
retention decision. The local probe repair only prevents new address/name fields.
Memory-only PostHog identity intentionally gives up cross-reload anonymous/session
continuity; review this privacy choice before rollout. Native identity remains
the only identification source, with no additional email/name profile.

If collection is unsafe, disable the approved transport or sampling under the
receiving process while retaining an explicit monitoring gap. Do not roll back
to raw payload forwarding, weaken the release guard or remove existing history.
Use the normal release rollback contract and verify the externally served identity.
