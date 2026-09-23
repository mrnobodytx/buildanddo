# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-UPGRADE-001/career-passport-report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     docs/career-passport.md, .bits/out/VCC-BUILDANDDO-UPGRADE-001/career-passport-validation.json, .bits/handoffs/2026-09-22-bits-codegen-career-passport.md
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/career-passport.md; CONSUMES .bits/out/VCC-BUILDANDDO-UPGRADE-001/career-passport-validation.json; CONSUMES .bits/handoffs/2026-09-22-bits-codegen-career-passport.md
# Intent:      Retain measured career dogfood results, source validation and the missing evidence for one real personal application.
# ───────────────────────────────────────────────────────────────

# BuildAndDo Career Passport — validation report

## §1 SUMMARY

Status: PARTIAL — source implemented; personal/live/browser acceptance open
Dispatch: VCC-BUILDANDDO-UPGRADE-001
Seat: BITS-CODEGEN
SRS: SRS-BUILDANDDO-UPGRADE-001
Branch: dd/bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-release-ingestion-YuUFGm
Tasks: 4/4 source phases; receiving requirements remain open
Smoke: 3/7 application command gates pass
CKS Gate: B+/75 target; CKS: pending
CAPS: pending; CK: pending
Commits: 1 implementation at report capture (37e6d6f54d0c97f3730e5bb9da26516d60936252)

The Career Passport uses existing work, workspace-read and independent-review
owners to generate attributed contributions, requirement coverage and supported
application drafts. It keeps personal implementation, operation, design,
direction, review, verification, team delivery and agent execution distinct.
Neither a source digest nor an imported review authenticates personal experience
or grants permission to fill or submit an application.

The real BuildAndDo run captured **22 artifacts**, including **30 commit metadata
observations**, a bounded sample of **20 reports**, and **100 of 205 retained
memory events**. Nineteen reports carry BITS attribution. All 19 resulting
contributions remain NOT_PERSONAL for the deliberately unresolved dogfood person.
There are **zero independently verified personal claims, jobs, packages or real
submissions**. The expected result is HOLD. This is an actual repository run,
separate from the synthetic 100-job / ten-dossier / three-package test.

`career-passport-validation.json` records exact commands, UTC times, log hashes,
source bindings, statement coverage, source artifact references and this run's
limits. Raw career exports remain private in temporary storage. Final source
tests bind the career compiler and its existing review dependencies. Earlier
intermediate runs used the inherited binding scope without the new library;
those are retained as diagnostics, not final source acceptance.

## §2 TASK RESULTS

### CP1 — attributed work and review

Status: source PASS; real personal attribution UNMEASURED.

Capture retains committed bytes, immutable revisions, observation timestamps and
bounded history. Local Git queries disable lazy fetching. This checkout lacks
some ancestor trees needed for file diffs; the career collector retains available
commit metadata with an explicit gap. It does not fabricate changed paths or
fetch missing objects. Captured report timestamps describe their repository
version, not the time of a deployment or a new human achievement.

Native snapshots use the existing authenticated operator read model. Candidates
from mission reviews retain exact account/workspace scope and unknown assistance
until reviewed. Source bundles cannot carry a self-declared verification result.
Career claims require current, separately pinned independent checks of identity,
participation, capability and scope. Wrong subjects/producers, self-review,
foreign/missing artifacts, unknown assistance and stale/conflicting reviews do
not become application facts.

Files: `libs/career_passport/models.py`, `passport.py`, `sources.py`, focused tests.
CKET: 07_BUILD / 08_TEST.
Verify: `python -m unittest tests.upgrade.test_career_passport tests.upgrade.test_career_sources -v`.
Recapture current local evidence into a new private directory with
`python -m libs.career_passport capture --repo . --workspace buildanddo-repository-dogfood --output state/career/receiving-capture-001`.
Exact original artifact bytes can also be checked against the revision and
digests in the validation JSON; later recapture does not rewrite that observation.

### CP2 — jobs, coverage and application drafts

Status: source PASS; live search and real applications UNMEASURED.

Selected Lever/Ashby public posting GETs are bounded, redirect-free and preserve
partial source failures. The compiler reparses retained feeds and keeps original
clauses. Specific products, unknown qualifiers, mixed activities and alternatives
cannot disappear behind a general keyword match. Each requirement retains
participation, scope, recency and explicit gaps. Duration, credentials and human
attestations remain separate; every dossier includes DO NOT CLAIM.

