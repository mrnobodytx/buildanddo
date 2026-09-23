# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-ROADMAP-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-ROADMAP-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ROADMAP-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-ROADMAP-001.md
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-ROADMAP-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that puts the guildmasters' own missions and evidence into the public
#              activity projection (continuation R7-R8).
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-ROADMAP-001 (continuation R7-R8)

**SRS:** SRS-BUILDANDDO-ROADMAP-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

## Objective

The public roadmap's activity section shows the guildmasters' own work next to the sinks: one row per guildmaster,
with the missions and evidence it recorded under its own account, from its own guild box.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Estate producer: `sink_guildmasters()` in `tools/citadel_activity_projection.py` (estate repository) | the producer's run lists six `guildmaster.*` entries, MEASURED | done |
| 2 | Regenerate `apps/web/public/activity-status.json` through the producer's public scrub | `public_redaction.py scan apps/web/public/activity-status.json` | done |
| 3 | Evidence that is not a web address renders as text | `vitest run src/pages/__tests__/RoadmapPage.activity.test.jsx` | done |
| 4 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `verify_public_boundary.py` | done |

## Constraints

- Files this dispatch may touch in this repository:
  - `apps/web/public/activity-status.json` (generated);
  - `apps/web/src/pages/RoadmapPage.jsx` and the new activity test;
  - this bookkeeping and the readiness and context locks.
- Persona names only in anything published. No box name, address or workspace id.
- The guildmasters' records stay in their members-only staging workspaces; only counts and times are published.
- Raises the tier: deploy. Not performed here.
