# SRS-BUILDANDDO-LIVE-UTILIZATION-001

## Objective
Prove actual BuildAndDo utilization across a room projection, SFU collaboration, experimental MoQ transport, evidence capture, and deterministic content generation.

## Acceptance
1. Systems Room renders measured projection data and does not infer health from absence.
2. Live Experiment Room renders one episode with truth-state labels and evidence references.
3. SFU canary records sessions, sent/received messages, media publish/receive and payload equality.
4. MoQ canary records relay/object counts, ordered sequence and digest equality; remains labeled EXPERIMENTAL.
5. `buildanddo.episode.verified` can produce a draft outbox containing Hostinger project-log, forum, wiki, Discord and lesson artifacts.
6. Content generation cannot publish externally.
7. Provider credentials are read from environment/vault only and never written to receipts.
8. Selftest results are explicitly labeled simulated and cannot promote provider runtime to VERIFIED.

## Authority
A2 bounded sandbox provider resources and local evidence writes. External publishing remains A3 and is out of scope.

## Amendment 2026-09-11 (C-ONE): live rooms sidecar replaces static artifacts
Living Rooms no longer read `/room-projections/*.json`. A backend sidecar,
`services/buildanddo_visual_substrate` (stdlib + `cryptography`), owns the tenant
CitadelKey private seed (file path from `BUILDANDDO_CK_PRIVATE_KEY_FILE` only),
signs one Ed25519 envelope per request and relays `GET /api/rooms/projection/{kind}`
to `https://citadel-nexus.com/api/platform/rooms/projection/{kind}`, passing 401/403
reasons through unchanged. `systems` is refused locally (`projection_never_exportable`)
and never forwarded; every 200 body is leak-checked again before it reaches the
browser (`502 projection_leak_check_failed`). The browser never signs and holds no key.

Acceptance additions:
9. `python -m services.buildanddo_visual_substrate --selftest` passes offline against
   an in-process verifier with the real canonicalisation (no key 401, bad key 401,
   replay 401, wrong payload binding 401, ungranted room 403, wrong seat 403,
   systems 403 local, valid organization 200 cleansed:true, mesh-IP body 502).
10. `useRoomProjection` fetches only `/api/rooms/projection/{kind}` and never falls
    back to sample JSON; `apps/web/public/room-projections/samples/` is referenced by
    no runtime code and `systems.json` is deleted.
11. Systems Room and Live Experiment render `UTILIZATION = UNMEASURED` with no fetch
    and no sample data; acceptance items 1-2 above are superseded until Citadel Nexus
    publishes those projections over the signed boundary.
12. Readiness is reported as `C-ONE_READY_FOR_BND_LIVE_001` (fields in
    docs/architecture/BUILDANDDO_LIVING_ROOMS.md); any UNMEASURED field is a report,
    not a go.
