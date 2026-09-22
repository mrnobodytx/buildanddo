# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-CAREER-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     AGENTS.md, docs/architecture/CAPABILITY_PASSPORT.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-CAREER-001-* branches; DEPENDS_ON docs/architecture/CAPABILITY_PASSPORT.md
# DAG Node:    none
# Intent:      Specify a local career evidence engine that derives role matches and application packages only from recorded work, with explicit participation and human-reserved attestations.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-CAREER-001 — Career evidence engine, vertical slice 1

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

Keyword résumé matching asks whether a document contains words. The owner wants
the inverse question answered: can recorded work prove a person has already
performed at or above a role's requirements? Answering it honestly requires the
distinction between work a person implemented, reviewed, directed or verified
and work an agent executed, and it requires refusing to state what the record
does not show.

## Intent

Provide a dependency-free, CPU-only local pipeline:

```text
git history + human attestations
        -> Career Passport (per-capability evidence with participation)
        -> supplied job postings -> requirement extraction
        -> Requirement Coverage Map -> Match Dossier (with DO NOT CLAIM)
        -> Application package (every claim carries evidence references)
```

## Scope

- Add `apps/career/` with a capability taxonomy, git-history ingestion,
  participation classification, attestation handling, passport construction,
  job normalization, requirement extraction, coverage mapping, dossiers, a
  J0–J5 application authority policy and a deterministic application compiler.
- Add a CLI: `python -m apps.career passport` and `python -m apps.career evaluate`,
  writing only to a new local output directory.
- Add synthetic job fixtures, unit tests and a statement-coverage gate.

## Out of scope

- Live job discovery, ATS APIs, browser automation or any network access.
- Application submission, form filling or any external write (A3).
- Inferring answers to reserved questions: work authorization, clearance,
  criminal history, compensation, relocation, contract acceptance, background
  check consent, disability, veteran or demographic disclosure.
- Language-model generation; persisted schema; PocketBase, web or CI changes.

## Invariants

- A person receives credit only for commits they authored (`PERSONALLY_IMPLEMENTED`)
  or integrated through their own merge (`REVIEWED`). Agent-authored work that a
  person did not integrate yields no personal credit and is counted as excluded.
- `DESIGNED`, `DIRECTED`, `PERSONALLY_OPERATED` and `VERIFIED` enter only through
  explicit attestations. An attestation is `VERIFIED` only with a verifier distinct
  from the person and a receipt reference; otherwise it is `DECLARED`.
- Git evidence is `OBSERVED`, never `VERIFIED`: a repository record shows work
  occurred, not that an independent party verified it.
- Claim wording is bounded by participation: reviewed work is never phrased as
  personally authored; agent-executed work is never claimable by a person.
- Tenure requirements are never satisfied from repository history; the observed
  evidence span is reported beside the nominal gap.
- Every dossier carries a non-empty `do_not_claim` list. Every compiled claim has
  at least one evidence reference that exists in the passport.
- Reserved questions return `HUMAN_REQUIRED` unless the human stored an answer
  explicitly marked reusable; the compiler never produces those answers.
- The compiler's maximum authority is J2. J3 and J4 are policy decisions only;
  an anti-bot challenge always yields a human stop, never a bypass.

## Acceptance evidence

1. `python tests/career/check_career.py` passes all behavior tests and reports at
   least 80 percent statement coverage for every `apps/career` module.
2. `python -m unittest tests.career.test_career` covers participation, merge
   integration, attestations, extraction, coverage, dossiers, authority and
   package validation.
3. `python -m apps.career passport --repo . --identity <file> --output <new-dir>`
   runs against this repository's own history.
4. `python scripts/ci/verify_public_boundary.py` reports `PASS`.
5. `python scripts/ci/agent_context.py --check` reports a current context lock.

## Rollback

Remove `apps/career`, `tests/career`, `tests/fixtures/career`, this spec and its
dispatch, registry and output entries. No schema or persisted state is involved.
