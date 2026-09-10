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
#              .github/workflows/evidence-epoch.yml, scripts/ci/telemetry_snapshot.py,
#              scripts/ci/telemetry_delta.py, scripts/ci/datadog_publish.py,
#              scripts/ci/evidence_epoch.py
# EnumType:    Doc
# EnumEdges:   VALIDATES .github/workflows/datadog-dora.yml;
#              VALIDATES .github/actions/datadog-ci-report/action.yml;
#              VALIDATES .github/workflows/evidence-epoch.yml;
#              VALIDATES scripts/ci/evidence_epoch.py
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
`env:production`. Evidence epochs publish `buildanddo.epoch.*` — see
[Evidence epochs](#evidence-epochs).

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

## Evidence epochs

Everything above measures a run. An **evidence epoch** fingerprints one, and
that is a different job.

The metrics and artifacts a run produces have a retention window — 14 days for
PR evidence, 30 for candidates, 15 months for metrics. After that, the claim
"the artifact set attributed to commit `abc123` is the set that existed when it
merged" becomes unprovable, because an expired artifact and a substituted one
both look like absence. An epoch is the missing fingerprint: one SHA-256 Merkle
root over the whole evidence set, chained to the previous root, published where
it outlives the artifacts.

`BUILDANDDO_CANDIDATE_PROVENANCE.json` gets close — it hashes every tracked file
and self-hashes the manifest — but it covers source rather than build output, and
it is regenerated per run with no link to its predecessor, so it witnesses only
itself.

**An epoch has no authority.** Nothing in any pipeline gates on one. A failed
epoch or a failed publication never fails a build or a deploy, for the same
reason the rest of this document's telemetry cannot: observability must not be
able to break the thing it observes.

### What produces one

| Trigger              | Producer                                | `trigger` value      |
|----------------------|-----------------------------------------|----------------------|
| Push to `main`       | `.github/workflows/evidence-epoch.yml`  | `merge`              |
| Manual dispatch      | same workflow, `workflow_dispatch`      | `manual`             |
| Production promote   | `scripts/deploy/ship.py`, after the production probe returns 200 | `production_deploy` |

Epoch manifests are written to `state/epochs/` — gitignored, and boundary-
forbidden, so they never reach the public plane. Only the chain head,
`scripts/ci/epoch_chain.json`, is committed. That is deliberate: it makes the
chain reconstructable from this one file's git history, with no dependency on
artifact retention or on Datadog.

### What the root covers

| Leaf                                       | Why it is in the set                         |
|--------------------------------------------|----------------------------------------------|
| `dist/apps/web/**`                         | the bytes that actually ship                 |
| `BUILDANDDO_SOURCE_PROVENANCE.json`        | where the source came from                   |
| `BUILDANDDO_CANDIDATE_PROVENANCE.json`     | per-file source hashes at candidate time     |
| `package-lock.json`                        | the resolved dependency tree                 |
| `.buildanddo/public/boundary-report.json`  | the public/private boundary verdict          |
| `.bits/context.lock.json`                  | the measured governance state                |
| `reports/telemetry/*.json`                 | the run's own metrics and deltas             |
| `reports/junit/**`                         | test results, when a runner produces any     |
| `git://commit` (synthetic)                 | binds sha, branch, author and commit time    |
| `chain://previous` (synthetic)             | binds the previous root, making it a chain   |

Absent sources are recorded as absent rather than failing the run, and the
manifest's `sources` array says exactly which were present. An epoch over a
partial set is worth more than no epoch, provided it does not lie about what it
covered.

### Hash construction (`sha256-merkle-v1`)

A root nobody else can recompute is not evidence, so the construction is fixed:

```
content digest  sha256(file bytes), lowercase hex
leaf digest     sha256("buildanddo-leaf\0" + path + "\0" + content_hex)
ordering        leaf digests sorted ascending as hex
pairing         sha256("buildanddo-node\0" + left||right) over raw 32-byte digests
odd node        carried up unchanged, never duplicated
empty set       sha256("buildanddo-empty")
```

Two properties matter. Leaves are ordered by digest, not by discovery, because
discovery order is a property of the runner rather than of the evidence. And
`created_at` is recorded in the manifest but is **not** an input to the root — a
fingerprint that changes when nothing changed proves nothing. Two runs over an
unchanged tree at the same chain position produce the same root.

The odd node is carried rather than duplicated on purpose: duplicating the last
node is the classic Merkle malleability bug, where two different leaf sets fold
to one root.

### What Datadog receives

One event per epoch, with `source_type_name: buildanddo`:

```
title  Evidence Epoch Created: EPOCH-20260910-01
text   Root, previous epoch and root, artifact count and bytes, chain length,
       commit, trigger, self-verification result, the recompute command, run URL
tags   epoch_id:<id>  git_sha:<sha>  trigger:<merge|production_deploy|manual>
       source:evidence_epoch  anchor:pending  deploy:production (ship.py only)
       plus the standard service/env/pipeline/branch tags
```

Five metrics:

| Metric                            | Type  | Meaning                                     |
|-----------------------------------|-------|---------------------------------------------|
| `buildanddo.epoch.root_created`   | count | one per epoch; sums to epochs in a window   |
| `buildanddo.epoch.artifacts`      | gauge | leaves in the tree, including synthetic     |
| `buildanddo.epoch.artifact_bytes` | gauge | total bytes fingerprinted                   |
| `buildanddo.epoch.verified`       | gauge | 1 when the root recomputes from its manifest, else 0 |
| `buildanddo.epoch.chain_length`   | gauge | epochs recorded in the chain so far         |

Plus one `info` log carrying the root, the artifact count and the verification
result.

`anchor:pending` is on every epoch, not only deploys. Publishing a root to an
external witness needs a funded signing key, which is deployment authority and
lives on the GitLab mirror; until an anchor step exists, every epoch this
repository can produce is unanchored, and tagging only some of them would imply
the rest were witnessed.

### Verifying an epoch

Self-verification runs inside the workflow and is what
`buildanddo.epoch.verified` reports. To check one by hand, from the manifest
artifact:

```bash
# recompute the root from the manifest's artifact list alone
python scripts/ci/evidence_epoch.py --verify state/epochs/EPOCH-20260910-01.json

# additionally re-hash every artifact still present on disk
python scripts/ci/evidence_epoch.py --verify state/epochs/latest.json --recheck-files
```

Verification needs only the manifest, because a leaf digest is a function of
`path` and `digest`. A third party can therefore check that the tree is
internally consistent without holding the artifacts, and check the artifacts
separately when they do have them.

To walk the chain, read `scripts/ci/epoch_chain.json` and then its own git
history:

```bash
git log --follow -p -- scripts/ci/epoch_chain.json
```

### Dashboard

`scripts/ci/evidence_dashboard.json` is an importable definition covering the
epoch timeline, artifact counts, verification status, and epoch creation overlaid
on DORA deployments and build health. Import it with **Dashboards → New →
Import JSON**, or:

```bash
npx --yes @datadog/datadog-ci@^2 dashboard upsert --file scripts/ci/evidence_dashboard.json
```

One caveat is baked into that file. `source` is a reserved field in both event
search (`source_type_name`) and log search (`ddsource`), so a query for
`source:evidence_epoch` does not reliably select the tag of that name. The event
widget matches `source:buildanddo OR source:evidence_epoch` so it works under
either interpretation, and the log widget filters on the unreserved `trigger`
tag instead.

### Running it locally

```bash
npm run build
python scripts/ci/verify_public_boundary.py       # produces a boundary leaf
python scripts/ci/evidence_epoch.py --trigger local --dry-run
```

`--dry-run` computes the root and writes nothing — no manifest, and no change to
the committed chain head. Use `--no-chain-update` to write a manifest while
leaving the chain alone.

### Suggested monitors

- `buildanddo.epoch.verified` below 1 — a published root does not recompute,
  which is a defect in the epoch script, not a build problem.
- `buildanddo.epoch.root_created` at 0 over 7 days while
  `buildanddo.cd.deployment.count` is above 0 — deploys are happening without
  epochs, so the chain has a gap.
- `buildanddo.epoch.artifacts` dropping sharply — the build output or a
  provenance file stopped being produced, and the root now covers less than it
  did.

### Not in scope here

External anchoring (publishing `root_digest` to a public chain) and manifest
signing both need keys that are not public-plane assets. The manifest carries an
`anchor` block with `state: pending` so that step is additive: it consumes
`root_digest` and nothing else. `.bits/srs/SRS-BUILDANDDO-EPOCH-001.md` holds the
spec and states why anchoring is excluded.

The witness design itself lands in `docs/architecture/EVIDENCE_WITNESS.md`, which
is authored separately and is **not present in this repository yet** — this
sentence is the pointer, not a claim that the file exists. Check before citing it.

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
- Evidence epochs: `buildanddo.epoch.root_created` in Metrics Explorer, and the
  `BuildAndDo Evidence Epochs` dashboard.

## Suggested monitors

- `buildanddo.ci.bundle.gzip_bytes.delta` over `pipeline:main` above 25 KB — a
  single merge inflating the shipped bundle.
- `buildanddo.ci.regressions` above 0 on `pipeline:main` — a regression reached
  the default branch.
- `buildanddo.ci.pipeline.succeeded` average below 0.9 — pipeline health.
- `buildanddo.cd.deployment.lead_time_seconds` p95 trend — DORA lead time.
