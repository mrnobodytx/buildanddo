# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-CF-IDS-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CF-IDS-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CF-IDS-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     apps/edge/wrangler.toml, apps/edge/package.json
# EnumType:    Doc
# EnumEdges:   VALIDATES apps/edge/wrangler.toml; PRODUCES apps/edge/tools/deploy.mjs
# Intent:      Keep Cloudflare account and resource ids out of the public repository, and record
#              what a sweep for other sensitive data found.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-CF-IDS-001 — No Cloudflare ids in the public repository

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN **Dispatch:** VCC-BUILDANDDO-CF-IDS-001

## Problem

#83 (SRS-BUILDANDDO-BUDDI-002) imported `apps/edge/wrangler.toml` as the deployed Worker had it. The
file carries the Cloudflare account id and the id of the `cni-edge-graph` D1 database. That PR flagged
keeping them public as an owner decision. On 2026-09-24 the owner decided: scrub them.

Neither id grants access by itself; both need an API token. They still map the account and name a
database, so they are the kind of detail a public repository should not hand out.

## Scope

- `wrangler.toml` drops `account_id`. The D1 binding keeps its name, and its id becomes the
  placeholder `resolved-at-deploy`.
- New `apps/edge/tools/deploy.mjs`, run by `npm run deploy`:
  - requires `CLOUDFLARE_ACCOUNT_ID`;
  - resolves the database by name through `wrangler d1 list --json`, and refuses zero or several
    matches or a non-uuid;
  - deploys from a resolved copy that is gitignored and always deleted;
  - never prints an id.
- Wrangler's automatic provisioning is not used on purpose: when its lookup misses, it can create a
  new, empty database.
- A plain `wrangler deploy` fails on the placeholder: Cloudflare rejects the binding. It cannot bind
  the wrong database.
- A test fails if any 32-hex or uuid value, or an `account_id` setting, returns to `wrangler.toml`.
- Registering this code showed that `.bits/srs_registry.yml` stopped being valid YAML on main. An
  unquoted `: ` came in with SRS-BUILDANDDO-HYGIENE-001, and the repo's line-based readers did not
  notice. The note is reworded, and `tests/upgrade/test_hygiene.py` now parses the registry as YAML.
  That test fails on main's registry and passes here.

## Out of scope: recorded here, not changed

- **History.** Both ids stay in the history of `8f97751`, including #83's diff, and in any mirror.
  Removing them means rewriting published `main` history and force-pushing every mirror. That is
  destructive, and it is the owner's call.
- **Cloudflare's own PR comments.** The Workers Builds bot posts dashboard links on every PR, and
  those links contain the account id. Hiding that needs the integration changed or removed in the
  Cloudflare dashboard.
- **Findings from the same sweep, left to their owners:**
  - Tracked files, all of git history and all refs were checked for vendor token shapes (cloud,
    GitHub, GitLab, Slack, Stripe, model-provider, Discord webhooks and bot tokens, PostHog,
    Datadog), private keys, JWTs, credentials in URLs and secret assignments. No live credential
    was found. Every hit was a test fixture, a scanner self-test, or a documented local-development
    default in `.env.example` and the dev-setup scripts. No `.env` or key file was ever committed.
  - The fleet machine names that `public_redaction.py` flags, outside `.bits/`: seat user lists and
    comments in three PocketBase migrations (`1789100000`, `1790700000`, `1791800000`), one comment
    in `.gitlab-ci.yml`, and path references in `BUILDANDDO_CANDIDATE_PROVENANCE.json` and
    `scripts/ci/sprint_ledger.json`.
    - The migration seat lists create user records, so renaming them changes behaviour on a fresh
      database. They belong to SRS-BUILDANDDO-PUBLIC-REDACTION-001.
    - The 13 `.bits/` files that the redaction scan flags are recorded in
      SRS-BUILDANDDO-HYGIENE-001.
  - `1759383931_initial_app_settings.js` names the original hosting-preview origin. Whether that
    preview still serves the app outside the edge worker's headers is for the operator to check
    (A3, external read).
  - Three `.bits/` records cite Cloudflare build ids. Like the account id, these open nothing without
    dashboard access.
  - Deliberately public, and left as is: the voice agent's public ElevenLabs agent id (the site
    embeds it), `licensing@` contact addresses, and GitHub `noreply` addresses in workflows.

## Acceptance evidence

1. `apps/edge`: `npx vitest run` passes, including `deploy-config.test.js`. Its control shows that a
   planted account id is caught.
2. `wrangler deploy --dry-run` bundles the Worker from the scrubbed config, with the `CNI_GRAPH`
   binding listed.
3. With a stand-in `npx`, `npm run deploy`:
   - refuses when `CLOUDFLARE_ACCOUNT_ID` is unset (exit 2);
   - otherwise binds the database with the configured name, not a decoy;
   - passes extra flags through;
   - leaves no resolved config behind.
4. `git grep` finds neither id anywhere in the tree.
5. `agent_context --check`, `hostinger_readiness --check`, `system_growth --check`, `readme_check`
   and `verify_public_boundary` pass.
