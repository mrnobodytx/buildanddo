# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-COMMUNITY-WEB-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-COMMUNITY-WEB-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-COMMUNITY-WEB-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/web/src/components/site/Footer.jsx, apps/web/src/components/Seo.jsx,
#              apps/web/tools/generate-seo.mjs, apps/web/src/pages/RoadmapPage.jsx,
#              scripts/ci/ocn_seat_session.py
# EnumType:    Doc
# EnumEdges:   GOVERNS apps/web/src/lib/communityLinks.js; GOVERNS apps/web/src/data/personas.js;
#              GOVERNS apps/web/public/community-status.json; GOVERNS scripts/ci/ocn_seat_session.py
# Intent:      Record the community-surface, persona-profile, community-health and seat-identity
#              directions of 2026-09-22 as one reviewable scope with its verification commands.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-COMMUNITY-WEB-001 — One source for community links, public persona profiles, honest community health, and no machine names in seat identity

## Why this exists

Measured 2026-09-22 at `da1b57f`, relayed by the C-ONE dispatch:

1. Community links are scattered. Only `Footer.jsx` links the forum, wiki and Reddit;
   `ContactPage.jsx` carries a second copy of the Discord invite; `generate-seo.mjs` writes an
   `llms.txt` that names only Reddit and Gumroad; `Seo.jsx` publishes no `sameAs`. Only one Discord
   invite may ever be published - other invites land in a moderator-only channel - so a second
   hand-typed copy is a correctness risk, not a style problem.
2. No guildmaster persona has a profile page, although each now has a forum account carrying an
   "OCN agent" badge and a wiki page.
3. `scripts/ci/ocn_seat_session.py` hard-codes which fleet machine each persona runs on. The
   repository is public. Operator rule (2026-09-22): no public surface carries a fleet machine name
   or any IP address.
4. Every "Service status" link leaves the domain for `citadel-nexus.com/status`, and nothing public
   reports whether the community surfaces themselves are reachable.

## Requirements

1. **R1 - one source.** `apps/web/src/lib/communityLinks.js` holds every community URL with an id
   and a label. The footer, the contact page, `llms.txt` and the JSON-LD `sameAs` read it. A unit
   test fails when any other file under `apps/web/src` or `apps/web/tools` hard-codes a Discord
   invite, forum, wiki or subreddit URL.
2. **R2 - public persona profiles.** `/guild` lists the eight guildmasters and `/guild/:slug`
   profiles one. Each profile says plainly that it is an automated agent and links only the
   persona's public accounts (forum, wiki). The persona data carries no machine, box, host or
   address field; a test fails if a fleet machine name or an IP address appears in the data or in
   either rendered page.
3. **R3 - classroom presence names the persona.** A classroom presence row for a guildmaster links
   to that persona's profile instead of printing the raw presence id.
4. **R4 - community health is honest.** `apps/web/public/community-status.json` has a declared
   schema (`buildanddo.community-status/v1`). The roadmap and a same-domain `/status` page render
   each canonical surface as UP, DEGRADED, DOWN or UNMEASURED. An absent, unreadable, unrecognised
   or stale file renders every surface UNMEASURED with the reason; nothing renders UP without a
   fresh reading.
5. **R5 - status stays on the domain.** Status links point at `/status`, which renders
   `platform-health.json` and `community-status.json` with their timestamps and age.
6. **R6 - the seat learns its persona on its own box.** `ocn_seat_session.py` carries no
   persona-to-machine table. It reads the box's own identity (`/opt/citadel/node.json` and the
   box-local `FLEET_PLACEMENT.json`), joins on guild to the canon guildmaster, and refuses - before
   any network call or telemetry - when that identity is missing, contradicts itself or names a
   guild with no guildmaster.

## Non-goals

Deployment, pushing, writing `community-status.json` from a live probe (a separate probe owns that),
changing `activity-status.json` or its publisher, the PostHog event contract of
`ocn_seat_session.py`, and machine names in other files (recorded as findings).

## Verification

```bash
npm --prefix apps/web exec -- vitest run src/lib/__tests__/communityLinks.test.jsx src/lib/__tests__/communityStatus.test.js src/pages/__tests__/GuildPages.test.jsx src/pages/__tests__/StatusPage.test.jsx
npm test
npm run build
python -m unittest tests.upgrade.test_ocn_seat_session
python scripts/ci/verify_public_boundary.py
```
