# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-DEVENV-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-DEVENV-001
# CAPS:        pending
# CK:          pending
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-10
# Depends:     docker-compose.yml, apps/pocketbase/pb_migrations, CONTRIBUTING.md
# EnumType:    Doc
# EnumEdges:   VALIDATES docker-compose.yml; VALIDATES scripts/dev-setup.sh; PRODUCES docs/api/README.md
# Intent:      Specify a reproducible local full stack so a contributor can run web plus PocketBase without production access.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-DEVENV-001 — Local development environment

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

A contributor cloning this repo can start the frontend and nothing else.
`npm run dev` at the root runs `apps/web` *and* `apps/pocketbase`, but the
PocketBase script invokes `./pocketbase`, a binary that is gitignored
(`.gitignore:apps/pocketbase/pocketbase`) and never downloaded by any script in
the repo — so the backend half of the dev command fails on every fresh clone.

The frontend then falls back to `'/hcgi/platform'`
(`apps/web/src/lib/pocketbaseClient.js:3`), a path served only by the deployed
site. The result: every authenticated surface — auth, workspaces, missions,
signals, evidence — is dead locally, with no error that explains why.

CONTRIBUTING.md compounds it: it instructs contributors to run the Praxis
evidence suite "against a live PocketBase instance" without saying where such
an instance comes from. The honest answer today is "production, with superuser
credentials you do not have".

There is also no written schema. Thirteen migrations define 40 collections;
the only way to learn the data model is to read 1,611 lines of migration
JavaScript.

## Intent

Make the whole stack runnable from a clone with one command, using the same
migrations production uses — so local schema drift is impossible by
construction — and write down the API surface that already exists.

## Scope

- `docker-compose.yml` at the repository root: a `web` service (Vite dev server
  with hot reload, port 3000), a `pocketbase` service (port 8090, named volume
  for `pb_data`), and a one-shot `pocketbase-migrate` service that applies
  `apps/pocketbase/pb_migrations/` before `pocketbase` starts serving.
- `apps/web/Dockerfile.dev` and `apps/pocketbase/Dockerfile`; `.dockerignore`.
- `scripts/dev-setup.sh` and `scripts/dev-setup.ps1`: prerequisite checks,
  `.env` bootstrap from `.env.example`, `docker compose up -d`, a real health
  probe against PocketBase, printed URLs, optional demo seed.
- `scripts/dev-seed.mjs`: demo workspace data created over the PocketBase REST
  API under a demo user, not written into the database by hand.
- `.env.example`: every variable the stack reads, marked required or optional,
  with the local default.
- `docs/api/README.md`: collections, fields, relations and API rules extracted
  from the migrations; the auth flow; the workspace data model.
- README.md quick start; CONTRIBUTING.md local-testing section.

## Out of scope

- Any change to application source. The environment adapts to the code as it
  is; if a variable name is awkward, that is a separate SRS.
- Production or staging deployment. `scripts/deploy/ship.py` is untouched.
- Running the containers in CI. The compose stack is a contributor tool; the
  public CI gate stays as it is.

## Constraints

- Dev-only PocketBase superuser credentials are local defaults in
  `.env.example`, never production values, and `.env` stays gitignored.
- Datadog RUM variables must remain optional: an empty `VITE_DD_CLIENT_TOKEN`
  disables RUM (`apps/web/src/lib/datadogRum.js`), it does not fail the boot.
- Migrations are the only schema path. The compose stack must not create
  collections by any other means.

## Acceptance evidence

1. `docker compose config` parses and resolves with an empty environment
   (no unset-variable failures).
2. `bash -n scripts/dev-setup.sh` and a PowerShell parse of `dev-setup.ps1`
   both succeed.
3. From a clean clone: `./scripts/dev-setup.sh` reaches a PocketBase
   `/api/health` 200 and `http://localhost:3000` serves the app.
4. `docs/api/README.md` lists every collection created by
   `apps/pocketbase/pb_migrations/` — count matches the migrations.
5. `python scripts/ci/verify_public_boundary.py` reports `PASS`.

## Verification

```bash
docker compose config >/dev/null && echo compose-ok
bash -n scripts/dev-setup.sh && echo shell-ok
python scripts/ci/verify_public_boundary.py
./scripts/dev-setup.sh --seed
curl -fsS http://localhost:8090/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000
```

## Notes for the implementing agent

`apps/pocketbase/package.json` runs `./pocketbase` with
`--encryptionEnv=PB_ENCRYPTION_KEY`; the container omits that flag deliberately
so no fake key has to be committed for local settings encryption. The
`_superusers` bootstrap migration reads `PB_SUPERUSER_EMAIL` and
`PB_SUPERUSER_PASSWORD` from the environment
(`pb_migrations/1764579159_create_superuser.js`) — compose must pass both or
the migration step fails.

Node 18 cannot run this toolchain: Vite 7 requires Node `^20.19 || >=22.12`,
and `.nvmrc` pins 22. The web image tracks `.nvmrc`.
