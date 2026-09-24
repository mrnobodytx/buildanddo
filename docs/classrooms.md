# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/classrooms.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     apps/web/src/pages/workspace/ClassroomsPage.jsx, apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/classroom-media.js, tests/upgrade/test_classroom_native.py
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/pages/workspace/ClassroomsPage.jsx; CONSUMES apps/pocketbase/pb_hooks/classrooms.js; CONSUMES apps/pocketbase/pb_hooks/classroom-media.js; VERIFIED_BY tests/upgrade/test_classroom_native.py
# DAG Node:    none
# Intent:      Describe the classroom user flow, installed-backend requirements and acceptance limits without representing a shared lesson as a video stream.
# ───────────────────────────────────────────────────────────────

# Classrooms and shared lessons

Classrooms connect a workspace to a shared Field Manual lesson, host-controlled
section, expiring attendance and saved discussion. The public entry is
`/classrooms`; signed-in rooms are under `/app/classrooms`. The public header,
footer, home learning section, Docs and workspace navigation point to them.
The public page lists curriculum previews, never private room records.

The routed classroom now connects the existing voice/video signalling service.
Joining media remains explicit and requires a live room, fresh attendance and
installed session storage. A **Live lesson** means the host started the lesson,
not that media works. "Receiving" requires measured inbound packets. Screen
sharing, recording, public broadcasts and calendar notifications are not added.
Hosted media has not been accepted by this source change.

## Bound media and repair lessons

The media routes below `/api/classroom` now require `room` in every session,
track and renegotiation request. `1791400000_classroom_media_sessions.js` creates
a locked `classroom_media_sessions` collection. Each provider session binds its
workspace, room, native account, attendance record/revision, provider application,
recorded published tracks and four-hour expiration. Four usable sessions per
current attendance are allowed; obsolete attendance and rollback bindings do not
consume a new attendance generation's capacity.

Session creation, push/pull, renegotiation and presence recheck current native
workspace membership, live room and fresh attendance. Publishing additionally
requires host/administrator management authority and the existing publisher
allowlist. A global publisher entry no longer grants room access. A private
persona must join through the native classroom flow and create its own bound
session; an old provider session identifier is not imported or grandfathered.
Pulls resolve exact successful track registrations in that same room, and
advertisements cannot invent a published track. Provider responses do not prove
delivered media or independent verification.

The browser rejects a session response without its matching room, closes pending
or connected resources across real scope changes, and preserves subscriptions
across same-session token refresh. `POST /api/classroom/close` invalidates only
the caller's exact room session even after attendance ends. This closes local
resources and future signalling admission; it does not claim that the provider
has forcibly terminated every already-negotiated remote stream. Receiving tests
must measure revocation behavior in both browsers and at the actual provider.

Deploy the session migration and matching hooks before the new frontend and
restart old media sessions. Missing or rolled-back storage denies new signalling;
rollback removes the protocol marker and does not restore old bindings on re-up.
Do not roll back to the unbound handlers as a security recovery.

The authored case study is available at
`/app/tutorials?lesson=broadcast-classroom-repair`, with a separate **Source case
studies** panel on `/app/evidence` and a downloadable public source-test capture.
`1791400001_broadcast_classroom_lessons.js` installs its tutorial for interactive
learning/classroom selection, preserves operator edits and retains learner history
on rollback. The bundled preview works without that installation. Reading the
case or test report does not create workspace evidence, award progress/XP or
verify a mission. Its dated source observation remains separate from blocked
rendered/native and unmeasured hosted checks.

## Use a classroom

1. Open **Classrooms**, sign in and select your workspace. An existing room
   link preserves its destination through sign-in, signup and onboarding.
   A link's workspace is selected only if it appears in the account's readable
   workspaces; the link never grants membership.
2. An editor, administrator or owner selects **Schedule a class**, supplies a
   title, optional description/time and an installed lesson. Times are entered
   in the host's local timezone and stored in UTC. Scheduled rooms stay closed
   until the host selects **Start lesson session**.
3. Members select **Join class**. The host controls the current lesson and
   section. Editors may post questions while attending; viewer seats can
   attend and read. The instructor's position does not write anyone's personal
   lesson progress.
4. **Read the full lesson and save your own progress** opens that saved lesson
   in the Field Manual. A personal progress update still uses the existing
   tutorial rules and exercises. Classroom attendance does not complete a
   lesson, verify a mission, issue a credential or award a qualification.
5. **Leave class** ends your attendance. Closing the page stops heartbeats;
   attendance expires after 75 seconds. The room allows at most 100 fresh
   attendees. A host may confirm **End class** (or cancel a scheduled class).
   Ended rooms remain readable, and cannot be reopened or receive new posts.
6. **Share with workspace members** provides a room link. It copies only on a
   user action and sends no email, notification or invitation.

Administrators and the workspace owner may manage any room. An editor manages
the rooms they host. Removing a membership denies subsequent reads, heartbeats,
commands and receipt recovery. Current permissions are checked on the backend
inside every mutation transaction.

## Consistency and privacy

