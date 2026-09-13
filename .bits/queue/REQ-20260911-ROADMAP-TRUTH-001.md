# CGRF: SRS=SRS-BUILDANDDO-ROADMAP-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/REQ-20260911-ROADMAP-TRUTH-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     .bits/srs/SRS-BUILDANDDO-ROADMAP-001.md, .bits/queue/TEMPLATE.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-ROADMAP-001 work
# Intent:      Record the roadmap-truth-repair dispatch REQUEST in the queue
#              shape, so progress is checkable mid-flight and the VCC can
#              issue (or refuse) a dispatch id against it.
# ───────────────────────────────────────────────────────────────

# Dispatch REQ-20260911-ROADMAP-TRUTH-001

**SRS:** SRS-BUILDANDDO-ROADMAP-001 **Risk:** A2 **Seat:** C-ONE **Status:** requested

> This is a DISPATCH REQUEST awaiting VCC issuance. No VCC dispatch id has been
> issued for this work; `REQ-…` is a request number, not a VCC id. The work was
> performed on branch `bits/SRS-BUILDANDDO-LIVE-UTILIZATION-001-rooms-sfu-moq-content`
> and is not pushed. The VCC decides whether it lands, under which id, and at
> which risk tier.

## Objective

The public roadmap is a CONSUMER of the estate's canonical progression
(development-continuity projection) instead of a second progression engine,
with every axis (calendar, plan, measured, milestone evidence, full campaign)
shown separately and never averaged.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | `sprint_cycle.py`: SPRINT_START 2026-09-03 (plan clock only); projection field renamed `plan_verified_pct`; docstring names the canonical clock | `py -3.13 -m unittest tests.roadmap.test_roadmap_status_progression` | done |
| 2 | `roadmap_status.py`: `progression` block consumed from env NAME `BUILDANDDO_PROGRESSION_FILE` + `BUILDANDDO_CAMPAIGN_CONFIG` through a public-safe allowlist; `day_anchor`, `day_disagreement`, `freshness`, `measurement_contract`, `baseline_epoch`; UNMEASURED fallback; never fails the build | `py -3.13 scripts/deploy/roadmap_status.py` exits 0 and writes a `progression` block | done |
| 3 | `roadmapStatus.js`: `progressionOf()` (UNMEASURED / STALE / MEASURED, contract change), `dayLabel()` | `npm test -- src/lib/__tests__/roadmapStatus.test.js` | done |
| 4 | `RoadmapPage.jsx`: Progression panel above the plot, one row per axis; plot caption says ACTUAL = milestone evidence | `npm test -- src/pages/__tests__/RoadmapPage.progression.test.jsx` | done |
| 5 | `HomePage.jsx`: Roadmap pulse for anonymous visitors, UNMEASURED-safe | same as 4 | done |
| 6 | Python unittest with a temp fake estate: SPRINT_START, plan day 9 on 2026-09-11, UNKNOWN != ZERO, STALE != FRESH, contract hash, evidence rule, leak guard | `py -3.13 -m unittest tests.roadmap.test_roadmap_status_progression` (15 tests) | done |
| 7 | Public boundary and context lock | `py -3.13 scripts/ci/verify_public_boundary.py`; `py -3.13 scripts/ci/agent_context.py --check` | done |
| 8 | VCC issues a dispatch id and decides the landing | VCC | todo |

## Constraints

- Files this dispatch may touch: `scripts/ci/sprint_cycle.py`,
  `scripts/deploy/roadmap_status.py`, `apps/web/src/lib/roadmapStatus.js`,
  `apps/web/src/pages/RoadmapPage.jsx`, `apps/web/src/pages/HomePage.jsx`,
  `apps/web/src/components/roadmap/*`, `apps/web/src/test/roadmapFixtures.js`,
  `apps/web/src/**/__tests__/*`, `tests/roadmap/*`,
  `.bits/srs/SRS-BUILDANDDO-ROADMAP-001.md`, this file, `.bits/context.lock.json`.
- Files it must not touch: milestone `day`/`planned_value` in `sprint_cycle.MILESTONES`
  and `RoadmapPage.PLANNED_MILESTONES` (mirror test), `CommunitySocialPage`,
  `TutorialsPage`, `apps/pocketbase/pb_migrations/*`, anything under the estate
  `state/` or `config/` (read-only inputs, never written).
- Anything that would raise the risk tier above A2: writing to the estate's
  progression file; copying non-allowlisted fields (paths, bars, hostnames,
  secret names) into `roadmap-status.json`; averaging any two axes.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code (stays `in_progress`; VCC decides).
- [x] Anything discovered but out of scope is recorded as a finding, not fixed:
  - FINDING: the estate projection was STALE at build time (current_date
    2026-09-09, generated 2026-09-10; build date 2026-09-11). The page labels
    it STALE and reads the plan target at the plan clock. Refreshing the
    projection is an estate task (`tools/citadel_development_continuity.py`),
    not this repo's.
  - FINDING: the two clocks disagree by construction (plan clock anchored to
    the window start 2026-09-03; canonical rule anchors day 8 to 2026-09-08,
    so the rule gives day 11 on 2026-09-11 while the plan clock gives day 9).
    The page shows both and flags it; reconciling the anchors is an operator
    decision recorded in the SRS, not something this dispatch may change.
  - FINDING: `scripts/discordbot/bot.py` still reads `actual_pct`; the field is
    kept as an alias of `verified_pct` so it keeps working, but its label
    ("Actual") should say "milestone evidence" - out of scope here.
