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

Slice 2 (same SRS, same PR):

- BuildAndDo mission evidence as a passport source, from an exported snapshot of
  `missions`, `evidence` and `suite_runs` records.
- Public job-board discovery adapters for Lever, Greenhouse and Ashby posting
  feeds (J0), from a saved payload or an opt-in HTTPS GET to those three
  allow-listed endpoints, with refresh diffs.
- Digest-verified reload of written application packages.
- An append-only outcome ledger recorded by the human, with funnel and
  per-dimension response reporting that refuses to rank small samples.
- Adversarial hardening (slice 3): AI/bot co-author detection, bot-identity
  refusal, reserved-class and tenure parsing fixes, negated requirements, a
  hash-chained outcome ledger, and `verify`, which lets a reviewer re-derive a
  passport's repository claims from a clone. `passport` also writes a shareable card.
- Portable claims and assessments (slice 4): import skills, certifications,
  positions and badges from a LinkedIn data export, JSON Resume or Open Badges
  2.0 assertions as SELF_REPORTED claims; issue, grade and re-grade capability
  quizzes from a grader-held bank; list which imported claims are assessed.
- Profile on login (slice 5, owner-directed): Citadel Nexus holds the person's
  career records; BuildAndDo requests the signed-in user's profile at login.
  `python -m apps.career profile` builds the `buildanddo.career.profile/v1`
  envelope Citadel serves. A native-authenticated PocketBase route
  `GET /api/buildanddo/career/profile` requests it server-to-server, validates
  it, binds it to the signed-in account and returns an allow-listed projection
  with `no-store`; it persists nothing. The web app loads it after login and
  clears it on logout or account change. The single existing-file edit is
  mounting the provider in `apps/web/src/App.jsx`.
- A J3 fill plan mapping an employer form's fields to profile, package or human
  sources, with fill and submit authority decisions. It is a plan, not a runner.

## Out of scope

- Network access other than an explicit `--allow-network` GET to the three public
  posting endpoints; authenticated ATS APIs.
- Browser automation, form filling, application submission or any external write (A3).
- Checking Open Badges issuer signatures or hosted assertions (needs network);
  a production question bank (a real bank's answer key must stay with the grader
  and out of this public repository; the committed bank is a sample).
- Encrypted storage of reserved answers: no encryption dependency is declared and
  the slice does not implement its own cryptography. Stored answers remain a
  human-supplied local input.
- Staging or production deployment (A3, separate human dispatch).
- Inferring answers to reserved questions: work authorization, clearance,
  criminal history, compensation, relocation, contract acceptance, background
  check consent, disability, veteran or demographic disclosure.
- Language-model generation; persisted schema; CI changes; PocketBase or web
  changes beyond the slice 5 route, client, provider and its mount.
- The Citadel Nexus profile endpoint itself, its storage and the service token
  (private plane; see the handoff). Setting the endpoint URL and token on a
  running PocketBase is an A3 operator action.

## Invariants

- A person receives credit only for commits they authored (`PERSONALLY_IMPLEMENTED`)
  or integrated through their own merge (`REVIEWED`). Agent-authored work that a
  person did not integrate yields no personal credit and is counted as excluded.
- `DESIGNED`, `DIRECTED`, `PERSONALLY_OPERATED` and `VERIFIED` enter only through
  explicit attestations. An attestation is `VERIFIED` only with a verifier distinct
  from the person and a receipt reference; otherwise it is `DECLARED`.
- A person-authored commit with a `Co-authored-by` trailer naming a bot or AI
  agent is `AGENT_ASSISTED` ("Built with AI agents:"), never sole authorship. A
  person identity may not include recognisable bot or agent addresses.
- A passport's repository claims are accepted only when `verify` re-derives them;
  a self-consistent digest is not evidence.
- Imported claims are `SELF_REPORTED` and `DECLARED`; endorsement counts never
  change a state. A badge whose recipient does not match the person is rejected.
  Declared employment is shown beside tenure requirements but never satisfies them.
- Assessment forms never carry answer keys. Attempts are limited per window,
  timed, recorded whether passed or failed in a hash-chained ledger, and
  re-gradable from the bank. An unproctored pass is `OBSERVED`; `VERIFIED`
  needs a proctor other than the candidate with a receipt.
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
- Mission records the person wrote are DECLARED, whatever their `type` says. A
  suite run is VERIFIED only when a reviewer other than its requester attached it
  with a result digest. Owner-set mission `status` is never used.
- Outcome events are recorded by a named human against a digest-verified package;
  stages only advance. Groups under ten applications are never ranked.
- BuildAndDo never stores a Citadel profile: the route writes no record, answers
  `no-store`, and the browser holds it in memory only. The route returns only
  allow-listed passport fields; anything else Citadel sends (answers, emails,
  evidence payloads) is dropped. A profile for a different subject is refused.
- The Citadel service token is read from the PocketBase environment and never
  reaches the browser. Without a configured endpoint the route reports
  `not_configured`, and login is unaffected.
- The compiler's maximum authority is J2. J3 and J4 are policy decisions only;
  an anti-bot challenge always yields a human stop, never a bypass.

## Acceptance evidence

1. `python tests/career/check_career.py` passes all behavior tests and reports at
   least 80 percent statement coverage for every `apps/career` module.
2. `python -m unittest tests.career.test_career tests.career.test_slice2` covers
   participation, merge integration, attestations, extraction, coverage, dossiers,
   authority, package validation, board normalization, mission verification,
   package tamper detection, the outcome ledger and fill plans.
   `tests.career.test_redteam` holds every adversarial failure as a regression.
   `tests.career.test_profile` covers the profile envelope;
   `node --test tests/upgrade/career-profile.test.mjs` runs the real route source
   against a Citadel double; `apps/web/src/lib/__tests__/careerProfile.test.js`
   and `apps/web/src/contexts/__tests__/CareerProfileContext.test.jsx` cover
   loading on login and clearing on logout.
   `tests.career.test_assessments` covers imports, hidden keys, limits, lateness,
   proctoring, re-grading and forged results.
3. `python -m apps.career passport --repo . --identity <file> --output <new-dir>`
   runs against this repository's own history.
4. `python scripts/ci/verify_public_boundary.py` reports `PASS`.
5. `python scripts/ci/agent_context.py --check` reports a current context lock.

## Rollback

Remove `apps/career`, `tests/career`, `tests/fixtures/career`, this spec and its
dispatch, registry and output entries. No schema or persisted state is involved.
