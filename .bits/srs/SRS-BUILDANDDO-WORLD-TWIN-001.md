# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-WORLD-TWIN-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WORLD-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     AGENTS.md, apps/career/ledger.py
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-WORLD-TWIN-001-* branches; DEPENDS_ON apps/career/ledger.py
# DAG Node:    none
# Intent:      Derive each person's twin as a projection of typed world events, where every number drills down to events and self-reported success carries no weight.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-WORLD-TWIN-001 — Personal world twin, slice 1

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

A profile of levels and XP says nothing about what a person did, what they
demonstrated, how they affected others or why the system believes it. It is
also easy to farm. The Living World should own state; a person's twin should be
the part of that world that relates to them.

## Scope

Add dependency-free `apps/world_twin/` (distinct from the system twin in
`libs/semantic_twin`, which this slice does not touch):

- Typed world events in a hash-chained ledger: actor, type, target, context,
  capability, claimed state, outcome, evidence, verifiers, participants with
  typed relations, world effects, visibility.
- Effective state and activity tier derived per event (raw, meaningful,
  outcome-bearing, verified).
- Twin projection: observed activity, capability ladder with a "why this
  changed" timeline, attempts/failures/corrections, typed community relations,
  world impact, separate activity, capability and contribution measures, trust
  evidence per context. Every figure lists its event ids.
- Subject disputes of inferences, kept in history and resolved by someone else.
- Audience projections (private, community, public); minors get no public
  projection and no community relations.
- Community aggregates with small-group suppression.
- CLI, tests and coverage gate.

## Out of scope

PocketBase storage, web pages, the Living World graph store, USO accounting,
changes to `libs/semantic_twin`, existing XP/TP, or any network effect.

## Invariants

- An event is VERIFIED only with evidence and a verifier who is neither the
  actor nor a participant. A claimed VERIFIED without that is OBSERVED (with
  evidence) or INFERRED (without).
- Raw activity (views, reads) never raises a capability.
- A capability is VERIFIED only after verified successes in two or more
  distinct contexts.
- Failures are shown, and a failure later followed by a verified success on the
  same capability counts as corrected.
- There is no universal trust number; trust evidence is reported per context.
- Disputes never delete events; an inference disputed by its subject reads
  CONTESTED_BY_SUBJECT until someone other than the subject resolves it.

## Acceptance evidence

1. `python tests/world_twin/check_world_twin.py` passes, >= 80 percent statement coverage per module.
2. `python scripts/ci/verify_public_boundary.py` and `python scripts/ci/agent_context.py --check` pass.

## Rollback

Delete `apps/world_twin`, `tests/world_twin`, this spec, its dispatch and registry entry.
