# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-23-bits-codegen-c-one-broadcast-classroom.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN, C-ONE (release seat named by seat, not by machine)
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
# EnumType:    Doc
# EnumEdges:   TRIGGERS cross-seat handoff
# Intent:      Name the private-plane steps the broadcast classroom needs before it can run anywhere but a local stack.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-09-23 BITS-CODEGEN -> C-ONE (release), IDE1 (backend release), repository owner

**Originating SRS:** SRS-BUILDANDDO-UPGRADE-001 **Dispatch:** VCC-BUILDANDDO-UPGRADE-001 (Broadcast classroom, BC-1..BC-7)

## What was asked

The owner authorized the Broadcast Classroom: live voice and video in the routed
classroom, an attendance history with a host class record, provider usage on
assistant turns, and agent activity from `seat_events`, plus finishing the
connected gaps found in the 2026-09-23 repository assessment.

## Why it cannot be done on the public plane

These steps need deployment control, secret access or infrastructure this
repository does not hold (AGENTS.md: A3 and private-mirror work):

1. **Backend deploy.** `scripts/deploy/ship.py` promotes the web build only. The
   new migrations (`1791300000_classroom_attendance.js`,
   `1791300001_assistant_turn_usage.js`) and the changed hooks
   (`classrooms.js`, `classrooms.pb.js`, `workspace-assistant.js`) reach staging
   and production only through the private backend release path.
2. **Realtime secrets.** `CLOUDFLARE_REALTIME_APP_ID`,
   `CLOUDFLARE_REALTIME_APP_SECRET` and `BUILDANDDO_CLASSROOM_PUBLISHERS` must be
   set on each PocketBase host. The local compose file now names them without
   values; this coding session had no access to any of them.
3. **Rooms / CitadelKey sidecar.** `pb_hooks/ocn-login.pb.js` calls a sidecar on
   `127.0.0.1:8092` whose source (`services/buildanddo_visual_substrate/`) is not
   in this repository. Seat login cannot work on a host without it.
4. **Room projections.** `useRoomProjection` reads `/room-projections/*.json`,
   which the private controller publishes. The rooms and live-experiment pages
   read UNMEASURED until it does.
5. **Canonical origin.** The Day-21 registry notes that the README and
   `SITE_ORIGIN` disagree and that buildanddo.tech has no DNS.

## What was done instead

Source only, on the public plane: the routed classroom joins the existing
Cloudflare Realtime hooks; the classroom detail reports media availability from
configuration (never a value); the attendance migration and host-only aggregate
record; the assistant usage migration; the agent activity panel; compose and
`.env.example` variable names. No deployment, secret read or external call was
made. Hosted audio/video, applied migrations and deployed behaviour are unmeasured.

## What the receiving seat needs to do

The later BR-1..BR-4 repair continuation tightens the original media contract.
Include `1791400000_classroom_media_sessions.js` and
`1791400001_broadcast_classroom_lessons.js`, their data bundle, the new
`classroom-media.js`, both signalling/presence route files and the matching
browser transport. New clients reject an unbound session response; old clients
must supply room context and create fresh sessions. Publisher allowlisting is
additional to current room authority, not enrollment. See `docs/classrooms.md`.

Run both expanded disposable native profiles and rendered suites first. They
include attendance, media-session storage, provider-transport doubles, assistant
usage and lesson enrollment, not merely the old classroom subset. Source tests
cannot establish an actual provider response shape, two-browser media delivery,
forced stream revocation or deployed behavior. The public case-study capture is
source-only and is not to be imported as independently verified workspace work.

Ship backend migrations/hooks together before the matching frontend, restart old
media sessions, and use one authorized two-browser acceptance capture for the
same release. Roll back by disabling the media protocol, never by restoring the
unbound signalling handlers. The lesson down path preserves histories and edits.

1. C-ONE / IDE1: apply the attendance, usage and BR repair migrations on staging,
   then deploy the matching hooks and frontend through the existing release lane.
   Verify: `GET /api/buildanddo/workspaces/<ws>/classrooms/<room>/record` as the
   host returns `"installed": true`; a started class then shows `attendees >= 1`.
2. Owner: set the three realtime variables on staging. Verify:
   `GET /hcgi/platform/api/classroom/health` returns `ok: true` and a live room's
   detail returns `"media": {"available": true}`.
3. Owner: from two browsers, host starts broadcasting and a member joins and
   listens; the member's signal reads "Receiving" with a rising packet count.
   "Connected · no frames" means the pull completed without media and is a failure.
4. Private-plane owner: restore or publish the rooms sidecar and room-projection
   controller, or record that they are retired so the pages can say so.
5. Owner: choose the canonical origin and DNS; then update README and SITE_ORIGIN together.

## Blocking

Items 1-3 block hosted acceptance of the broadcast classroom. Items 4-5 are
independent of it.
