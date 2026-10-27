# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-GITLAB-RELEASE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-GITLAB-RELEASE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GITLAB-RELEASE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     tools/buildanddo_release.py, .citadel/release.public.json, .gitlab-ci.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-GITLAB-RELEASE-001-* branches; DEPENDS_ON tools/buildanddo_release.py
# DAG Node:    none
# Intent:      Ship every merged main from GitLab through the existing verified release rail.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-GITLAB-RELEASE-001 — Ship buildanddo.com from GitLab

**Status:** in_progress **Risk:** A3 (activation) / A2 (this change) **Seat:** C-ONE

**Authorization:** on 2026-10-27 the repository owner directed "do all 5 for build and do",
which included shipping buildanddo.com through the release rail. This SRS is that directive.
The source change is shared CI configuration (A2). Turning it on — the deploy credentials and
`BUILDANDDO_DEPLOY_ENABLE` — is A3 and stays with the operator.

## Problem

Production serves commit `5805bc9d`, built 2026-09-25. Everything merged since has passed CI
and gone nowhere, because the release rail (`tools/buildanddo_release.py`) only ever ran from an
operator's machine. Since SRS-BUILDANDDO-GITLAB-ONLY-CI-001, GitLab already runs every gate on
each merge to `main`; it stops one step short of shipping.

## Scope

- **`.gitlab/ci/release.yml`**, a new `release` stage after `test`:
  - `release_staging` runs `pipeline-stage`: build the exact commit, deploy staging, read
    `/_version` back and check the payload digest.
  - `release_production` runs `pipeline-promote` on the staging job's artifact: the same bytes
    go to production, are read back, and only then is DORA emitted.
  - Both run only on a push, web or API pipeline for the protected branch `buildanddo-source`,
    and only with `BUILDANDDO_DEPLOY_ENABLE=1`. Review pipelines run a PR's own CI file, so the
    protected-ref rule is what keeps deploy credentials away from unmerged code.
  - Production promotes on its own only with `BUILDANDDO_PROMOTE_PRODUCTION=1`; otherwise it
    is a manual job on the pipeline page.
  - `resource_group: buildanddo-release` serialises releases; neither job is interruptible.
  - The runner tag is `$BUILDANDDO_DEPLOY_RUNNER_TAG` (default `buildanddo`), so a runner on the
    web VM can deploy with `local_webroot` instead of SSH.
- **`tools/buildanddo_release.py`**: `BUILDANDDO_SSH_KNOWN_HOSTS` names a known_hosts file for
  ssh and rsync. `StrictHostKeyChecking=yes` is unchanged; a missing or empty file refuses.
- **Tests:** `tests/deploy/test_release_lane.py`, run by the `source_assurance` job.

## Out of scope

- Creating the deploy key, CI/CD variables or runner settings (A3, operator).
- Changing what the release rail checks. Every gate it already has applies unchanged.
- `scripts/deploy/ship.py`, which stays the operator's manual tool.

## Operator inputs (A3)

| Variable | Type | Value |
|---|---|---|
| `BUILDANDDO_VM_HOST` | variable, protected | `user@host` of the web VM, as in `secrets/deploy.local.env` |
| `BUILDANDDO_SSH_KEY` | file, protected | the deploy private key |
| `BUILDANDDO_SSH_KNOWN_HOSTS` | file, protected | `ssh-keyscan -t ed25519 <host>` output, checked against the VM |
| `VITE_BUILDANDDO_PH`, `VITE_DD_APPLICATION_ID`, `VITE_DD_CLIENT_TOKEN` | variable, protected | the public browser keys in `apps/web/.env` |
| `DD_API_KEY` | variable, protected, masked | optional; DORA is a HOLD without it, not a failure |
| `BUILDANDDO_DEPLOY_ENABLE` | variable | `1` |
| `BUILDANDDO_PROMOTE_PRODUCTION` | variable | `1` for hands-off production |

## Acceptance

1. `python -m unittest tests.deploy.test_release_lane tests.deploy.test_release_telemetry` passes.
2. `agent_context.py --check`, `hostinger_readiness.py --check`, `submission_readiness.py --check`,
   `readme_check.py --check` and `verify_public_boundary.py` pass.
3. Live acceptance: a `buildanddo-source` pipeline whose `release_production` receipt reads
   `VERIFIED_PRODUCTION`, and `https://buildanddo.com/_version` serving that pipeline's SHA.
   Until the operator inputs exist, this SRS has source acceptance only.
