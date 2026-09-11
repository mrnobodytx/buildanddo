# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-ROADMAP-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN, C-ONE (2026-09-11 progression consumer addendum)
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/deploy/roadmap_status.py, scripts/deploy/ship.py,
#              apps/web/src/pages/RoadmapPage.jsx
# EnumType:    Doc
# EnumEdges:   VALIDATES scripts/ci/sprint_cycle.py;
#              VALIDATES apps/web/src/pages/RoadmapPage.jsx;
#              DEPENDS_ON scripts/deploy/roadmap_status.py
# Intent:      Specify one sprint plan, one projection, and a page that can say
#              it does not know.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-ROADMAP-001 — One sprint plan, projected honestly

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

The roadmap existed in three disconnected places and one of them did not exist
at all.

1. `scripts/deploy/roadmap_status.py` imports `sprint_cycle` from
   `scripts/ci/`. That file was listed in `.gitignore` as an internal ops
   script, so it was never in the repository. Every clean checkout — including
   CI runners — failed the projection with `ModuleNotFoundError`. `scripts/ci/`
   is a `public_allowed_prefix` in `.buildanddo/public/path-policy.json`, so the
   ignore was not enforcing the public/private boundary; it was breaking a
   tracked script.
2. `scripts/deploy/ship.py` called the projection and discarded its result. A
   failed projection therefore left the *previous* build's `roadmap-status.json`
   in `apps/web/public/`, and Vite shipped it. The public page drew a stale
   ACTUAL marker with no way to tell.
3. `apps/web/src/pages/RoadmapPage.jsx` carried its own hardcoded milestone
   array with every status pinned to `planned`, and ignored the `milestones`
   block in the file it already fetched. The page told readers "Verified
   milestones appear once they are backed by evidence records" while containing
   no code path that could ever render one.

The plan curve also carried a deterministic per-day "wiggle" so it read like a
market plot. That is drawn variance nobody measured, on a page whose entire
argument is that it does not present illustrative numbers as real.

## Intent

One plan, one projection, and a page that distinguishes *planned*, *verified*
and *unknown*.

## Scope

- `scripts/ci/sprint_cycle.py` becomes the canonical, tracked sprint module:
  campaign id, sprint start, the 11 milestones with their planned values, the
  state loader, and the planned/actual percentage rules. Standard library only.
- Actual progress is computed from verified milestones and nothing else. A
  milestone contributes its increment of the plan curve only when its status is
  `verified` *and* it names evidence. There is no writable progress number.
- Verified state lives in `state/roadmap/sprint.json`, which is gitignored
  operational state. Its absence means nothing is verified, which is the correct
  default for a fresh checkout, not an error.
- `ship.py` checks the projection result and, on failure, writes an
  `UNMEASURED` status file rather than leaving stale data in place. It warns and
  continues; the projection can never fail the build.
- The public page keeps its hardcoded milestones as labelled planned defaults,
  merges live status onto them by day, and renders a verified milestone as
  verified. It clamps `sprint_day`, flags data older than 48 hours, and draws no
  ACTUAL marker at all when the projection is `UNMEASURED` or absent.
- The plan curve becomes a dashed straight line between milestones.
- The workspace roadmap page gains a status summary, filtering, a status
  distribution chart and inline status/evidence editing, under
  SRS-BUILDANDDO-WORKSPACE-001.

## Out of scope

- Writing `state/roadmap/sprint.json` from CI. Verification is a human act
  backed by an evidence record; automating the write would reintroduce exactly
  the assertable progress number this spec removes.
- Joining the public sprint milestones to workspace `roadmap_items`. They are
  different objects: one is this product's own campaign, the other is a
  customer's plan.
- Automated tests. `apps/web` still has no runner (SRS-BUILDANDDO-TEST-001).

## Invariant this change must not break

**Observability must not be able to break the build it observes.** The
projection is best-effort at every layer: a GitHub API outage degrades the
commit list, a failed projection degrades to `UNMEASURED`, and a missing status
file degrades the page to "live data unavailable". None of the three fails a
ship.

## Acceptance evidence

1. A clean checkout can run the projection.
   `python scripts/deploy/roadmap_status.py` exits 0 and writes
   `apps/web/public/roadmap-status.json` with `"state": "MEASURED"`.
2. Actual progress cannot be asserted.
   `python scripts/ci/sprint_cycle.py` reports `actual_pct: 0.0` and
   `verified_milestones: 0` with no state file present.
3. A failed projection degrades rather than lying.
   Calling `ship._write_unmeasured_roadmap_status({'reason': 'simulated'})`
   leaves `roadmap-status.json` holding `{"state": "UNMEASURED",
   "error": "projection_failed", ...}`.
4. Every changed web source file parses as JSX.
   `bun build <file> --no-bundle --outfile /tmp/check/<name>` for each changed
   file under `apps/web/src`.
5. No fabricated variance remains in the plan curve.
   `grep -n wiggle apps/web/src/pages/RoadmapPage.jsx` returns nothing.
6. Public boundary is clean.
   `python scripts/ci/verify_public_boundary.py`

## Addendum 2026-09-11 — the roadmap is a consumer, not a second engine

