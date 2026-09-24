# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-JOURNEY-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-JOURNEY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-JOURNEY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     AGENTS.md, apps/web/src/components/workspace/WorkspaceLayout.jsx, apps/web/src/lib/missionLearning.js
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-JOURNEY-001-* branches; DEPENDS_ON apps/web/src/lib/missionLearning.js
# DAG Node:    none
# Intent:      Replace a flat list of thirty-five workspace destinations with Build and Do categories and a guided journey that compiles a first lesson and mission draft from multiple-choice answers.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-JOURNEY-001 — Build/Do navigation and guided journey

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN
**Authority:** owner-directed in session on 2026-09-23 (mr.nobody), which is the
human dispatch for the existing-file edits below.

## Problem

The workspace sidebar lists 35 destinations in one flat column. New users do not
know where to begin, and the BuildAndDo mantra (build it, then do it) is not
visible in the structure. The Career Passport page exists but does not show the
profile that now loads from Citadel Nexus at sign-in.

## Scope

- Group the sidebar into Build, Do, Prove, Community and Workspace categories.
  Only the category holding the current page opens by default; "Start a journey",
  "Front Page" and "Settings" stay pinned. Every existing route and link remains.
- Add `/app/journey`: one multiple-choice question at a time, framed as the
  Guildmaster interview. A pure compiler turns the answers into a lesson from the
  shipped curriculum and a proposed mission draft whose plan is prefilled except
  for the baseline and success criterion, which the person must measure and set.
- "Talk it through" opens the existing workspace assistant with the answers as a
  draft message. The person sends it; nothing is sent automatically.
- Show the Citadel-held career profile on the existing Career Passport page.

## Out of scope

- The private voice Field Interviewer / Guildmaster runtime (handoff only).
- New collections, schema, hooks or server routes. Saving uses the existing
  owner-scoped `missions` create path with `status: proposed`.
- Removing or renaming any page or route.

## Invariants

- The compiler never fills `baseline` or `target`; `planIssues` reports them, so
  a compiled draft cannot be approved until the person completes them.
- A compiled mission is only ever saved as `proposed`, after an explicit click.
- Demo mode cannot save.
- The assistant draft is inserted into the composer, never sent.

## Acceptance evidence

1. `node --test tests/upgrade/journey.test.mjs` exercises the compiler.
2. `npx --prefix apps/web vitest run src/pages/workspace/__tests__/JourneyPage.test.jsx src/components/__tests__/Navigation.test.jsx src/__tests__/AppRoutes.test.jsx src/pages/workspace/__tests__/AdministrationFlow.test.jsx`.
3. `python scripts/ci/verify_public_boundary.py` and `python scripts/ci/agent_context.py --check` pass.

## Rollback

Revert the grouped `NAV` in `WorkspaceLayout.jsx`, the assistant listener, the
journey route and the CareerPage profile card; delete the journey page, library
and tests. No persisted state beyond ordinary mission drafts the user saved.
