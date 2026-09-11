<!-- CGRF: SRS=SRS-BUILDANDDO-TENANT-RAIL-001 | CAPS=B | Seat=C-ONE -->
# BuildAndDo Release Lane

BuildAndDo is built in the open. The code anyone can read on GitHub is the
code that ends up on staging, and production only ever receives a release
that was cut from a GitHub `main` sha and re-verified on a private lane. This
document describes the product-side half of that contract: what
`scripts/deploy/ship.py` does, what it refuses to do, and how a served build
proves where it came from.

```text
   foundry (a developer machine or the release controller)
      |
      |  scripts/deploy/ship.py --stage-only          bound to a GitHub sha by a lane file
      v
   STAGING  serves /.well-known/citadel-release.json  lane = "github-staging"
      |
      |  (not this script) private release lane: intake verify -> build -> package -> verify
      v
   PRODUCTION serves /.well-known/citadel-release.json  lane = "gitlab-golden"
```

## Why the direct production line is closed

Until 2026-09-11 `ship.py` had one contract: build, gate, ship to staging,
probe, and if staging answered 200 copy the same build straight to production.
That meant production could be reached from a working tree that GitHub had
never seen. The release lane ends that: staging is the public GitHub truth
(it may only serve a sha that GitHub answered for) and production is released
from a private lane that starts from that same sha.

So the flag-less run now stops after the staging probe with
`stopped_at = "direct_production_refused"` and exit code 2. Staging is still
built, gated, shipped and probed; nothing touches production. The legacy line
still exists for a human who explicitly wants it:

```text
py -3.13 scripts/deploy/ship.py --direct-production-legacy
```

It is a deliberate, typed-out choice, and the manifest it ships says
`lane = "direct-legacy"` so any readback can tell it apart from a lane release.

## Modes

| Invocation | What runs | Exit |
| --- | --- | --- |
| `--stage-only` | bind -> manifest -> build -> gate -> staging sync -> staging probe | 0 on a staging 200, 1 otherwise, 2 on a bind refusal |
| *(no flags)* | the same, then `direct_production_refused` | 2 |
| `--direct-production-legacy` | the legacy full line (staging, then production, epoch, publication) | 0 / 1 |
| `--json PATH` | any of the above, plus a copy of the deploy record at PATH | unchanged |

## The lane file: how a staging build is bound to a GitHub sha

The release controller builds staging from a detached worktree of the GitHub
`main` sha it just read back from the GitHub API, and tells `ship.py` which sha
that is through one file:

```text
BUILDANDDO_RELEASE_LANE_FILE = <absolute path to a citadel.tenant-rail-lane/v1 JSON receipt>
```

When the variable is set, `ship.py` reads the file before anything is built:

- unreadable or not a `citadel.tenant-rail-lane/v1` object ->
  `stopped_at = "lane_file_invalid"`, exit 2, no build;
- `candidate_sha` is a full sha and is not `git rev-parse HEAD` ->
  `stopped_at = "bind_sha_mismatch"`, exit 2, no build, nothing synced,
  the record carries `bind.expected` and `bind.actual`;
- `candidate_sha` equals HEAD -> the build is bound: the manifest is stamped
  with `github_sha`, `github_ref`, `lane = "github-staging"` and the lane
  file's `lane_version`;
- `candidate_sha` is null -> nothing to bind to; the build proceeds as
  `lane = "unbound"` (recorded, not refused). A manifest only claims
  `github-staging` when a concrete GitHub sha equals HEAD.

Without the variable a `--stage-only` build is `lane = "unbound"`: a
developer preview that a readback gate will not mistake for a lane release.

## Environment names `ship.py` honours

Values are read by name and never printed or recorded.

