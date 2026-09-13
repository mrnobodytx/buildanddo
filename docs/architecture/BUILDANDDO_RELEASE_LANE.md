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
      |  scripts/deploy/ship.py --stage-only          bound to a GitHub readback by a lane file
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

Three things are enforced by the script itself, not by convention:

- **The flag-less run writes nothing.** `py -3.13 scripts/deploy/ship.py`
  with no mode flag is refused before anything is read, built or copied:
  `stopped_at = "direct_production_refused"`, exit 2, `remote_writes = 0`,
  no manifest, no `git` call. Staging is `--stage-only`; there is no default.
- **Production needs a typed-out acknowledgement.** The legacy line runs only
  with both `--direct-production-legacy` and `--ack-authority`. The flag
  alone is refused before any build: `stopped_at = "authority_refused"`,
  exit 3, `remote_writes = 0`, and the record carries
  `authority = {required: "A3", acknowledged: false}`. With both flags the
  manifest it ships says `lane = "direct-legacy"` so any readback can tell it
  apart from a lane release.
- **`--stage-only` and `--direct-production-legacy` are mutually exclusive**
  (argparse usage error, exit 2, nothing recorded), so a manifest can never
  claim `target = "staging+production"` for a run that was told to stop at
  staging.

```text
py -3.13 scripts/deploy/ship.py --direct-production-legacy --ack-authority
```

## Modes

| Invocation | What runs | Exit |
| --- | --- | --- |
| `--stage-only` | bind -> manifest -> build -> gate -> staging sync -> staging probe | 0 on a staging 200, 1 otherwise, 2 on a bind refusal |
| *(no flags)* | nothing; refused before the bind (`direct_production_refused`) | 2 |
| `--direct-production-legacy` | nothing; refused before the bind (`authority_refused`) | 3 |
| `--direct-production-legacy --ack-authority` | the legacy full line (staging, then production, epoch, publication) | 0 / 1 |
| `--json PATH` | any of the above, plus a copy of the deploy record at PATH | unchanged |

## The lane file: how a staging build is bound to a GitHub readback

The release controller builds staging from a detached worktree of the GitHub
`main` sha it just read back from the GitHub API, and tells `ship.py` which sha
that is through one file:

```text
BUILDANDDO_RELEASE_LANE_FILE = <absolute path to a citadel.tenant-rail-lane/v1 JSON receipt>
```

When the variable is set, `ship.py` reads the file before anything is built.
The bind is a readback, not a label: the file has to prove that GitHub
answered for the sha being built.

