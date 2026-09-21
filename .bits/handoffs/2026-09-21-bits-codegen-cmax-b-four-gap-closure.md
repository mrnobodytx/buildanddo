# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-21-bits-codegen-cmax-b-four-gap-closure.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     docs/development-loop.md, docs/submission-guide.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/four-gap-report.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/development-loop.md; CONSUMES docs/submission-guide.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/four-gap-report.md
# Intent:      Assign the exact external inputs still needed after acceptance repair and source completion of the four closure paths.
# ───────────────────────────────────────────────────────────────

# Four-gap receiving work

The owner-requested local continuation repairs the 32 migration-fixture failures,
retains explicit seed IDs, makes actual development review packets portable,
and joins candidate evidence with the final submission gate. Source validation
and actual acceptance results are in the report below. These files request
receiving work; they do not record assignment, notification or runtime activation.

| Receiving owner | Required input or action | Executable consumer |
|---|---|---|
| Acceptance operator / IDE1 | Locked npm dependencies, apps/research/requirements.txt and scripts/discordbot/requirements.txt dependencies, and both declared disposable PocketBase versions | hostinger_readiness.py --run all, followed by every native check in the other runtime profile |
| GitLab runner owner | Execute the full Day-21 acceptance job on the chosen revision and retain its complete export, JUnit and original build artifact | .gitlab/ci/day21-submission.yml and the shared acceptance validator |
| Independent reviewer / COPILOT | Inspect the frozen source, actual change and process evidence; author OutcomeLabels and an exact VerificationReceipt | review_packets inspect and admit, with independently distributed ReviewPolicy pins |
| Capability runtime / CMAX-B | Sufficient real discovery, disjoint replay/shadow cases, teacher observations, compatibility and independent promotion proof | Existing libs.evolution CLI and unchanged qualification thresholds |
| Private release owner | Deploy the accepted candidate through the existing authorized lane and export sanitized release/provider readback | Existing hostinger_replay.validate_capture |
| Browser acceptance operator | Candidate/source/artifact-bound response body, six ordered browser steps, screenshots, console log and actual walkthrough | Day-21 evidence audit and final submission audit |
| Hostinger product owners | Four separate observed uses of Agent, AI Builder, Web Hosting and VPS | Day-21 product proof validation |
| Competition owner | Actual organizer rules and deadline/time zone, eleven milestone decisions, approved materials and external submission confirmation | submission_readiness.py; the external submission remains an owner action |

The owner's GitLab correction supersedes the previous Actions-billing receiving
action. The historical GitHub failure is provider-specific and is not a GitLab
blocker. Pipeline execution and runner health still require actual GitLab evidence.

Dependency installation could not be completed from the available offline cache:
the npm cache lacks a required locked zod tarball, Python has neither pypdf nor
Discord.py, and no installed PocketBase binary or cached container image was
available. Recheck versions from apps/pocketbase/.pocketbase-version and
docker-compose.yml; the source declarations currently select 0.39.8 and 0.28.4.
Do not replace unavailable native or browser execution with fixture results.

The review packet includes source bytes, prediction, run and log. Its manifest
stays UNMEASURED. A receiving journal can import its original observations and
admit a separately pinned review without reconstructing a producer database.
Failed runs remain observations. One admitted pair does not qualify or promote
the capability, and no independently graded real pair was supplied in this run.

For submission, run acceptance on the exact committed candidate; receipts now
record whether source remained unchanged. Export the complete receipt history
with the Day-21 acceptance command. It retains later failures and actual JUnit
and build artifacts. Supply the capture documents, pin them with the index
command, and reference candidate-evidence.json from the submission manifest.
The final gate revalidates the actual replay chain and every named check, plus
the common source, candidate, artifact and observed URL. Historical summaries
without the new binding remain history and require fresh acceptance.

Use the commands in docs/development-loop.md and docs/submission-guide.md. The
five existing written materials in the development-loop submission draft remain
owner-review drafts; the recorded walkthrough, current product proofs and
official review must come from actual observations. No automatic competence,
deployment or competition approval is granted by these source changes.
