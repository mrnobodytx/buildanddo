# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-16-bits-codegen-cmax-b-classrooms.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docs/classrooms.md, apps/pocketbase/pb_hooks/classrooms.js
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/classrooms.md; CONSUMES apps/pocketbase/pb_hooks/classrooms.js
# DAG Node:    none
# Intent:      Assign installed classroom acceptance and discovery of the existing media join contract without inventing a provider or deployment receipt.
# ───────────────────────────────────────────────────────────────

# Classroom acceptance and media contract

From: BITS-CODEGEN
To: CMAX-B, with IDE1 for the existing media/auth interface
Status: receiving dispatch and runtime evidence required
Authority here: A2 source continuation; no private service or deployment effects

## What was asked

The owner reported that the live classroom and educational rooms do not work
or appear on the website. Inspection found Field Manual lessons, but no room
route, schema or join implementation in the public checkout. The earlier SRS
identified an unavailable media source contract; it remains unavailable here.

## Why it cannot be done on the public plane

Source code can expose and implement shared learning rooms. Activating those
hooks/migrations on the installed backend, deploying the site and connecting
an existing voice/video service require the accountable receiving operator.
No provider URL, room-token contract, SDK version, private media source,
authenticated workspace or receiving human dispatch was supplied. An async
question requested the actual service without credentials; no answer was
available when this handoff was written.

## What was done instead

`/classrooms` and workspace room routes are implemented and surfaced in the
site's navigation, Home, Docs and Field Manual. PocketBase room state, host
controls, attendance generations and saved discussion use current workspace
authorization and transactional retry receipts. Auth and onboarding preserve
class links. The page explicitly says voice and video are not connected;
`media.available` remains false. There are no invented stream links, media
tokens, broadcasts, notification messages or running-class fixtures.

Twenty connected source tests pass. Twelve rendered/hook cases and three native
cases are authored. Frontend dependencies and the native binary are absent in
this sandbox, so their acceptance and actual site behavior remain unverified.
The full contract and runnable verification are in `docs/classrooms.md`.

## What the receiving seat needs to do

1. Identify the installed BuildAndDo frontend/backend revisions and actual media
   owner. Read the receiving repository's authority and register its execution
   dispatch before private changes. Do not infer an operating media product from
   a fleet inventory entry or add a parallel SFU/provider.
2. Run the rendered and native commands in the guide on dependency-enabled
   runners. Both declared PocketBase versions must pass authentication, presence,
   concurrent replay and down/up tests. Return actual results, including failures.
3. Apply the classroom migration/hooks and frontend through the existing release
   owner. Perform the two-account website check and capture the final desktop and
   narrow-viewport state. Verify that a deployed public classroom link resolves,
   survives sign-in and never grants a foreign workspace membership.
4. Supply the existing media join API and SDK contract: authentication, room
   namespace, allowed origins, host/moderator roles, expiry and revocation,
   reconnect semantics, consent/device controls, recording policy and service
   ownership. Bind admission to the current account, room and workspace. Keep
   short-lived provider material out of browser persistence, logs and telemetry.
5. Under a separate verified source continuation, connect the existing media
   transport. Test two actual devices/accounts, failed permission prompts, host
   loss, expiry, membership revocation, reconnect and end-of-class denial. Set
   media availability from an observed contract/response, not a feature flag or
   the classroom's text-session state.

## Blocking

Missing locally: React/Vitest/Vite dependencies and the native PocketBase binary.
Missing for live acceptance: deployed revision/route evidence and a workspace.
Missing for audio/video: canonical service owner/source and join API/SDK contract.
Missing for private effects: receiving human dispatch. No deployment or media
activation is claimed by this public-source handoff.

Rollback: disable the UI entry points through the normal release process and,
if needed, apply the registered down migration to disable the classroom protocol
while retaining history. Coordinate any later media binding with its owner;
this source wave has no external provider state to compensate.
