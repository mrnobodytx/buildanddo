# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-PLATFORM-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-PLATFORM-001
# CAPS:        pending
# CK:          pending
# Dispatch:    USO-BUILDANDDO-PLATFORM-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-13
# Depends:     apps/web/src/App.jsx, apps/web/src/components/site/ui.jsx
# EnumType:    Doc
# EnumEdges:   GATES apps/web/src/pages/PlatformPage.jsx;
#              DEPENDS_ON apps/web/src/components/site/ui.jsx;
#              VALIDATES apps/web/src/components/platform
# Intent:      Specify a public, evidence-led visual explanation of the MetaFunction Fabric.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-PLATFORM-001 — MetaFunction Fabric platform page

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN
**Dispatch:** USO-BUILDANDDO-PLATFORM-001

## Problem

BuildAndDo has no public visual surface that explains how a Guildmaster request
becomes a governed provider call, normalized result, analytics record and causal
edge. The system is difficult to evaluate without reading implementation notes,
and its capability registry has no presentation-quality monitoring treatment.

## Intent

Create an editorial platform page that makes the MetaFunction execution path,
provider mesh, authority boundaries and normalized receipts understandable at a
glance while clearly presenting all data as an illustrative public preview.

## Scope

- Add `apps/web/src/pages/PlatformPage.jsx` and public route `/platform`.
- Add reusable components under `apps/web/src/components/platform/` for the
  animated execution flow, capability mesh and monitoring dashboard.
- Use React, Framer Motion, Three.js, Tailwind and the established primitives in
  `apps/web/src/components/site/ui.jsx`.
- Lazy-load the Three.js visualization, honor reduced-motion preferences and
  provide a static fallback.
- Keep the experience usable on mobile and keyboard-accessible.

## Out of scope

- Live provider integrations, credentials, runtime mutation or private evidence.
- Changes to PocketBase collections, deployment configuration or NATS subjects.
- Claims that illustrative capability state is production telemetry.

## Invariant this change must not break

**Public previews must not be mistaken for live private operational state.** The
dashboard labels illustrative data explicitly, performs no network request and
does not expose private provider identifiers or evidence.

## Acceptance evidence

1. The platform route renders and the production bundle includes its lazy chunk.
   `npm --prefix apps/web run build`
2. Component behavior and accessibility semantics are covered by focused tests.
   `npm --prefix apps/web test -- --run`
3. All changed frontend files pass lint.
   `npm --prefix apps/web run lint`
4. Governance context and the public boundary remain valid.
   `python scripts/ci/agent_context.py --check`
   `python scripts/ci/verify_public_boundary.py`
5. Desktop and mobile layouts, reduced motion, expansion controls and the static
   orb fallback are inspected in a browser using the local production preview.
