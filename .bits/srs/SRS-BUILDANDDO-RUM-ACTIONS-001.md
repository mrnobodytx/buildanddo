# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-RUM-ACTIONS-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-RUM-ACTIONS-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     apps/web/src/lib/observability/runtime.js,
#              apps/web/src/components/observability/TelemetryBoundary.jsx
# EnumType:    Doc
# EnumEdges:   EXTENDS apps/web/src/lib/observability/runtime.js;
#              VALIDATES apps/web/src/pages/workspace
# Intent:      Specify the workspace instrumentation the existing RUM layer was
#              built for and never received, so product actions are measurable.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-RUM-ACTIONS-001 — Workspace actions, per-page error scope, interaction timing

**Status:** proposed **Risk:** A1 **Seat:** unassigned

## Problem

The browser observability layer is complete and almost entirely unused by the
product it observes.

`apps/web/src/lib/observability/runtime.js` already exports `reportAction`,
`reportMetric`, `reportError`, `trackRenderError`, `trackAuthIdentity` and
`trackFeatureFlag`. `report.js` already forwards them to RUM with scrubbing and
graceful degradation. Of the fifteen pages under `apps/web/src/pages/workspace`,
**zero** call any of them; the only page in the repository that reports an
action at all is `apps/web/src/pages/RoadmapPage.jsx`.

Three consequences are concrete:

1. **No product funnel exists.** RUM records that a session visited
   `/workspace/missions`. It cannot tell whether the user created a mission,
   abandoned the form, or hit a validation error, so the most basic retention
   question — do people who sign up actually build anything — is unanswerable
   from telemetry.
2. **Error attribution stops at the app root.** `App.jsx` wraps the entire
   router in one `TelemetryBoundary`. A render failure anywhere blanks the whole
   application and reports a single route-tagged error, so error rate cannot be
   attributed to a page or a component, and a failure in one workspace panel
   destroys the rest of the shell.
3. **Interaction cost is invisible.** `vitals.js` measures page-level timing.
   Nothing measures the latency the user actually complains about: time from
   submitting a mission to it appearing, or how long a workflow step takes to
   complete.

## Intent

Instrument the workspace surface using the helpers that already exist. Add no
new telemetry infrastructure and no new dependency.

## Scope

- A single action-name vocabulary for workspace CRUD, defined once and imported
  rather than string-literal per call site: `workspace.<entity>.<verb>` with
  `verb` in `create | update | delete`, plus a terminal `outcome` of
  `success | failure` on every reported action.
- Report those actions from the mutation paths of the workspace pages
  (missions, workflows, operations, signals, settings and the remaining pages
  under `apps/web/src/pages/workspace`), taking the entity and outcome from the
  real PocketBase result, not from optimistic UI state.
- Measure and report mutation duration as `reportMetric` alongside each action,
  so a slow create is distinguishable from a failed one.
- Scope error boundaries per workspace route so one failing page degrades to a
  recoverable panel and reports an error tagged with that page, keeping the
  existing root boundary as the last resort.
- Centralise the service, environment, sample-rate and action-vocabulary
  constants currently inlined in `datadogRum.js` into a single configuration
  module under `apps/web/src/lib/observability/`, and have `datadogRum.js`
  consume it. No behaviour change is intended by the move.

## Out of scope

- Any new npm dependency. The Datadog browser SDK already present is sufficient.
- Server-side metrics — see SRS-BUILDANDDO-PB-METRICS-001.
- `VITE_DD_ENV` / release identity — owned by SRS-BUILDANDDO-RELEASE-TAG-001;
  this spec must not introduce a second version or environment resolver.
- A feature-flag provider. `reportFeatureFlag` and `trackFeatureFlag` already
  exist and need no stub added on top of them.

## Acceptance evidence

1. Creating, editing and deleting one workspace record produces three RUM
   custom actions with matching `outcome` and a duration metric each, shown by
   RUM explorer query `@action.name:workspace.*`.
2. A deliberately thrown error inside one workspace page reports an error tagged
   with that page and leaves the rest of the workspace shell interactive; a
   screenshot or session replay is the evidence.
3. With `VITE_DD_APPLICATION_ID` and `VITE_DD_CLIENT_TOKEN` unset, the same
   flows run with no console error and no network call to Datadog — degradation
   is silent, per the standing invariant that observability cannot break the
   product it observes.
4. `npm run lint` and `npm run build` pass, and `npx knip` reports no new
   unused export.

## Verification

```bash
npm run lint --prefix apps/web
npm run build --prefix apps/web
rg -c "reportAction|reportMetric" apps/web/src/pages/workspace   # expect > 0 per instrumented page
```

## Notes for the implementing agent

Keep action names low cardinality: the entity id belongs in the action context,
never in the action name. Do not report an action from a `useEffect` that reruns
on render — attach it to the mutation promise so one user intent yields exactly
one action. Read `apps/web/src/lib/observability/README.md` before adding
anything to that directory; the layering there is deliberate.