| Name | Meaning | Default |
| --- | --- | --- |
| `BUILDANDDO_RELEASE_LANE_FILE` | the lane receipt described above | unset (unbound build) |
| `BUILDANDDO_SECRETS_FILE` | dotenv to read instead of `secrets/deploy.local.env`, so a worktree build reads the clone's secrets | `<root>/secrets/deploy.local.env` |
| `BUILDANDDO_STATE_DIR` | ledger directory (`history.jsonl`, `latest.json`) so worktree builds share one ledger | `<root>/state/deploy` |
| `CITADEL_EXECUTOR` | who is driving; stamped into the manifest and the record | `ship.py-direct` |
| `CITADEL_LANE_VERSION` | informational lane version; the lane file wins when both exist | unset |

`BUILDANDDO_SSH_KEY` (a key *path* inside the secrets file) resolves against
the clone that owns the secrets file when it is relative, so a build in a
detached worktree uses the same key file as a build in the clone. The record
stores the resolved path and which rule was used, never key material.

## The served release manifest (`citadel.release-manifest/v2`)

Every build writes `apps/web/public/.well-known/citadel-release.json`; Vite
copies `public/` verbatim into `dist`, so the file is served at
`/.well-known/citadel-release.json` on whichever surface received the build.
One schema, two writers: `ship.py` writes it for staging (and for the legacy
line); the private release lane writes the production variant of the same
schema. Readback gates compare the served file with what they expect.

| Key | Staging (`ship.py`) | Production (private lane) |
| --- | --- | --- |
| `schema` | `citadel.release-manifest/v2` | same |
| `tenant_id` | `buildanddo` | same |
| `commit` / `commit_full` | short and full sha of HEAD | same |
| `commit_message` | subject line, URL-like tokens redacted | same |
| `branch` | git branch, or the bound ref's name in a detached worktree | same |
| `package_version` | `apps/web/package.json` version | same |
| `built_at` | UTC ISO timestamp | same |
| `target` | `staging`, or `staging+production` for the legacy line | `production` |
| `shipped_by` | `scripts/deploy/ship.py` | the lane's manifest writer |
| `github_sha` / `github_ref` | from the lane file, else null | the GitHub sha the intake was cut from |
| `gitlab_project_id` / `gitlab_intake_sha` / `gitlab_package_name` / `gitlab_package_version` | always null | filled by the private lane |
| `lane` | `github-staging`, `unbound` or `direct-legacy` | `gitlab-golden` |
| `executor` | `CITADEL_EXECUTOR` or `ship.py-direct` | the lane executor |
| `lane_version` | lane file value, else `CITADEL_LANE_VERSION`, else null | the lane version |

Forbidden in the manifest: hostnames, URLs, secret names or values. The
writer redacts tokens in `commit_message` and `branch` that look like any of
those, and the test suite asserts the served payload stays clean.

## The deploy record

Every run appends one line to `history.jsonl` and rewrites `latest.json`
(and the `--json` receipt) with the real outcome of each stage. The v2 record
adds `executor`, `lane`, `lane_version`, `lane_file`, `bind {expected, actual,
ok}`, `manifest {schema, commit_full, github_sha}`,
`direct_production_legacy`, `remote_writes` (one per successful sync) and
`secret_values_persisted` (always 0). A record never says "deployed" without
the probe result that backs it.

## Candidate provenance

`scripts/ci/candidate_manifest.py` stamps `BUILDANDDO_CANDIDATE_PROVENANCE.json`
into the candidate commit that the private lane consumes. It now also records
who stamped it (`executor`), what that executor read back from GitHub before
stamping (`github_readback {sha, observed_at}`) and the `lane_version`.
`authority` stays `candidate_only` and `production_authority` stays `false`:
a candidate can prove where it came from, never that it may go live.

## Tests

```text
py -3.13 -m unittest tests.deploy.test_ship_manifest -v
```

Offline by construction: a fake subprocess answers the git identity questions
and refuses `npm`, `ssh`, `scp` and everything else; `urllib` is disabled; all
files land in a temp dir.
