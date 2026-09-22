# ─── CGRF Header ──────────────────────────────
# File:        .bits/out/VCC-BUILDANDDO-CAREER-001/report.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     .bits/srs/SRS-BUILDANDDO-CAREER-001.md, tests/career/test_career.py, tests/career/check_career.py
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-CAREER-001.md; VALIDATES .bits/out/VCC-BUILDANDDO-CAREER-001/memory.json; VERIFIED_BY tests/career/test_career.py; VERIFIED_BY tests/career/check_career.py
# DAG Node:    none
# Intent:      Preserve reviewer-runnable evidence that the career slice credits only attributed work and never infers reserved answers or submits.
# ───────────────────────────────────────────────────────────

# VCC-BUILDANDDO-CAREER-001 Report

## §1 SUMMARY

Status:      COMPLETE (slices 1-3; no submission, no deployment)
Dispatch:    VCC-BUILDANDDO-CAREER-001
Seat:        BITS-CODEGEN
SRS:         SRS-BUILDANDDO-CAREER-001
Branch:      bits/SRS-BUILDANDDO-CAREER-001-career-evidence
Tasks:       13/13
Smoke:       3/3
CKS Gate:    pending
CKS:         pending
CAPS:        pending
CK:          pending
Commits:     3 (SHAs assigned by the focused repository commits)

## §2 TASK RESULTS

Task 1 — Participation, attestation and git-history ingestion
  Status:  PASS
  Output:  Authored commits are PERSONALLY_IMPLEMENTED; commits integrated by the person's own merge are REVIEWED; everything else is excluded and counted.
  Verify:  `python -m unittest tests.career.test_career.HistoryTests tests.career.test_career.AttestationTests`

Task 2 — Career Passport
  Status:  PASS
  Output:  Per-capability records, participation counts, headline claim participation, claim state, span, recency and a documented ranking heuristic; digest-bound and tamper-evident.
  Verify:  `python -m unittest tests.career.test_career.PassportTests`

Task 3 — Job normalization, requirement extraction, coverage map
  Status:  PASS
  Output:  CAPABILITY / TENURE / CREDENTIAL / RESERVED / UNMAPPED requirements; SUPPORTED / PARTIAL / NOT_PROVEN / HUMAN_ATTESTATION rows; no single match percentage.
  Verify:  `python -m unittest tests.career.test_career.JobTests tests.career.test_career.MatchTests`

Task 4 — Dossier
  Status:  PASS
  Output:  STRONG_CANDIDATE / CANDIDATE / REAL_GAP with why, lead-with strategy, human-reserved items and a non-empty do_not_claim list.
  Verify:  `python -m unittest tests.career.test_career.DossierTests`

Task 5 — Authority policy and compiler
  Status:  PASS
  Output:  J0-J5 policy; compiler stops at J2; packages carry claim-level evidence refs and are self-validated.
  Verify:  `python -m unittest tests.career.test_career.AuthorityTests tests.career.test_career.CompilerTests`

Task 6 — CLI and coverage
  Status:  PASS
  Output:  34 tests; every `apps/career` module at or above 90 percent statement coverage.
  Verify:  `python tests/career/check_career.py`

Task 7 — Boundary and context
  Status:  PASS
  Verify:  `python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check`

Task 8 — BuildAndDo mission evidence source
  Status:  PASS
  Output:  Self-written mission evidence is DECLARED; a suite run is VERIFIED only when a different reviewer attached it with a result digest.
  Verify:  `python -m unittest tests.career.test_slice2.MissionTests`

Task 9 — Public job-board discovery
  Status:  PASS
  Output:  Lever, Greenhouse and Ashby feeds normalize to canonical jobs; postings without a requirement section are skipped with a reason; refresh diffs by digest.
  Verify:  `python -m unittest tests.career.test_slice2.SourceTests`
  Limit:   the live GET path is covered with a mocked transport only; this sandbox has no internet.

Task 10 — Verified package reload and outcome ledger
  Status:  PASS
  Output:  Edited package files are rejected; outcomes are human-recorded, stages only advance, groups under 10 are never ranked.
  Verify:  `python -m unittest tests.career.test_slice2.PackageTests tests.career.test_slice2.OutcomeTests`

Task 11 — J3 fill plan
  Status:  PASS
  Output:  Each form field names its source; required human fields and reserved classes block fill; a challenge always stops for the human.
  Verify:  `python -m unittest tests.career.test_slice2.FillTests tests.career.test_slice2.SliceCliTests`

