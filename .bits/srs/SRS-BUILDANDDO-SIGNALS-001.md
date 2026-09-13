# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-SIGNALS-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-SIGNALS-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-11
# Depends:     scripts/deploy/roadmap_status.py, apps/web/src/pages/RoadmapPage.jsx,
#              tools/citadel_roadmap_signals.py (controller estate),
#              config/tenants/buildanddo.posthog.json (controller estate)
# EnumType:    Doc
# EnumEdges:   VALIDATES scripts/deploy/roadmap_status.py;
#              VALIDATES apps/web/src/pages/RoadmapPage.jsx;
#              CONSUMES state/roadmap_signals/latest.json
# Intent:      Specify the repo-side half of roadmap signals: embed the estate's
#              per-source signals in the roadmap projection and draw them as
#              signals, never as results.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-SIGNALS-001 — Roadmap signals: live sources, drawn as signals

**Status:** in_progress **Risk:** A1 **Seat:** C-ONE

## Problem

The public roadmap page quotes one projection (`roadmap-status.json`): the
plan, the honest actual percentage and the last eight commits. Everything
else that moves around this build - Datadog monitors, PostHog events, wiki
pages, Discord activity, Reddit and forum verification, the Citadel rail and
self-model - was invisible on the page, so readers could not see whether the
systems were alive without opening each one.

The temptation when adding such tiles is to let activity read as progress.
`config/tenants/buildanddo.posthog.json` (controller estate) forbids exactly
that: PostHog cannot grant VERIFIED, ROADMAP_COMPLETION or EVIDENCE, and the
page already carries the invariant `CURVE = PLAN, NOT RESULTS`.

## Intent

Embed one signals file, written by the controller estate, in the projection
and render one tile per source with its state, two to four metrics, freshness
and the reason when it was not measured. Signals, never results.

## Scope

- Controller estate (not this repository): `tools/citadel_roadmap_signals.py`
  `collect [--network] [--sources ...]` writes
  `state/roadmap_signals/latest.json` (schema `buildanddo.roadmap-signals/v1`)
  with sources github, datadog, posthog, wiki, discord, reddit, forum, citadel.
  Each source is MEASURED, DEGRADED or UNMEASURED with a reason; network
  errors never fail the run; `remote_writes` is always 0; secret NAMES only.
- `scripts/deploy/roadmap_status.py`: reads the signals file from env NAME
  `BUILDANDDO_ROADMAP_SIGNALS`, default `<clone>/../../state/roadmap_signals/latest.json`
  (the estate layout, where the clone is `sites/buildanddo`). Adds
  `signals`, `signals_state` (MEASURED|UNMEASURED), `signals_reason` and
  `signals_generated_at`. Every pre-existing key is unchanged. An absent,
  unreadable or off-schema file yields `signals_state: UNMEASURED` and the
  build still succeeds.
- `apps/web/src/pages/RoadmapPage.jsx`: a "Live sources" panel after the
  ticker strip. One tile per source: name, state badge, metrics, freshness
  (`timeAgo` of the source's `data_at` or the file's `generated_at`), reason
  when UNMEASURED, and a failures list. Copy states these are signals, not
  results. The PostHog tile is labelled "presentation only".
- `apps/web/src/pages/__tests__/RoadmapPage.signals.test.jsx`: fetch mocked
  with a fixture; asserts eight tiles, UNMEASURED rendering with reason, the
  failures list, the no-signals case, and that the PostHog tile never contains
  "verif", "complet" or "evidence".

## Out of scope

- Any write to GitHub, Datadog, PostHog, the wiki, Discord or Reddit. The
  collector is A1 observe only.
- Promoting a milestone from any signal. Milestone state still comes only
  from the sprint projection (`SRS-BUILDANDDO-ROADMAP-001`).
- Creating a forum. The forum tile reports the existing verification record
  (UNMEASURED today) and nothing else.

## Authority

| Step                    | Who  | Authority   |
|-------------------------|------|-------------|
| collect signals         | rig1 | A1_OBSERVE  |
| embed in projection     | rig1 | A1_OBSERVE  |
| render on roadmap page  | web  | none        |

## Acceptance evidence

1. `python tools/citadel_roadmap_signals.py selftest` (controller estate)
   passes offline with fakes; `collect --network` writes the file with every
   source present and every non-MEASURED source carrying a reason.
2. `python scripts/deploy/roadmap_status.py` exits 0 with and without the
   signals file; `apps/web/public/roadmap-status.json` has `signals_state`
   and, when the file exists, `signals.sources` with the eight keys.
3. `npm test` runs `RoadmapPage.signals.test.jsx` green and does not worsen
   the existing baseline.
4. `python scripts/ci/verify_public_boundary.py` and
   `python scripts/ci/agent_context.py --check` pass with this code registered.

## Verification

```bash
python scripts/deploy/roadmap_status.py
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
npm test
```

## Notes for the implementing agent

The page must not add a state vocabulary that can be confused with the
milestone states (`verified`, `blocked`, ...). Tile states are the estate's
MEASURED / DEGRADED / UNMEASURED, rendered with `Badge`, not `StatePill`.
