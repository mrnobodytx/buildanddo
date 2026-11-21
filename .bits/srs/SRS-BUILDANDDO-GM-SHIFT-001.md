# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-GM-SHIFT-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-GM-SHIFT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GM-SHIFT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-11-21
# Depends:     AGENTS.md, .bits/srs/SRS-BUILDANDDO-GUILDMASTER-001.md
# EnumType:    Doc
# EnumEdges:   EXTENDS SRS-CN-GM-AGENTS-001; DEPENDS_ON SRS-BUILDANDDO-GUILDMASTER-001
# DAG Node:    none
# Intent:      Record how the guildmasters work on buildanddo.com through Citadel Nexus's existing mission loop, and how Citadel grades that work, without a parallel system in this repository.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-GM-SHIFT-001 — Guildmaster units on buildanddo.com through the Citadel mission loop

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

The owner wants the eight guildmasters to work on buildanddo.com on their own, and
Citadel Nexus to observe, grade and evaluate that work. Citadel already runs the loop
that does this for its own estate (SRS-CN-GM-AGENTS-001), but nothing pointed it at
BuildAndDo: the mission workflow had run once, by hand, against an estate task, and
its reviewer was always the author's own guild.

## Owner decisions, 2026-11-21

| Decision | Where it lands |
|---|---|
| Guildmasters work on buildanddo.com automatically; Citadel observes, grades and evaluates | Citadel's existing Datadog mission loop, extended with a BuildAndDo unit kind |
| Use the system Citadel Nexus already has; do not build a parallel one | No grader, contract library or runtime in this repository; this spec records the integration only |
| Work scope: code fixes as PRs, site content, hosting and attending classes, live-site QA, peer evaluation, PostHog Scout | Phase 1 runs live-site QA with peer grading; later kinds are listed under Phases |
| Gate: grade, then a human merges; content goes live and is withdrawn if it fails its grade; guildmaster PRs never auto-merge | The peer verdict plus the exact-head GitLab status grade a unit; a person merges; guildmaster PRs use non-`bits/SRS-*` branches and the `hold` label |
| Cadence: once a weekday per guildmaster | A weekday dispatcher, armed only by the owner |

## The loop (Citadel, existing)

- **Mission workflow** "Guildmasters · mission (Dev → Review)" resolves the guild, runs
  its Dev Bits agent, runs a Review Bits agent with a PASS or BLOCK verdict, and
  summarizes the result as `citadel.<guild>.activity` with a verdict tag.
- **Run-as workflows**, one per guild, run that guild's Dev or Review agent as the
  guild's own Datadog service account (`gm-<guild>`).
- **Observation**: workflow instance history and the Bits conversations; PostHog
  `guildmaster_operation` events and the `guildmaster-behaviour` Scout already observe
  the eight personas.
- **Kill switch and budget**: the GM Shift KILL workflow (disarm only), the
  `control:global` record (`armed`), and a Bits credit monitor that fires KILL.

## Integration (this spec)

1. The mission workflow gains `kind=qa`: a fixed, read-only BuildAndDo live-site QA
   brief over Datadog Synthetics, RUM, Error Tracking and logs, with a per-guild lens.
2. The Dev agent runs through its own guild's run-as workflow, so its reads run as
   that guild's service account.
3. The reviewer is the peer guild from the BuildAndDo PR #145 rota formula
   (`ORDER[(i + 1 + w % 7) % 8]`, week 0 = 2026-W45), never the author's own guild.
   It runs through the reviewer guild's run-as workflow and must re-run every claimed
   query before it answers PASS.
4. Every unit is read-only. Agents are told not to create, update, delete, publish,
   run or trigger anything; the reviewer is told the author's text is untrusted.
5. A weekday dispatcher calls the mission workflow once per guild, only while
   `control:global.armed` is true. The owner arms it; KILL and the credit monitor
   disarm it.

## Phases

| Phase | Kinds | Needs |
|---|---|---|
| 1 | Live-site QA with peer grading | Nothing beyond this spec; armed by the owner |
| 2 | Code fixes as draft PRs (Bits Code), graded by the peer verdict and the exact-head `gitlab-ci/buildanddo` status | Green review pipelines; an actor label on Bits Code PRs |
| 3 | Daily Edition and guild lessons, shadow then live with withdraw-on-BLOCK | PR #145 deployed; persona seat keys bound (LIVE-UTILIZATION-001) |
| 4 | Hosting and attending rota classes, graded by the rota auditor | PR #145 deployed; `BUILDANDDO_GUILD_CLASS_WORKSPACE`; seat roles |
| 5 | PostHog Scout and other read-only lenses | Read connections from the roll call fix list |

## Out of scope

Any grader, contract library, schema set or runtime in this repository; production
deploys; secrets and keys; CI wiring; changes to `scripts/ci/gitlab_plane.py`,
AGENTS.md or CLAUDE.md. Datadog changes run under the owner's dispatch
VCC-BUILDANDDO-GM-SHIFT-OPS-001 (2026-11-21: disarmed build plus one supervised smoke
run); arming is a separate owner act.

## Acceptance

- One supervised QA unit runs end to end: the author guild's Dev agent works as its
  own service account, the rota peer guild returns a parsable PASS or BLOCK, and the
  workflow output names both guilds and both conversations.
- A guild cannot review its own QA unit (the workflow refuses it).
- The dispatcher does nothing while `control:global.armed` is false.
