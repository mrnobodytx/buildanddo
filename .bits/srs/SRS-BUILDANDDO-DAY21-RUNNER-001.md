# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-DAY21-RUNNER-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-DAY21-RUNNER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DAY21-RUNNER-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     tools/day21/day21_acceptance.py, .gitlab/ci/day21-submission.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-DAY21-RUNNER-001-* branches; DEPENDS_ON tools/day21/day21_acceptance.py
# DAG Node:    none
# Intent:      Make the Day-21 acceptance job pass on the GitLab fleet runners without weakening it.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-DAY21-RUNNER-001 — Day-21 acceptance passes on the fleet runners

**Status:** in_progress **Risk:** A2 **Seat:** C-ONE

**Authorization:** on 2026-10-27 the repository owner chose "fix it properly" over making
`day21_full_acceptance` non-blocking. The job stays blocking; this SRS removes the reasons it
fails.

## Problem

`day21_full_acceptance` has failed on every GitLab pipeline since GitLab became the only CI
(jobs 104934, 104985, 105071, 105092, 105160). `main` is never green, so nothing auto-merges
and the release stage never runs. Job 105160 (runner 17, `main` at `e7c120d`) shows five
separate causes:

| Profile | Cause | Kind |
|---|---|---|
| `source_python` | `ModuleNotFoundError: yaml`; the acceptance venv never installs `foundry/shared/requirements.txt` | runner provisioning in code |
| `source_python` | `test_discovers_conventional_state_paths` reads the runner's own `CITADEL_FLEET_MANIFEST` | test isolation |
| `source_node` | two suites spawn `python`; the runner has only `python3` (`spawnSync python ENOENT`) | runner provisioning in code |
| `web_tests` | 13 files hit the 5 s test or 1 s query limit on a loaded runner and pass locally | timing |
| `web_tests` | three assertions disagree with the code on `main` (a split receipt sentence, the owner-only Publish control from SRS-BUILDANDDO-TRUST-001, and a user-event click that hangs under Vitest fake timers) | stale tests |
| native profiles | `permission denied` on `/var/run/docker.sock`: `gitlab-runner` is not in the `docker` group | host provisioning (operator) |

## Scope

- `tools/day21/day21_acceptance.py`: `--install-deps` also installs
  `foundry/shared/requirements.txt`, and source checks run with the acceptance interpreter's
  directory first on `PATH`, so `python` is that venv.
- `tests/upgrade/test_datadog_metrics.py`: strip `CITADEL_*` from the environment per test.
- `apps/web/vitest.config.js`: 30 s test and hook limits. `apps/web/src/test/setup.js`: 5 s
  Testing Library query limit. A hung test still fails.
- Three web tests corrected to the behaviour on `main`; no product code changes.

## Out of scope

- Adding `gitlab-runner` to the `docker` group on the fleet hosts (A3, operator).
- Making any acceptance profile optional.

## Acceptance

1. `python -m unittest tests.upgrade.test_day21_acceptance tests.upgrade.test_datadog_metrics` passes.
2. `npm test` passes: 980 web tests.
3. `node --test tests/upgrade/media-draft-import.test.mjs tests/upgrade/policy-intelligence.test.mjs` passes.
4. Repository checks (`agent_context`, `hostinger_readiness`, `submission_readiness`, `readme_check`,
   `verify_public_boundary`, `system_growth`) pass.
5. Live: after the operator's docker-group change, `day21_full_acceptance` passes on a
   `buildanddo-source` pipeline.
