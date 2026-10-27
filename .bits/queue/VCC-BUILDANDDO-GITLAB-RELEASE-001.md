# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-GITLAB-RELEASE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-GITLAB-RELEASE-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     .bits/srs/SRS-BUILDANDDO-GITLAB-RELEASE-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-GITLAB-RELEASE-001-* branches
# Intent:      Track shipping buildanddo.com from GitLab after every merge.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-GITLAB-RELEASE-001

**SRS:** SRS-BUILDANDDO-GITLAB-RELEASE-001 **Risk:** A2 source / A3 activation **Seat:** C-ONE **Status:** in_progress

## Objective

A merge to `main` reaches buildanddo.com without anyone running the release rail by hand, and
only through the rail's existing staging readback and digest checks.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | `release` stage with staging and production jobs, protected-ref and opt-in rules | `python -m unittest tests.deploy.test_release_lane` | done |
| 2 | Runner-supplied known_hosts for ssh and rsync, host-key checking still strict | `python -m unittest tests.deploy.test_release_lane tests.deploy.test_release_telemetry` | done |
| 3 | Lane tests run in `source_assurance` | `python -m unittest tests.deploy.test_release_telemetry` | done |
| 4 | Locks, readiness binding and docs | `python scripts/ci/agent_context.py --check && python scripts/ci/hostinger_readiness.py --check` | done |
| 5 | Operator: deploy variables and `BUILDANDDO_DEPLOY_ENABLE=1` | `release_production` receipt reads `VERIFIED_PRODUCTION` | blocked |

## Constraints

- Files this dispatch may touch: `.gitlab-ci.yml`, `.gitlab/ci/release.yml`,
  `.gitlab/ci/source-validation.yml`, `tools/buildanddo_release.py` (host-key option only),
  `tests/deploy/`, the readiness contract, README, AGENTS.md, CLAUDE.md, `.bits/context.md`
  and the generated locks.
- Files it must not touch: application code, `scripts/deploy/ship.py`, and any check the
  release rail already performs.
- Anything that would raise the risk tier: creating keys, CI variables or runner settings.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [x] Registry status updated for the SRS code.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
