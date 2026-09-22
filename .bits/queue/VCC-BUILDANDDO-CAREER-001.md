# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-CAREER-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     .bits/srs/SRS-BUILDANDDO-CAREER-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-CAREER-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-CAREER-001.md
# DAG Node:    none
# Intent:      Authorize and gate the local career evidence slice without discovery, submission or external-write authority.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-CAREER-001

**SRS:** SRS-BUILDANDDO-CAREER-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

A person's recorded work can be compiled into a participation-honest Career
Passport, matched requirement-by-requirement against supplied postings, and
turned into dossiers and application packages whose every claim has provenance.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Participation, attestation and git-history ingestion | `python -m unittest tests.career.test_career.HistoryTests tests.career.test_career.AttestationTests && echo PASS` | done |
| 2 | Career Passport construction | `python -m unittest tests.career.test_career.PassportTests && echo PASS` | done |
| 3 | Job normalization, requirement extraction and coverage map | `python -m unittest tests.career.test_career.JobTests tests.career.test_career.MatchTests && echo PASS` | done |
| 4 | Dossier with mandatory DO NOT CLAIM | `python -m unittest tests.career.test_career.DossierTests && echo PASS` | done |
| 5 | J0-J5 authority policy and application compiler | `python -m unittest tests.career.test_career.AuthorityTests tests.career.test_career.CompilerTests && echo PASS` | done |
| 6 | CLI and per-module coverage | `python tests/career/check_career.py && echo PASS` | done |
| 8 | BuildAndDo mission evidence source | `python -m unittest tests.career.test_slice2.MissionTests && echo PASS` | done |
| 9 | Public Lever/Greenhouse/Ashby discovery adapters | `python -m unittest tests.career.test_slice2.SourceTests && echo PASS` | done |
| 10 | Verified package reload and outcome ledger | `python -m unittest tests.career.test_slice2.PackageTests tests.career.test_slice2.OutcomeTests && echo PASS` | done |
| 11 | J3 fill plan with authority decisions | `python -m unittest tests.career.test_slice2.FillTests tests.career.test_slice2.SliceCliTests && echo PASS` | done |
| 7 | Public boundary and context gates | `python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

## Constraints

- Files this dispatch may touch: `apps/career/**`, `tests/career/**`,
  `tests/fixtures/career/**`, `.bits/srs/SRS-BUILDANDDO-CAREER-001.md`,
  `.bits/srs_registry.yml`, `.bits/queue/VCC-BUILDANDDO-CAREER-001.md`,
  `.bits/context.lock.json`, `.bits/out/VCC-BUILDANDDO-CAREER-001/**`, and
  `.bits/hostinger-readiness.lock.json` (source-review refresh only; `apps/` is
  governed source, and no milestone rationale, owner, check or next action changes).
- Files it must not touch: existing application, PocketBase, web, CI,
  authority policy, migrations, deployment and private-plane files.
- Anything that would raise risk above A1: network access beyond the opt-in GET
  to the three allow-listed public posting endpoints, authenticated ATS APIs,
  browser runners, submission, credential or personal-data storage, persisted
  schema, staging or production deployment.

## Smoke test

```bash
python tests/career/check_career.py
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status remains `in_progress` until merge verification.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
