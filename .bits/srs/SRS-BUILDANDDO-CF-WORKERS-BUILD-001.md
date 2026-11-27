# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-CF-WORKERS-BUILD-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CF-WORKERS-BUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CF-WORKERS-BUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-27
# Depends:     apps/edge/wrangler.toml, SRS-BUILDANDDO-CF-IDS-001, SRS-BUILDANDDO-GITLAB-ONLY-CI-001
# EnumType:    Doc
# EnumEdges:   DOCUMENTS Cloudflare Workers Builds connection "buildanddo"; DEPENDS_ON apps/edge/wrangler.toml
# DAG Node:    none
# Intent:      Record why "Workers Builds: buildanddo" fails on every commit and what the owner must change.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-CF-WORKERS-BUILD-001 — the orphan `buildanddo` Worker fails every build

**Status:** in_progress **Risk:** A1 (this record) · A3 (the fix, owner only) **Seat:** C-ONE

**Authorization:** on 2026-10-27 the owner asked to "use the system to investigate that and document
that" after the check failed on PR #127. This SRS is that record. The remediation changes production
Cloudflare settings, which is A3: no seat performs it.

## Finding (measured 2026-10-27 through the Cloudflare Workers and Builds APIs)

| Fact | Evidence |
|---|---|
| The Worker `buildanddo` is the Cloudflare starter: its only module returns `Hello world`. | Workers script content API |
| It was created 2026-09-09 02:46 UTC and has never been modified since. | Workers list API, `modified_on` |
| It serves nothing: no zone route, no custom domain, `workers.dev` and previews disabled. | zone worker routes, Workers domains, script subdomain APIs |
| Production traffic goes elsewhere: `buildanddo.com/*` and `www.buildanddo.com/*` route to `buildanddo-edge`; `/api/classroom/*` to `citadel-classroom`; `/reset-password/*` to no Worker. | zone worker routes API |
| It is git-connected to `mrnobodytx/buildanddo` with two triggers, root `/`, build `npm run build`: `main` → `npx wrangler deploy`; every other branch → `npx wrangler versions upload`. | Builds triggers API |
| **415 builds since 2026-09-09: 414 failed, 1 skipped, 0 succeeded.** | Builds API, all pages |
| Cause: the build succeeds, the deploy step fails. The repository root has no wrangler config, so wrangler stops with "Specify an entry-point … or create a wrangler.jsonc". The only config, `apps/edge/wrangler.toml`, belongs to `buildanddo-edge`. | build log of PR #127 head `50801a0`; same result on `main` `f7a794b` |
| Effect: a red `Workers Builds: buildanddo` check on every `main` commit and every PR head, unrelated to the change under review. | GitHub check runs, last 12 `main` commits |

`buildanddo-edge` has no Workers Builds connection; it deploys through `apps/edge/tools/deploy.mjs`.
`buildanddo-staging` exists without a build connection and with `workers.dev` enabled (not investigated
further; out of scope).

## Decision for the owner (A3)

The repository never deployed to `buildanddo`, and nothing routes to it, so the recommended fix is:

1. Cloudflare → Workers & Pages → `buildanddo` → Settings → Builds → **Disconnect** the repository.
   This removes the failing check from every commit.
2. Optionally delete the `buildanddo` Worker (it only says `Hello world`).

Not recommended: pointing the connection at `apps/edge`. That would add a second, ungoverned deploy
path for production `buildanddo-edge` alongside GitLab and `deploy.mjs`, against
SRS-BUILDANDDO-GITLAB-ONLY-CI-001.

## Acceptance

After step 1, the newest `main` commit reports no `Workers Builds: buildanddo` check run. The gate in
the dispatch table measures this.

## Out of scope

Any Cloudflare change by a seat; account or Worker identifiers in this repository
(SRS-BUILDANDDO-CF-IDS-001); `buildanddo-staging`; the unrouted `/reset-password/*` pattern.
