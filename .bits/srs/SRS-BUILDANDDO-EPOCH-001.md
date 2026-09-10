# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-EPOCH-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-EPOCH-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     scripts/ci/evidence_epoch.py, .github/workflows/evidence-epoch.yml
# EnumType:    Doc
# EnumEdges:   VALIDATES scripts/ci/evidence_epoch.py;
#              VALIDATES .github/workflows/evidence-epoch.yml;
#              GATES bits/SRS-BUILDANDDO-EPOCH-001-* branches
# Intent:      Specify a per-merge evidence epoch whose root a third party can recompute.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-EPOCH-001 — Evidence epochs in public CI

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

Every pipeline run already produces artifacts that matter: a build output, two
provenance manifests, a lockfile, a boundary-scan verdict, telemetry. All of it
is uploaded as a GitHub Actions artifact with a retention window of 14 or 30
days, and then it is gone.

That leaves a specific claim unprovable. Six months after a merge, nobody can
demonstrate that the artifact set attributed to commit `abc123` is the artifact
set that actually existed at merge time. The provenance files record hashes of
the files they saw; nothing records a single fingerprint over the whole set, and
nothing links one run's fingerprint to the previous run's. Retention expiry is
indistinguishable from tampering, because both look like absence.

`BUILDANDDO_CANDIDATE_PROVENANCE.json` gets close — it hashes every tracked
file and self-hashes the manifest. But it covers source, not build output, it is
regenerated per run with no link to its predecessor, and its digest is never
published anywhere durable, so it witnesses only itself.

## Intent

Produce, on every merge to `main` and every production deploy, one deterministic
digest over the run's evidence set, chain it to the previous digest, and publish
that digest to a system outside this repository's control. The digest is
evidence, never authority: nothing in the pipeline may gate on it, and a failed
publication may not fail a build or a deploy.

## Scope

- `scripts/ci/evidence_epoch.py` — stdlib-only collector. Hashes the build
  output, both provenance manifests, the lockfile, the boundary report, the
  telemetry snapshot and JUnit results when present; builds a SHA-256 Merkle
  tree over the leaves; writes a `buildanddo.public-anchor/v1` manifest.
- Chain linking through `scripts/ci/epoch_chain.json`, committed, so the chain
  is reconstructable from git history alone.
- `.github/workflows/evidence-epoch.yml` — runs on push to `main` and on manual
  dispatch, publishes the epoch to Datadog as an event plus three metrics, and
  uploads the manifest as an artifact.
- `scripts/deploy/ship.py` — creates a `production_deploy` epoch after a passing
  production probe, fail-soft.
- `scripts/ci/evidence_dashboard.json` — importable Datadog dashboard.

## Out of scope

- **Publishing the digest to a public chain.** That is the eventual external
  witness and it needs a funded key, which is deployment authority and therefore
  GitLab's, not this repo's. The epoch is designed so that step is additive: it
  consumes `root_digest` and nothing else.
- Signing the manifest. Same reason — a signing key is not a public-plane asset.
- Epochs for pull requests. A PR's artifact set is not canonical; anchoring it
  would put unmerged, possibly abandoned roots into the chain.

## Acceptance evidence

1. Two runs over an unchanged tree produce the same `root_digest`, and changing
   one byte of `dist/apps/web/index.html` changes it.
2. `--verify` recomputes the root from a written manifest and reports `PASS`.
3. Removing one leaf from a manifest makes `--verify` report `FAIL`.
4. A Datadog event with `source_type_name:buildanddo` and tag
   `source:evidence_epoch` exists for the merge, and
   `buildanddo.epoch.artifacts` has a point at that time.
5. `epoch_chain.json` on `main` names the previous epoch of the newest epoch.

## Verification

```bash
npm run build
python scripts/ci/evidence_epoch.py --trigger merge --json
python scripts/ci/evidence_epoch.py --verify state/epochs/latest.json
python scripts/ci/datadog_publish.py --dry-run --metric buildanddo.epoch.artifacts=1
```

## Notes for the implementing agent

Determinism is the whole product. The manifest is sorted, the leaf ordering is
by digest rather than by discovery order, and `created_at` is excluded from the
root — a fingerprint that changes when nothing changed proves nothing. Both the
hash construction and the odd-node rule are documented in the script's module
docstring, because a root nobody else can recompute is not evidence either.

Risk is A1: the script only reads the working tree and writes to gitignored
`state/`, and the publisher already treats a missing `DD_API_KEY` as `SKIP`.
