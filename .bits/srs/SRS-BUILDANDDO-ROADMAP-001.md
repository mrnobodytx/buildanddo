# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-ROADMAP-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
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
