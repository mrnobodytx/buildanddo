# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/post-competition-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-30
# Depends:     .bits/out/VCC-BUILDANDDO-UPGRADE-001/post-competition-validation.json, .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json, .bits/handoffs/2026-09-30-bits-codegen-post-competition-activation.md, docs/elevenlabs-starter-batch.md
# EnumType:    Doc
# EnumEdges:   CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/post-competition-validation.json; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json; CONSUMES .bits/handoffs/2026-09-30-bits-codegen-post-competition-activation.md; CONSUMES docs/elevenlabs-starter-batch.md
# Intent:      Retain reproducible privacy, Buddi and content results while separating source verification from unavailable provider and release acceptance.
# ───────────────────────────────────────────────────────────────

# Post-competition privacy, Buddi and content

## §1 Summary

Status: PARTIAL — source changes and three media drafts are prepared; audio,
rendered/native acceptance and live deployment remain unobserved.

Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Authority: A2 source continuation.
Branch: `dd/bits/SRS-BUILDANDDO-UPGRADE-001-buddi-recovery-20260930-tsgrIV`.
Tasks: CX/CY source verified; CZ audio blocked; DA source governance and handoff complete.
Smoke: 592 source cases pass, three source cases skip; all 13 native cases skip.
CKS gate: B+ target; CKS, CAPS and CK remain pending.
Source persistence is inspectable with `git log -1`; it is not release evidence.

The owner reports the competition ended. The archive does not infer a submission,
award or completion of historical acceptance. Existing GitLab/release governance
remains required. The machine-readable observation record is
`post-competition-validation.json` beside this report; it contains commands,
source hashes, measured counts and limits. Local output digests identify the
observed runs, not independently signed verification or hosted CI exports.

## §2 Task results

| Phase | Result | Verify | CKET |
|---|---|---|---|
| CX | Five operational feeds excluded from delivery; 17 global collections require native estate authority; public tools keep authored lessons; signed graph queries must scope every pattern | `node --test tests/upgrade/post-competition-privacy.test.mjs tests/upgrade/private-evidence.test.mjs`; `python -m unittest tests.upgrade.test_platform_health_public_projection tests.upgrade.test_public_api_native` (native binary required) | 07_BUILD / 08_TEST |
| CY | Buddi exposes dated current-workspace observations, draft-preserving starters and refreshed connections; native roles and estate authority govern routes, captured surfaces and retained plans | `node --test tests/upgrade/assistant-awareness.test.mjs tests/upgrade/workspace-assistant.test.mjs`; rendered component command in validation JSON | 07_BUILD / 08_TEST |
| CZ | Three source-bound scripts, 1,891 planned speech characters; two exact compiler replays and three valid Content studio imports; zero audio/provider/publication observations | `python tests/upgrade/check_media_corpus.py`; replay commands in `docs/elevenlabs-starter-batch.md`; validate each draft through `parseMediaDraft` | 06_PLAN / 11_COMMIT |
| DA | Source priority and receiving-owner requirements updated; historical evidence retained; private activation sequence prepared | Readiness, submission, context, boundary and dispatch-memory commands below | 04_HYPOTHESIZE / 06_PLAN / 11_COMMIT |

The privacy migration preserves rows and write rules, intersects existing read
restrictions and keeps null policies. Its down path locks reads and retains data.
Old public copies are also refused before edge origin fetch and filtered before
Vite copies assets. The public roadmap now enters the authenticated workspace;
global Capability Passport access requires native master authority.

Classroom clients send their current native token for availability checks.
Ordinary users receive minimal availability; master seats retain configuration
diagnostics. OCN health denies non-master callers before probing its sidecar.
The edge permits same-origin microphones by default while respecting a stricter
origin policy. These source changes do not establish working live audio/video.

## §3 Verification performed

