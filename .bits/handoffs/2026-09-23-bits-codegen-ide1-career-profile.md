# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-23-bits-codegen-ide1-career-profile.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/career/profile.py, apps/pocketbase/pb_hooks/career-profile.js
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON apps/career/profile.py; DEPENDS_ON apps/pocketbase/pb_hooks/career-profile.js
# DAG Node:    none
# Intent:      Ask the private plane to serve career profiles from Citadel Nexus stores and to bind the endpoint to BuildAndDo, without moving that data into the public repository.
# ───────────────────────────────────────────────────────────────

# Handoff: BITS-CODEGEN -> IDE1 (backend), operator

## What BuildAndDo now does

On sign-in the web app calls `GET /api/buildanddo/career/profile` (native
PocketBase auth). That route calls Citadel Nexus server-to-server, validates the
answer, binds it to the signed-in account and returns an allow-listed summary
with `Cache-Control: no-store`. BuildAndDo writes nothing; the browser keeps the
profile in memory and drops it on sign-out or account change.

## What Citadel Nexus must serve (private plane)

`POST <endpoint>` with `Authorization: Bearer <service token>` and body
`{"subject_id": "<BuildAndDo account id>", "email": "<verified email or empty>"}`.

- `200` with a `buildanddo.career.profile/v1` envelope for that subject, built by
  `python -m apps.career profile --passport <passport.json> --subject-id <id> --output <dir>`
  (or `apps.career.profile.build_profile`). The envelope's `subject_id` must equal
  the requested one; BuildAndDo refuses any other.
- `404` when Citadel holds no profile for the subject.
- Anything else is shown to the user as "unavailable".

Keep in Citadel's stores, never in the envelope: identity files, question banks
and answer keys, assessment and outcome ledgers, stored reserved answers
(work authorization, compensation and the rest), imported raw exports. The route
drops unknown fields anyway, but they should not leave Citadel.

Map `subject_id` to the person on Citadel's side. Do not trust `email` alone:
it is included only when PocketBase has verified it.

## What the operator must set (A3, human dispatch)

On the PocketBase host, from the vault, never committed:

- `BUILDANDDO_CAREER_PROFILE_URL`: https to any host, or http to loopback only.
- `BUILDANDDO_CAREER_PROFILE_TOKEN`: the service token Citadel issues.

Until both are set the route answers `not_configured` and sign-in is unaffected.

## Acceptance for the receiving seat

1. `node --test tests/upgrade/career-profile.test.mjs` passes (contract double).
2. With the variables set on staging, a signed-in test account receives
   `state: "ready"` and its own `subject_id`; a second account never sees the first's.
3. The PocketBase response carries `Cache-Control: no-store` and no record is created.
