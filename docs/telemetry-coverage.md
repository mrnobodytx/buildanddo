# --- CGRF Header ------------------------------------------------
# File:        docs/telemetry-coverage.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     apps/web/src/lib/observability/runtime.js, apps/web/src/lib/observability/mutations.js, apps/web/src/lib/telemetry.js, apps/pocketbase/pb_hooks/telemetry.js, apps/web/tools/release-telemetry.mjs
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/lib/observability/runtime.js; CONSUMES apps/web/src/lib/observability/mutations.js; CONSUMES apps/web/src/lib/telemetry.js; CONSUMES apps/pocketbase/pb_hooks/telemetry.js; CONSUMES apps/web/tools/release-telemetry.mjs
# Intent:      Define bounded collection contracts and distinguish tested source coverage from actual vendor delivery and operational acceptance.
# ----------------------------------------------------------------

# Telemetry coverage and acceptance

The owner's September 24 audit is the reason for this repair. Its later real-visit
readback supersedes its earlier claim that the new release sent no PostHog events.
Those observations are supplied evidence, not vendor reads performed by this source
session. The implementation starts from current public main and does not assert
that the checkout or backend is the audited deployment.

Source tests, emitted artifacts, browser delivery and vendor ingestion are four
different checks. No section is called fully covered until its actual views,
actions, failures and backend signals have arrived from one accepted release.
No live visit, test mail, provider request, monitor change or deployment is part
of the local regression suite.

## Privacy and identity

- Section names come from `telemetrySection`, which matches the route table.
  Classroom, room, persona and reset-token segments are templates. Unknown
  paths become `/unknown`; query strings and fragments never leave in URLs.
- Browser identity is the native account ID only. Email, names, lesson answers,
  search text, workspace titles and exception prose are not event properties.
  RUM masks content and automatic action names. Product DOM autocapture,
  session recording and unfiltered exception capture are disabled.
- PostHog uses memory persistence: the initial pageview is anonymous, never a
  previous document's persisted account. Native auth can identify the current
  document. Anonymous/session continuity across full reloads is intentionally
  lost. Logout resets identified state without overriding opt-out consent.
- The configured public PostHog project key is restored only in the SDK envelope
  after scrubbing. This routing field is not permission to send application
  tokens, credentials or arbitrary properties.
- Product events carry the build's trusted `env` and `release`, a bounded
  `section`, and `browser_automated` from `navigator.webdriver`. An initial
  `telemetry_test=heartbeat` marker sets `declared_synthetic` for that document.
  These are filtering signals, not authenticated human or agent identity.
- Probe analytics use session-scoped opaque IDs, `actor_type: agent`,
  `traffic_type: synthetic` and a fixed probe type. No machine address or seat
  person name is sent. Existing vendor events are not deleted by this repair.

## Browser contracts

PostHog owns initial and SPA pageviews through `capture_pageview: history_change`.
The application does not also send manual pageviews. Datadog retains automatic
views with scrubbed names. `route.change` and `route.not_found` are separate
application observations, not extra views.

| Event or family | Meaning and bounded fields |
|---|---|
| `section.failure` | Section, source, reason, outcome and observed status class. Missing status stays unknown. |
| `section.render_error` | Named public/page/shell crash, with `error_source: react_render`; no component or exception prose in product events. |
| `workspace.*` mutation actions | Validated outcome, native command/operation, collection, initiating section, reason and status class. |
| `public.auth.*`, `public.password_reset.*` | Distinct sign-in/signup/reset result. Request acceptance is not email delivery or account-existence evidence. |
| `public.enquiry.*`, `public.early_access.*` | Draft preparation, mailto activation or native request result, never a claim that mail was sent. |
| `public.onboarding.*` | Local step advancement differs from a saved native receipt and readable workspace. |
| `public.voice.*`, `classroom.media.*` | Intent, signalling, connection and failure observations. Signalling acceptance is not received media. |
| Public navigation/search/lesson/CTA actions | Closed targets, modes and counts only. Search text and arbitrary slugs are excluded. |
| Passport/replay/projection observations | Bounded recorded counts/states; no IDs, graph contents or promotion of recorded results to independent verification. |

`readFailed` sends to both sinks independently. Shared notices emit once per
settled state transition, not on every render. `degraded_notice`, `write_notice`,
`control_state`, `control_feedback` and `access` are state observations; they must
not be counted as additional request attempts. The read-operation sources report
actual failed attempts, including malformed successful responses and unavailable
subsources. Valid empty results, loading, demo data, navigation cancellation and
obsolete lifetimes are not backend failures.

Mutation receipt and scope validation occur inside the observer. `success`,
`failure`, `uncertain`, `conflict`, `forbidden`, `cancelled` and `scope_changed`
remain distinct. Recovery retains its original request bytes/key. A result from
an obsolete account, workspace, session or visit cannot become success or a
backend failure attributed to the next account. Collector failures do not alter
the underlying response, exception, saved record or retry policy.

