# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-PRESENCE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-PRESENCE-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PRESENCE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/pocketbase/pb_hooks/classroom-presence.pb.js, apps/pocketbase/pb_hooks/classroom-realtime-lib.js
# EnumType:    Doc
# EnumEdges:   GOVERNS tests/upgrade/classroom-presence.test.mjs; GOVERNS apps/pocketbase/pb_hooks/classroom-realtime-lib.js
# Intent:      Make the classroom presence route, its shared library and its test state the same
#              verification contract, so the test fails only when the route breaks it.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-PRESENCE-001 — one presence verification contract

## Why this exists

Commit d91a5f9 made classroom presence ask the SFU which tracks it actually holds. Before it, every presence
row carried `verified: false` and `NOT_ECHOED_BY_SFU`, because no check existed. Since d91a5f9:

- the write path (POST `/api/classroom/presence`) answers `NOT_YET_ECHOED`, because it does not wait on the SFU;
- the read path (GET `/api/classroom/presence`) asks the SFU once per session and answers one of these:
  - `ECHOED_BY_SFU`: the SFU holds every advertised track. This is the only state with `verified: true`.
  - `NOT_HELD_BY_SFU:<names>`
  - `NO_TRACKS_ADVERTISED`
  - `SFU_UNREACHABLE:<why>`

The route's own header says the same. Its test still expected `NOT_ECHOED_BY_SFU` from both paths, so
`node --test tests/upgrade/classroom-presence.test.mjs` failed 1 of 21 on the integration branch. It had
failed that way since d91a5f9, before the live classroom was merged. The shared library's comment names only
the old label. The test file's header says the route must never call Cloudflare, which the read path now does
on purpose, through the library.

No web code reads the label; `apps/web` never consumes `verification` from presence. The route is therefore the
contract, and the test and the documentation are what is stale.

## Requirements

1. **R1 - the test states the route's contract.**
   - On write: `verified: false` and `NOT_YET_ECHOED`.
   - On read: `verified: false` and a named reason. With no realtime configuration, as in the test double, the
     reason is exactly `SFU_UNREACHABLE:CLOUDFLARE_REALTIME_APP_ID absent`.
2. **R2 - the documentation agrees.**
   - The shared library's comment calls `NOT_ECHOED_BY_SFU` the label from before the check, and names the
     current write and read labels.
   - The test file's offline note says that the read path asks the SFU through the library, and that the test
     double provides no network, so every echo there reports `SFU_UNREACHABLE`.
3. **R3 - controls.** The updated test fails when the route answers the old label on write, and when the read
   path claims `ECHOED_BY_SFU` without an echo.
4. **R4 - no behaviour change.** The route is not edited. The library changes only in a comment.

## Out of scope

- Tests for the echo outcomes against a reachable SFU (`ECHOED_BY_SFU`, `NOT_HELD_BY_SFU`,
  `NO_TRACKS_ADVERTISED`). They need a stand-in SFU in the test double, which the file's offline design does
  not provide today. Recorded as a finding.
- Deploying. The staging backend runs these hooks; a comment-only library change needs no deploy of its own.

## Acceptance

`node --test tests/upgrade/classroom-presence.test.mjs` passes 21 of 21 and fails under each control in R3. The
repository gates pass.

## Continuation (2026-09-23): the echo outcomes, against a stand-in SFU

The first increment recorded that only the unconfigured case, `SFU_UNREACHABLE`, had a test. That leaves the
property that matters most untested: only a session whose every advertised track the SFU really holds is
verified. This continuation tests the other outcomes.

5. **R5 - every echo outcome has a test.** The test double gets obviously fake realtime credentials through its
   injected `$os.getenv`, and an in-memory `$http.send` that answers the SFU's session read from a table. Nothing
   opens a socket. With that stand-in:
   - every advertised track held gives `ECHOED_BY_SFU` and `verified: true`, from one read without a body;
   - one advertised track missing gives `NOT_HELD_BY_SFU:<name>` and `verified: false`;
   - a track the SFU reports `inactive` does not count as held;
   - a row that advertises no tracks gives `NO_TRACKS_ADVERTISED`;
   - an SFU answering 500 gives `SFU_UNREACHABLE:sfu_http_500`.
6. **R6 - the stand-in lives only in the test.** The route file still holds no network call and no credential of
   its own; the existing test that reads its source keeps passing. The default test double still provides no
   `$http` and no realtime credentials.
7. **R7 - a control.** Breaking the route so it verifies a session whose tracks are not all held fails the new
   tests. The route is then restored byte for byte.
8. **R8 - the route compares track names (found by R5, fixed on the operator's decision of 2026-09-23).**
   `tracksOf()` hands back `{trackName, kind}` objects, and the read path turned each one into text with
   `String()`, which reads `"[object Object]"`. No advertised track could ever match what the SFU holds, so no row
   could ever be verified; d91a5f9 recorded that a positive verification had not yet been shown. The read path
   now compares each advertised track's name. This is the only change to the route. Its behaviour on the staging
   backend changes after the next staging-only backend sync.
