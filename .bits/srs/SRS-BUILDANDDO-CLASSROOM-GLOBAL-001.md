# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-CLASSROOM-GLOBAL-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CLASSROOM-GLOBAL-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CLASSROOM-GLOBAL-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js,
#              apps/pocketbase/pb_hooks/classrooms.js, apps/web/src/pages/workspace/ClassroomsPage.jsx
# EnumType:    Doc
# EnumEdges:   GOVERNS apps/pocketbase/pb_migrations; GOVERNS apps/web/src/pages/workspace/ClassroomsPage.jsx
# Intent:      Make a class a global object of the platform, make the workspace the place a
#              person's access to classes is tracked, and let guildmasters audit and score classes.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-CLASSROOM-GLOBAL-001 — a class is global; the workspace holds your access

## Why this exists

**Operator decision, 2026-09-24:** *"classes live outside workspaces, the workspaces track the
users access and have them like a gallery in the workspace, so a student never studying chem
classes wouldn't see chem in gallery."*

Today a class belongs to a workspace. `classroom_rooms.workspace` is a **required** relation and
every index on every classroom collection is workspace-first, so a class cannot exist without one
and cannot be seen from another. That is the wrong shape for a platform whose teaching is meant to
be one shared body of work: the same lesson gets re-created per workspace, a guildmaster's class is
invisible to everyone outside the workspace it happens to sit in, and there is nothing to audit
centrally because there is no central thing.

A partial fix already shipped (`a5bc2b0`): `useOpenClasses` fans out **client-side** across the
workspaces a person can already read. That makes an existing class easier to find. It does not make
the class global, and it does not scale — it is one request per readable workspace, and it can only
ever reach workspaces the person is already seated in.

## The model

**A class is a global object.** It has a host, a lesson, a schedule and a status, and it does not
belong to a workspace.

**A workspace holds a person's access to classes.** Access is a record, not a side effect of
membership: it says this account, in this workspace, has this relationship to this class.

**The gallery is that access, rendered.** It shows the classes a person actually has, so a student
who never studies chemistry never sees a chemistry class there. Absence is the correct outcome, not
a greyed-out card — the platform does not advertise what is not yours.

**Guildmasters audit and score a class centrally,** because there is now one class to audit rather
than a copy per workspace.

## Requirements

1. **R1 — a class may exist without a workspace.** `classroom_rooms` gains `scope`
   (`workspace` | `global`) and `workspace` stops being required. Every existing room is `workspace`
   and behaves exactly as it does today; this migration changes no existing row's behaviour.
2. **R2 — access is its own record.** A new `classroom_access` carries
   `(workspace, account, room, state, source)` with `state` one of
   `invited | enrolled | completed | withdrawn`. Unique on `(account, room)`: a person has one
   relationship to a class, and it is recorded where they work.
3. **R3 — the gallery reads access, not rooms.** The workspace desk lists the classes this account
   has access to. A class with no access record for the reader does not appear in it, whatever its
   scope and whoever hosts it.
4. **R4 — a global class is joinable only through access.** Being global makes a class
   *discoverable and auditable*; it does not make it open. The backend decides, as it does now, and
   `scope: global` grants nobody anything on its own.
5. **R5 — guildmasters audit and score.** A new `classroom_audit` carries
   `(room, auditor, score, scale, label, evidence_ref, note)`. `label` uses the frozen trust
   vocabulary the platform already speaks: `VERIFIED` requires a resolvable `evidence_ref` and
   floors to `UNVERIFIED` without one, exactly as `TrustLabel` specifies. A score is meaningless
   without its scale, so `scale` is required beside it.
6. **R6 — the public promise changes with the code, not after it.** The classrooms page currently
   says *"Room links are for workspace members; creating an account does not grant access to
   someone else's class."* That sentence stays true under R4 and must be re-read against the
   shipped behaviour before this SRS closes.

## Controls — what must FAIL

A migration that only adds columns proves nothing. Each of these must be shown to fail:

1. A reader with no `classroom_access` row sees a global class in their gallery.
2. A `scope: workspace` room created without a workspace is accepted.
3. An audit claiming `VERIFIED` with no resolvable `evidence_ref` keeps that label.
4. A second `classroom_access` row for the same `(account, room)` is accepted.
5. The existing workspace-scoped classroom suites still pass unchanged — a regression here means
   the additive claim is false.

## Out of scope

- Moving existing rooms from `workspace` to `global`. That is a content decision per class, and
  nothing here does it automatically.
- The gallery's visual design. The Broadcast Classroom system already specifies the surface; this
  SRS decides what it is fed.
- Scoring weights and what a score is worth. R5 records a score with its scale; what a good score
  means is a guildmaster decision, not a schema one.
- Any deployment. Schema and source only.

## Risk

**A2.** Shared schema and shared hooks. The migration is additive and every existing row keeps its
behaviour, but the collections are shared and PocketBase applies migrations by set difference on
filename, so a bad one takes the backend down rather than skipping.
