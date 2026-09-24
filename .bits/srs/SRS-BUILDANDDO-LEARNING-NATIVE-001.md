# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-LEARNING-NATIVE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-LEARNING-NATIVE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-LEARNING-NATIVE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     AGENTS.md, apps/pocketbase/pb_hooks/tutorial-learning.js, tests/upgrade/test_tutorial_learning_native.py
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-LEARNING-NATIVE-001-* branches; DEPENDS_ON apps/pocketbase/pb_hooks/tutorial-learning.js
# DAG Node:    none
# Intent:      Make the learning summary and migration replays work on the native PocketBase the repository declares.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-LEARNING-NATIVE-001 — Native learning summary and migration replay

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN

**Authorization:** the repository owner requested this fix on 2026-09-24.

## Problem

- `GET /api/buildanddo/learning` passes a filter string to `countRecords`, which
  takes dbx expressions; native PocketBase (0.28.4 and 0.39.8) raises a TypeError,
  so learning summaries (levels, milestones, certificates, Buddi's learning
  achievements) never load. The node double accepted a string, hiding it.
- Migration replay checks compare `field.type` as a property, but on both native
  versions `type` is a method, so every replay of an existing collection throws
  "Review custom …".
- The native learning suite's down/up test expected a 503 after rollback, but
  `serve` applies pending migrations on start, so that state is not observable over HTTP.
- The suite's seed migration used `__hooks`, which 0.28.4 does not define in migrations.

## Scope

1. Count completed enrollments with dbx expressions.
2. Replay checks call method-valued field properties in the affected migrations.
3. The node double refuses non-expression `countRecords` arguments, as native does.
4. The native down/up test asserts the rolled-back schema on disk and retained rows.
5. The native seed names its data directory itself.
6. Pin PocketBase 0.39.8 as the Compose, staging Compose, Dockerfile and
   `.env.example` default (owner decision, 2026-09-24): production migrations
   (`1789700000`, `1790400000`, `1791000000`, `1791400001`) need `__hooks`, so
   0.28.4 cannot install the current schema. Operator docs name 0.39.8.

## Out of scope

- Upgrading a running host: an operator backs up `pb_data`, rebuilds the image at
  0.39.8 and lets `serve` apply pending migrations (A3, human dispatch).
- `1791400000_classroom_media_sessions.js` has the same replay-check defect but is
  bound to recorded source evidence; it needs a rerun-and-refresh of that evidence.
- Wiring native suites into CI.

## Acceptance

1. `node --test tests/upgrade/*.test.mjs` all pass, and the double fails the old code.
2. `tests/upgrade/test_tutorial_learning_native.py` passes 6/6 on PocketBase 0.39.8.
3. A real 0.39.8 learning summary is accepted by the web learning client.