| Check | Observed result | Limit |
|---|---|---|
| Targeted red/green controls | 12 failures before repair; final targeted suite 201 passed, zero skipped | Real policy/route/migration code with explicit storage, inference and provider doubles; signed positive graph query executes actual SQLite |
| Connected Node regressions | 315 passed, one skipped | The real-Vite build case is skipped because Vite is absent |
| Python privacy/Discord/redaction | 51 passed, two skipped | Exact-name private fleet map and built distribution are unavailable |
| Media compiler and receipt contracts | 25 passed, no skips; 98.17–100% statement coverage per module | Synthetic source/receipt fixtures; zero provider calls |
| New privacy/awareness modules | 100% V8 line coverage for assistant-systems, restrictive migration, public-exposure policy and public delivery | Branch coverage is separately recorded; no native/browser equivalence claim |
| Prepared media | Both retained batches replay exactly; three drafts pass the actual importer | Reported source, unverified model availability, no generated audio |
| Changed web/edge static diagnostic | 19 modules, zero errors | Offline parser/binding diagnostic only |
| Python lint | Seven affected files pass Ruff | Separate from strict typing |
| Full web source diagnostic | Six duplicate-key errors in unchanged HomePage tests; identical at the materialized baseline | Not repaired as part of this continuation |
| Strict Python typing | 19 errors; baseline shadow check also fails during duplicate-module discovery | No clean baseline or clean strict typing is claimed |
| Declared web build/lint and web/edge Vitest | Unavailable: Vite, required ESLint plugin and Vitest missing | No network installation attempted |
| Native public API suite | All 13 skipped because PocketBase is unavailable | Migration installation, native expansion/realtime and rollback still require the receiving profiles |

The broader regression run exposed two obsolete harness assumptions: a build-time
public projection and anonymous classroom health. The updated harnesses verify
filtered assets, cleanup on build failure, refusal of late feed generation,
authenticated minimal health and preserved classroom operations.

Run the source commands recorded in the validation JSON, then the required
governance checks:

```bash
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py
```

The inherited readiness binding was stale at preflight. Refreshing after review
records the changed source, never a passing deployment or milestone. Local
boundary validation does not observe the external PR's actor label. All five
source governance checks pass: readiness retains 12 milestones, submission
policy retains its unknown official rules, context retains 62 findings (32
unwired gates), boundary checks 1,883 tracked files, and memory has no orphan
vectors. These are source-governance results, not completed release acceptance.

## §4 Memory ingest

Type A count: 1071. Type B count: 2820. Type C count: 265.
All 260 pre-existing Type C events are retained. Current source observations use
real timestamps, no inferred provider/deployment result and no fabricated signing
grade. IOO completeness, exact header edges, line counts and absence of orphan
vectors are checked by the dispatch verifier. Payload: `memory.json` beside this
report. The generated locks retain source-review findings and limitations.

## §5 CKET filing

New runtime helpers, the restrictive migration and the delivery adapter use
07_BUILD; targeted source tests use 08_TEST. The narration guide uses 06_PLAN.
Source/draft JSON, their CGRF sidecars, this report and the receiving handoff use
11_COMMIT. Existing context/spec changes retain their project stage. New files
carry CGRF declarations; signing and private REFLEX acceptance remain post-merge.

## §6 Governance and rollback

Entity: Citadel Nexus Inc. CKS, CAPS and CK: pending. No secret, private runtime
receipt, golden source, infrastructure or deployment-control file is introduced.
Stripe is outside this change. The required actor label is `actor:agent`; this
session does not apply provider labels or publish refs. Public source and local
test fixtures cannot establish private execution authority.

Retain restrictive backend rules and edge denial during application rollback.
The migration's down path sets list/view rules to null. Its up path preserves
those stronger restrictions: restoring master reads after down/up requires a
reviewed forward migration. Do not republish old feeds as compensation. Full
backup/restore and external release readback belong to the private release owner.

## §7 Next actions

CMAX-B / IDE1 / the private release owner must execute the locked web/edge and
both native profiles, install backend rules and hooks before the frontend,
remove legacy origin/CDN copies and verify permitted and denied reads externally.
The concrete sequence is in
`.bits/handoffs/2026-09-30-bits-codegen-post-competition-activation.md`.

The existing ElevenLabsBridge/content owner must connect the provider, review the
three scripts, confirm model/voice/account terms, generate and retain real request
receipts, media hashes and observed costs. Human publication and external
readback remain separate. Neither audio nor content was published in this session.
No external issue or seat message was sent; the unrelated static/type findings
are recorded here for the receiving owner.
