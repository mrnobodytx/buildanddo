# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-CLASSROOM-GLOBAL-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-CLASSROOM-GLOBAL-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CLASSROOM-GLOBAL-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs/SRS-BUILDANDDO-CLASSROOM-GLOBAL-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-CLASSROOM-GLOBAL-001
# DAG Node:    none
# Intent:      Record the operator-directed dispatch that makes a class global, makes the workspace
#              hold a person's access, and gives guildmasters something central to audit.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-CLASSROOM-GLOBAL-001

**SRS:** SRS-BUILDANDDO-CLASSROOM-GLOBAL-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

A class is a global object. The workspace records a person's access to classes and renders it as
their gallery, so a student who never studies chemistry never sees a chemistry class there.
Guildmasters audit and score the class itself, because there is now one of it.

## Authority

Operator decision, 2026-09-24, in their own words: *"classes live outside workspaces, the
workspaces track the users access and have them like a gallery in the workspace, so a student never
studying chem classes wouldn't see chem in gallery."* A2 covers the shared schema and hooks below.
Nothing here deploys; a deploy is a separate A3 step.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Register the SRS, its spec and this dispatch | `env -u PYTHONPATH py -3.13 scripts/ci/agent_context.py --check` | done |
| 2 | Migration: `classroom_rooms.scope`, `workspace` no longer required, `classroom_access`, `classroom_audit` | `migration_preflight.py --selftest` then `--dir` against a copy | pending |
| 3 | The migration is additive: every existing room reads back `scope: workspace` and unchanged behaviour | native classroom suite, before and after | pending |
| 4 | Hook: a `global` room needs no workspace; a `workspace` room still requires one | `node --test tests/upgrade/classroom-*.test.mjs` | pending |
| 5 | Hook: the gallery lists by `classroom_access`, not by room workspace | the same suites | pending |
| 6 | Guildmaster audit: score with its scale; `VERIFIED` floors to `UNVERIFIED` without a resolvable evidence reference | new tests | pending |
| 7 | Controls, each shown to FAIL: a reader with no access sees a global class; a `workspace` room without a workspace is accepted; a `VERIFIED` audit with no evidence keeps its label; a duplicate `(account, room)` access row is accepted | the same suites under each planted fault, restored byte for byte | pending |
| 8 | The web gallery reads access and renders absence as absence | `vitest run` | pending |
| 9 | Re-read the public promise on `/classrooms` against the shipped behaviour (R6) | reading, plus `verify_public_disclosure.py` | pending |
| 10 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`, `verify_public_boundary.py` | pending |

## The trap this dispatch must not spring

PocketBase applies migrations by **set difference on filename**, and one bad migration aborts
startup rather than skipping — the whole backend goes down, not one feature. A migration that
returns early is recorded as applied **forever**, so a guard that skips is a decision that can
never be retried. Task 2 is rehearsed on a copy of live data through `migration_preflight.py`
before it goes anywhere, and that preflight is trusted only because it refuses a planted broken
migration.
