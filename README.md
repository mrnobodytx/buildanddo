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
