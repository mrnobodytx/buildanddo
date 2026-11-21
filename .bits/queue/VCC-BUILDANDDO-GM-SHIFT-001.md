# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-GM-SHIFT-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-GM-SHIFT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GM-SHIFT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-11-21
# Depends:     .bits/srs/SRS-BUILDANDDO-GM-SHIFT-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-GM-SHIFT-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-GM-SHIFT-001.md
# DAG Node:    none
# Intent:      Track the integration of BuildAndDo guildmaster units into Citadel's existing mission loop.
# ─────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-GM-SHIFT-001

**SRS:** SRS-BUILDANDDO-GM-SHIFT-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

The guildmasters do one graded BuildAndDo unit each weekday through Citadel's
existing mission loop, reviewed by a peer guild, observed where Citadel already looks,
and stopped by the existing kill switch. This repository records the integration; it
carries no grader or runtime of its own.

## Authority

- Owner decisions, 2026-11-21 (planning session): work scope, gate, cadence, and
  "use the system Citadel Nexus already has".
- Owner dispatch VCC-BUILDANDDO-GM-SHIFT-OPS-001, 2026-11-21: Datadog disarmed build
  plus one supervised smoke run. Arming the weekday dispatcher is a separate owner act.

## Tasks

| Phase | Task | Gate | Status |
|---|---|---|---|
| A | Back up the 8 run-as workflows and 16 guildmaster agents before any change | Backup manifest with sha256 per file | done — 25 files, outside the repository |
| B | Control record (`armed: false`), KILL workflow (disarm only), Bits credit tripwire | KILL test run succeeds; control record reads back `armed: false` | done |
| C | Run-as workflows: API trigger 30 to 4 a day, `tool_calls` output; agent call unchanged | All 8 published, run-as identity unchanged | done |
| D | Mission workflow: `kind=qa`, Dev through its own run-as workflow, rota peer reviewer through its run-as workflow, read-only prompts, verdict parsing that defaults to BLOCK | Spec validates; self-review refused; local script tests | done — published after E passed |
| E | One supervised QA unit, end to end | Instance succeeds with a parsable verdict naming both guilds | done — Alex (Commerce) authored, Quill (Writers, rota week 2) re-ran the queries and returned PASS |
| F | Weekday dispatcher, unpublished, gated on `control:global.armed` | Spec validates; does nothing while disarmed | done — "BuildAndDo · guild weekday units" (weekdays 13:23 UTC) is unpublished; a test run while disarmed stopped at the armed check |
| G | Report verdicts to the `guildmaster-behaviour` PostHog Scout | `guildmaster_operation` events with `project=buildanddo` | pending — owner picks the path (see below) |
| H | Arm | Owner instruction in their own words | owner |

## Evidence, 2026-11-21

- **E.** The supervised unit ran the published Commerce run-as workflow as `gm-commerce`.
  - Alex reported 5 findings, each with evidence ids, and marked the rest UNMEASURED.
  - The top finding: no Synthetics test covers `/signup`. The others are a single-session long-task burst on `/signup`, stale lazy-chunk 404s after a deploy, baseline-regression warnings in the logs, and Error Tracking issues that belong to other services.
  - Quill re-ran the material queries as `gm-writers` and answered PASS. One count Quill flagged was a hedged minor overcount (3 against 2).
  - The workflow output names both guilds, both guildmasters and both conversations.
- **F.** The dispatcher reads `control:global` first and rechecks it before every unit, so KILL stops the remaining units mid-run.
  - It also reads `control:pauses` (guilds and kinds) and caps the day at `budget:limits.author_per_day`.
  - It records each unit's verdict in the GM Shift records datastore, keyed by dispatcher instance and guild.
  - Every unit stays read-only, and the mission workflow refuses self-review.
- **G.** The `guildmaster_operation` events the Scout reads come from Citadel's n8n gm-ops emitter (`op`, `guild`, `persona`, `op_id`, `summary`, `refs`). There are two ways to add the BuildAndDo verdicts, and both need an owner-side credential:
  - Call that emitter's webhook from the dispatcher.
  - Add a PostHog capture connection in Datadog.

  Neither is wired yet.

## Constraints

Read-only units only in phase 1. No secrets, model ids, personal email addresses or
server IP addresses in the repository. Guildmaster PRs (phase 2) never use
`bits/SRS-*` branches and always carry `hold`. Production deploys stay A3.
