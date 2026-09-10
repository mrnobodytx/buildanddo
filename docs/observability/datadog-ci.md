# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/observability/datadog-ci.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-CI-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     .github/actions/datadog-ci-report/action.yml, .github/workflows/datadog-dora.yml,
#              scripts/ci/telemetry_snapshot.py, scripts/ci/telemetry_delta.py,
#              scripts/ci/datadog_publish.py
# EnumType:    Doc
# EnumEdges:   VALIDATES .github/workflows/datadog-dora.yml;
#              VALIDATES .github/actions/datadog-ci-report/action.yml
# Intent:      Document what BuildAndDo measures per pipeline run, and what an operator must configure.
# ───────────────────────────────────────────────────────────────

# Datadog CI telemetry, deltas and DORA

Every GitHub Actions run measures itself, compares the result against the last
successful `main` build, and ships metrics, deltas, events, logs, git metadata
and test results to the Citadel Nexus Datadog org on **us5.datadoghq.com**.

## Required GitHub Actions secrets

| Secret       | Value                | Purpose                                            |
|--------------|----------------------|----------------------------------------------------|
| `DD_API_KEY` | Datadog API key      | Authenticates metric, event, log, test and DORA submissions. |
| `DD_SITE`    | `us5.datadoghq.com`  | Datadog site. Optional — workflows default to it.  |

Set them under **Settings → Secrets and variables → Actions**. Until `DD_API_KEY`
exists every Datadog step logs `SKIP:` and exits zero, so pipelines never fail
because observability is not wired up yet.

## Pipeline flow

`.github/actions/datadog-ci-report` runs in both pipelines and performs one pass:

1. **Collect** — `scripts/ci/telemetry_snapshot.py` measures the build output,
   dependency graph, tracked source, JUnit results, ESLint and knip reports, the
   public-boundary scan and the run itself into one JSON snapshot.
2. **Baseline** — the newest non-expired `buildanddo-telemetry-main` artifact is
   downloaded. Absent (first run, expired), the run reports absolute values only.
3. **Compare** — `scripts/ci/telemetry_delta.py` diffs the two snapshots, applies
   per-metric thresholds and writes the job-summary table plus a delta report.
4. **Publish** — `scripts/ci/datadog_publish.py` submits gauges, `.delta` gauges,
   one event and structured logs; `datadog-ci` uploads git metadata, JUnit results
   and pipeline-level measures.
5. **Persist** — the snapshot is uploaded as an artifact. Main-branch runs
   overwrite the baseline every PR is measured against.

## Metric catalog

All under the `buildanddo.ci.` prefix, tagged
`service`, `env`, `pipeline`, `branch`, `repository`, `workflow`, `job_status`,
`source:github-actions`. Each comparable metric also emits a `.delta` companion.

| Group      | Metrics                                                                                   |
|------------|-------------------------------------------------------------------------------------------|
| `bundle.`  | `total_bytes`, `gzip_bytes`, `js_bytes`, `css_bytes`, `html_bytes`, `other_bytes`, `file_count`, `js_chunk_count`, `largest_asset_bytes` |
| `deps.`    | `direct_production`, `direct_development`, `locked_packages`, `workspaces`                  |
| `source.`  | `tracked_files`, `code_files`, `code_lines`                                                 |
| `change.`  | `files_changed`, `lines_added`, `lines_removed`, `commits` (against the merge base)         |
| `tests.`   | `total`, `passed`, `failed`, `skipped`, `duration_seconds`, `report_files`                  |
| `lint.`    | `errors`, `warnings`, `files_with_findings`, `files_scanned`                                |
| `knip.`    | `unused_files`, `unused_dependencies`, `unused_exports`, `unlisted_dependencies`            |
| `boundary.`| `files_checked`, `failures`, `passed`                                                       |
| `governance.`| `findings`, `findings_high`, `unwired_gates`, `srs_open`, `srs_total` (from `.bits/context.lock.json`) |
| `pipeline.`| `runs`, `succeeded`, `duration_seconds`, `attempt`                                          |

