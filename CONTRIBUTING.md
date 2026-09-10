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

## Before you open a PR

1. **Fork or branch**, make your change.
2. **Run the build and lint locally**: `npm ci && npm run build && npm run lint`
   (from `apps/web` — see the root `package.json` workspaces).
3. **Run the web tests**: `npm test` (from the repository root, or
   `npm run test --prefix apps/web`). This is a required PR check — the same
   command runs in CI and the PR fails if it does. Vitest with jsdom and
   `@testing-library/react`; suites live next to what they cover in
   `apps/web/src/**/__tests__/`, and shared fixtures are in
   `apps/web/src/test/`. Use `npm run test:watch --prefix apps/web` while
   working and `npm run test:coverage --prefix apps/web` to see what is
   uncovered. A run writes `reports/junit/web.xml`, which is what feeds Datadog
   test visibility — if you add a test file, expect to see it there.
4. **Run the public-boundary scan**: `python scripts/ci/verify_public_boundary.py`.
   This is the same check that runs in CI; it fails on secrets, private paths,
   internal hostnames, or anything outside the public allowlist
   (`.buildanddo/public/path-policy.json`).
5. If your change touches the evidence fabric (`services/praxis_evidence/`),
   run `python services/praxis_evidence/run_all_tests.py` — real tests against
   a live PocketBase instance, not mocks.

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
2. `npm ci`, lint (if present), then `npm test` — required, and the run must
   leave a JUnit report at `reports/junit/web.xml`; a green suite that produced
   no report fails the check.
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
  (idempotent `ensure()`-style checks, explicit down-migrations).
- **Evidence, not assertions.** The Praxis Evidence Fabric's own rule applies to
  this repo's development process too: a claim that something works needs a
  real test or a real observed result, not just a description of intent.

## Reporting issues

Use GitHub Issues. For anything security-sensitive, do not open a public issue —
see `SECURITY.md` (if present) or contact the maintainer directly.
