# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-TEST-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-TEST-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     .github/actions/datadog-ci-report/action.yml
# EnumType:    Doc
# EnumEdges:   PRODUCES reports/junit; VALIDATES apps/web/src
# Intent:      Specify the missing web test layer that CI is already prepared to consume.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-TEST-001 — Web unit tests with JUnit output

**Status:** proposed **Risk:** A1 **Seat:** unassigned

## Problem

`apps/web/src` holds well over a hundred source files and zero test files. Both
pipelines run `npm test --if-present`, and because no workspace defines a `test`
script, that step is a silent no-op — CI reports success without executing a
single assertion. The Datadog test-visibility path added under SRS-BUILDANDDO-CI-001
uploads `reports/junit/*.xml`; nothing writes there, so `tests.total` is 0 on
every run and the Tests page in Datadog stays empty.

CONTRIBUTING.md tells contributors to run real tests. For the frontend there are
none to run.

## Intent

Make the no-op real: a test runner whose output CI already knows how to consume,
starting with the pure logic that is cheapest to protect and most costly to break.

## Scope

- Add `vitest` (with `jsdom` only if a DOM is genuinely needed) to `apps/web`.
- `test` script in `apps/web/package.json` and a root `test` script so the
  existing `npm test --if-present` step stops being a no-op.
- JUnit reporter writing `reports/junit/web.xml` from the repository root, which
  is the path the CI report action already scans.
- Seed suites for logic that is currently unprotected and side-effect free:
  `src/lib/format.js`, `src/lib/utils.js`, `src/lib/ecommerceSubscriptionsUtils.js`,
  and `resolveEnvironment()` in `src/lib/datadogRum.js` (environment resolution
  decides which Datadog dashboard real user data lands in — a silent break there
  corrupts production telemetry).
- No coverage gate in this SRS. Establish the signal first, then threshold it.

## Out of scope

- Component or browser tests, Playwright, visual regression.
- The Python evidence suite — that is SRS-BUILDANDDO-EVIDENCE-CI-001.
- Any change to `tools/build.mjs` or `tools/lint.mjs` shell-free invariants.

## Acceptance evidence

1. `npm test` fails when an assertion is broken and passes when it is not —
   demonstrate both, do not assert it.
2. `reports/junit/web.xml` exists after a CI run and contains one `testcase` per test.
3. The telemetry snapshot reports `tests.total > 0`; the delta against the
   previous main baseline shows the increase.
4. Datadog CI Visibility → Tests lists `service:buildanddo-web`.

## Verification

```bash
npm test
test -s reports/junit/web.xml
python scripts/ci/telemetry_snapshot.py --pipeline local | grep tests
```

## Notes for the implementing agent

Vitest is the only runner consistent with the existing Vite toolchain; adding
Jest would mean a second transform pipeline. Keep the runner config in
`apps/web`, not the root, so the workspace boundary stays intact.
