# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-EVIDENCE-CI-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-EVIDENCE-CI-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     services/praxis_evidence/run_all_tests.py
# EnumType:    Doc
# EnumEdges:   CONSUMES services/praxis_evidence/run_all_tests.py; GATES pull_request
# Intent:      Specify how an existing, unexecuted test suite becomes a real public gate.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-EVIDENCE-CI-001 — Praxis evidence suite in public CI

**Status:** proposed **Risk:** A2 **Seat:** unassigned

## Problem

`services/praxis_evidence/` ships fourteen selftest modules and an aggregating
entrypoint, `run_all_tests.py`. Its own docstring says it is "wired into the
GitLab CI pipeline so a push that breaks the evidence fabric fails the pipeline,
not just a manually-run script nobody remembers to run." CONTRIBUTING.md tells
contributors to run it before opening a PR.

No GitHub Actions workflow executes it. On the public collaboration plane — the
one where outside contributors actually open PRs — the evidence fabric is exactly
the script nobody remembers to run. `scripts/ci/agent_context.py` reports it as an
unwired gate on every run.

The suites are not mocked: they exercise a live PocketBase. That is why they were
never wired here, and it is the real problem this SRS has to solve.

## Intent

Either run the evidence suite on the public plane against an ephemeral backend,
or make its absence explicit and measured. Silence is the one unacceptable outcome.

## Scope

Preferred path — ephemeral backend:

- A workflow job that provisions PocketBase at a pinned version, applies
  `apps/pocketbase/pb_migrations`, and runs `run_all_tests.py` against it.
- Emit JUnit XML into `reports/junit/` so the existing Datadog upload covers it
  with no further CI changes.
- Seed data must be synthetic and public-safe. Golden data stays on GitLab.

Fallback path, if an ephemeral backend proves impractical:

- A `evidence:skipped` marker metric published every run, so the gap is visible
  as a metric rather than as nothing at all, plus a documented statement in
  CONTRIBUTING.md that the suite is GitLab-only.

## Out of scope

- Rewriting suites to use mocks. These tests are valuable precisely because they
  hit a real backend; weakening them to make CI easy inverts the trade.
- Any use of production or staging credentials in a public workflow.

## Acceptance evidence

1. A deliberately broken evidence module fails the PR pipeline — demonstrate it.
2. Suite results appear in Datadog test visibility tagged `service:praxis-evidence`.
3. `python scripts/ci/agent_context.py` no longer reports `run_all_tests.py`
   as unwired, or reports the documented fallback state.

## Verification

```bash
python services/praxis_evidence/run_all_tests.py
python scripts/ci/agent_context.py | grep run_all_tests
```

## Notes for the implementing agent

Risk is A2 because it starts a backend process in CI. It stays A2 only while the
backend is ephemeral, synthetic and destroyed with the runner — pointing the
suite at shared staging would make it A3 and require human approval first.
