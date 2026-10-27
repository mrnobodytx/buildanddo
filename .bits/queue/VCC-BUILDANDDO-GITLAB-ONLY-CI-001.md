# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-GITLAB-ONLY-CI-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-GITLAB-ONLY-CI-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     .bits/srs/SRS-BUILDANDDO-GITLAB-ONLY-CI-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-GITLAB-ONLY-CI-001-* branches
# Intent:      Track the move of every CI duty from GitHub Actions to GitLab.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-GITLAB-ONLY-CI-001

**SRS:** SRS-BUILDANDDO-GITLAB-ONLY-CI-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

GitLab runs every check, schedule and commit-back that GitHub Actions used to, and the
repository no longer contains a GitHub Actions workflow.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | GitHub plane orchestrator with unit tests | `python -m unittest tests.upgrade.test_gitlab_plane` | done |
| 2 | GitLab include with schedules, writeback and CI report; existing jobs see `buildanddo-source` and `review/*` | `python -m unittest tests.upgrade.test_gitlab_acceptance` | done |
| 3 | Boundary gate accepts the mirror branch and the exported review | `python -m unittest tests.upgrade.test_public_boundary` | done |
| 4 | Delete `.github/workflows` and the composite action; briefing flags reintroduction | `python scripts/ci/agent_context.py --check` | done |
| 5 | Readiness contract, README and agent docs name the GitLab files | `python scripts/ci/hostinger_readiness.py --check && python scripts/ci/readme_check.py --check` | done |
| 6 | No regression in the Python source suite | `python scripts/ci/hostinger_readiness.py --run source_python --evidence-dir reports/hostinger` | done |
| 7 | Operator: CI variables, schedules, protected branch, Actions disabled | first `github_intake` run posts `gitlab-ci/buildanddo` on `main` | blocked |

Task 7 is A3 and waits on the operator. The handoff
`.bits/handoffs/2026-10-27-C-ONE-gitlab-only-ci.md` lists every step.

## Constraints

- Files this dispatch may touch: `.github/workflows/`, `.github/actions/`, `.gitlab-ci.yml`,
  `.gitlab/ci/`, `scripts/ci/gitlab_plane.py`, `scripts/ci/agent_context.py`,
  `scripts/ci/verify_public_boundary.py`, the tests that read those files, the readiness
  contract, README, AGENTS.md, CLAUDE.md, `.bits/context.md`, the observability doc and the
  generated locks.
- Files it must not touch: deployment (`scripts/deploy/`, `tools/buildanddo_release.py`) and
  any application code.
- Anything that would raise the risk tier: creating tokens or CI variables, or changing
  GitHub or GitLab settings. Those belong to the operator.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status updated for the SRS code.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