Fetch measurement admits known same-origin application endpoints, not vendor
intake, external requests or unknown proxies. HTML where JSON is expected is
`invalid_response`; the observer does not consume the body or change the returned
response. Client validators detect malformed JSON/receipts. Hidden tabs stop the
periodic vitals timer; unchanged aggregates do not emit on idle ticks. Final
observations are drained once, and bfcache restoration can resume collection.

## Backend contracts

The existing `routerUse` path records bounded request templates, method, latency,
status and outcome, including thrown errors and explicit response statuses.
An opaque JS exception stays a failure with status zero (unknown); middleware
does not guess how the outer PocketBase handler will map that exception to HTTP.
Record counters include the relevant auth, classroom and workspace collections
without reading their contents. Known route families, including OCN, have fixed
templates; unknown paths collapse to a fixed fallback.

`buildanddo.backend.failure` uses closed operation and cause categories:
`config`, `upstream_status`, `parse`, `transport`, `schema`. No raw exception,
request body, query, IP, email or message is passed to the logger. The original
application error/response remains authoritative. Classroom health is intentionally
503 when its existing availability checks fail; a reachable process is not a
healthy media dependency. OCN authentication/signing and its health implementation
are not changed.

`BUILDANDDO_TELEMETRY_TRANSPORT=stdout` remains an explicit operator switch.
It is not enabled by a migration or by these tests. The forwarder preserves
native log persistence, emits only sanitized fields and prevents recursion.
It no longer appends raw log rows to an unbounded journal or suppresses database
logs based on `NODE_ENV`. Existing on-server journal files and retention settings
need operator handling; source changes do not rotate or remove them.

This deliberately does not lower native `minLevel` globally or enable `logAuthId`.
That would collect sensitive raw request paths/IPs before the shipping/privacy
policy was established. Sanitized middleware supplies the request/latency signal
instead. The log shipper must add configured service/environment/version tags;
unconfigured tags and ingestion remain unmeasured.

Discord reuses the structured stderr sink. Personless command/control labels,
outcomes and duration cover success, denial, expiry, cancellation and transport
failure. Quiz control acceptance is not answer correctness or mastery. No new
vendor client or hosting configuration is introduced.

## Release admission

Ordinary local builds remain keyless. Both existing release controllers explicitly
select `BUILDANDDO_RELEASE_TARGET` for a designated release and require public
PostHog and Datadog inputs, valid sampling and the expected release identity.
The build writes `telemetry-manifest.json` using the
`buildanddo.release-telemetry/v2` contract. It binds a fresh build ID, configuration
fingerprints, SDK/adapter presence and exact JS/HTML/version bytes.

The bundler's real transformed adapters and configuration helpers run in a bounded
offline module check with SDK stubs. This checks both designated hostnames and
configured sampling; it is not a generic JavaScript verifier or proof of ingestion.
Values are not printed in admission output. Missing, altered, mismatched and stale
artifacts are refused before copy/promotion, including the configured canonical
release lane. The prior integrity manifest is preserved as the comparison baseline.

The real Vite/minifier integration test must run with installed dependencies.
Source doubles cannot certify an emitted application bundle. No existing release
can be grandfathered through a missing or older telemetry manifest; rebuild it.
The existing required GitLab source-assurance matrix also runs the Python
admission/swap tests for both controllers on both declared Python versions.
This is configured execution, not a claim that a hosted pipeline ran.

## Verification and remaining work

Offline regression commands:

```bash
node --test tests/upgrade/telemetry-*.test.mjs tests/upgrade/mutation-*.test.mjs tests/upgrade/read-failure-telemetry.test.mjs tests/upgrade/public-action-telemetry.test.mjs tests/upgrade/classroom-telemetry.test.mjs tests/upgrade/pocketbase-metrics.test.mjs
node --test tests/upgrade/build.test.mjs
python -m unittest discover -s tests/deploy -p 'test_*telemetry.py'
python -m unittest tests.upgrade.test_discordbot_telemetry tests.upgrade.test_ocn_seat_session tests.upgrade.test_native_fixture_contracts
```

Use the declared Node and Python versions. Execute the locked rendered suites,
real bundle test and disposable PocketBase checks before rollout. The tests use
synthetic accounts, local files, fake clocks and explicit vendor/transport doubles;
none grants full live telemetry coverage. The detailed source report is
`.bits/out/VCC-BUILDANDDO-UPGRADE-001/telemetry-coverage-report.md`.

Receiving work is specified in
`.bits/handoffs/2026-09-24-bits-codegen-telemetry-runtime.md`: log shipping and
tagging, configuration for missing providers/mailer, retention, heartbeat and
failure monitors, synthetics and same-release readback in both vendors. Edge
worker source/Logpush and the separate OCN receipt-telemetry branch remain with
their owners. Full section-by-section action and live coverage remain unaccepted.
