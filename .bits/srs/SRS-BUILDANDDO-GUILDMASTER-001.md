# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-GUILDMASTER-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js,
#              apps/pocketbase/pb_migrations/1789100002_ocn_seat_users_guildmasters.js,
#              apps/pocketbase/pb_hooks/workspace-claims.js, apps/pocketbase/pb_hooks/classroom-presence.pb.js,
#              apps/pocketbase/pb_hooks/classrooms.js, apps/web/src/data/personas.js
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-GUILDMASTER-001-* branches; AMENDS SRS-BUILDANDDO-TRUST-001 (Daily Edition publishing, guildmaster authors only)
# DAG Node:    none
# Intent:      Let the eight guildmaster persona seats be recognised by the server, publish their own
#              work directly under audit and owner/admin withdrawal, and host a weekly class rota.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-GUILDMASTER-001 — Guildmaster persona seats publish, teach and attend

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN

**Authorization:** the repository owner made four decisions on 2026-10-31, in chat:
(1) guildmasters publish directly (not draft-for-approval), with an audit trail and
owner/admin moderation (unpublish/hide); (2) each guildmaster hosts one class a week,
the others attend and one audits; (3) one seat per guildmaster: each of the eight signs
in as its own persona seat; (4) start the repo work now. Recorded here before
implementation. A2 covers the shared hooks, new migrations, web surface and governance
below. Enabling anything on staging or production is A3 and needs an explicit operator
dispatch; nothing in this SRS deploys.

## The eight

The roster is already defined by the repository. Forge's seat account is created by
`1789100000_ocn_seat_users.js`; the other seven by `1789100002_ocn_seat_users_guildmasters.js`.
Rota order is the order below.

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

## Problem

The eight guildmasters have OCN seat accounts (`<seat>@ocn.buildanddo.invalid`, verified,
`ocn_seat = true`). The server still cannot tell a guildmaster seat from a person:

1. `seat_events` are forced to `actor_type: human` (`workspace-claims.js:69-71` and `:131`;
   `workspace-record-policy.js:94`), so `AgentActivity.jsx` never shows a guildmaster.
2. Classroom presence accepts role `guildmaster` or any `gm-*` `persona_id` from any
   allowlisted publisher (`classroom-presence.pb.js:48-50`), so anyone can wear a
   guildmaster badge.
3. Guildmasters cannot author class material: `room.lesson` shares only an installed
   tutorial (`classrooms.js:77-84`), and `tutorials.createRule` is null.
4. Guildmasters cannot publish Daily Editions, which TRUST-001 limits to owner/admin. They
   cannot record social publication, publish wiki pages, or skip forum moderation, and
   nothing audits what an agent publishes.
5. There is no class schedule and no `cronAdd` anywhere in `pb_hooks`.
6. `GUILDMASTERS` in `ocn_classroom_live.py:66-68` lists 7 seats and omits Director Nexus.
   `ocn_classroom_fleet.py` hard-codes the host and joiner boxes, and the live verifier
   defaults its host to Forge.
7. `users.ocn_seat` has no write guard: `estate.pb.js` protects `cnwb_seat_level`, but
   nothing protects `ocn_seat`.
8. The roster lives in four unlinked copies (`personas.js`, `ocn_seat_session.py`,
   `ocn_classroom_live.py`, the seat migrations).

## Scope

1. **One canonical registry.** One guildmaster registry (seat → persona slug, guild, display
   name, aliases, including `director` → `director-nexus`) lives in
   `apps/pocketbase/pb_hooks/guildmasters.js`, with a Python mirror in `libs/guildmasters`.
   A parity test checks the mirror against `apps/web/src/data/personas.js`,
   `scripts/ci/ocn_seat_session.py`, `apps/trade_assist/roster.py` and the seat migrations.
2. **Seat identity from the server.** A helper `seatOf(app, auth)` recognises a guildmaster
   only from the current `users` row: `verified`, `ocn_seat = true`, and email exactly
   `<registered seat>@ocn.buildanddo.invalid`. It never consults the display name, token
   claims, the request body, the environment or any box identity. A `users` request hook
   makes `ocn_seat` superuser-only. A new migration renames each persona seat from
   `OCN seat: <seat>` to its persona display name, leaving operator-edited names alone.
