# --- CGRF Header ------------------------------------------------
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/evidence-repairs-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     tests/career/check_career.py, tests/integrity/check_integrity.py, tests/knowledge_units/check_knowledge_units.py, tests/world_twin/check_world_twin.py, tests/upgrade/mission-system.test.mjs, tests/upgrade/workspace-value.test.mjs, tests/upgrade/workspace-assistant.test.mjs, docs/career-passport.md
# EnumType:    Doc
# EnumEdges:   VERIFIED_BY tests/career/check_career.py; VERIFIED_BY tests/integrity/check_integrity.py; VERIFIED_BY tests/knowledge_units/check_knowledge_units.py; VERIFIED_BY tests/world_twin/check_world_twin.py; VERIFIED_BY tests/upgrade/mission-system.test.mjs; VERIFIED_BY tests/upgrade/workspace-value.test.mjs; VERIFIED_BY tests/upgrade/workspace-assistant.test.mjs; CONSUMES docs/career-passport.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json
# Intent:      Retain adversarial repair evidence, compatibility boundaries and receiving validation still needed for the audited career-to-workflow chain.
# ----------------------------------------------------------------

# Audited evidence and handoff repairs

## Section 1: Summary

Status: PARTIAL for operational acceptance; the audited source defects are repaired.
Dispatch: VCC-BUILDANDDO-UPGRADE-001. Seat: BITS-CODEGEN.
SRS: SRS-BUILDANDDO-UPGRADE-001. Risk: A2. Actor: actor:agent.
CKS Gate: pending. CKS/CAPS/CK: pending.

The owner approved dependency-ordered repair of the completed audit at merged
revision 1bb22896eb1e78704d12c20b0d85c58f22e568c6. Existing product owners,
authorization, schemas and all eighteen acceptance profiles remain in place.
No live job search, application submission, authenticated ingestion or deployment
is added. No historical verification is backfilled.

## Section 2: Task results

| Phase | Source outcome | Verification |
|---|---|---|
| ER-1 | Assessments bind unique prior issuance, candidate, capability, bank, proctor separation, response layout, score and timing. Passport admission requires answer replay with the issuing bank. Headline participation and state share compatible support, including sampled references, dates and counts. | 86 career tests on both declared Python versions |
| ER-2 | Same-reviewer conflict survives ordering and replay. Mastery binds unit version and normalized content, with strict boolean results. World review excludes action/result actors, participants and guildmasters, including hidden predecessors. External pins can review OBSERVED or VERIFIED sources without trusting supplied labels. | 19 integrity, 20 Knowledge Unit and 97 world-twin tests per Python version |
| ER-3 | Actual native review output carries version 1 into the value/replay consumers. Final serialized UTF-8 snapshots cannot exceed 24,000 bytes. Same-identity refresh preserves drafts/imports while real scope changes clear and fence work. | 47 native-policy/value and 80 focused UI/client Node cases; rendered/native execution remains open |
| ER-4 | Independent source review reproduced and closed remaining lineage, bank-admission and polling races. Broad source tests and static/type checks are retained without treating missing dependencies as acceptance. | 672 Node passes; 1,174 Python cases, zero failures and six skips |

The world review path hashes each event subject once per invocation rather than
once per receipt comparison. The measured three-event cases fell from 21/37
hashes for three/six reviews to three, without collapsing conflicting receipts.

## Section 3: Smoke test results

Red tests preceded source correction. Representative observed failures:

- Career: the initial 19-method run had 30 failing subtest assertions and four
  errors. The reassigned candidate/capability regraded PASS; unrelated verified
  assessments supplied implementation state; the assessment disappeared from a
  large evidence sample. Separate red cases exposed contradictory serialized
  headlines and bank replay omitted from passport admission. All now pass.
- Integrity: three new tests failed before repair, including a positive
  competence recommendation after stale PASS replay. All 19 now pass.
- Knowledge Units: 12 of 20 methods failed before content/version and boolean
  binding; all 20 now pass. Legacy unbound history remains ineligible.
- World review: six initial methods failed, followed by four red lineage tests
  exposing predecessor-only participant/guildmaster attribution. All 97 pass.
- Native handoff: 19 of 47 cases failed before version/size repair. Boundary
  tests now cover 23,999, 24,000, 24,001 and 24,564 serialized bytes, including
  multibyte, astral, escaped and lone-surrogate content.
- UI helper regressions reproduced same-account resets, swallowed denial,
  discarded successful deletion and private chat returned during permission
  polling. Final focused suites pass. Rendered tests for import preservation,
  revoke/regrant, pending work and focus preservation are authored but unexecuted.

Runnable focused checks:

