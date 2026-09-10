# ─── CGRF Header ───────────────────────────────────────────────
# File:        apps/web/src/lib/observability/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-RUM-002
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     apps/web/src/lib/observability/runtime.js
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/web/src/lib/observability/runtime.js
# Intent:      Document the emitted metric catalogue and delta semantics so
#              dashboards and monitors can be built without reading the source.
# ───────────────────────────────────────────────────────────────

# Browser observability

Datadog RUM, browser logs and a delta engine for `apps/web`. One entry point:

```js
import { initObservability } from '@/lib/observability/runtime';
initObservability();
```

Nothing is emitted unless `VITE_DD_APPLICATION_ID` and `VITE_DD_CLIENT_TOKEN`
are present at build time. Without them every function in this directory is a
no-op, so local development and preview builds stay silent.

## Layout

| File          | Responsibility                                                        |
|---------------|-----------------------------------------------------------------------|
| `runtime.js`  | Public API: `initObservability` plus the trackers the React tree calls |
| `report.js`   | The only path to the SDK; fail-soft, version-tolerant                 |
| `deltas.js`   | Session and cross-session delta maths (browser-free, unit tested)     |
| `context.js`  | Environment, release, device, network and display facets              |
| `vitals.js`   | Performance API collection and the periodic aggregate flush           |
| `network.js`  | `fetch` instrumentation per normalised endpoint                       |

`../datadogRum.js` owns SDK configuration: sampling, trace propagation and the
scrubbing applied in `beforeSend`.

## Deltas

Every measurement goes through `reportMetric`, which emits the value *and* its
comparisons in the same event, so a single RUM action answers "is this worse
than usual" without a dashboard comparison window:

| Attribute              | Meaning                                              |
|------------------------|------------------------------------------------------|
| `session_previous`     | Previous value this session                          |
| `session_delta`        | Change since the previous value                      |
| `session_pct_change`   | Same, relative                                       |
| `session_first`        | First value this session                             |
| `session_min` / `_max` / `_mean` | Session aggregate                          |
| `baseline`             | Exponentially weighted mean over prior sessions      |
| `baseline_delta`       | Change against that baseline                         |
| `baseline_pct_change`  | Same, relative                                       |
| `trend`                | `up`, `down` or `flat`                               |
| `regression`           | Baseline deviation past the threshold, wrong way     |

Baselines live in `localStorage` and are keyed to the release. A deploy clears
them and emits `release.changed` once, so a new version never reports itself as
a regression on every metric. `direction: 'higher_is_better'` inverts the
regression test (used for route dwell time); a noise floor suppresses relative
blow-ups on tiny values. `regression: true` also emits a `warn` log, which is
the intended hook for a Datadog monitor.

Run the delta checks with `npm run smoke --prefix apps/web`.

## Metric catalogue

Load and rendering:

- `web.vital.fcp`, `web.vital.lcp`, `web.vital.ttfb`, `browser.page_load` — milliseconds
- `browser.navigation` — action carrying DNS, TCP, TLS, request, response,
  DOM and compression-ratio breakdown
- `app.boot` — navigation start to observability init
- `route.render` — location change to the first painted frame of the new route

Responsiveness and stability:

- `web.interaction.worst` — worst interaction latency seen. An approximation
  of INP, deliberately not named `inp`
- `web.vital.cls` — cumulative layout shift, no session windowing
- `browser.long_task` — individual tasks over 200 ms, with attribution
- `browser.long_task.total_time` — session total, with count

Resources and memory:

- `browser.resource.transfer_bytes` — bytes, plus resource count, cache-hit
  percentage and the slowest resource path
- `browser.heap_used` — used JS heap; Chromium only. Growth across the
  periodic flush is the leak signal

API and connectivity:

- `api.latency` — per normalised endpoint, method, status and status class.
  Record ids, UUIDs and numeric segments collapse to `:id`
- `api.error_rate` — session error rate, recorded on each failure
- `api.failures` — counter
- `api.outage_suspected` — three consecutive failures against one endpoint
- `browser.connectivity` — offline and online transitions

Application:

- `route.change`, `route.changes`, `route.dwell` — navigation flow and time on route
- `auth.identified`, `auth.cleared` — session identity transitions
- `app.render_errors` — React render failures, with component stack
- `session.summary` — emitted on `pagehide` with the full metric snapshot

## Privacy

`defaultPrivacyLevel: 'mask-user-input'` for session replay. `beforeSend`
redacts `token`, `email`, `password`, `otp`, `code`, `secret`, `key` and
`apikey` query parameters from view, resource and error URLs — password-reset
and verification links carry single-use tokens in the URL.

Expected backend states (`INTEGRATION_NOT_CONFIGURED`, a rejected password,
insufficient credits) are dropped before leaving the browser. They are product
states, not defects, and they would otherwise dominate the error rate. This
mirrors the benign-error list in `vite.config.js`.

Trace headers (`traceparent`, `x-datadog-*`) are attached to same-origin
requests only, which is where PocketBase is served from. A cross-origin
endpoint would have to allow those headers explicitly, and a preflight it does
not allow fails the request outright - RUM-to-APM correlation is not worth
breaking an API call for.