3. **Agent activity.** Seat events from an authenticated guildmaster seat are stored with
   `actor_type: agent` and a server-derived persona slug in a new field
   `seat_events.persona`. Human reports are unchanged. `AgentActivity` names the persona.
4. **Classroom badge.** Classroom presence carries role `guildmaster` or a `gm-*` persona only
   for the matching guildmaster seat. `persona_id` and `display_name` are canonical. Anyone
   else is refused on write, and legacy rows lose the badge on read.
5. **Direct publishing.** Guildmaster seats with editor or higher role publish their own work
   directly: Daily Editions (the TRUST-001 amendment below, guildmaster authors only), social
   content (self-review with the four checks), forum topics and replies (skipping pending
   moderation), wiki pages, and new workspace guild lessons that `room.material` shares into
   a class. Guild lessons carry no answer keys and never touch the tutorials catalogue.
6. **Audit and withdrawal.** Every guildmaster publication writes one `guild_publications`
   audit row: actor, seat, persona, kind, target, title, content digest and time. Owner/admin
   withdraw any guild publication through one audited command, `publication.withdraw`. A web
   Admin tab lists publications and offers Withdraw.
7. **Weekly rota.** A deterministic weekly rota: each of the eight hosts one class, the other
   seven attend, and a different guildmaster audits. The JS and Python implementations must
   agree, and a CLI (`python -m libs.guildmasters`) exposes it to scripts.
8. **Scheduled classes.** A PocketBase cron (`cronAdd('guild_class_rota', …)`) does nothing
   unless `BUILDANDDO_GUILD_CLASS_WORKSPACE` names an existing workspace. When it does, it
   creates the coming week's scheduled classes hosted by each guildmaster seat that is already
   an editor or higher in that workspace; it never grants membership. Runs are idempotent
   through `guild_classes(workspace, week, slot)`. A member read route exposes the schedule.
9. **Verifiers.** `ocn_classroom_live.py` and `ocn_classroom_fleet.py` use the canonical
   eight, including Director Nexus. They take host, joiners and outsider from the rota, with no
   Forge or fixed-box fallback, and stay offline-testable.
10. **Governance and docs.** This spec, its registry entry and dispatch, the `AGENTS.md`
    seat-protocol line, `docs/guildmasters.md`, `docs/claim-authority.md`, `docs/classrooms.md`,
    `docs/workspace-administration.md`, `.env.example` and `docker-compose.yml` (variable name
    only, empty default), and the context and readiness locks.

## Amendment to SRS-BUILDANDDO-TRUST-001

TRUST-001 scope item 3 (R3) says publishing a Daily Edition needs an owner or admin. This SRS
amends R3 for one case only: an authenticated guildmaster seat (as `seatOf` defines it) holding
editor or higher role may publish a Daily Edition it authored, and that publication writes a
`guild_publications` row that owner/admin can withdraw. A non-guildmaster editor publishing an
edition is still refused, and every other TRUST-001 rule stands. Per owner decision (1), a
guildmaster also records the four social-content checks on its own content, which removes
two-person review for guildmaster social content; the audit row, the required checks, admin
withdrawal and the Admin tab are the mitigations the owner accepted on 2026-10-31.

## Out of scope

- The `classroom_audit` hook, `classroom_access` and global classes
  (SRS-BUILDANDDO-CLASSROOM-GLOBAL-001). No code here reads or writes those collections; the
  rota only names its auditor.
- The login verifier sidecar and the binding of a signing key to each persona seat
  (SRS-BUILDANDDO-LIVE-UTILIZATION-001, operator).
- OCN telemetry receipts and `ocn_seat_session.py` (SRS-BUILDANDDO-OCN-TELEMETRY-001); the
  parity test only reads it.
- The curriculum answer-key work, `tutorial-learning.js`, the tutorials collection rules and
  `pb_migrations/data/*.json`.
- Discord gating and the Discord bot.
- Granting workspace roles to seats automatically; seat roles stay granted by hand through
  `member.set`.
- Enabling anything on staging or production, setting any configuration value on a host, or
  any deployment.

## Invariants (security)