```bash
python tests/career/check_career.py
python tests/integrity/check_integrity.py
python tests/knowledge_units/check_knowledge_units.py
python tests/world_twin/check_world_twin.py
node --test tests/upgrade/mission-system.test.mjs tests/upgrade/workspace-value.test.mjs
node --test tests/upgrade/journey.test.mjs tests/upgrade/career-passport.test.mjs tests/upgrade/workspace-control-client.test.mjs tests/upgrade/workspace-assistant.test.mjs
python -m ruff check --no-cache apps/career apps/integrity apps/knowledge_units apps/world_twin tests/career tests/integrity tests/knowledge_units tests/world_twin
python -m mypy --strict --explicit-package-bases --follow-imports=silent --cache-dir=/dev/null apps/career apps/integrity apps/knowledge_units apps/world_twin
```

Python 3.11.15 and 3.12.13 each passed all 222 focused cases with no skips.
Existing statement-coverage floors are unchanged: career 96.74-100 percent,
integrity and Knowledge Units 100 percent, world-twin 92.88-100 percent across
the two versions. No Python branch-coverage claim. The native-policy helper
measured 100 percent V8 lines/functions and 98.5 percent branches.

Broad source checks use the existing readiness runner:

```bash
python scripts/ci/hostinger_readiness.py --run source_node
python scripts/ci/hostinger_readiness.py --run source_python
```

The Node 22.17.0 run passes 672 tests with no skips. Its first attempt failed
because the source-diagnostic fallback looked for globally installed ESLint in
the Node 22 prefix. Pointing npm's per-command prefix at the already installed
ESLint resolved that prerequisite; no package, lock, test or gate changed.
This fallback is a limited source diagnostic, not locked repository lint.
It also parsed 353 frontend modules without static errors.

The Python 3.12.13 source run passes 1,168 of 1,174 cases and skips six: five
require the declared pypdf parser and one requires Discord.py. Its acceptance
state is HOLD, not PASS. Local pre-publication receipts retain their dirty-source
status; they cannot establish final-candidate or deployment acceptance.

| Required check | Actual result | Remaining prerequisite |
|---|---|---|
| `npm test` | FAIL before test execution | Vitest missing |
| `npm run build` | FAIL before build execution | concurrently missing |
| `npm run lint --prefix apps/web` | FAIL before repository analysis | eslint-plugin-import missing |
| `python tests/upgrade/test_workspace_native.py --require-binary` | FAIL prerequisite; no HTTP acceptance | Both declared disposable PocketBase runtimes |

Source/readiness and public-boundary checks pass after reviewed binding refresh.
Do not substitute these results for native or rendered acceptance. Execute the
unchanged full offline matrix on the final clean candidate and retain every
receipt, log and artifact; unavailable runtime profiles remain BLOCKED/HOLD.

## Section 4: Memory ingest

The existing upgrade payload preserves all 222 historical Type C events. New
events describe the observed repair checks and runtime limits; Type A metadata
and Type B edges follow current headers. Counts are in the final summary.
Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.

## Section 5: CKET filing

Existing implementation and test owners remain 07_BUILD and 08_TEST. The career
guide is 06_PLAN, the spec is 04_HYPOTHESIZE, and dispatch/readiness/report/memory
records are 11_COMMIT. The new report has a CGRF header. REFLEX and CK remain
receiving/post-merge work; no generated signature or score is asserted.

## Section 6: Governance and rollback

Entity: Citadel Nexus Inc. Existing license posture is unchanged. No secret
access, live provider, shared-backend write, seat event, hosted CI trigger or A3
effect occurred. Actor labeling is still a publishing-owner action; it has not
been applied by this read-only provider session. Exactly one actor label is
required on the review. GitHub billing and Cloudflare diagnostics are external
historical findings, not current GitLab execution evidence.

Hashes establish consistency only. Proctor authentication, trusted verifier pins
and identity/read/share grants remain receiving-owner responsibilities. Local
Integrity output does not pay rewards; world projection grants no action authority.

No schema migration is added or deleted. Existing unversioned client review
requests remain accepted, but newly persisted reviews receive version 1. Old
terminal reviews are not rewritten or automatically counted as measured.
Knowledge Unit events without original content binding do not establish mastery;
do not infer a binding from today's unit. Assessment imports now require the
issuing bank. Regenerate inconsistent old passport summaries rather than patching
their verification label. Revert this source change only as a coordinated rollback;
that would restore the audited defects, not recover verified evidence.

## Section 7: Next actions

1. Acceptance owner: provision the locked frontend dependencies, pypdf, Discord.py
   and both declared PocketBase binaries; run all eighteen profiles and the
   rendered lifecycle/native HTTP regressions on the exact candidate.
2. Backend/browser verifier: show one real mission review reaching the value card
   and replay; test byte-limit rejection and same-account refresh versus actual
   account/workspace/revocation boundaries with independent identities.
3. Receiving Citadel owner: authenticate assessment proctors, personal attribution,
   exact review pins and scoped captures before a real career claim or application.
   The reviewed-passport import still does not update the separate login profile;
   Knowledge Unit/classroom and Integrity/native settlement integration remain open.
4. CI/release owner: retain same-revision GitLab execution and deployed readback,
   apply the required actor label, and diagnose provider failures without disabling
   checks. No live ATS submission or deployment acceptance is claimed here.
