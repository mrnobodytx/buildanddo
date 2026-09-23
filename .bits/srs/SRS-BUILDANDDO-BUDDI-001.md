# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-BUDDI-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-BUDDI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     AGENTS.md, apps/web/src/lib/workspaceJourney.js, apps/web/src/lib/tutorialLearning.js, apps/web/src/contexts/MotionContext.jsx
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-BUDDI-001-* branches; DEPENDS_ON apps/web/src/lib/workspaceJourney.js
# DAG Node:    none
# Intent:      Specify the BuildAndDo block mark and the Buddi mascot with animation, interaction, engagement and achievement layers that only reflect server-confirmed facts.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-BUDDI-001 — Brand mark and the Buddi mascot

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

The site has no logo: the header shows a generic activity icon and the favicon
points at `/vite.svg`, which is not in `apps/web/public`. The owner approved a
brand mark (an isometric building block: paper front with ruler ticks, red cap,
ochre side) and a mascot, Buddi, which is that block with a face. The workspace
has no friendly guide, and earned progress is scattered across panels.

## Scope

- Brand assets: `apps/web/public/brand/buildanddo-mark.svg` (also the favicon)
  and `apps/web/public/brand/buddi.svg`; the mark in the public header and the
  workspace sidebar.
- `components/buddi/`: `LogoMark`, `Buddi` (poses calm, hello, think, verified,
  build), `BuddiGuide`, `BuddiAchievements` and their stylesheet.
- **Animation layer:** arrival hop, a single wave, a press response, eyes that
  look toward focus, and an achievement stamp.
- **Interaction layer:** Buddi is a real button. Pointer or keyboard focus makes
  it look up; pressing it shows the next short tip; it can be hidden and shown
  again.
- **Engagement layer:** Buddi fronts "What needs attention next". Its pose and
  sentence come from the first action `workspaceJourney` already ranks; it adds
  no recommender of its own.
- **Achievement layer:** a derived list of achievements with a one-time
  celebration when a new one is earned.

## Out of scope

- New collections, migrations, hooks, points or writes of any kind.
- Changing how tutorials, missions or evidence are scored or verified.
- A consent banner, sound, or any external service.

## Invariants

- Achievements derive only from server-owned facts: mission `status` of
  `verified` or `failed` (transitions enforced by `pb_hooks/mission-policy.js`)
  and the learning summary returned by `/api/buildanddo/learning`
  (server-issued certificates and milestones). Never from `tutorial_progress`,
  the mission `progress` percentage, mission learning points or browser state.
- A source that is loading, unreadable or in demo mode makes its achievements
  `unmeasured`, never `not yet earned`.
- The only browser storage is a per-viewer convenience: which achievements this
  viewer has already been shown, and whether Buddi is hidden. Losing it only
  replays or suppresses a celebration; it never changes what is earned.
- Buddi never states a result the page has not read. The Verified pose appears
  only beside an achievement the server data supports.
- Motion uses the existing `learning` category and motion tokens: off by default,
  `prefers-reduced-motion` always wins, nothing loops.
- Decorative Buddi images are hidden from assistive technology; the interactive
  Buddi has an accessible name and a visible focus ring.

## Acceptance

1. The favicon and header resolve to files in the repository.
2. `buddiMood` maps each `workspaceJourney` state and first action to a pose and
   sentence, with loading and unavailable states that claim nothing.
3. `buddiAchievements` returns `unmeasured` for loading, degraded or demo sources
   and earns mission achievements only from `verified` or `failed` status.
4. A newly earned achievement is announced once in a `role="status"` region and
   is not announced again after "Got it"; the first visit seeds silently.
5. Pressing Buddi advances the tip; hiding Buddi keeps the actions list.
6. Web lint, build and the Buddi, NextWorkspaceActions and Overview suites pass,
   with no new failure against the recorded baseline.

## Verification

`npx vitest run src/components/buddi src/lib/__tests__/buddi.test.js src/pages/workspace/__tests__/OverviewPage.test.jsx`,
`npm run lint`, `npm run build`, `python scripts/ci/agent_context.py --check`,
`python scripts/ci/hostinger_readiness.py --check`, `python scripts/ci/verify_public_boundary.py`.