The six generated documents contain only supported independently reviewed
personal facts and claim-level provenance. Hashes bind the exact package. Files
are written only to new private destinations; a failing symlink-parent regression
was fixed and passes. The PDF supports Windows-1252 text and explicitly requires
a reviewed Unicode renderer for other glyphs. Missing real evidence produces no
application prose.

J3/J4 plans require exact externally authenticated human approval of recipient,
package, current form, explicit answers and expiry. A CAPTCHA stops; J3 cannot
grant J4. No browser executor or ATS writer is activated. Outcome contracts require
actual evidence and separate authenticated pins. An unknown or already-started
attempt blocks blind resubmission; durable atomic reservation belongs to the
receiving executor.

Files: `libs/career_passport/jobs.py`, `matching.py`, `application.py`,
`authority.py`, `cli.py`, focused tests and coverage runner.
CKET: 07_BUILD / 08_TEST.
Verify: `python tests/upgrade/check_career_passport.py`.
All 90 focused cases pass. Per-module statement coverage ranges from 82.30 to
100 percent; this is Python `trace` line coverage, not branch coverage. Synthetic
100/10/3 execution never counts as live postings or personal career evidence.

### CP3 — scoped workspace review

Status: client/source PASS; rendered/native/browser acceptance BLOCKED.

`/app/career` reads existing scoped history, exports a private capture and imports
the actual compiler review format. It exposes participation, provenance,
requirement coverage, exclusions and package file hashes. Canonical bytes and
digests detect changed exports; imported verification remains reported by the
file. Account/workspace changes, revocation and delayed imports clear or reject
private state. The page has no approval or submission control.

Files: CareerPage, careerPassport client, route/navigation and rendered tests.
CKET: 07_BUILD / 08_TEST.
Verify: `node --test tests/upgrade/career-passport.test.mjs` and
`npm --prefix apps/web test`.
Fourteen client cases pass within the full 625-case Node regression. Seven new
rendered cases are authored but could not run without Vitest and its dependencies.
The offline source diagnostic parses 346 modules with zero static errors; it is
neither the repository lint gate nor rendered UI acceptance. No screenshots or
real native-session acceptance were captured.

### CP4 — retained evidence and receiving work

Status: source records PASS; complete acceptance PARTIAL.

The source inventory, public boundary, reviewed readiness and submission-policy
checks pass. The existing eleven milestone identities, dependency/check sets,
runtime prerequisites and earlier acceptance requirements remain. HS-09 and
HS-10 add explicit career evidence and review acceptance. The original eighteen
Day-21 profiles are unchanged and were not rerun as a claimed acceptance result.

Full Python discovery ran 952 cases with two errors and 32 skips. Both errors
come from unchanged Semantic Twin consumers requiring historical trees absent
from this checkout; one is a class setup error that prevents four compiler cases
from running. This report does not infer a passed-case total from a text parser
that counts setup errors as test failures. No test was disabled or weakened.
The 32 dependency skips remain 26 PocketBase, five PDF-parser and one Discord SDK
case. Runtime and external evidence remain incomplete.

Files: dispatch/spec, readiness/context locks, this report/validation, memory
and `.bits/handoffs/2026-09-22-bits-codegen-career-passport.md`.
CKET: 04_HYPOTHESIZE / 11_COMMIT.
Verify: the governance commands in §3 and the dispatch memory verifier in §4.

## §3 SMOKE TEST RESULTS

| Command | Expected | Observed | Result |
|---|---|---|---|
| `npm --prefix apps/web test` | Rendered cases execute | Vitest absent after local subprocess review, exit 127 | FAIL: dependency missing |
| `npm --prefix apps/web run lint` | Locked lint executes | eslint-plugin-import absent, exit 2 | FAIL: dependency missing |
| `npm --prefix apps/web run build` | Frontend bundle produced | Vite absent after local subprocess review, exit 1 | FAIL: dependency missing |
| `node --test tests/upgrade/*.test.mjs` | Source cases pass | 625/625, no failures or skips | PASS |
| `python -m unittest discover -s tests/upgrade -p 'test_*.py'` | Source discovery passes | 952 run, two errors, 32 skips; four class cases unrun | FAIL: historical Git trees missing |
| `python scripts/ci/agent_context.py --check` | Current inventory | Matches; 24 existing findings, 22 unwired gates | PASS |
| `python scripts/ci/verify_public_boundary.py` | Public source only | Tracked-file boundary accepted | PASS |