Deployments publish `buildanddo.cd.deployment.count`, `.duration_seconds` and
`.lead_time_seconds` (commit authorship to deployment completion), tagged
`env:production`.

`branch` is deliberately low cardinality: pull-request runs are tagged
`branch:pull-request` and the real branch travels on the event and the log
instead. Do not widen this without checking custom-metric volume.

## Regression thresholds

`scripts/ci/telemetry_delta.py` flags a metric only when a change clears **both**
an absolute and a relative tolerance, so routine drift stays quiet:

| Metric                       | Absolute | Relative | Bad direction |
|------------------------------|---------:|---------:|---------------|
| `bundle.gzip_bytes`          | 25 KB    | 2%       | up            |
| `bundle.total_bytes`         | 100 KB   | 5%       | up            |
| `bundle.js_bytes`            | 75 KB    | 5%       | up            |
| `bundle.largest_asset_bytes` | 75 KB    | 5%       | up            |
| `deps.direct_production`     | 0        | 0%       | up            |
| `deps.locked_packages`       | 25       | 5%       | up            |
| `lint.errors`                | 0        | 0%       | up            |
| `lint.warnings`              | 10       | 10%      | up            |
| `knip.unused_files`          | 0        | 0%       | up            |
| `knip.unused_dependencies`   | 0        | 0%       | up            |
| `tests.failed`               | 0        | 0%       | up            |
| `tests.total`                | 0        | 0%       | down          |
| `boundary.failures`          | 0        | 0%       | up            |
| `governance.findings_high`   | 0        | 0%       | up            |
| `governance.unwired_gates`   | 0        | 0%       | up            |

Regressions surface as GitHub warning annotations, a job-summary section, a
`warning` Datadog event and `warn`-level logs. They do **not** fail the build:
the pipelines run in report-only mode. Pass `--fail-on-regression` to the delta
script to turn any group into a hard gate once the baselines are trusted.

## Running it locally

No network calls happen without `DD_API_KEY`, and `--dry-run` prints the exact
payloads instead of sending them:

```bash
npm run build
python scripts/ci/telemetry_snapshot.py --pipeline local --output reports/telemetry/snapshot.json
python scripts/ci/telemetry_delta.py --current reports/telemetry/snapshot.json \
  --baseline reports/telemetry/baseline.json
python scripts/ci/datadog_publish.py --snapshot reports/telemetry/snapshot.json \
  --delta reports/telemetry/delta.json --dry-run
```

## Pipeline traces require the Datadog GitHub App

Full GitHub Actions pipeline traces (job/step spans, queue time, failed-job
attribution) are ingested by the Datadog GitHub integration, not by anything a
repository can install itself. Metrics, events, logs and DORA above work without
it; pipeline spans and the `datadog-ci measure` values attached to them do not.
An org admin must, once:

1. Open **Integrations → GitHub** in the us5 Datadog org.
2. Install the Datadog GitHub App on the `mrnobodytx` account and grant it
   access to `buildanddo`.
3. Enable **Enable GitHub Actions CI Visibility** for the repository.

## Verifying

- Metrics Explorer: `buildanddo.ci.bundle.gzip_bytes` and its `.delta` companion.
- Events: `sources:github tags:service:buildanddo-web`.
- Logs: `source:github-actions service:buildanddo-web`.
- Software Delivery → DORA Metrics: `service:buildanddo-web env:production`.
- CI Visibility → Pipelines and Tests (after the GitHub App install).

## Suggested monitors

- `buildanddo.ci.bundle.gzip_bytes.delta` over `pipeline:main` above 25 KB — a
  single merge inflating the shipped bundle.
- `buildanddo.ci.regressions` above 0 on `pipeline:main` — a regression reached
  the default branch.
- `buildanddo.ci.pipeline.succeeded` average below 0.9 — pipeline health.
- `buildanddo.cd.deployment.lead_time_seconds` p95 trend — DORA lead time.