The page polls every five seconds and renews active attendance every twenty
seconds. A refresh failure disables writes and marks the last view disconnected;
an authorization, missing-record or malformed-response failure hides the room.
Navigating away cancels timers. Old account, workspace and room responses cannot
populate the current view. No room records, discussion or pending commands are
written to browser storage. A pending save can be recovered while that scoped
page remains mounted; a full page reload requires reading the saved history
before re-submitting an uncertain action.

Commands include a fresh request key and room revision. A transaction stores the
operation and its receipt together. Repeating the same key and intent returns
the original result, even after another participant changes the room; it does
not run the action again. Changing the intent under that key conflicts. Presence
has a separate attendance revision so a delayed heartbeat or leave cannot undo
a later join. Heartbeats do not create receipt rows every twenty seconds.

Room and message pages contain up to twenty records, with explicit pagination.
The lesson picker offers the first 200 readable catalogue entries with installed
structured bodies; bundled previews are not invented as database identities.
Messages are rendered as text. Classroom DOM content is masked for analytics;
room/workspace identifiers and lesson query parameters are removed from the
new classroom telemetry locations. Mutation telemetry includes bounded operation
names and outcomes, never discussion or lesson content. The existing
observability wrapper preserves the operation if a telemetry sink fails.

## Source and installed backend

The additive migration `1790400000_classroom_rooms.js` creates
`classroom_rooms`, `classroom_members`, `classroom_messages` and
`classroom_receipts`. Raw collection read/write APIs are locked; native
PocketBase account authentication and the existing workspace policy protect
the following routes:

| Method | Path suffix below `/api/buildanddo/workspaces/{workspace}/classrooms` | Purpose |
|---|---|---|
| GET | empty, with `page` and `status` | List readable rooms and available lessons |
| GET | `/{room}`, with `page` | Read lesson, attendance and discussion |
| POST | empty | Apply a revisioned classroom command |
| POST | `/{room}/presence` | Renew the current attendance generation |

Command bodies have exactly `action`, `payload`, `revision` and `request_key`.
Actions are `room.create`, `room.update`, `room.start`, `room.end`, `room.lesson`,
`room.join`, `room.leave` and `room.message`. Request bodies are bounded to
30,000 bytes; presence bodies to 2,000 bytes. The presence body contains exactly
`membership` and `revision`. Route responses use `Cache-Control: no-store`.
All record/account names shown by the API come from the authenticated server
context, not a caller-supplied identity.

The existing tutorial migrations must have installed the authored lesson bodies.
Deploying frontend assets alone cannot install rooms. The receiving release
owner must apply the registered migration and hooks through the existing private
release process, then verify the real site and account flow. A missing migration
returns an explicit unavailable state; it never displays synthetic live rooms.

The migration validates existing policy and field definitions before changing
anything. Its down migration retains room, attendance, discussion and receipt
history, while removing the protocol field that enables these routes. Re-applying
it restores the field after validating the preserved schema. Do not delete the
room tables to roll back the UI. This session changes no deployed database.

## Reproduce acceptance

Source-connected tests exercise the actual JavaScript browser adapter, policies
and migrations using the established transactional storage double:

```bash
node --test tests/upgrade/classroom-system.test.mjs tests/upgrade/classroom-client.test.mjs
```

Twenty source cases pass. V8 measures 100% lines and 95.35–98% branches across
the room service, migration, browser adapter and navigation/privacy module.
These measurements exclude JSX, the React hook and the native route runtime.

On a runner with the repository's frontend dependencies:

```bash
npm --prefix apps/web test -- src/pages/workspace/__tests__/ClassroomsFlow.test.jsx src/hooks/__tests__/useClassrooms.test.jsx src/components/auth/__tests__/LoginPage.test.jsx src/components/auth/__tests__/ProtectedRoute.test.jsx src/components/workspace/__tests__/TutorialCatalog.test.jsx src/__tests__/AppRoutes.test.jsx src/pages/__tests__/PublicPages.test.jsx
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
npm --prefix apps/web run build
```

Nine new rendered flow cases and three hook cases cover scheduling, attendance,
shared sections, interrupted saves, host confirmations, stale drafts, account
changes, polling and cleanup. Existing route, auth, public-page and tutorial
tests cover the new destinations. They are authored but unexecuted in this
sandbox because Vitest and frontend build dependencies are absent.

For real PocketBase acceptance, set `BUILDANDDO_TEST_POCKETBASE` to an existing
test binary (not a deployed service), then run:

```bash
python tests/upgrade/test_classroom_native.py --require-binary
```

This starts only a disposable loopback server with synthetic accounts, applies
the actual classroom migration/hooks, and tests native authentication, raw API
denial, date fields, attendance, concurrent retry transactions, revocation and
down/up preservation. CI invokes it for both existing declared PocketBase
versions. It fails if no binary is available; default Python discovery marks the
three cases skipped. Native acceptance has not run in this sandbox.

Receiving browser acceptance uses two real workspace accounts: open a shared
link while signed out, authenticate, host/join the same class, change sections,
send/read one question, disconnect/rejoin and end the class. Verify narrow
viewport navigation, keyboard focus, both themes and the saved discussion after
reload. A passing source double does not substitute for this check or establish
live audio/video. The receiving contract is in
`.bits/handoffs/2026-09-16-bits-codegen-cmax-b-classrooms.md`.
