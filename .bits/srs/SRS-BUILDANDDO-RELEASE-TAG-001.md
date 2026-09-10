# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-RELEASE-TAG-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-RELEASE-TAG-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     apps/web/src/lib/datadogRum.js, .github/workflows/datadog-dora.yml
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/web/src/lib/datadogRum.js; CONSUMES .version
# Intent:      Specify the one identifier that makes RUM, CI and DORA describe the same release.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-RELEASE-TAG-001 — One version across RUM, CI and DORA

**Status:** proposed **Risk:** A1 **Seat:** unassigned

## Problem

Three telemetry systems now report on this product and none of them agree on
what a release is.

- RUM reads `import.meta.env.VITE_DD_VERSION`. `.env.example` declares the
  variable and `datadogRum.js` states that `scripts/deploy/ship.py` writes it,
  but no tracked build or deploy path in this repository sets it. Browser
  sessions therefore arrive with no `version`.
- CI telemetry identifies a run by commit SHA.
- DORA deployment events identify a deployment by commit SHA.
- A `.version` file exists at the repository root and is not read by the build.

The consequence is concrete: when error rate rises after a deploy, nothing joins
the RUM error to the deployment event that caused it. DORA change failure rate
cannot be derived from real user impact, only from pipeline status. The most
valuable question observability can answer — "did the thing we just shipped hurt
users?" — is currently unanswerable.

## Intent

Establish one release identifier, derived at build time, and attach it to every
signal.

## Scope

- Derive a version at build time from `.version` plus the short commit SHA
  (`38+a1b2c3d`), in a Node build step, with no shell-dialect chaining.
- Inject it as `VITE_DD_VERSION` so the existing RUM initialisation reports it.
- Tag the CI telemetry snapshot and the DORA deployment event with the same value.
- Record the resolved version in the build artifact so a deployed bundle can be
  identified after the fact.
- Correct or remove the provenance claim in `datadogRum.js` about ship.py once
  the real writer exists.

## Out of scope

- Semantic versioning or release automation. This is an identifier, not a policy.
- Changing the private deploy pipeline's own versioning authority.

## Acceptance evidence

1. A production RUM session shows a non-empty `version` matching the deployed commit.
2. The DORA deployment event for that commit carries the same version.
3. `buildanddo.ci.*` metrics for the same run carry the same version tag.
4. Filtering RUM errors by `version` isolates a single deployment.

## Verification

```bash
npm run build && grep -r "VITE_DD_VERSION\|__APP_VERSION__" dist/apps/web | head
python scripts/ci/agent_context.py | grep -i version
```

## Notes for the implementing agent

Keep the version tag low cardinality on metrics: one value per deploy is fine,
one per PR build is not. Prefer tagging main-branch runs and deployments.