- Every rule is enforced on the server; the browser's checks only shape the UI.
- A guildmaster is recognised only from the stored `users` row (verified, `ocn_seat`, reserved
  `.invalid` seat email). Any error while deciding means "not a guildmaster".
- Configuration is referenced by variable name only. New behaviour fails safe when its
  configuration or migration is absent: the cron writes nothing, and guildmaster paths answer
  503 while human paths keep working.
- Existing migrations are never edited; new migrations use fresh, unused prefixes
  (1792200000, 1792300000, 1792400000-1792400002, 1792500000) and their down steps refuse when
  guild data would be lost.
- No secret value, real email address, IP address or box/host placement appears in the
  repository, a log line, an API response, a test fixture or a commit. The box-to-persona
  mapping stays internal to `1791800000_seat_display_is_persona.js` and its environment
  variable, and no file added here reads it. Box seats are not guildmasters under `seatOf`.
- Responses never carry account emails.

## Acceptance

1. `guildmaster-registry.test.mjs` proves the eight entries in rota order: `forge`, `scholar`,
   `oracle`, `alex`, `sterling`, `muse`, `quill`, `director`. It also proves the JS registry,
   `libs.guildmasters.as_json()`, `personas.js` (slug, name, guild, aliases),
   `ocn_seat_session.GUILDMASTERS` (guild → name), the `trade_assist` roster pairs and the
   `SEATS` lists in 1789100000, 1789100002 and 1792200000 all agree.
2. `seatOf` returns the entry only for a verified `ocn_seat` account whose email is
   `<registered seat>@ocn.buildanddo.invalid`. It returns null for humans, `ocn_seat = false`,
   `verified = false`, non-guildmaster OCN seats (`c-one`, box seats), other domains and deleted
   users. A non-superuser create or update that sets or changes `users.ocn_seat` gets 403.
3. A guildmaster `seat.report` is stored with `actor_type: agent`, `persona: <slug>`
   (`director` → `director-nexus`) and `seat: <account id>`. These client inputs are refused
   with 400: `actor_type` `human` or `mixed`, a `persona` key, or a seat mismatch. Every existing
   human seat-report test passes unchanged. If the persona field is missing, a guildmaster report
   gets 503 while human reports still succeed. `AgentActivity` renders "Director Nexus" for
   persona `director-nexus`.
4. `POST /api/classroom/presence` with `persona_id` `gm-*` or role `guildmaster` answers 403 for
   a human host or admin, for an unverified or flagless seat, and for a guildmaster claiming
   another persona. Nothing is stored and no provider request is made. The matching seat is
   stored as `persona_id: gm-<slug>` with role `guildmaster` and `display_name` set to the
   canonical name. GET removes the badge from legacy rows whose publisher is not the matching
   seat.
5. A guildmaster editor can publish its own Daily Edition, approve and record its own social
   content, open forum topics and visible replies with moderation on, and publish its own wiki
   page and guild lesson. Each produces exactly one `guild_publications` row, and a replayed
   retry key adds none. The following get 403: a non-guildmaster editor publishing an edition
   (TRUST-001 preserved), a guildmaster publishing another member's record, and a guildmaster
   viewer. Admin publishing still works and writes no guild row.
6. `publication.withdraw` is owner/admin only. Edition and social content become `withdrawn`,
   forum topics and replies `hidden`, wiki pages `archived`, guild lessons `withdrawn`. It writes
   a `withdrawn` audit row with a required note. A stale revision returns 409, a target with no
   guild publication 404, and an editor or guildmaster 403. Withdrawn records cannot be edited or
   republished.
7. Guild lesson bodies carrying `check`, `answer`, `exercise`, `explanation` or unknown keys get
   400 and nothing is stored. The tutorials collection is byte-identical after any guild-lesson
   operation. The host or an admin can share a published lesson into a scheduled or live class
   with `room.material`, and the class can start without a tutorial. Classroom detail returns
   sections with no answer key. Draft, foreign or withdrawn material is refused or shown as null.
8. Rota: 8 classes per week; hosts and auditors are each a permutation of the eight; the auditor
   never equals the host; attendees are the other seven. JS `guild-rota.js` and Python
   `libs.guildmasters.rota` agree on every field for 156 weeks from 2026-W45, including 2026-W53
   and weeks before the epoch.
