# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/observability/datadog-ci.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-CI-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     .github/actions/datadog-ci-report/action.yml, .github/workflows/datadog-dora.yml
# EnumType:    Doc
# EnumEdges:   VALIDATES .github/workflows/datadog-dora.yml
# Intent:      Document the secrets and Datadog-side setup CI Visibility and DORA require.
# ───────────────────────────────────────────────────────────────

# Datadog CI Visibility and DORA metrics

BuildAndDo reports its GitHub Actions pipelines to the Citadel Nexus Datadog org
on **us5.datadoghq.com**.

## Required GitHub Actions secrets

| Secret       | Value                | Purpose                                             |
|--------------|----------------------|-----------------------------------------------------|
| `DD_API_KEY` | Datadog API key      | Authenticates git metadata, test and DORA uploads.   |
| `DD_SITE`    | `us5.datadoghq.com`  | Datadog site. Optional — workflows default to it.    |

Set them under **Settings → Secrets and variables → Actions**. Until `DD_API_KEY`
exists every Datadog step logs `SKIP:` and exits zero, so pipelines never fail
because observability is not wired up yet.

## What reports today

- **Git metadata** — uploaded from every PR and main-branch run so Datadog can
  resolve commits, authors and file paths for CI and test results.
- **Test visibility** — any JUnit XML written to `reports/junit/` is uploaded
  with `service=buildanddo-web`, `env=ci`. No test runner is wired up yet; when
  one lands (vitest: `--reporter=junit --outputFile=reports/junit/web.xml`) it is
  picked up automatically with no workflow change.
- **DORA deployments** — `Datadog DORA Deployment` runs after a successful
  main-branch `BuildAndDo Candidate to GitLab` run and sends a deployment event
  for `service=buildanddo-web`, `env=production`, using the candidate run's real
  start and finish timestamps. Failed candidate runs produce no deployment event,
  so deployment frequency stays honest.

## Pipeline traces require the Datadog GitHub App

Full GitHub Actions pipeline traces (job/step spans, queue time, failed-job
attribution) are ingested by the Datadog GitHub integration, not by anything a
repository can install itself. An org admin must, once:

1. Open **Integrations → GitHub** in the us5 Datadog org.
2. Install the Datadog GitHub App on the `mrnobodytx` account and grant it
   access to `buildanddo`.
3. Enable **Enable GitHub Actions CI Visibility** for the repository.

Change failure rate and lead time in the DORA dashboard derive from those
pipeline events plus the deployment events above, so both halves are needed.

## Verifying

After the secrets exist and the GitHub App is installed:

- CI Visibility → Pipelines, filter `@ci.pipeline.name:"BuildAndDo PR Governance"`.
- Software Delivery → DORA Metrics, filter `service:buildanddo-web env:production`.
- CI Visibility → Tests, filter `service:buildanddo-web` (once a test runner exists).
