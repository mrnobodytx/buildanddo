# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/upstream-integration-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md, .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/hostinger-readiness.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json, tests/upgrade/classroom-recovery.test.mjs, tests/upgrade/check_media_corpus.py, tests/upgrade/check_work_exchange.py, .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
# EnumType:    Doc
# EnumEdges:   CONSUMES .bits/queue/VCC-BUILDANDDO-UPGRADE-001.md; CONSUMES .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md; CONSUMES .bits/hostinger-readiness.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json; VERIFIED_BY tests/upgrade/classroom-recovery.test.mjs; VERIFIED_BY tests/upgrade/check_media_corpus.py; VERIFIED_BY tests/upgrade/check_work_exchange.py; VERIFIED_BY .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
# Intent:      Retain the merge's source verification and complete evidence history without promoting unavailable runtime acceptance.
# ───────────────────────────────────────────────────────────────

# Upstream and classroom integration — 2026-09-30

## §1 SUMMARY

Status: COMPLETE for source integration; runtime acceptance remains open.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Risk: A2. Actor: actor:agent.
CKS, CAPS and CK: pending receiving assessment.

The supplied `origin/main` revision is already an ancestor of the first merge
parent. The pending merge applies the saved classroom repair to that combined
work-exchange/media source. Seven shared-record conflicts are reconciled without
discarding either continuation, acceptance requirements or original test reports.
This report records local source checks, not private CI or deployed acceptance.

## §2 TASK RESULTS

| Phase | Result | Reproduce |
|---|---|---|
| MI-1 | Both continuation histories and readiness requirements retained; current media instructions now use incorporated PR 119 source. | `git ls-files --unmerged`; inspect the readiness acceptance lists and dated SRS/dispatch sections. |
| MI-2 | Classroom, media/workspace and connected Python behavior passes; one historical evidence check remains unavailable. | Run the source commands below. |
| MI-3 | Reviewed source bindings regenerated; all 263 distinct historical events from both parents retained before appending these integration observations. | Run the five governance commands below and compare Type C records with both merge parents. |

## §3 SMOKE TEST RESULTS

| Check | Observed result |
|---|---|
| Classroom discovery/session/client/media source suites | PASS: 157/157; no skips. Both hooks have 100% source lines/functions; branch coverage is 97.39% for useClassrooms and 83.82% for useOpenClasses. |
| Media import, content permissions, workspace claims and connection recovery | PASS: 105/105; no skips. contentMedia.js has 100% measured lines, functions and branches. |
| Historical broadcast lessons | PARTIAL: 12/13 pass. The evidence-binding case cannot read the original classroom-media.js object at its retained revision with replacement objects disabled. The earlier report and evidence binding are unchanged. |
| Connected work exchange, development, capability, mission packaging, GitLab wiring, media and activity publisher | PASS: 199/199 on Python 3.11.15 and 199/199 on Python 3.12.13; no skips. |
| Work-exchange coverage gate | PASS: 46/46 on each Python version; all four measured modules exceed 96% statement coverage. |
| Media coverage gate | PASS: 25/25 on each Python version; all three measured modules exceed 98% statement coverage. |
| Readiness, submission, context, public boundary and dispatch memory | PASS: all five validators; boundary covers 1,863 files. The context inventory retains its 62 findings and 32 unwired gates, without claiming those findings are resolved. |

Coverage-gate cases are subsets of the connected Python suite, not additional
unique behavior. Node source checks used Node 24.13.0; the declared Node 22
runtime and locked React/Vitest/Vite/browser toolchain are unavailable. Native
PocketBase and delivered media are unverified. Initial restricted invocations
could not launch local compiler/history subprocesses or complete the local
Node backend fixture; the final connected runs used local subprocess access.

```bash
node --test --test-isolation=none --experimental-test-coverage --test-coverage-include='**/apps/web/src/hooks/useClassrooms.js' --test-coverage-include='**/apps/web/src/hooks/useOpenClasses.js' --test-reporter=tap tests/upgrade/classroom-system.test.mjs tests/upgrade/classroom-client.test.mjs tests/upgrade/classroom-presence.test.mjs tests/upgrade/classroom-media.test.mjs tests/upgrade/classroom-media-client.test.mjs tests/upgrade/classroom-media-lifetime.test.mjs tests/upgrade/classroom-telemetry.test.mjs tests/upgrade/classroom-recovery.test.mjs
node --test --test-isolation=none --experimental-test-coverage --test-coverage-include='**/apps/web/src/lib/contentMedia.js' --test-reporter=tap tests/upgrade/media-draft-import.test.mjs tests/upgrade/business-learning.test.mjs tests/upgrade/workspace-claims.test.mjs tests/upgrade/workspace-connections.test.mjs tests/upgrade/broadcast-lessons.test.mjs
python -m unittest tests.upgrade.test_work_contracts tests.upgrade.test_work_exchange tests.upgrade.test_work_cli tests.upgrade.test_development_loop tests.upgrade.test_development_intelligence tests.upgrade.test_development_sources tests.upgrade.test_development_review_packets tests.upgrade.test_capability_token_contracts tests.upgrade.test_capability_token_records tests.upgrade.test_mission_suite tests.upgrade.test_gitlab_acceptance tests.upgrade.test_media_corpus tests.upgrade.test_activity_publish
python tests/upgrade/check_work_exchange.py
python tests/upgrade/check_media_corpus.py
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
```

Repeat the Python behavior and coverage commands under each declared Python
version. The second Node command deliberately retains the historical failure.
Its missing source is a checkout/history limitation; changing its expected hash
or enabling replacement objects would not validate the original evidence.

## §4 MEMORY INGEST

Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`.
Type A/B/C counts: 1,037 / 2,759 / 266. IOO and declared-edge checks pass with
zero orphans. The 260 events from the first parent and 255 from the
classroom parent overlap in 252 identical records, leaving 263 distinct events.
Their timestamps and content are preserved, including past failures and limits.
Current file metadata and CGRF relationships describe the combined source.

## §5 CKET FILING

04_HYPOTHESIZE: the existing upgrade SRS retains both continuations.
06_PLAN: current media and sprint receiving instructions reflect merged source.
11_COMMIT: dispatch, handoff, reviewed bindings, this report and memory payload.
This report is the only newly authored file in the integration and carries the
upgrade CGRF header; the saved classroom files retain their original headers.
REFLEX and CK assessment remain with the receiving pipeline.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. Source integration only. Original classroom,
mutual-development and media validation artifacts are unchanged from their
respective merge parents. Generated locks bind the resolved tree; they do not
mark deployment, provider acceptance or sprint milestones complete. No checkout
logic, secrets, private evidence or deployment authority changed.

The inherited readiness lock also contained stale hashes for unchanged source,
including `.nvmrc`. Regeneration computes actual source bytes and retains every
previously declared source path; it adds the classroom regression source. This
explains the larger generated diff without implying broader application edits.

Rollback: revert the integration through governed source control, then refresh
reviewed bindings and current metadata while retaining historical observations.
There are no external effects requiring compensation.

## §7 NEXT ACTIONS

Receiving owners still need locked browser/Node 22/native execution and actual
host/listener media readback, as specified by the existing classroom handoff.
The repository owner must supply the original broadcast evidence objects for
the historical check. CMAX-B/CSCC must map media identities into the incorporated
work contract and obtain the existing assignment, provider and publication
authority. Nothing was deployed, generated through a provider or published.
