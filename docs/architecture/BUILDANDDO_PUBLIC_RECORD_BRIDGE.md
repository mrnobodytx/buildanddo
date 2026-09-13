<!-- CGRF: SRS=SRS-BUILDANDDO-PUBLIC-RECORD-001 | CAPS=B | Seat=C-ONE -->
# BuildAndDo Public Record Bridge

BuildAndDo is a place to learn by doing real, verified work together. Part of
that promise is that the work is auditable: every roadmap change and every
documented failure the estate broadcasts to its public channels (Wiki.js,
forum, Discord, Reddit) is visible from inside the app, with the same numbers
the estate holds. This document describes the first, build-time form of that
bridge.

```text
   CONTROLLER ESTATE (D:\HOSTINGER_COMP, read-only for this bridge)
   state/roadmap_broadcast/deliveries.jsonl        -> published counts, wiki page links
   state/roadmap_broadcast/outbox/BC-*/manifest.json -> queued / held counts, recent change ids
   state/error_corpus/tutorials.latest.json        -> public-safe failure tutorials
   state/integrations/validity.latest.json         -> last read-only probe per channel
                     |
                     |  scripts/deploy/integrations_status.py   (ship.py _build, before npm run build)
                     v
   apps/web/public/integrations-status.json        (gitignored build output, copied verbatim into dist)
                     |
                     |  apps/web/src/lib/integrationsStatus.js  (fetch + hook + stale rule)
                     v
   Community -> "Public record" tab            Field Manual -> "Failure tutorials" tab
```

## What is bridged

| Section | Source | Projected fields |
| --- | --- | --- |
| `channels.<wiki\|forum\|discord\|reddit>` | `deliveries.jsonl` | `published` (distinct change ids with a `PASS` receipt), `last_published_at`; for wiki the latest 10 `{change_id, url, published_at}` pages |
| same | `outbox/BC-*/manifest.json` | `queued` (`QUEUED` + `QUEUED_LOCAL`), `held` (`HELD`), the 5 most recent `{change_id, state, created_at}`; for Reddit the first line of `reddit.txt` only when the manifest is `public_safe` and the Reddit channel is not `HELD` |
| `channels.<ch>.validity` / `validity[]` | `validity.latest.json` | `id, state, observed_at, latency_ms, reason` for `wiki, discord, reddit, forum, github, posthog, datadog, mautic, twenty, youtube` only; reasons are scrubbed of secret names |
| `tutorials[]` | `tutorials.latest.json` | `lesson_id, error_class, severity, env, channels` for `public_safe: true` entries only |
| `sections.*` | all of the above | `MEASURED` or `{state: UNMEASURED, reason}` per source |

### The tutorial-to-wiki join

There is no direct key between a tutorial and a wiki page: wiki URLs carry the
broadcast `change_id` (`BC-...`), tutorials carry a `lesson_id` (`LES-ERR-...`).
The bridge therefore follows the chain the estate actually records:

`tutorial.incident_dir` prefixes a path in `manifest.evidence[]` -> that
manifest's `change_id` -> a `PASS` wiki delivery with a `url`.

Each tutorial reports `wiki_join` as the chain used, `CHANGE_FOUND_NOT_PUBLISHED`
(a broadcast exists but the wiki page has not landed) or `NO_JOIN_KEY`, and
`wiki_url` is `null` whenever the chain does not complete. No link is invented.

## What is never bridged

- Secret values, secret *names*, tokens, webhook URLs, Discord message ids,
  content hashes (`sha256`), probe endpoints, identities.
- The text of any `HELD` channel item; only its `change_id` and state.
- Anything reached over the network: the projection reads files only, and the
  browser reads one static JSON file. No channel API key exists client-side.
- Reddit posts: the estate never auto-posts to Reddit. Queued Reddit items are
  shown as "queued for a human to post" and nothing in the app can send them.

A leak guard (`leak_scan`) walks every string in the projection before the
write and refuses the file if anything token-shaped is present (`eyJ...`,
`ghp_`, `glpat-`, `phc_`/`phx_`, 40+ hex characters). A refused write exits 1,
and `ship.py` then writes an explicit `UNMEASURED` marker so the previous
build's file can never masquerade as current.

## Honesty rules the UI applies

- The lib treats anything that is not the expected schema saying `MEASURED`
  as `UNMEASURED`; each channel card and the tutorials tab render an
  `EmptyState` or a literal `UNMEASURED` count, never a placeholder.
- A projection older than 48 hours is flagged `DATA MAY BE STALE` (the same
  rule `RoadmapPage` applies to `roadmap-status.json`).
- Counts are the estate's counts; `published` is receipts, not intent.

## How to regenerate

```powershell
py -3.13 scripts\deploy\integrations_status.py               # writes apps/web/public/integrations-status.json
py -3.13 scripts\deploy\integrations_status.py --selftest    # temp fake estate, real estate never read
py -3.13 scripts\deploy\integrations_status.py --estate X --out Y   # explicit paths
```

The estate root defaults to `BUILDANDDO_ESTATE_ROOT` (env NAME) or the
clone's grandparent (`D:\HOSTINGER_COMP` in the controller layout). `ship.py
_build()` runs the projection automatically before `npm run build`, next to
`roadmap_status.py`, with the same never-fails-the-ship contract.

Frontend tests: `apps/web/src/lib/__tests__/integrationsStatus.test.js`,
`apps/web/src/pages/workspace/__tests__/CommunitySocialPage.publicRecord.test.jsx`,
`apps/web/src/pages/workspace/__tests__/TutorialsPage.failureTutorials.test.jsx`.

## Next step

Live read-through via the platform boundary: once the rooms route is mounted,
the same `buildanddo.integrations-status/v1` document should be served by the
platform (`/hcgi/platform/...`) from the estate's current state, so a learner
in a room sees the record as it changes rather than as of the last build. The
lib's `fetchIntegrationsStatus` is the single seam to repoint; the leak guard
and the per-section `UNMEASURED` contract move with the producer, not the UI.
