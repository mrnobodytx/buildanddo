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

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

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

- Add `vitest` and `jsdom` to `apps/web`, plus `@testing-library/react`,
  `@testing-library/user-event` and `@testing-library/jest-dom`.
- `test`, `test:watch` and `test:coverage` scripts in `apps/web/package.json`,
  and a root `test` script so the existing CI step stops being a no-op.
- JUnit reporter writing `reports/junit/web.xml` from the repository root, which
  is the path the CI report action already scans.
- A shared harness under `src/test/`: a provider-aware render wrapper over the
  real `AuthContext` and `WorkspaceContext`, an in-memory PocketBase stand-in,
  and record factories whose field names match the live collections.
- Suites for the workspace surface a contributor is most likely to break, and
  where a break is least visible: `OverviewPage`, `MissionsPage`,
  `WorkflowsPage`, `SignalsPage`, `useWorkspaceRecords` / `useRecords`, the
  sign-in form, and `ProtectedRoute`.
- `npm test` promoted to a required PR check, with an explicit assertion that
  the JUnit report was written — a green suite that reports nothing leaves
  Datadog test visibility empty and looks identical to success.
- No coverage gate in this SRS. Establish the signal first, then threshold it.

**Scope revision (2026-09-10).** Component tests were originally out of scope
and pure-logic seed suites were in it. That is now inverted: the component layer
is where contributors actually change code and where nothing else — not lint,
not the build, not the boundary scan — can catch a regression. The pure-logic
suites for `src/lib/format.js`, `src/lib/utils.js`,
`src/lib/ecommerceSubscriptionsUtils.js` and `resolveEnvironment()` in
`src/lib/datadogRum.js` remain wanted and are the next increment under this
code; the harness added here is what they will build on.

## Out of scope

- Browser/E2E tests, Playwright, visual regression.
- Tests for `src/components/ui/**` — upstream shadcn primitives, excluded from
  coverage as well.
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
npm ci                     # regenerates package-lock.json entries for the runner
npm test
test -s reports/junit/web.xml
python scripts/ci/telemetry_snapshot.py --pipeline local | grep tests
```

## Notes for the implementing agent

Vitest is the only runner consistent with the existing Vite toolchain; adding
Jest would mean a second transform pipeline. Keep the runner config in
`apps/web`, not the root, so the workspace boundary stays intact.

Assert behaviour a user could observe, not internals: query by role and label,
drive interaction with `userEvent`. Where a page's fixture field names diverge
from what a request assumed, the collection wins — a test written against an
invented field proves nothing. Two such divergences are already known: signals
carry `type` and `confidence`, not severity, and have no acknowledge action.