**Request:** `.bits/queue/REQ-20260911-ROADMAP-TRUTH-001.md` (dispatch request,
awaiting VCC issuance). **Risk:** A2.

The public roadmap used to carry its own progression clock (`SPRINT_START =
2026-09-09`) and its own "actual" percentage, so the estate's canonical
progression and the site could drift apart with no way to tell which was
right. `roadmap_status.py` now CONSUMES the estate's development-continuity
projection (`state/development_continuity/sprint_progression/latest.json`, env
NAME `BUILDANDDO_PROGRESSION_FILE`) and the campaign day-index config
(`config/campaign_21_day_progression_v1.yaml`, env NAME
`BUILDANDDO_CAMPAIGN_CONFIG`) through a strict public-safe allowlist, and the
page renders each axis as its own row. Nothing on the site computes
progression any more.

### Axes — independent, never averaged

| Axis | Field | Source | What it is | What it is not |
|------|-------|--------|------------|----------------|
| Calendar elapsed | `progression.calendar_pct` | estate `summary.schedule_elapsed_percent` | share of the strategy window that has passed | work |
| Plan target | `progression.planned_pct` | `sprint_cycle._planned_pct` at the canonical day when FRESH, else at the plan day | the plan curve's value | a result |
| Measured progression | `progression.measured_pct` | estate `summary.verified_to_date_percent` | verified acceptance criteria to date, by the estate's rule | milestone evidence, the plan |
| Verified · milestone evidence | `verified_pct` (alias `actual_pct`) | `sprint_cycle._actual_pct` | plan milestones recorded with an evidence reference | measured progression |
| Full system | `progression.full_pct` | estate `summary.full_campaign_percent` | verified share of the whole campaign | the to-date figure |
| Pace | `progression.pace` | estate `summary.pace_state` | the estate's pace word | a percentage |

The honesty invariants the tests encode (`tests/roadmap/`, `apps/web/src/lib/__tests__/roadmapStatus.test.js`,
`apps/web/src/components/roadmap/__tests__/ProgressionPanel.test.jsx`):
PLAN != REALITY; MATERIALIZED != TESTED; TESTED != VERIFIED; UNKNOWN != ZERO
(absent or unreadable input renders UNMEASURED with no number, never 0);
SEQUENCE != CAUSE (the panel never says a milestone caused a percentage);
MEASUREMENT-CONTRACT-CHANGE != PROGRESSION (`measurement_contract` = sha256 of
the estate's `rule` + `day_index_rule` texts; `baseline_epoch` = the
projection's `generated_at`; a changed hash is rendered as "contract changed",
and a moved number under a changed hash is not progression).

### The anchor contradiction — two clocks, shown side by side

- The **plan clock** counts calendar days from `sprint_cycle.SPRINT_START =
  2026-09-03`, the strategy window start and the first commit of this
  repository (351559a). On 2026-09-11 it reads **plan day 9**.
- The **canonical rule** (`day_index_rule`, from the campaign config) anchors
  **day 8 to 2026-09-08** and increments by local calendar day. Applied on
  2026-09-11 it gives **day 11**. The projection file, however, reports the day
  it was last computed for (`sprint_day`, `current_date`), which on 2026-09-11
  was day 9 for 2026-09-09 — the file was STALE.

The page does not pick one. It shows the canonical day from the projection
(`progression.day`), the plan day (`progression.plan_day`), the anchor facts
(`progression.day_anchor`: `canonical_anchor_day`, `canonical_anchor_date`,
`plan_window_start`, and `anchor_rule_day` derived at build time), and flags
`day_disagreement` when the two clocks differ. `freshness` is FRESH only when
the projection's `current_date` equals the build date; otherwise STALE with
`stale_days`, and the plan target is read at the plan clock so it cannot be
pinned to an old day. Reconciling the anchors is an operator decision, not
something the site may do.

### Public-safe allowlist

Only these cross from the estate files: `campaign_id`, `day`, `total_days`,
`current_date`, `generated_at`, the five summary numbers and counts,
`next_hard_milestone{title,date,days_until,past}`,
`current_focus{day,title,state}`, `day_index_rule`, `window_start`,
`window_end`, `source_title`, and from the campaign config `anchor_day`,
`anchor_date`, `strategy_window_start/end`, `hostinger_deadline`, `rule`. File
paths, bars, hostnames, secret names, evidence refs and PDF references never
cross; any string carrying a path-like fragment is dropped, and the leak-guard
test asserts the output contains no `D:\`, `state/` or `HOSTINGER_COMP`.

### Acceptance evidence (addendum)

7. `py -3.13 -m unittest tests.roadmap.test_roadmap_status_progression` — 15 tests, fake estate in a temp dir.
8. `py -3.13 scripts/deploy/roadmap_status.py` exits 0 and writes a `progression` block; with the estate absent the block is `{"state": "UNMEASURED", "reason": "PROGRESSION_FILE_ABSENT", ...}` and the build still succeeds.
9. `npm test` in `apps/web` passes with the progression, panel and pulse suites.
10. `py -3.13 scripts/ci/verify_public_boundary.py` — PASS.