Additional observed checks: 90-case portable career coverage PASS;
`python -m mypy --strict libs/career_passport` PASS (ten modules); Ruff check and
format PASS on the new Python implementation/tests;
`python scripts/ci/hostinger_readiness.py --check` and
`python scripts/ci/submission_readiness.py --check` PASS. These do not establish
hosted CI, production, native workspace or browser acceptance.

Failures and corrections:

- The initial application writer followed a symlinked parent. The shared private
  destination check now rejects it; the exact red test and green retest are
  retained, and final coverage exercises the fixed path.
- Real capture initially failed while Git inspected absent ancestor trees. The
  new collector uses bounded local-only queries and retains metadata-only history
  with a gap. Its regression and actual recapture pass. Existing Semantic Twin
  history requirements remain unchanged; the receiving run needs full history.
  Diagnostic: `GIT_NO_LAZY_FETCH=1 git ls-tree a2d8285422ff90fa87d5015d56a06a69bff86842 -- tools/buildanddo_release.py`
  returns an unavailable tree in this sandbox.
- An intermediate strict-typing failure in CLI summary counts was corrected by
  narrowing generated list types. Final strict typing passes.
- Initial restricted Node/process attempts were not counted as executed case
  acceptance. Approved local subprocess execution ran all 625 actual source cases.
- Frontend tests/build still fail after process restrictions are removed because
  the required tools are absent. No package install, substitute rendered result
  or network access was claimed. Re-run the three original commands with the
  locked dependencies on the receiving candidate.
- Readiness/context bindings became stale after task-table updates. The rationale
  and receiving acceptance were reviewed and both locks regenerated. Their final
  checks pass; refreshing a lock does not mark runtime checks passed.

## §4 MEMORY INGEST

Type A count: 847
Type B count: 1967
Type C count: 214
IOO compliance: complete
DKG orphans: 0
Historical Type C events preserved: 205/205, byte-for-value unchanged
Payload: `.bits/out/VCC-BUILDANDDO-UPGRADE-001/memory.json`

Verify: `python .bits/out/VCC-BUILDANDDO-UPGRADE-001/verify.py`.
Memory vectors preserve declared source edges and substantive test, failure,
dogfood and implementation events. No direct memory ingestion occurred.

## §5 CKET FILING

06_PLAN: `docs/career-passport.md`.
04_HYPOTHESIZE: existing SRS specification and measured source context.
07_BUILD / 08_TEST: repository-authorized application/compiler source and tests.
11_COMMIT: dispatch, receiving handoff, readiness locks, report, validation and memory.
13_SAVE: none.
CGRF headers or JSON sidecars: 26/26 new files.
REFLEX check: deferred to the receiving/post-merge owner; no CK signature produced.

## §6 GOVERNANCE

Entity: Citadel Nexus Inc. (Delaware C-Corp).
License posture: existing BUSL-1.1 + Additional Use Grant unchanged;
commercial contact licensing@citadel-nexus.com.
Authority: existing A2 source dispatch; actor:agent required on the PR.
External writes, native seat messages, live collection and submissions: zero.
Hard-NO paths: no change. New-file secret-prefix scan: passed.
Stripe mode: not applicable; no checkout or payment code added or executed.
CK/CAPS/CKS: pending; no independent review grade or authority fabricated.

Rollback: revert the focused Career Passport source change. It adds no database
migration or activated external writer. Preserve private source captures and
actual future application receipts under their existing receiving retention
policy; reverting source is not permission to erase submitted-application history.

## §7 NEXT ACTIONS

Blockers: exact native applicant/workspace identity and independently reviewed
personal participation; selected real job sources/preferences and permitted
network runtime; locked frontend dependencies and native/browser acceptance;
complete local Git history for the existing full regression; a reviewed actual
application and separately authorized receiving executor.

Handoffs requested: IDE1 / CMAX-B / applicant / independent verifier, through
`.bits/handoffs/2026-09-22-bits-codegen-career-passport.md`. No external message sent.
Suggested next dispatch: a human-authored career receiving dispatch to prove
the real 100/10/3 preparation flow and authorize one exact ATS application.
No dispatch ID or consent is invented here. Outcome tracking begins with the
actual submission receipt; no example response/interview/offer counts are seeded.
Out-of-scope findings: missing historical Git objects are retained above; no
issue comment was sent because repository write/messaging authority was absent.
