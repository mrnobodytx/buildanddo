# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-COMMUNITY-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-COMMUNITY-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     .github/ISSUE_TEMPLATE/feature_request.yml, AGENTS.md
# EnumType:    Doc
# EnumEdges:   VALIDATES .github/ISSUE_TEMPLATE; PRODUCES apps/web/src/lib/seatComms.js
# Intent:      Specify the contributor-facing surface a public mirror needs before it can accept outside work.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-COMMUNITY-001 — Community contributor infrastructure

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

The repository is a public collaboration plane with no contributor on-ramp.
Measured gaps:

- `.github/ISSUE_TEMPLATE/` holds exactly one form, `feature_request.yml`. There
  is no way to report a bug in a structured way, and no way for a maintainer to
  publish a scoped first task. Every incoming issue is free-form prose that a
  maintainer has to triage into the governance vocabulary by hand.
- `apps/web/src/components/ui/` holds 55 primitive modules exporting several
  hundred named components. None of them are documented, none are rendered
  anywhere a contributor can see, and `rg` shows roughly 15 of the 55 modules are
  imported by application code. A contributor cannot tell what already exists,
  so the default behaviour is to write a fourth button.
- Several workspace routes are shells relative to `OverviewPage` and `ErpPage`.
  They are the obvious first-contribution targets and nothing says so.
- The contribution flow itself — issue, fork, governance scan, review, staging,
  production — exists as CI configuration and prose in `AGENTS.md`. It is not
  visible to the person being asked to walk it.
- Nothing records that work happened. Two contributors, or two agent seats, can
  pick up the same mission with no way to discover the collision, because
  PocketBase has no cross-actor activity record.

## Intent

Make the contribution path legible from inside the product: publish the
component inventory, publish the pipeline, publish who is working on what, and
give incoming work a structured front door that already speaks the governance
vocabulary (actor type, risk tier, acceptance evidence).

## Scope

- Issue forms: `bug_report.yml`, `good_first_issue.yml`,
  `workspace_page_enhancement.yml`, each carrying the actor-type and risk-tier
  fields the PR template and boundary scanner already require.
- A component catalogue built by enumerating `apps/web/src/components/ui/`, with
  import path, key props and a live preview per entry where a preview can be
  rendered without a provider. Entries that need a provider say so instead of
  faking one.
- A contributor hub on `/app/community`: pipeline diagram, contribution
  leaderboard from PocketBase, live pull-request and recent-merge lists from the
  public GitHub API with graceful degradation to a link, and a legend for the
  actor labels and risk tiers.
- `ProgressionPipeline` — a prop-driven component rendering the ten-step flow,
  each step carrying its actor and its pipeline tag.
- `seatComms` — a pub/sub over a `seat_events` PocketBase collection so seats
  working the same workspace can announce join, progress, completion, blockage
  and handoff, plus the migration that creates the collection.
- `workHistory` — a read-only lookup that answers "has anyone worked this
  mission or workflow before" from `seat_events` and `evidence`, surfaced on the
  Missions and Workflows pages.
- `AGENTS.md` documentation for the seat protocol and the pipeline tag set.

## Out of scope

- Writing to the GitHub API, or any authenticated GitHub call from the browser.
  The hub reads public endpoints or renders a link; it never holds a token.
- Seeding the `contributors` collection. The leaderboard renders empty until
  real rows exist; it does not invent contributors.
- NATS emission. Seat events stay inside PocketBase on the public plane; the
  bridge to `citadel.bits.*` is private-plane work and belongs in a handoff.
- Changing the eight shell workspace pages. This SRS makes them findable and
  specifiable; enhancing them is one issue each, which is the entire point.

## Acceptance evidence

1. `ls .github/ISSUE_TEMPLATE/*.yml` lists four forms, and each new one parses
   as a GitHub issue form (`python -c "import json,sys" ` style YAML load).
2. The component catalogue entry count equals the number of modules in
   `apps/web/src/components/ui/` — the catalogue cannot silently drift behind the
   directory. Demonstrate with a count comparison, not an assertion.
3. `npm run lint` and `npm run build` pass with the new pages in the bundle.
4. `python scripts/ci/verify_public_boundary.py` reports `PASS`.
5. `python scripts/ci/agent_context.py --check` passes with the refreshed lock.
6. The migration applies and reverts: the down leg removes every collection the
   up leg created.

## Verification

```bash
ls .github/ISSUE_TEMPLATE/*.yml | wc -l                        # expect 4
ls apps/web/src/components/ui/*.jsx | wc -l                    # catalogue target
npm run lint --prefix apps/web
npm run build
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```

## Notes for the implementing agent

The two repurposed pages already hold working features. `TutorialsPage` writes
to `tutorial_progress` and `CommunitySocialPage` writes to `social_channels` and
`social_content`. Repurposing a route must not delete a working write path —
both pages keep their original feature as a second tab rather than losing it.

The catalogue is the piece most likely to rot. It is a hand-written registry
because a live preview cannot be generated from a file listing, so acceptance
item 2 exists specifically to catch the day someone adds a primitive and forgets
the entry.
