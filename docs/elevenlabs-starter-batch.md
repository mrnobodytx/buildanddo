# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/elevenlabs-starter-batch.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     docs/media-corpus.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/media-corpus-source.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-buddi-options.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/onboarding-media-source.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-onboarding-options.json
# EnumType:    Doc
# EnumEdges:   EXTENDS docs/media-corpus.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/media-corpus-source.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-buddi-options.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/onboarding-media-source.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-onboarding-options.json
# Intent:      Provide three source-bound narration scripts ready for the existing ElevenLabs production lane without inventing audio or publication receipts.
# ───────────────────────────────────────────────────────────────

# ElevenLabs starter batch

Prepared 2026-09-30T19:30:38.137086+00:00 through the existing media compiler. Three English
narration scripts are ready for review/import. No audio was generated and no
content was published: this session has no ElevenLabs or private bridge connection.
The requested model is `eleven_v4`; its availability, voice binding and actual
provider charge remain unmeasured. This batch adds no cloning request.

The Buddi update quotes a historical source-test report and states its limits.
The onboarding pieces quote the public product guide. None describes the new
privacy changes as deployed or narrates internal system health. Source review
state is `REPORTED_SOURCE`, not independent verification.

The JSON drafts below import into the existing Content studio. Scripts are copied
verbatim from the validated corpus. Their character counts are planning values,
not a provider billing estimate; no duration has been measured from audio.

## Daily Edition — buddi-update

Draft: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-buddi-update-draft.json`

Characters: 788

Script SHA-256: `b4d59e2cff22b3d847167e07dac81df6d7f58c8a9870e4be5851553b6ee4940b`

```text
Buddi connection recovery: what the source tests establish. Source report dated 2026-09-30.

Problem reported: The user requested improved
connections, integrations and Buddi usage after a supporting-system handoff.

Action recorded: Fixes bind
permission completion to the current attempt, fence SDK callbacks after a
terminal event or unmount, catch asynchronous SDK errors, release a transport
that finishes opening late, and distinguish confirmed hang-up from failure.

Outcome reported: PASS: 23 cases

Lesson recorded: Source repair and source-binding refresh do not mark the sprint or live
integration complete.

Limitations recorded: The handler harness executes production closures with hook/SDK/clock doubles;
it is not rendered browser evidence. No native PocketBase suite ran.
```

## Onboarding — first-workspace

Draft: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-first-workspace-draft.json`

Characters: 642

Script SHA-256: `f06db15bf7d83cdf533d59c46ea4686cd6091d66b5313e74bf22cf56d7b8dc91`

```text
Start with one useful project. Source report dated 2026-09-30. Inspect the recorded example and its lesson before trying the procedure.

Problem reported: Start with one real question, keep the source visible, and verify the result before calling the work done.

Action recorded: Create an account, choose an intent and objective, then name your workspace.

Outcome reported: Your starting path links to a lesson and your saved objective.

Lesson recorded: The Evidence Ledger stores the measurements, decisions and source references behind work.

Limitations recorded: Verified means evidence exists; a completed checkbox alone is not proof.
```

## Short video — short-introduction

Draft: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-short-introduction-draft.json`

Characters: 461

Script SHA-256: `880d26510af31d93fccb55d0f5ab661c712fb5702fa36b693e58af04878b0ae0`

```text
Start with one useful project. Source report dated 2026-09-30.

Problem reported: Start with one real question, keep the source visible, and verify the result before calling the work done.

Action recorded: Create an account, choose an intent and objective, then name your workspace.

Outcome reported: Your starting path links to a lesson and your saved objective.

Limitations recorded: Verified means evidence exists; a completed checkbox alone is not proof.
```

## Generation handoff

Use the existing private ElevenLabsBridge or ElevenCreative with a confirmed
account and an authorized voice. Retain the provider request identifier, actual
model/voice, output file hash and observed charge with each asset identity. Import
those observations through the existing media library before marking audio
generated. Human publication and external readback remain separate. If source
copy changes, compile a new asset identity before reusing a receipt.

Reproduce the batches into new directories with their retained options and the
recorded compile time (historical replay only):

```bash
python -m scripts.publish.media_corpus compile .bits/out/VCC-BUILDANDDO-UPGRADE-001/media-corpus-source.json --options .bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-buddi-options.json --evidence-root . --at 2026-09-30T19:30:38.137086+00:00 --output state/media-corpus/replay-elevenlabs-buddi
python -m scripts.publish.media_corpus compile .bits/out/VCC-BUILDANDDO-UPGRADE-001/onboarding-media-source.json --options .bits/out/VCC-BUILDANDDO-UPGRADE-001/elevenlabs-onboarding-options.json --evidence-root . --at 2026-09-30T19:30:38.137086+00:00 --output state/media-corpus/replay-elevenlabs-onboarding
```
