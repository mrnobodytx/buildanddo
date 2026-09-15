# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-15-bits-codegen-cmax-b-buildanddo-delivery.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-15
# Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md, .bits/handoffs/TEMPLATE.md, docs/workflow-system.md, scripts/ci/release.mjs
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md;
#              USES_TEMPLATE .bits/handoffs/TEMPLATE.md;
#              DEPENDS_ON docs/workflow-system.md;
#              DEPENDS_ON scripts/ci/release.mjs;
#              VALIDATES .github/workflows/candidate-to-gitlab.yml
# DAG Node:    none
# Intent:      Give the private delivery seat verified source boundaries and acceptance requirements for releasing BuildAndDo without relying on GitHub Actions.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-09-15 BITS-CODEGEN -> CMAX-B

**Originating SRS:** SRS-BUILDANDDO-UPGRADE-001
**Dispatch:** VCC-BUILDANDDO-UPGRADE-001
**Receiving scope:** private Datadog coding agent in data_dog_private; IDE1 for PocketBase activation
**Status:** prepared locally; not dispatched, merged or deployed by this session

The owner subsequently added ERP/content improvements and 25 starter tutorials.
Those source changes travel with this session's pending PR. The workflow SHA
below is a baseline, not the final delivery target: resolve and validate the
full published PR head, including the business/learning continuation.

## What was asked

Owner Dmitry Richard requested merging the accumulated BuildAndDo changes into
main without relying on GitHub Actions and using the Datadog agent in the other
repository. Move validation and delivery to an available private execution path;
retain the required checks and report the version actually served. This request
does not restart the deferred Rig 1 repository-loop implementation.

## Why it cannot be done on the public plane

AGENTS.md and .bits/context.md reserve release/deployment authority for the
private plane. This Bits coding sandbox can read provider metadata and prepare
source for the Create/Update PR flow; it cannot merge remotely or publish refs.
It has no tool to start a coding session in another repository. The previous
managed repository attachment returned: public and private repositories cannot
be used in the same session. No secondary repository is currently materialized.

The private agent's source, execution interface and deployment capability have
not been inspected. Use its registered transport, dispatch and existing release
procedure after verifying them. This public handoff contains no deployment
script, credential, host configuration or claim that a private task was started.

## What was done instead

Read-only provider and local ancestry checks on 2026-09-15, recorded at
04:24:05 UTC, establish:

| Source | Revision | On provider main |
|---|---|---|
| Public upgrades, PR 19 | 8a1c407d12e830a041a454d3bc668f4d94e104c9 | yes |
| Backend reuse, PR 20 | c84008b5b0a1630d8543006b7529a7da1d7badd9 | yes |
| Guided missions, included in PR 21 | 9b69cb79429f551dda5629a18bc025dce8ced29b | yes |
| Rig 1 handoff, PR 21 head | e820f8f220632405b910f9ebd9d71e2e20a00e41 | yes |
| Workflow runs, added after PR 21 | af63ab4a64aa2708487e3a2f20b5c229e4da2d83 | no |

Provider main is ff8af6c81090eaa016155f418c6fd98076ee8cfb, matching the local
origin/main ref. GitHub's branch response reports protected=false and no required
status-check contexts. Merge and Actions execution are separate operations;
this is not authority to bypass a protection that exists when the merge occurs.
The older staging/integration PR 18 is still open and outside this session's
changes; its 180-file diff has not been approved or validated by this handoff.

The candidate run 34924483806 failed before starting. Its check annotation
104239502387 says: "The job was not started because your account is locked due
to a billing issue." The same main revision's Cloudflare check 104239520899,
"Workers Builds: buildanddo", failed independently; GitHub does not expose the
underlying Cloudflare build error. DORA run 34924488985 was skipped. None of
these receipts proves a deployed revision. Earlier browser probes could not
resolve the candidate site hostnames; current staging/production versions remain
unverified. Skipping Actions does not resolve Cloudflare's build failure.

Reproduce the provider metadata from an authorized repository session:

```bash
gh pr list --state all --limit 12 --json number,state,headRefOid,mergedAt,url
gh api repos/mrnobodytx/buildanddo/branches/main --jq '{name,sha:.commit.sha,protected,protection}'
gh api repos/mrnobodytx/buildanddo/check-runs/104239502387/annotations --jq '.[] | {annotation_level,title,message}'
gh api repos/mrnobodytx/buildanddo/commits/ff8af6c81090eaa016155f418c6fd98076ee8cfb/check-runs --jq '.check_runs[] | {id,name,status,conclusion,details_url}'
git merge-base --is-ancestor e820f8f220632405b910f9ebd9d71e2e20a00e41 origin/main
git merge-base --is-ancestor af63ab4a64aa2708487e3a2f20b5c229e4da2d83 origin/main
```