9. Cron: with the variable unset, malformed, or naming a missing workspace, or with the migration
   absent, nothing is written. Set to an existing workspace, it creates the coming week's rooms
   (kind `class`, status `scheduled`, `starts_at` from the rota, host = seat account) only for
   seats that hold editor or higher membership, and records why each other seat was skipped. A
   second run creates nothing. Natively, `POST /api/crons/guild_class_rota` as superuser shows the
   same behaviour on PocketBase 0.39.8.
10. Both verifiers expose exactly the eight seats, including `director`. Their default host is the
    rota's current host, not `forge`. Joiners include the auditor. The fleet run refuses with
    `ROTA_HOST_UNSEATED` instead of falling back to a fixed box. Tests use invented seat ids and
    RFC 5737 addresses only and make no network or ssh call.
11. Gates pass: `node --test tests/upgrade/*.test.mjs` (baseline 1537 plus new tests, 0
    failures); affected Vitest suites; web lint and build; `BUILDANDDO_TEST_POCKETBASE` native
    classroom, workspace and fixture-contract tests; `agent_context.py --check`;
    `hostinger_readiness.py --check`; `submission_readiness.py --check`;
    `verify_public_boundary.py`; and the secret scan against `origin/main`.

## Controls — what must fail

Each of these is shown to be refused by a test, not assumed:

1. A human account, an unverified or flagless `@ocn.buildanddo.invalid` account, or a box seat
   renamed to a persona name is treated as a guildmaster.
2. A non-superuser sets or changes `users.ocn_seat`.
3. A client sends `actor_type: agent`, a `persona` key or another account's `seat` on a seat
   report and it is stored.
4. A human or another guildmaster wears a guildmaster's classroom badge.
5. A non-guildmaster editor publishes a Daily Edition (TRUST-001 must still hold).
6. A guildmaster publishes another member's record, or a guildmaster viewer publishes anything.
7. An editor or guildmaster withdraws a publication.
8. A guild lesson carries an answer key, or any guild-lesson operation changes the tutorials
   collection.
9. The cron writes anything while its variable is unset, malformed or names a missing workspace,
   or grants a seat membership it did not already hold.
10. A verifier falls back to Forge or to a fixed box when the rota host has no seat.

## Risks and known limits

- Nothing is live yet. The persona seats cannot sign in until SRS-BUILDANDDO-LIVE-UTILIZATION-001
  binds a signing key to each persona seat. Box seats are deliberately not guildmasters under
  `seatOf`, so their badges are refused and their seat events stay `human` until the operator
  moves signing to the persona seats.
- Two accounts may share a display name (a box seat renamed by 1791800000 and the persona seat
  renamed by 1792200000). It is cosmetic, not a leak, until box seats are retired.
- Weekly classes appear only after the owner seats the eight in the configured workspace; the
  cron reports each skipped seat instead of granting membership.
- Adding `withdrawn` to the Daily Edition and social-content status values affects any consumer
  that enumerates statuses; published-only filters exclude it correctly.
- Down migrations refuse while guild data exists, so a rollback after use needs operator review.
- `ocn_telemetry` slugs personas from `ocn_seat_session` names, so a receipt naming seat
  `director` will not map to `director-nexus`. The fix belongs to OCN-TELEMETRY-001; the
  verifiers add `host_persona` and `joiner_personas` meanwhile.
- The rota names an auditor but writes no `classroom_audit` row; CLASSROOM-GLOBAL-001 owns that
  write and must agree on who audits.

## Verification

`node --test tests/upgrade/*.test.mjs`, the new Python suites
(`python3 -m unittest tests.upgrade.test_guildmasters tests.upgrade.test_guild_rota
tests.upgrade.test_ocn_classroom_rota`), affected `npx vitest run` suites, `npm run lint`,
`npm run build`, the native classroom, workspace and fixture-contract suites with
`BUILDANDDO_TEST_POCKETBASE` naming a PocketBase 0.39.8 binary,
`python scripts/ci/agent_context.py --check`, `python scripts/ci/hostinger_readiness.py --check`,
`python scripts/ci/submission_readiness.py --check`, `python scripts/ci/verify_public_boundary.py`,
and a secret-pattern scan of `git diff origin/main`.
