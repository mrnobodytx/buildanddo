# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-14
# Depends:     .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs_registry.yml
# DAG Node:    none
# Intent:      Define acceptance evidence for the eight owner-authorized BuildAndDo upgrades.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-UPGRADE-001 — BuildAndDo site upgrades

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN
**Dispatch:** VCC-BUILDANDDO-UPGRADE-001 **Actor:** actor:agent

## Authority

Dmitry Richard (mr.nobody@citadel-nexus.com) explicitly authorized this dispatch,
its task table, SRS registration and implementation of all eight areas in one PR
in the session prompt on 2026-09-14. This umbrella records that single-PR scope.
It incorporates the existing SUPPLY-001, RUM-ACTIONS-001, RELEASE-TAG-001 and
public-plane PB-METRICS-001 specifications. It grants no deployment authority.

## Problem and intent

Visitors lack product, team, documentation and contact pages. Eager route imports
load workspace and visualization code for public visits. Sparse interaction
coverage, fixed layouts and incomplete theme/keyboard behavior obscure failures.
Dependency, release and mutation telemetry must describe observed outcomes.

## Scope and acceptance evidence

1. Add Pricing, About/Team, Docs, Blog and Contact at stable public routes,
   using existing broadsheet typography and primitives. Navigation links resolve;
   pricing, team and blog copy make no invented customer, price or release claims.
2. Expand Testing Library suites for public navigation, authentication and critical
   workspace flows, including mutation failure, recovery and loading states.
3. Lazy-load every route page with accessible Suspense feedback. Keep navigation
   mounted during workspace route loading and retain page error isolation.
4. Make public and workspace shells, forms, tables and dialogs usable at narrow
   widths. Verify mobile menu close/focus behavior and absence of page overflow.
5. Implement the four existing telemetry specs: report-only dependency audit with
   license and lock validation, real-result mutation actions and timing, one build
   release stamp, and opt-in PocketBase structured-log CRUD/request telemetry.
   No external telemetry service may be required for local product operation.
6. Generate sitemap/robots from one public route catalogue. Add canonical social
   metadata and valid JSON-LD; exclude auth and workspace routes from indexing.
7. Support persisted light/dark/system theme, public Header toggle and workspace
   Settings control. Theme auth flows and shared workspace components as well.
8. Provide skip navigation, visible keyboard focus, named controls, modal focus
   trapping/return, and navigation semantics covered by interaction tests.

## Invariants and boundaries

- Reuse React/Vite, PocketBase auth and installed dependencies.
- Never emit record contents, auth material or user identifiers in telemetry.
- Telemetry failures must preserve the operation's original result or exception.
- Supply audit unavailability is unknown, never a zero-vulnerability result.
- PocketBase instrumentation adds no schema and makes no network call. Host log
  ingestion and live Datadog verification require a private-plane handoff.
- The dispatch stays in progress until evidence and review; delivery means merged
  and verified, not merely edited. CK, CAPS and CKS remain pending.

## Verification

```bash
npm --prefix apps/web test
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
node --test tests/upgrade/*.test.mjs
python -m unittest discover -s tests/upgrade -p 'test_*.py'
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
```

Inspect the production preview at mobile and desktop widths in both themes,
exercise public navigation and keyboard menus, and record the actual evidence.
Tests using SDK/JSVM doubles prove the adapter contract, not live ingestion.

## Authorized continuation — reuse existing backend flows

On 2026-09-15 the owner requested that existing frontend-only functions reuse
the backend integrations in the signed-in sections. This continues dispatch
VCC-BUILDANDDO-UPGRADE-001 at A1 under the same SRS; the first implementation
was merged as PR 19. It authorizes local source changes, not shared mutations.

- Replace the home page's permanent empty metrics, evidence, corrections and
  Daily Edition with records from the active workspace through the existing
  data hooks. Preserve separate loading, empty, unavailable and demo states.
- Reuse the existing challenge collection and mutation hook for intake and
  history. Show the saved backend status; a submission does not start a runner.
- Share the signed-in tutorial catalogue and progress flow with the home Field
  Manual and Docs. Catalogue access remains authenticated and demo cannot write.
- Clear records, drafts and pending results when the account or workspace
  changes. Anonymous visits must make no private collection request and must
  never render records left by an earlier signed-in session.
- Preserve source, timestamp and status on previews. Revenue remains separated
  by provider, currency and date range; pending connections are not payments.
- No new collection, access-rule relaxation, credential, payment integration,
  contact-delivery service or private-stack runner is included. Early access
  already persists to PocketBase; commercial email remains an explicit draft.

Verify the continuation with targeted Testing Library suites for the home page,
tutorials and account transitions, Node tests for record selection, the web
build/lint/coverage gates, the context check and the public-boundary scanner.
Record unavailable tools as blocked validation, never as passing evidence.

The offline diagnostic `node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs`
checks JavaScript/JSX syntax and core binding errors using local ESLint. It makes
no installation or network request and does not replace repository lint, Vitest,
coverage, or browser acceptance.
