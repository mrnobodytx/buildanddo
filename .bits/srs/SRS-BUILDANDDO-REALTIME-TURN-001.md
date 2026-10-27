# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-REALTIME-TURN-001.md
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-REALTIME-TURN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-REALTIME-TURN-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     apps/pocketbase/pb_hooks/classroom-realtime-lib.js, apps/web/src/lib/classroomRealtime.js, SRS-BUILDANDDO-PRESENCE-001
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-REALTIME-TURN-001-* branches; EXTENDS apps/pocketbase/pb_hooks/classroom-realtime.pb.js
# DAG Node:    none
# Intent:      Let classroom viewers behind restrictive networks reach the SFU, and record the MoQ path and the route overlap found on the way.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-REALTIME-TURN-001 — TURN for the classroom SFU, and the MoQ plan

**Status:** in_progress **Risk:** A2 (shared media code) **Seat:** C-ONE

**Authorization:** on 2026-10-27 the owner directed "fix it and then improve buildanddo cloudflare moq and
sfu usage". This SRS is that dispatch for the SFU slice. Secrets (TURN key) and production routing are A3
operator steps listed below; this change performs neither.

## Problem (measured 2026-10-27)

| Finding | Evidence |
|---|---|
| The browser peer is configured with STUN only (`stun.cloudflare.com:3478`). A viewer behind symmetric NAT or a firewall that blocks UDP has no relay candidate, so the SFU is unreachable for them. | `apps/web/src/lib/classroomRealtime.js` `RTC_CONFIG` |
| The client gathers ICE without trickle (waits up to 5 s), so any TURN URL on port 53 (blocked by browsers) would stall the offer. | `whenIceComplete`, Cloudflare TURN docs |
| **Route namespace overlap (low).** The zone routes `buildanddo.com/api/classroom/*` to the Worker `citadel-classroom` (an interview-scoring service deployed from outside this repository; it answers its own `/health` and `403` to everything else without its shared key). The browser does **not** use that path: it reaches PocketBase at `/hcgi/platform/api/classroom/*`, so classroom media in production is unaffected. The overlap only matters if anything calls the bare `/api/classroom/*` path or the edge later proxies `/api/*` to PocketBase. | zone worker routes API; the Worker's source; `BACKEND_BASE` in `classroomRealtime.js`; `scripts/deploy` health URLs |
| The classroom node suites (`tests/upgrade/classroom-*.test.mjs`, 157 tests) are not run by any GitLab job. | `.gitlab-ci.yml`, `.gitlab/ci/*.yml` |

## This change (SFU slice)

- `classroom-realtime-lib.js` `iceServers()`: with `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_KEY_API_TOKEN`,
  `POST rtc.live.cloudflare.com/v1/turn/keys/<id>/credentials/generate-ice-servers` with a 4-hour TTL; drops
  port-53 URLs; requires at least one TURN URL with a credential. Any absence or failure answers STUN only
  with a named reason (`CLOUDFLARE_TURN_KEY_ID absent`, `turn_http_<status>`, `turn_unreadable`,
  `turn_no_relay`, `turn_unreachable`). The API token never leaves the function.
- `GET /api/classroom/ice` (signed-in only, `no-store`, always 200). `/api/classroom/health` adds `turn_configured`.
- Client `classroomIceServers()` never throws; `joinClassroom({ iceServers })` uses well-formed servers and
  falls back to STUN otherwise. `useClassroomMedia` prefetches ICE per scope so TURN adds no latency to the
  join, keeps credentials only in memory, and never carries them across rooms.
- Behaviour without TURN configured is byte-for-byte the pre-change join.

## Operator steps (A3)

1. Create a TURN key (Cloudflare → Realtime → TURN Server) and set `CLOUDFLARE_TURN_KEY_ID` and
   `CLOUDFLARE_TURN_KEY_API_TOKEN` on the PocketBase unit. `/api/classroom/health` then shows `turn_configured: true`.
2. Optional hygiene: give `citadel-classroom` its own prefix (or narrow it to `/api/classroom/courses*`,
   `/enroll*`, `/lessons/*`, `/interviews/*`) so two services do not share one namespace. That Worker is not
   in this repository; nothing here depends on the change.

## Next slice (not in this change): MoQ broadcast, experimental

Cloudflare's MoQ relay API (beta, announced 2026-07-31) provisions isolated relays with publish/subscribe
tokens (`POST /accounts/<id>/moq/relays`, draft-14/16). Proposed: one relay per live classroom, the teacher
publishes once, viewers watch through `@moq/watch` over WebTransport with a short-lived subscribe-only token
minted by PocketBase; interactive seats and Safari (no WebTransport) stay on the SFU. The `TransportBadge`
and `TrackCatalog` design components already model this ("MoQ is experimental; a room must still work when
the MoQ path fails"). It needs its own SRS, an account API token (A3) and a measured canary before it is
offered to anyone.

## Acceptance

- `node --test tests/upgrade/classroom-ice.test.mjs` (7) and every `tests/upgrade/classroom-*.test.mjs` pass.
- Vitest `useClassroomMedia`, `LiveBroadcast`, `classroomRealtime.presence` pass.
- Live: after the operator steps, a TURN-only peer (`iceTransportPolicy: 'relay'`) joins a room. Not
  established by this change.
