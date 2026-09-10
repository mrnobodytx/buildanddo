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

## Quick start

The whole stack — frontend, PocketBase, and the real migrations — runs locally
in Docker. No production access, no credentials, no hand-built database.

```bash
git clone https://github.com/mrnobodytx/buildanddo.git && cd buildanddo
docker compose up -d
open http://localhost:3000
```

Or use the setup script, which checks prerequisites, creates `.env`, waits for
a real PocketBase health response instead of assuming one, and prints the URLs:

```bash
./scripts/dev-setup.sh          # add --seed for a demo workspace
.\scripts\dev-setup.ps1         # Windows
```

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost:3000 | Vite dev server, hot reload |
| PocketBase API | http://localhost:8090 | same schema as production |
| PocketBase admin | http://localhost:8090/_/ | credentials from `.env` |

Requires Docker with Compose v2. Node is not needed to run the stack, but is
for `npm run lint` and `npm run build`; `.nvmrc` pins the version.

Everything the stack reads is documented in `.env.example` — copy it to `.env`
to change ports or enable Datadog RUM locally. The API surface is documented in
[docs/api/README.md](./docs/api/README.md), extracted from the migrations.

## What's in this repo

```
apps/web/          React + Vite frontend (the actual site)
apps/pocketbase/   PocketBase backend - migrations, hooks, the real app database
docker-compose.yml Local full stack (web + PocketBase + migration step)
docs/api/          API reference, extracted from the migrations
scripts/dev-setup* One-command local environment setup (bash + PowerShell)
services/          Backend services (praxis_evidence: the community-audited evidence fabric)
scripts/deploy/    The real staging -> production deploy pipeline (ship.py)
scripts/ci/        Build/lint/public-boundary gates, run in CI on every push
scripts/publish/   Canonical release-event publication (wiki + Discord + Reddit)
scripts/discordbot/ The development-aid Discord bot
.bits/             Agent working memory - durable brief, SRS backlog, measured context lock
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

## Roadmap

A 21-day development sprint with eleven milestones. Every row below is a
*planned* deliverable and the percentage is intended cumulative completion, not
measured progress. The status column changes only when the work behind it has
been replayed against its own evidence bar.

| Day | Milestone | Status | Planned cumulative |
|---|---|---|---|
| 1 | Sprint kickoff — foundations | planned | 5% |
| 3 | Auth & onboarding hardening | planned | 12% |
| 5 | Workspace collections live | planned | 20% |
| 7 | Signals pipeline MVP | planned | 30% |
| 9 | Missions — bounded-action engine | planned | 40% |
| 11 | Workflows editor | planned | 50% |
| 13 | Service connectors (Firecrawl, n8n) | planned | 60% |
| 15 | ERP foundation | planned | 70% |
| 17 | Evidence ledger & verification | planned | 80% |
| 19 | Daily edition & specialist desks | planned | 88% |
| 21 | Sprint review — verified replay | planned | 100% |

The interactive version — per-milestone deliverables, the plotted trajectory,
and the live commit and deployment overlay — is at
[buildanddo.com/roadmap](https://buildanddo.com/roadmap). This table is the
static mirror of the same `MILESTONES` list in
[apps/web/src/pages/RoadmapPage.jsx](./apps/web/src/pages/RoadmapPage.jsx).

A milestone reaches `verified` only when an evidence record backs it — a test
result, a probe against the live site, a deployment event. A claim in a commit
message, a pull request description, or this table is not evidence. Until that
record exists the status stays `planned`, `in_progress` or `blocked`, however
finished the work looks.

## Public/private boundary

GitHub is the public collaboration plane. Golden infrastructure, deployment
secrets, and internal release tooling live on a private mirror and never appear
here — enforced by an automated scan on every push and PR
(`scripts/ci/verify_public_boundary.py`), not just a policy statement.

## License

Proprietary — all rights reserved unless stated otherwise in a specific file.