Task 12 — Red-team, prove failures, then fix
  Status:  PASS
  Output:  10 adversarial tests written against slice 2 failed (13 failures, 2 errors); all pass after the fixes below.
  Verify:  `python -m unittest tests.career.test_redteam`

  Proven failures in slice 2, each now a regression test:
  R1  66 of 68 "personally implemented" commits in this repository carry a Claude
      Co-Authored-By trailer. Slice 2 reported them as sole authorship.
  R2  A person could list the datadog-bits bot address as their own and take credit for its commits.
  R3  "Debug race conditions" was classified as a demographic question and removed from matching.
  R4  "Five years of Python" and "A decade of Python" were read as plain Python and marked SUPPORTED.
  R5  "5-7 years" was read as 7; ages ("at least 18 years of age") and export control were not reserved.
  R6  "the rest of the team" produced backend evidence; "privacy policy" produced governance.
  R7  "No Kubernetes experience required" became a Kubernetes requirement.
  R8  An outcome ledger line could be edited undetected.
  R9  A forged passport with a recomputed digest passed every check that existed.

Task 13 — Third-party verification
  Status:  PASS
  Output:  `verify` re-derives every commit reference and counter from a clone. This repository's real passport: VERIFIED_AGAINST_REPOSITORY, 132 commit refs checked. An inflated passport with a recomputed digest: MISMATCH, exit 2.
  Verify:  `python -m unittest tests.career.test_redteam.IntegrityTests`

Before and after on this repository (HEAD 72ad1355, same identity file):
  slice 2: 70 authored, headline "Implemented" for architecture, backend, CI/CD, deployment, frontend, Python.
  slice 3: 70 authored, 67 of them agent-assisted; no capability carries an "Implemented" headline.

## §3 SMOKE TEST RESULTS

1. `python tests/career/check_career.py` — expected PASS — actual PASS (62 run, 0 failures; every module 94-100 percent).
2. `python scripts/ci/verify_public_boundary.py` — expected PASS — actual PASS.
3. `python scripts/ci/agent_context.py --check` — expected PASS — actual PASS.

Also observed: `mypy --strict --explicit-package-bases -p apps.career` clean;
`ruff check apps/career tests/career` clean; `hostinger_readiness.py --check`
PASS after a source-review refresh (no milestone field changed).

Dogfood against this repository at HEAD 34e07429 with a local identity file
(not committed) that maps the owner's three author addresses to one person and
the Bits and source-bridge addresses to agents:

- 285 commits read; 70 authored by the person; 98 integrated by the person's
  merges (all agent-authored); 26 agent commits excluded; 3 unmapped.
- 13 capabilities evidenced, all OBSERVED, none VERIFIED (no independent receipts supplied).
- Headline participation is REVIEWED for distributed systems, observability,
  security, testing, AI systems, governance and technical writing, because the
  person's own authored commits are under the qualifying share there.
- Against the three synthetic postings: AI Systems Architect STRONG_CANDIDATE,
  Staff Platform Engineer CANDIDATE (hard REVIEW: tenure and work authorization),
  iOS Lead REAL_GAP. Two packages compiled; 0 submitted.

Slice 2 dogfood: the saved Greenhouse fixture discovered 1 job (1 duplicate
skipped); evaluated against the repository passport it was STRONG_CANDIDATE; the
fill plan returned fill DENIED and submit DENIED under the default J2 grant,
blocked on name, email, work authorization and compensation; one human-recorded
`applied` event was written to a local ledger and reported as insufficient sample.

## §4 MEMORY INGEST

Payload: .bits/out/VCC-BUILDANDDO-CAREER-001/memory.json (counts in its summary block).

## §5 CKET FILING

CGRF headers on every new file; JSON fixtures carry sibling `.cgrf.yaml` files.
REFLEX check: deferred to post-merge.

## §6 GOVERNANCE

Entity:           Citadel Nexus Inc.
Hard-NO scan:     0 violations
Secret scan:      boundary scan PASS
External effects: none (no network, no submission, no personal data committed)

## §7 NEXT ACTIONS

Blockers: none for this slice.
Not done, by design: browser application runner and submission (A3, needs a
human dispatch and a runner outside this public repository), encrypted storage of
reserved answers (needs an owner-chosen encryption dependency or OS keyring),
staging deployment (A3; this package has no service surface to deploy), a live
PocketBase reader for missions (needs credentials; exported snapshots only).
Known remaining limits: git identities and dates are forgeable, so verify must run against the canonical remote;
squash merges authored by an agent are not credited to the merger; many trivial commits still inflate record counts.
Suggested next dispatch: human-dispatched A3 runner that consumes fill_plan.json
and stops at every HUMAN_REQUIRED field and challenge.
Bugs filed (out of scope, comment-only): none.
