<h1 align="center">BuildAndDo</h1>

<p align="center">
  <strong>Learn by doing real work. Lessons lead into missions, and a mission isn't finished until somebody has checked it.</strong>
</p>

<p align="center">
  <a href="https://buildanddo.com"><img alt="Live site" src="https://img.shields.io/badge/live-buildanddo.com-b91c1c?style=flat-square"></a>
  <a href="https://buildanddo.com/roadmap"><img alt="Roadmap" src="https://img.shields.io/badge/roadmap-public-18181b?style=flat-square"></a>
  <a href="https://buildanddo.com/_version"><img alt="Deploy receipt" src="https://img.shields.io/badge/deploy-receipted-166534?style=flat-square"></a>
  <a href="#license"><img alt="License" src="https://img.shields.io/badge/license-proprietary-71717a?style=flat-square"></a>
</p>

---

### Watch the four-minute tour

Four of the platform's own agents walk the whole site — the first half signed out,
the second half signed in and working inside a real workspace. Recorded live against
production, not a mockup.

<p align="center">
  <a href="https://youtu.be/ZEi06LLUvwQ">
    <img src="https://img.youtube.com/vi/ZEi06LLUvwQ/maxresdefault.jpg" alt="BuildAndDo platform tour" width="640">
  </a>
</p>

### Where things are

| | |
|---|---|
| **Live site** | https://buildanddo.com |
| **Public roadmap** | https://buildanddo.com/roadmap — dated checkpoints, outcomes recorded against them |
| **Practice library** | https://buildanddo.com/practice — every lesson readable without an account |
| **Classrooms** | https://buildanddo.com/classrooms — live shared lessons |
| **Wiki** | https://wiki.buildanddo.com — canonical development record |
| **Forum** | https://forum.buildanddo.com |
| **Discord** | https://discord.gg/vTDZxmpHHC |
| **Deploy receipt** | https://buildanddo.com/_version — the commit production is actually serving |

## Why this repository is public

Not for stars, and not because everything lives here.

BuildAndDo's claim is that work should be checkable by someone who does not trust
the person who did it. A project making that argument while keeping its own source,
its deploy pipeline and its verification gates behind a curtain is arguing against
itself. So the parts a skeptic would need in order to check us are here: the
application, the real database migrations, the deploy rail that gates production,
the CI checks that run on every push, and the evidence and witness architecture.

Three consequences worth stating plainly:

- **You can run it.** `docker compose up -d` gets you the same schema production
  runs, with no credentials and no access to ours.
- **You can check our claims rather than read them.** The roadmap is dated, the
  deploy endpoint reports the live commit, and the evidence design is documented
  including what it does *not* prove.
- **It costs us something.** Public means our incomplete days are public too. The
  roadmap shows what slipped. That is the point of publishing it.

Infrastructure, deployment secrets and internal release tooling stay on a private
mirror and are kept out by an automated scan on every push, not by a promise —
see [Public/private boundary](#publicprivate-boundary).

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

## Provenance & verification

BuildAndDo keeps an internal hash-linked evidence chain: every receipt contains
the digest of the record before it, so altering old history breaks the chain.
That proves internal consistency — and nothing more, because the records, the
clock and the verifier all belong to us. A skeptic can reasonably ask: could you
have rewritten all of that yesterday and dated it September 10?

So BuildAndDo periodically publishes cryptographic fingerprints of its verified
evidence — a single 32-byte root digest per evidence epoch — to a public network
it does not control. Anyone can then recompute the fingerprint from the evidence
and check the history independently, instead of taking our word for it.

What an anchor proves:

- the fingerprint existed no later than the public timestamp
- the evidence read today still matches the fingerprint that was anchored

What it does not prove:

- that any underlying claim is true — verification does that, and a publicly
  witnessed false claim is still false
- that anything is authorised; a public anchor carries no authority at all

No private data crosses the boundary: only a digest is published — never PII,
secrets, customer content, source documents or knowledge-graph contents.

The architecture, the control specification (`NEXUS-AUD-002`), the epoch model,
the anchor triggers and the `buildanddo.public-anchor/v1` schema are documented
in [docs/architecture/EVIDENCE_WITNESS.md](./docs/architecture/EVIDENCE_WITNESS.md).
The user-facing record for a single capability — source lineage, SBOM, TEVV
verification, public witness — is
[docs/architecture/CAPABILITY_PASSPORT.md](./docs/architecture/CAPABILITY_PASSPORT.md).

Attribution: this design came out of the BuildAndDo Discord. **ErichG** proposed
publicly notarising evidence roots rather than moving anything onto a chain;
**Fabi** argued for learning by doing, which is the same principle applied to our
own claims; **delphianQ** argued that LLMs need a structural, GPL-equivalent
foundation, which verifiable provenance is a prerequisite for. Recording that is
part of the point — a project asking to be judged on verifiable records should be
able to show where its own designs came from.

## Public/private boundary

GitHub is the public collaboration plane. Golden infrastructure, deployment
secrets, and internal release tooling live on a private mirror and never appear
here — enforced by an automated scan on every push and PR
(`scripts/ci/verify_public_boundary.py`), not just a policy statement.

## License

Proprietary — all rights reserved unless stated otherwise in a specific file.
