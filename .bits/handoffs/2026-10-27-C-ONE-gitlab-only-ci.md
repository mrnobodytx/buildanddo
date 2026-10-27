# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-10-27-C-ONE-gitlab-only-ci.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-GITLAB-ONLY-CI-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     .bits/srs/SRS-BUILDANDDO-GITLAB-ONLY-CI-001.md, .gitlab/ci/github-plane.yml
# EnumType:    Doc
# EnumEdges:   TRIGGERS cross-seat handoff
# Intent:      Give the operator the exact A3 steps that turn GitLab-only CI on.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-10-27 C-ONE -> repository operator

**Originating SRS:** SRS-BUILDANDDO-GITLAB-ONLY-CI-001 **Dispatch:** VCC-BUILDANDDO-GITLAB-ONLY-CI-001

## What was asked

"treat gitlabs as only ci then merge then removing the dependancy on github actions"

## Why it cannot be done on the public plane

Turning it on needs tokens, GitLab CI/CD variables, pipeline schedules, a protected branch and
a change to GitHub's Actions setting. All of these are secrets or external settings (A3). The
agent seat could not reach the GitLab API. The GitHub Actions settings endpoint is also closed
to it.

## What was done instead

The repository side is merged. No GitHub workflow remains, and GitLab has every job (see the
SRS). Until the steps below are done, nothing reaches GitLab automatically, and PRs show no
`gitlab-ci/buildanddo` status.

## What the receiving seat needs to do

1. **Create three tokens.**
   - GitLab project access token on the buildanddo project (id 104): role Maintainer, scopes
     `write_repository` and `read_api`. This is `GITLAB_INGEST_TOKEN`.
   - GitHub fine-grained token on `mrnobodytx/buildanddo` with **Commit statuses: read and
     write** and **Pull requests: read**. This is `GITHUB_STATUS_TOKEN`.
   - GitHub fine-grained token on the same repository with **Contents: read and write**. It
     must be allowed to push to `main`; if `main` is protected, add it as a bypass actor. This
     is `GITHUB_WRITEBACK_TOKEN`.
2. **Add GitLab CI/CD variables** (Settings → CI/CD → Variables). Make the three tokens
   **masked and protected**. Add `DD_API_KEY` (masked) and `DD_SITE=us5.datadoghq.com`.
   Optionally add `CITADEL_STATE_DIR` and the other `CITADEL_*` paths the hourly telemetry
   job reads.
3. **Protect `buildanddo-source`** (Settings → Repository → Protected branches). Allowed to
   push: Maintainers. Leave force push off. If public `main` is ever rewritten, intake fails
   loudly instead of overwriting history.
4. **Bootstrap once.** The schedule runs the CI file already on `buildanddo-source`, so the
   first intake has to run from a machine that holds the GitLab token:

   ```bash
   GITLAB_INGEST_TOKEN=... GITLAB_INGEST_REPO_URL=<project clone URL> \
   GITLAB_API_URL=<GitLab API v4 URL> GITLAB_PROJECT_ID=104 \
   python scripts/ci/gitlab_plane.py intake
   ```

   Expect `PROPAGATION VERIFIED`. That push starts the first `buildanddo-source` pipeline.
5. **Create pipeline schedules** (Build → Pipeline schedules), all targeting `buildanddo-source`:

   | Description | Cron | Variable |
   |---|---|---|
   | GitHub intake | `*/10 * * * *` | `SCHEDULE_TASK=intake` |
   | Stack telemetry | `17 * * * *` | `SCHEDULE_TASK=telemetry` |
   | Weekly supply chain | `23 8 * * 1` | `SCHEDULE_TASK=supply_chain` |

6. **On GitHub**, disable Actions (Settings → Actions → General → Disable actions). Then make
   `gitlab-ci/buildanddo` the required status check on `main`, in place of any old Actions
   check names. If those old names stay required, every PR blocks forever.
7. **Fork PRs.** A PR from a fork is held, with a pending status, until a maintainer has read
   it. To run it, push its head yourself:
   `git push <gitlab> <sha>:refs/heads/review/pr-<N>`.

**Verification:** after step 5, the next intake run logs `PROPAGATION VERIFIED` and
`STATUS: n commit status(es) updated`. The head of `main` on GitHub then shows
`gitlab-ci/buildanddo`. After the next merge, `main` gets the
`docs(changelog): refresh from main history [skip ci]` commit from `BuildAndDo CI Bot`.
`CHANGELOG.md` has been stale since Actions stopped.

## Findings recorded, not fixed

- `scripts/ci/datadog_publish.py` still tags everything `source:github-actions`. It is left
  alone so existing dashboards and monitors keep matching. Renaming it is a separate,
  dashboard-wide change.
- On `sprint/*` branches without a merge request, `day21_governance` fails by design
  ("Candidate pipelines require GitLab merge-request metadata..."). This predates this change.

## Blocking

Public work does not stop. Merges on GitHub still work. Until steps 1–6 are done, no CI runs on
them and `main`'s bookkeeping files stay stale.
