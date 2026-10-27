# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-GITLAB-ONLY-CI-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-GITLAB-ONLY-CI-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GITLAB-ONLY-CI-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     AGENTS.md, .gitlab-ci.yml, scripts/ci/gitlab_ci.py, scripts/ci/verify_public_boundary.py
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-GITLAB-ONLY-CI-001-* branches; DEPENDS_ON .gitlab-ci.yml
# DAG Node:    none
# Intent:      Make GitLab the only CI system for BuildAndDo and remove every dependency on GitHub Actions.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-GITLAB-ONLY-CI-001 — GitLab is the only CI

**Status:** in_progress **Risk:** A2 **Seat:** C-ONE

**Authorization:** on 2026-10-27 the repository owner directed: "treat gitlabs as only ci then
merge then removing the dependancy on github actions". This SRS is that directive. It covers
shared CI configuration and governance (A2). Creating CI/CD variables, pipeline schedules and
tokens, and switching GitHub Actions off in the repository settings, are secret and external
writes (A3). This change does none of them; the operator steps are listed in the handoff.

## Problem

GitHub Actions on `mrnobodytx/buildanddo` stopped running: every job fails with "The job was
not started because your account is locked due to a billing issue." Eight workflows depended
on it:

| Workflow | What it did | Where it now runs |
|---|---|---|
| `pr-governance.yml` | Every gate on a PR head | GitLab pipelines on `review/pr-N` (existing jobs) |
| `candidate-to-gitlab.yml` | Pushed `main` to the GitLab intake branch | Scheduled `github_intake` job pulls it |
| `changelog.yml` | Committed `CHANGELOG.md` back to `main` | `main_writeback` job |
| `growth.yml` | Committed `.bits/growth.lock.json` back to `main` | `main_writeback` job |
| `evidence-epoch.yml` | Built the epoch and committed the chain head | `main_writeback` job |
| `citadel-stack-telemetry.yml` | Hourly Datadog stack metrics | Scheduled `stack_telemetry` job |
| `supply-chain.yml` | Weekly dependency audit | Scheduled `supply_chain_weekly` job |
| `datadog-dora.yml` | Reported a "deployment" whenever the GitHub candidate passed | Retired |

GitLab already ran every acceptance job. It could not see PRs, and nothing moved `main` into
it once the mirror workflow stopped.

## Scope

- **`scripts/ci/gitlab_plane.py`**, stdlib only, the single place that talks to GitHub:
  - `intake` mirrors GitHub `main` to the protected GitLab branch `buildanddo-source` and
    checks by SHA that GitLab holds the exact commit (the same-SHA invariant from the old
    mirror workflow). It mirrors each trusted open PR head to `review/pr-N`, and deletes
    review branches for closed PRs. A PR is trusted when its head is in the same repository
    or its author is an owner, member or collaborator. Fork heads are not mirrored
    automatically, because the shell runner would execute their code.
  - `status` posts each mirrored head's GitLab pipeline state to GitHub as the
    `gitlab-ci/buildanddo` commit status.
  - `review-event` exports the PR record bound to the checked-out head, so the existing
    `verify_public_boundary.py --gitlab-ci` actor-label gate runs unchanged on review
    pipelines.
  - `fetch-chain`, `epoch-publish` and `writeback` replace the three commit-back
    workflows. Writeback commits the changelog, evidence chain head and growth point to
    GitHub `main` with `[skip ci]`, each as its own commit, retrying when `main` moves.
  - `ci-report` ports the Datadog CI report action. Its baseline comes from GitLab
    artifacts.
- **`.gitlab/ci/github-plane.yml`**, included from `.gitlab-ci.yml`: the scheduled jobs
  (`SCHEDULE_TASK` = `intake`, `telemetry`, `supply_chain`), `main_writeback` and
  `ci_report`. Every job that holds a secret runs only on a protected ref.
- **Existing GitLab jobs** also run on `buildanddo-source` and `review/*`, and never in
  scheduled pipelines.
- **`verify_public_boundary.py`** treats `buildanddo-source` like the default branch. That
  branch is written only by intake, from public `main`, so it has no review context of its
  own.
- **`agent_context.py`** expands the plane's subcommands to the scripts they run, and
  reports a high finding if a GitHub workflow is reintroduced.
- **Deleted:** `.github/workflows/*` and `.github/actions/datadog-ci-report`. Kept:
  CODEOWNERS, issue templates and the PR template, which GitHub reads without Actions.

## Out of scope

- Creating GitLab CI/CD variables, schedules and access tokens; protecting
  `buildanddo-source`; disabling Actions in GitHub settings (A3, operator).
- Deployment. The release rail (`tools/buildanddo_release.py`, `scripts/deploy/ship.py`)
  never used GitHub Actions and is unchanged.
- DORA. The release controller already emits DORA after an external `/_version` readback.
  The GitHub workflow reported a successful build as a deployment, which overstated it.

## Acceptance

1. No file remains under `.github/workflows/` or `.github/actions/`.
2. `python -m unittest tests.upgrade.test_gitlab_plane tests.upgrade.test_gitlab_acceptance
   tests.upgrade.test_public_boundary tests.upgrade.test_datadog_metrics` passes.
3. `agent_context.py --check`, `hostinger_readiness.py --check`,
   `submission_readiness.py --check`, `readme_check.py --check` and
   `verify_public_boundary.py` pass.
4. The `source_python` readiness run shows no new failures against the main baseline.
5. Live acceptance is the first `github_intake` schedule run that mirrors `main` and posts a
   `gitlab-ci/buildanddo` status. That needs the A3 operator steps. Until then this SRS has
   source acceptance only.
