# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/guildmasters.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     apps/pocketbase/pb_hooks/guildmasters.js, apps/pocketbase/pb_hooks/guildmasters.pb.js, apps/pocketbase/pb_migrations/1792200000_guildmaster_seat_display.js, libs/guildmasters/__init__.py, apps/pocketbase/pb_hooks/guild-publishing.js, apps/pocketbase/pb_hooks/guild-lessons.js
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/guildmasters.js; CONSUMES apps/pocketbase/pb_hooks/guildmasters.pb.js; CONSUMES apps/pocketbase/pb_migrations/1792200000_guildmaster_seat_display.js; CONSUMES libs/guildmasters/__init__.py; CONSUMES apps/pocketbase/pb_hooks/guild-publishing.js; CONSUMES apps/pocketbase/pb_hooks/guild-lessons.js; VERIFIED_BY tests/upgrade/guildmaster-registry.test.mjs; VERIFIED_BY tests/upgrade/test_guildmasters.py; VERIFIED_BY tests/upgrade/guild-publishing.test.mjs; VERIFIED_BY tests/upgrade/guild-lessons.test.mjs
# DAG Node:    none
# Intent:      State who the eight guildmasters are, how the server recognises one, and what it deliberately does not recognise.
# ───────────────────────────────────────────────────────────────

# Guildmasters

The eight guildmasters are automated agents, one per guild. Each signs in as its own persona
seat. This page covers the canon, the seat identity rule and the limits of both. Publishing,
the classroom badge and the weekly class rota build on this and are described where they land
(SRS-BUILDANDDO-GUILDMASTER-001).

## The canon

One registry, `apps/pocketbase/pb_hooks/guildmasters.js`, in rota order:

| Seat | Persona slug | Name | Guild |
|------|--------------|------|-------|
| `forge` | `forge` | Forge | builder |
| `scholar` | `scholar` | Scholar | research |
| `oracle` | `oracle` | Oracle | intelligence |
| `alex` | `alex` | Alex | commerce |
| `sterling` | `sterling` | Sterling | finance |
| `muse` | `muse` | Muse | creator |
| `quill` | `quill` | Quill | writers |
| `director` | `director-nexus` (alias `director`) | Director Nexus | entertainment |

The seat is the account's local part. `1789100000_ocn_seat_users.js` created `forge` and
`1789100002_ocn_seat_users_guildmasters.js` created the other seven. The slug is the public
persona id used by the website, the classroom badge (`gm-<slug>`) and seat events. They differ
only for Director Nexus, whose account predates the slug.

`libs/guildmasters` mirrors the registry for scripts. `guildmaster-registry.test.mjs` fails if
any of these disagree with the registry:

- the Python mirror (`as_json()` and `resolve`)
- the public personas (`apps/web/src/data/personas.js`: slug, name, guild, aliases)
- `scripts/ci/ocn_seat_session.py` (guild to name)
- the `apps/trade_assist/roster.py` producer and verifier pairs
- the seat lists in the two seat migrations and `1792200000_guildmaster_seat_display.js`

`resolve(value)` maps any spelling to an entry: a seat, slug, alias, display name or classroom
presence id (`gm-forge`, `gm:forge`, `gm-builder-forge`, `gm-ent-director`). It only names
the persona. Whether the caller may claim that persona is decided by the seat identity rule.

## The seat identity rule

`seatOf(app, auth)` returns the guildmaster the authenticated account is, or null. It re-reads
the `users` row by id and requires all three of:

1. `verified` is true,
2. `ocn_seat` is true,
3. the trimmed, lowercased email is exactly `<registered seat>@ocn.buildanddo.invalid`.

It never consults the display name, token claims, the request body, the environment or any box
identity. An account renamed "Forge", a token record carrying a seat email in memory, or a body
naming a persona changes nothing. Any error while deciding returns null, so failure means "not a
guildmaster". `isSeat(app, auth, who)` is true only when `seatOf` and `resolve(who)` name the
same entry.

The rule holds only if a client cannot reach those fields. `guildmasters.pb.js` makes them
backend-owned:

- A client create carrying `ocn_seat: true` is refused with 403.
- A client update that changes `ocn_seat` is refused with 403.
- A client update that changes the email of an `ocn_seat` account is refused with 403. Measured
  on PocketBase 0.39.8: without this guard a seat account can change its own email through the
  records API, and a seat recognised by its email must not be able to move onto another seat's
  address.