| The lane file ... | Outcome |
| --- | --- |
| is unreadable, not a JSON object, not schema `citadel.tenant-rail-lane/v1`, or not `tenant_id = "buildanddo"` | `stopped_at = "lane_file_invalid"`, exit 2, no build |
| has `candidate_sha` that is not a full lowercase 40-hex sha | `lane_file_invalid` |
| has no `github` object, or `github.sha != candidate_sha`, or `github.ref` is not a `refs/heads/*` name, or `github.state` is not `PASS` or `HOLD` (the two states in which the controller's GitHub readback succeeded) | `lane_file_invalid` |
| has `candidate_sha` that is not `git rev-parse HEAD` | `stopped_at = "bind_sha_mismatch"`, exit 2, no build, nothing synced; the record carries `bind.expected` and `bind.actual` |
| has `candidate_sha == HEAD` and a matching `github` readback | bound: the manifest is stamped with `github_sha` (always equal to `commit_full`), `github_ref`, `lane = "github-staging"` and the lane file's `lane_version` |
| has `candidate_sha = null` | nothing to bind to; the build proceeds as `lane = "unbound"` (recorded, not refused) |

A manifest therefore only claims `github-staging` when the lane file's
GitHub readback names HEAD itself; the writer raises rather than publish a
`github-staging` manifest whose `github_sha` differs from `commit_full`.

Without the variable a `--stage-only` build is `lane = "unbound"` for a human
(`CITADEL_EXECUTOR` unset or `ship.py-direct`): a developer preview that a
readback gate will not mistake for a lane release. A controller
(`CITADEL_EXECUTOR` set to anything else) must always supply a lane file; a
controller run without one is refused before the build with
`stopped_at = "lane_file_required"`, exit 2.

## Environment names `ship.py` honours

Values are read by name and never printed or recorded.

| Name | Meaning | Default |
| --- | --- | --- |
| `BUILDANDDO_RELEASE_LANE_FILE` | the lane receipt described above | unset (unbound build for a human; refused for a controller) |
| `BUILDANDDO_SECRETS_FILE` | dotenv to read instead of `secrets/deploy.local.env`, so a worktree build reads the clone's secrets | `<root>/secrets/deploy.local.env` |
| `BUILDANDDO_STATE_DIR` | ledger directory (`history.jsonl`, `latest.json`) so worktree builds share one ledger | `<root>/state/deploy` |
| `CITADEL_EXECUTOR` | who is driving; stamped into the manifest and the record | `ship.py-direct` |
| `CITADEL_LANE_VERSION` | informational lane version; the lane file wins when both exist | unset |

`BUILDANDDO_SSH_KEY` (a key *path* inside the secrets file) resolves against
the clone that owns the secrets file when it is relative, so a build in a
detached worktree uses the same key file as a build in the clone. The record
stores only `ssh_key = {configured, source}` (`source` is `absolute`,
`relative_to_clone` or `unset`) - never the path, never key material.

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
| `commit_message` | subject line, redacted (see below) | same |
| `branch` | git branch, or the bound ref's name in a detached worktree | same |
| `package_version` | `apps/web/package.json` version | same |
| `built_at` | UTC ISO timestamp | same |
| `target` | `staging`, or `staging+production` for the legacy line | `production` |
| `shipped_by` | `scripts/deploy/ship.py` | the lane's manifest writer |
| `github_sha` / `github_ref` | from the lane file when bound (`github_sha == commit_full`), else null | the GitHub sha the intake was cut from |
| `gitlab_project_id` / `gitlab_intake_sha` / `gitlab_package_name` / `gitlab_package_version` | always null | filled by the private lane |
| `lane` | `github-staging`, `unbound` or `direct-legacy` | `gitlab-golden` |
| `executor` | `CITADEL_EXECUTOR` or `ship.py-direct` | the lane executor |
| `lane_version` | lane file value, else `CITADEL_LANE_VERSION`, else null | the lane version |

The key list is exactly these 19 keys in this order; the test suite pins the
list literally, not by reference to the module constant.

Forbidden in the manifest: hostnames, IP addresses, URLs, secret names or
secret values. `commit_message` and `branch` are split on whitespace and any
token that matches one of these is replaced by `[redacted]`:

- a URL separator (`://`) or a token starting with `http`, `https`, `ssh`,
  `sftp`, `ftp`, `ws`, `wss`, `scp` or `www.`;
- an `@` (e-mail or `user@host`);
- an IPv4 literal;
- a dotted name whose last label is a public top-level domain
  (`example.com`, `www.foo.org`); file and module names such as `ship.py`,
  `package.json` or `tests.deploy.test_ship_manifest` are not hostnames and
  are kept;
- an infrastructure label such as `kvm1`, `vps-2`, `srv01`, `node3`, `rig1`;
- a known private domain or provider name;
- any secret NAME declared in the secrets file (both `KEY=value` and
  `KEY: value` lines contribute their name) or supplied through the OS
  environment under the `BUILDANDDO_`, `DISCORD_`, `BAD_`, `PB_` or
  `FLARUM_` prefixes (the five control names above are never treated as
  secret names);
- any secret VALUE (six characters or longer) behind one of those names.

Redaction is deliberately fail-closed: a commit subject that says
`add http client retry` is served as `add [redacted] client retry`. Keep
public subjects free of addresses and the loss is nil.

## The deploy record

Every run appends one line to `history.jsonl` and rewrites `latest.json`
(and the `--json` receipt) with the real outcome of each stage. The v2 record
adds `executor`, `lane`, `lane_version`, `lane_file`, `bind {expected, actual,
ok, state, github_state, reason}`, `manifest {schema, commit_full,
github_sha, lane, target}` (null until the manifest is actually written; a
refused run never pre-claims one), `authority {required, acknowledged}`,
`direct_production_legacy`, `remote_writes` (one per successful sync),
`promoted_to_production` (true only when the legacy line reached the
production probe) and `ssh_key {configured, source}`. A record never says
"deployed" without the probe result that backs it. A probe that gets a 4xx
or 5xx keeps the status and the first bytes of the body in `body_prefix`;
the reason a surface refused is evidence, not noise.

Secret hygiene in the record is measured, not asserted. Before a record is
written, every string in it is scrubbed of every secret VALUE the secrets
file declares (the `ssh`/`scp` error tails echo the target host, for one);
`secret_values_scrubbed` counts the replacements and
`secret_values_persisted` is the count of secret values still found in the
serialized record after the scrub - which the test suite asserts is zero on
the success path, the refusal paths and a fake ssh failure whose stderr
carried both the host and a token.

## Candidate provenance

`scripts/ci/candidate_manifest.py` stamps `BUILDANDDO_CANDIDATE_PROVENANCE.json`
into the candidate commit that the private lane consumes. It now also records
who stamped it (`executor`), what that executor read back from GitHub before
stamping (`github_readback {sha, observed_at}`, from
`CITADEL_GITHUB_READBACK_SHA` / `CITADEL_GITHUB_READBACK_AT`, with
`CITADEL_GITHUB_SHA` accepted as the sha when the readback name is unset)
and the `lane_version`. `authority` stays `candidate_only` and
`production_authority` stays `false`: a candidate can prove where it came
from, never that it may go live.

## Tests

```text
py -3.13 -m unittest tests.deploy.test_ship_manifest -v
```

Offline by construction: a fake subprocess answers the git identity questions
and refuses `npm`, `ssh`, `scp` and everything else; `urllib` is disabled; all
files land in a temp dir; the real `state/deploy/history.jsonl` is asserted
unchanged. The suite drives `main()` through every mode, including the legacy
line with the acknowledgement (production sync, probe, epoch and publication
all faked) and without it.
