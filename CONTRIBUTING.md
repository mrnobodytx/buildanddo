# Contributing to BuildAndDo

This describes the real process this repo actually runs — every step here is
enforced by a real check, not just a convention people are trusted to follow.

## Where things live

- **GitHub** (`mrnobodytx/buildanddo`, this repo) — the public collaboration and
  submission plane. Open issues and PRs here.
- **Private GitLab mirror** — internal release/golden pipeline, not public, and
  not something contributors need access to.

A PR merged here goes through the real staging → production pipeline described
below; nothing bypasses it.

## Running it locally

You do not need production access, and you should not use it. The full stack —
frontend, PocketBase, and the same migrations production applies — runs in
Docker from a clone:

```bash
./scripts/dev-setup.sh            # bash; --seed adds a demo workspace
.\scripts\dev-setup.ps1           # PowerShell, same behaviour
```

Or `docker compose up -d` if you already have a `.env`. Both bring up:

- `web` — Vite dev server on http://localhost:3000, hot reload against your
  working tree.
- `pocketbase` — the API on http://localhost:8090 and the admin UI at
  http://localhost:8090/_/, with an admin account created from `.env`.
- `pocketbase-migrate` — a one-shot step that applies
  `apps/pocketbase/pb_migrations/` before the API serves anything, so your
  local schema cannot drift from the deployed one.

Useful commands:

| Command | Effect |
|---|---|
| `docker compose logs -f web` | follow the frontend |
| `docker compose restart pocketbase-migrate` | apply a migration you just wrote |
| `docker compose down` | stop, keep the database |
| `docker compose down -v` | stop and delete the database volume (full reset) |

`.env.example` documents every variable, required and optional, with its local
default. Datadog RUM stays off locally unless you set both
`VITE_DD_APPLICATION_ID` and `VITE_DD_CLIENT_TOKEN` — an empty client token
disables browser telemetry rather than failing the boot, so local sessions do
not reach the Datadog org by accident.

The API surface — collections, fields, relations, access rules, and the auth
flow — is documented in [docs/api/README.md](./docs/api/README.md), extracted
from the migrations. Read it before adding a collection.

## Before you open a PR

1. **Fork or branch**, make your change.
2. **Run the build and lint locally**: `npm ci && npm run build && npm run lint`
   (from `apps/web` — see the root `package.json` workspaces).
3. **Run the public-boundary scan**: `python scripts/ci/verify_public_boundary.py`.
   This is the same check that runs in CI; it fails on secrets, private paths,
   internal hostnames, or anything outside the public allowlist
   (`.buildanddo/public/path-policy.json`).
4. If your change touches the evidence fabric (`services/praxis_evidence/`),
   run `python services/praxis_evidence/run_all_tests.py` — real tests against
   a live PocketBase instance, not mocks. Point it at your local stack:

   ```bash
   export PB_API_URL=http://localhost:8090
   export PB_SUPERUSER_EMAIL=admin@buildanddo.local
   export PB_SUPERUSER_PASSWORD=localdev-change-me   # your .env values
   python services/praxis_evidence/run_all_tests.py
   ```

   The suite writes real records, so run it against the container database —
   never a deployed one. `docker compose down -v` resets it.
5. **Test an authenticated surface as a user, not just as an admin.** Every
   product collection is owner-scoped, and several are additionally scoped by
   `workspace_members` role; a change that works for the record's owner can
   still be denied for a `viewer`. `./scripts/dev-setup.sh --seed` creates a
   demo user and workspace to click through.

## Opening a pull request

Use the PR template (auto-filled). It requires:

- **Feature / mission ID** — what this is for.
- **Actor type** — `human`, `agent`, or `mixed`. Exactly one of the
  `actor:human` / `actor:agent` / `actor:mixed` labels must be applied; the
  `BuildAndDo PR Governance` workflow checks this automatically and fails the
  check if it's missing or ambiguous.
- **Risk / authority tier** — `A0` (read-only) through `A2` (isolated low-risk
  change) are normal for community contributions. Anything proposing `A3` or
  higher (shared/staging mutation or beyond) needs explicit discussion first.
- **Acceptance evidence** — what you actually verified, not what you expect to
  work. "It builds" is not evidence that a feature works; describe what you
  tested and how.
- **Public/private boundary checklist** — confirm no golden/infrastructure/
  secret/private-evidence files are included, and that the change is safe to
  expose publicly. The automated scan checks this too, but the checklist is
  your own attestation.

## What CI actually does

On every PR (`BuildAndDo PR Governance` workflow):

1. Public/private boundary scan (fails closed on any violation).
2. `npm ci`, lint (if present), test (if present).
3. Full production build, verified by checking the real build artifact exists
   (`dist/apps/web/index.html`), not just that the build command exited 0.
4. Governance evidence (boundary report + build output) uploaded as an artifact
   for review.

On every push to `main` (private GitLab mirror, `.gitlab-ci.yml`):

1. The same integrity gate (build + public-boundary scan).
2. The Praxis Evidence Fabric test suite — 7 real test suites against the live
   backend.

## How a change reaches production

This is the real pipeline (`scripts/deploy/ship.py`), not an aspirational
diagram:

1. **Build** the frontend fresh (a stale build cache bug was found and fixed
   here before — every deploy starts from a clean `dist/`).
2. **Gate**: the same build + lint check CI runs.
3. **Staging**: sync the build to `staging.buildanddo.com`, then probe it live
   over real HTTPS — a 200 response is required, not assumed.
4. **Promote**: only if staging's gate *and* live probe both pass, the exact
   same build (not a rebuild) is synced to production and probed live again.
5. **Publish**: a canonical release event is compiled, scrubbed for secrets and
   private paths, and projected to the wiki (canonical record), Discord
   (operational notice), and — once configured — Reddit. Each channel's
   outcome is tracked independently; a channel being unavailable never marks
   the deployment itself as failed.

If staging's gate or probe fails, production is never touched.

## Code conventions

- **No shell-dialect dependence** in npm scripts — a real bug here (Windows
  `cmd.exe` silently skipping build steps after `||`/`&&` chaining) was fixed
  by moving to plain Node wrapper scripts (`apps/web/tools/build.mjs`,
  `tools/lint.mjs`). Don't reintroduce shell-specific chaining.
- **PocketBase migrations** are the only way schema changes ship — never hand-edit
  the running database. See `apps/pocketbase/pb_migrations/` for the pattern
  (idempotent `ensure()`-style checks, explicit down-migrations). Apply yours
  locally with `docker compose restart pocketbase-migrate`, verify it in the
  admin UI, and update `docs/api/README.md` in the same PR.
- **Evidence, not assertions.** The Praxis Evidence Fabric's own rule applies to
  this repo's development process too: a claim that something works needs a
  real test or a real observed result, not just a description of intent.

## Reporting issues

Use GitHub Issues. For anything security-sensitive, do not open a public issue —
see `SECURITY.md` (if present) or contact the maintainer directly.