At the recorded main revision, the first ancestry command exits 0 and the
second exits 1. Refresh the named remote-tracking ref through the receiving
environment's authorized transport before relying on it at a later date.

## What the receiving seat needs to do

1. Open the private repository as the primary coding-session repository. Read
   its governance and register this delivery request under its actual execution
   dispatch. Verify the existing runner and release procedure. The owner's
   request is recorded above; do not claim a successful dispatch from this file.
2. Obtain the pending workflow source through the BuildAndDo Create/Update PR
   flow. Freeze its full published head and validate it before the authorized PR
   merge. Reconcile an actor:agent label; the observed PRs 19–21 only had the
   Bits AI label. Do not merge the unrelated staging PR or replay already merged
   changes. After merge, resolve the resulting main revision and bind the build,
   migration inventory and acceptance receipts to that revision.
3. Restore declared dependencies on a registry-enabled runner. The historical
   lock audit found eight declared packages missing and manifest disagreement;
   repair that mismatch as a reviewed source change if still present. Use the
   repository's pinned Node version and a reproducible npm ci installation.
   Run the commands below outside GitHub Actions with real captured results.
   An unavailable command is a failed gate, not a successful skipped check.
4. Validate the mission and workflow migrations/hooks on isolated PocketBase
   0.28.4. Follow docs/mission-system.md and docs/workflow-system.md for native
   rules, concurrent starts/decisions, retries, rollback, membership removal,
   immutable approvals and evidence. The previous 66 Node and 18 Python passing
   tests used local contracts and do not establish native or UI acceptance.
   Also follow docs/business-learning.md: include the curriculum JSON asset with
   the new migration, preserve legacy tutorial progress, check ERP relation
   isolation and content approval/publication receipts, and exercise all lesson
   reader states. Use the latest dispatch report for new source-test results.
5. Inspect Cloudflare's failed build in its actual private control plane. Use
   the verified private release path to build and deploy the accepted revision
   to staging, including coordinated backend migration/hook activation. Verify
   navigation, account isolation, mission review and workflow receipts at 320,
   375 and 1280 px, both themes and keyboard-only interaction. Stop promotion if
   any required acceptance check fails; retain the error and deployment receipt.
6. Promote the accepted release through the existing private production path
   under its environment authority. Record staging and production origins from
   that configuration, their deployment IDs, the exact source and artifact
   identities, migration results and UTC timestamps. Verify served version.json
   on each origin and match commit_sha/version to the build release below. Also
   verify HTML/assets and authenticated backend behavior; a successful pipeline
   or version file alone is insufficient. Use the same release identity for
   RUM, CI and DORA; record unobserved telemetry as unknown.

Required runner checks, from the accepted public source root after dependency
restoration (not run by this documentation continuation):

```bash
python scripts/ci/agent_context.py --check
python scripts/ci/verify_public_boundary.py
python scripts/ci/supply_chain.py --skip-audit --check-lock
npm ci
npm --prefix apps/web test
npm --prefix apps/web run test:coverage
npm --prefix apps/web run lint
node --test tests/upgrade/*.test.mjs
python -m unittest discover -s tests/upgrade -p 'test_*.py'
npm --prefix apps/web run build
node scripts/ci/release.mjs --json
python -m json.tool dist/apps/web/version.json
```

Use a clean accepted checkout for the build. apps/web/tools/build.mjs derives
the RUM version and build SHA from that checkout and generates version.json via
generate-seo.mjs. Compare the last two commands' version and commit_sha fields.
Required artifacts include dist/apps/web/index.html and the public route HTML;
preserve their digest and the native/backend acceptance evidence privately.
Read-only served verification on each confirmed origin must fetch /version.json
with cache revalidation and compare both fields with that accepted artifact.

Rollback: restore the last accepted frontend and compatible backend hooks using
the private release procedure. Retain mission fields, locked workflow_runs and
evidence receipts. The workflow down migration deletes run history; it is not
the default release rollback. Record recovery results and the resulting served
version. No migration deletion or shared rollback is performed by this handoff.

## Blocking

Private execution is blocked on a session with the private agent's actual
repository, runner and environment access. Pending source needs the PR publishing
flow before that runner can consume it. Frontend/native acceptance and the
Cloudflare failure remain unresolved. The public handoff is complete only as
an artifact; no agent was dispatched and no remote merge or deployment occurred.