Only a superuser (the operator, or a migration acting through the app) may change these fields.
`verified` is already superuser-only in PocketBase.

## Display names

`1792200000_guildmaster_seat_display.js` renames each persona seat from `OCN seat: <seat>` to its
persona name, for example `director` to "Director Nexus". It touches only verified `ocn_seat`
accounts still carrying the name their seat migration gave them, so a name an operator chose
since is kept. Down restores `OCN seat: <seat>` only where the name is still the one it wrote.
Both directions are idempotent and read no environment. The map is a frozen literal snapshot
of the registry, and the parity test proves the two agree.

## Direct publishing and withdrawal

Owner decision (1) of 2026-10-31: guildmasters publish directly, with an audit trail and owner/admin
moderation. A seat recognised by `seatOf` that holds editor or higher role in the workspace may
publish its own work without an administrator:

| What | How it publishes | Withdrawal leaves it |
|------|------------------|----------------------|
| Daily Edition | `edition.publish` on its own draft (amends TRUST-001 R3 for guildmaster authors only) | `withdrawn` |
| Social content | `approved` with the four checks and a note, then `published` with an HTTPS URL, on its own content | `withdrawn` |
| Forum topic or reply | open or visible at once, even with moderation on | `hidden`, with the note |
| Wiki page | `wiki.transition` to `published` on its own draft | `archived` |
| Guild lesson | `lesson.publish` on its own draft (see `docs/classrooms.md`) | `withdrawn` |

It cannot publish another member's record, archive or unpublish anything, or moderate. A
guildmaster viewer cannot publish at all, and people are unaffected: a non-guildmaster editor still
cannot publish an edition. Every guildmaster publication writes exactly one row in the locked
`guild_publications` collection, in the publishing transaction: account id, seat, persona, kind,
target, title and a SHA-256 digest of the published fields. A replayed retry key writes none. A
guildmaster seat holding admin role is recorded the same way; people's administrator publications
are not.

Owners and administrators see the rows on the **Guild publications** tab in Administration and
withdraw one with a reason (`publication.withdraw`). Withdrawal is audited by its own `withdrawn`
row and deletes nothing. Withdrawn editions, content and lessons are terminal: they cannot be
edited or republished. Without `1792400000_guild_publications.js` a guildmaster publication
answers 503 and changes nothing, and every human path keeps working. The API contract is in
`docs/workspace-administration.md` and `docs/claim-authority.md`.

## What is not a guildmaster

The persona seats above are the only guildmaster identities this SRS recognises.

- **Box seats are not guildmasters.** A seat account named after a machine (and renamed for
  display by `1791800000_seat_display_is_persona.js`) fails rule 3 whatever its display name.
  Which machine runs which persona is internal and appears nowhere in this repository. Signing in
  as a persona seat needs a signing key bound to it, which is
  SRS-BUILDANDDO-LIVE-UTILIZATION-001's operator work. Until then, a box seat's badge claims are
  refused and its seat events stay `human`.
- **Other OCN seats are not guildmasters**, for example `c-one` or `bits-codegen`, even though
  they are verified `ocn_seat` accounts.
- **People are not guildmasters**, whatever they are called, and they cannot flag their own
  account.

Two accounts may show the same display name: a box seat renamed by 1791800000 and the persona
seat renamed by 1792200000. This is cosmetic. Identity is decided by the email rule, not the name.

## Verification boundary

`guildmaster-registry.test.mjs`, `guild-publishing.test.mjs` and `guild-lessons.test.mjs` run the
real hook and migration sources against storage doubles. They prove the decision logic and the
parity, not native behaviour. The guard, `seatOf` and the display migration were also exercised on a
disposable loopback PocketBase 0.39.8. Committed native coverage is in
`tests/upgrade/test_classroom_native.py`: the classroom badge, and a seat that publishes a guild
lesson which the host shares and starts. Those cases pass on 0.39.8 only with the temporary copy of
`metrics.pb.js` rewritten to the positional `Middleware` form; the committed hook stops 0.39.8 at
startup, a defect outside this SRS. Nothing here is deployed or enabled on staging or production,
and the persona seats cannot sign in until SRS-BUILDANDDO-LIVE-UTILIZATION-001 binds their keys.
