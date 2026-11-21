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
| D | Mission workflow: `kind=qa`, Dev through its own run-as workflow, rota peer reviewer through its run-as workflow, read-only prompts, verdict parsing that defaults to BLOCK | Spec validates; self-review refused; local script tests | done (draft) |
| E | One supervised QA unit, end to end | Instance succeeds with a parsable verdict naming both guilds | in progress |
| F | Weekday dispatcher, unpublished, gated on `control:global.armed` | Spec validates; does nothing while disarmed | pending |
| G | Report verdicts to the `guildmaster-behaviour` PostHog Scout | `guildmaster_operation` events with `project=buildanddo` | pending |
| H | Arm | Owner instruction in their own words | owner |

## Constraints

Read-only units only in phase 1. No secrets, model ids, personal email addresses or
server IP addresses in the repository. Guildmaster PRs (phase 2) never use
`bits/SRS-*` branches and always carry `hold`. Production deploys stay A3.
