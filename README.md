# BuildAndDo

Early-stage software that turns "I want X" into a bounded, verified next step —
build, code, or a real-world objective. This repo is the public build-in-public
source for [buildanddo.com](https://buildanddo.com).

- **Live site:** https://buildanddo.com
- **Roadmap:** https://buildanddo.com/roadmap
- **Practice library** (community-audited evidence fabric): https://buildanddo.com/practice
- **Wiki** (canonical development record): https://wiki.buildanddo.com
- **Forum:** https://forum.buildanddo.com
- **Discord:** https://discord.gg/vTDZxmpHHC

## What's in this repo

```
apps/web/          React + Vite frontend (the actual site)
apps/pocketbase/   PocketBase backend - migrations, hooks, the real app database
services/          Backend services (praxis_evidence: the community-audited evidence fabric)
scripts/deploy/    The real staging -> production deploy pipeline (ship.py)
scripts/ci/        Build/lint/public-boundary gates, run in CI on every push
scripts/publish/   Canonical release-event publication (wiki + Discord + Reddit)
scripts/discordbot/ The development-aid Discord bot
```

## How it's built and shipped

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full contributor and code process —
what's public vs. private, the PR requirements, and how a change actually reaches
production.

Short version: every push to `main` runs a real build+lint+public-boundary gate,
deploys to a staging environment, probes it live, and only then promotes the
same build to production. Nothing is deployed on trust — every stage is a real
HTTP check against the live site, not a simulated pass.

## Observability

Every CI run measures itself — bundle size, dependency count, source volume,
tests, lint and dead-code findings, boundary-scan results, pipeline duration —
compares it against the last successful `main` build, and publishes the values,
their deltas, events and structured logs to Datadog (us5.datadoghq.com).
Deployments emit DORA events with lead time. Regressions against the baseline
appear in the PR job summary as warnings; they do not block the build.

Required GitHub Actions secrets — `DD_API_KEY` and `DD_SITE` — the metric
catalog, thresholds and the one-time Datadog GitHub App setup are documented in
[docs/observability/datadog-ci.md](./docs/observability/datadog-ci.md).

## Public/private boundary

GitHub is the public collaboration plane. Golden infrastructure, deployment
secrets, and internal release tooling live on a private mirror and never appear
here — enforced by an automated scan on every push and PR
(`scripts/ci/verify_public_boundary.py`), not just a policy statement.

## License

Proprietary — all rights reserved unless stated otherwise in a specific file.
