# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-GUILDMASTER-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-GUILDMASTER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     .bits/srs/SRS-BUILDANDDO-GUILDMASTER-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-GUILDMASTER-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-GUILDMASTER-001.md
# DAG Node:    none
# Intent:      Authorize the owner-decided guildmaster seat, publishing and class-rota work without deployment, secret or external effects.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-GUILDMASTER-001

**SRS:** SRS-BUILDANDDO-GUILDMASTER-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

The server recognises each of the eight guildmaster persona seats from its own account, records
its seat reports as agent activity, lets it wear only its own classroom badge, lets it publish
its own work directly under an audit trail that owners and admins can withdraw, and schedules a
weekly class rota in which each guildmaster hosts once while the others attend and one audits.

## Authority

Owner decisions of 2026-10-31, made in chat: (1) guildmasters publish directly (not
draft-for-approval), with an audit trail and owner/admin moderation (unpublish/hide); (2) each
guildmaster hosts one class a week, the others attend and one audits; (3) one seat per
guildmaster: each of the eight signs in as its own persona seat; (4) start the repo work now.
A2 covers the shared hooks, new migrations, web surface and governance named below. Nothing here
deploys; enabling the rota or anything else on staging or production is a separate A3 step.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Foundation: register the SRS, canonical guildmaster registry (JS and Python), `seatOf` seat identity, `ocn_seat` write guard, persona display names | `node --test tests/upgrade/guildmaster-registry.test.mjs && python3 -m unittest tests.upgrade.test_guildmasters && (cd apps/web && npx vitest run src/pages/__tests__/GuildPages.test.jsx) && echo PASS` | done |
| 2 | Agent activity: guildmaster seat reports stored as `actor_type: agent` with a server-derived `seat_events.persona`; AgentActivity names the persona | `node --test tests/upgrade/workspace-claims.test.mjs tests/upgrade/trust-shared-records.test.mjs tests/upgrade/mutation-telemetry.test.mjs && (cd apps/web && npx vitest run src/components/broadcast/__tests__/AgentActivity.test.jsx && npm run lint) && python3 -m unittest tests.upgrade.test_workspace_native tests.upgrade.test_native_fixture_contracts && echo PASS` | done |
| 3 | Badge: classroom presence carries a guildmaster badge only for the matching seat; legacy rows lose it on read | `node --test tests/upgrade/classroom-presence.test.mjs tests/upgrade/classroom-media.test.mjs tests/upgrade/classroom-telemetry.test.mjs && python3 -m unittest tests.upgrade.test_classroom_native tests.upgrade.test_native_fixture_contracts && echo PASS` | done |
| 4 | Publishing: direct guildmaster publishing with `guild_publications` audit rows, keyless guild lessons shared by `room.material`, owner/admin `publication.withdraw`, Admin tab | `node --test tests/upgrade/guild-publishing.test.mjs tests/upgrade/guild-lessons.test.mjs tests/upgrade/workspace-claims.test.mjs tests/upgrade/workspace-community.test.mjs tests/upgrade/trust-shared-records.test.mjs tests/upgrade/business-learning.test.mjs tests/upgrade/classroom-system.test.mjs && (cd apps/web && npx vitest run src/components/workspace/__tests__/GuildPublicationsPanel.test.jsx src/pages/workspace/__tests__/DailyEditionPage.test.jsx src/components/broadcast/__tests__/AgentActivity.test.jsx && npm run lint && npm run build) && python3 -m unittest tests.upgrade.test_classroom_native tests.upgrade.test_workspace_native tests.upgrade.test_native_fixture_contracts && echo PASS` | done |
| 5 | Rota: deterministic weekly rota (JS and Python, CLI) and the env-gated, idempotent `guild_class_rota` cron with a member read route | `node --test tests/upgrade/guild-rota.test.mjs tests/upgrade/guild-classes.test.mjs tests/upgrade/community-quiz.test.mjs && python3 -m unittest tests.upgrade.test_guild_rota && python3 -m libs.guildmasters week --week 2026-W45 --json && python3 -m unittest tests.upgrade.test_classroom_native tests.upgrade.test_native_fixture_contracts && echo PASS` | done |
| 6 | Verifiers: `ocn_classroom_live.py` and `ocn_classroom_fleet.py` use the canonical eight and take host, joiners and auditor from the rota, with no Forge or fixed-box fallback | `python3 -m unittest tests.upgrade.test_ocn_classroom_rota tests.upgrade.test_ocn_telemetry tests.upgrade.test_guildmasters tests.upgrade.test_guild_rota && python3 scripts/ci/ocn_classroom_live.py selftest && python3 tests/upgrade/check_discordbot.py && echo PASS` | done |
| 7 | Review fixes: the web classroom reads and renders shared guild material; the guild lesson limit counts stored bytes; the live verifier's control outsider is never already a member of the host's workspace; the verifier test pairs no real box with a persona; the growth lock is regenerated | `node --test tests/upgrade/guild-lessons.test.mjs && (cd apps/web && npx vitest run src/lib/__tests__/classrooms.test.js src/pages/workspace/__tests__/ClassroomsGuildMaterial.test.jsx src/pages/workspace/__tests__/ClassroomsFlow.test.jsx && npm run lint && npm run build) && python3 -m unittest tests.upgrade.test_ocn_classroom_rota tests.upgrade.test_system_growth && python3 scripts/ci/system_growth.py --check && python3 -m unittest tests.upgrade.test_classroom_native tests.upgrade.test_native_fixture_contracts && echo PASS` | in_progress |

Every native suite above runs with `BUILDANDDO_TEST_POCKETBASE` naming a PocketBase 0.39.8
binary; a missing binary is a failure, not a pass.

Row 2's gate cannot print PASS on the current base. Three `test_workspace_native` cases fail before
row 2 and after it alike: `test_signal_workflow_independent_review_and_operator_readback` and
`test_source_auth_revocation_staleness_and_foreign_denial` fail (400 != 200), and
`test_business_execution_atomic_erp_receipt_and_independent_review` errors (KeyError 'id'), because
`signal.propose` answers 400 "priority: Invalid value medium." in the native fixture. The suite runs
14 cases: 11 pass, and the same 2 failures and 1 error occur at origin/main. Row 2 changes no code on
that path. The failures need their own finding and owner. Every node suite in the row passes, as do the
Vitest suite, lint and the fixture contracts.

Row 3's native gate cannot print PASS on the current base. `apps/pocketbase/pb_hooks/metrics.pb.js`
(unchanged since a9b6e71, outside this SRS) registers `new Middleware({ func, priority })`, which
PocketBase 0.39.8 rejects at startup. Every `test_classroom_native` case therefore fails before it
runs: 10 of 10 at the base and 11 of 11 with row 3. With only the disposable copy of that hook
rewritten to the positional `new Middleware(func, priority)` form, all 11 pass, including the new
badge case. The fixture-contract suite passes unchanged. The hook needs its own fix and owner.

Row 4's gate cannot print PASS on the current base either, for three reasons that predate it and lie
outside this SRS. `test_classroom_native` stops at startup on the same `metrics.pb.js` defect; with
only its disposable copy rewritten, all 12 cases pass, including the new guild-lesson case.
`test_workspace_native` keeps the three failures recorded with row 2 (`signal.propose` answers 400
"priority: Invalid value medium."): 11 of 14 pass, the same three fail at the base. In
`DailyEditionPage.test.jsx` the case "keeps publication disabled for an editor" fails identically at the
base, because the page renders Publish only for administrators; the other five cases pass. Every node
suite in the row passes, as do the new Vitest suite, lint, the build and the fixture contracts.

Row 5's gate cannot print PASS on this base for the same `metrics.pb.js` reason: `test_classroom_native`
stops at startup. With only the disposable copy of that hook rewritten, all 14 native classroom cases
pass, including the two new rota cases: with `BUILDANDDO_GUILD_CLASS_WORKSPACE` naming the fixture
workspace, `POST /api/crons/guild_class_rota` as the fixture superuser creates the coming week's classes
for the seated editor hosts only, matching `libs.guildmasters.rota`, and a second run creates none; on
the default server the same run writes nothing. The node suites, the Python rota suite, the CLI and the
fixture contracts pass unchanged. No `apps/web` file changed in row 5.

Row 6's gate prints PASS. Both verifiers take the eight from `libs.guildmasters` and the cast from
`libs.guildmasters.rota`; `test_ocn_classroom_rota.py` drives them with `urllib.request.urlopen`,
`subprocess.run` and the socket layer refusing every attempt, invented seat ids and RFC 5737
addresses only. Neither verifier adds a migration or hook, so no native case applies, and nothing was
run against staging.

Row 7 answers the confirmed review findings on the branch head. A class sharing guild material could
not be opened, joined or ended from the web page, because the browser adapter refused its detail read.
Material within the advertised character limit could still fail at save, because PocketBase stores
`<`, `>` and `&` as six-byte escapes. The live verifier could pick a control outsider that an earlier
run had already seated in the host's workspace. One verifier test paired a real fleet box id with a
persona. `.bits/growth.lock.json` was on the must-not-touch list, so `system_growth.py --check` and
`test_the_live_lock_is_current` failed on the review head while passing on main. The lock is now
regenerated by its script, as the SRS branches e39d344, deb4071, 9e0fddc and e54aa07 did. The root
`README.md` keeps only the generated catalogue row that `readme_check` needs for the new library README.

Every slice also runs the repository gates before its commit is final:
`node --test tests/upgrade/*.test.mjs` (baseline 1537 pass, 0 fail, plus the slice's new tests);
a review of the milestone rationale and next actions in `.bits/hostinger-readiness.json`, then
`python scripts/ci/hostinger_readiness.py --refresh` and `--check`;
`python scripts/ci/agent_context.py --write` and `--check`;
`python scripts/ci/submission_readiness.py --check`; `python scripts/ci/verify_public_boundary.py`;
and a secret-pattern scan of `git diff origin/main`. Refreshing a lock establishes no native,
browser or deployed acceptance.

## Constraints

- May touch: this dispatch, the SRS, the registry (one entry), `.bits/context.lock.json`
  (regenerated only by `agent_context.py --write`), `.bits/hostinger-readiness.lock.json`
  (regenerated only by `hostinger_readiness.py --refresh` after field review),
  `.bits/hostinger-readiness.json` (milestone fields only if review shows they are stale),
  `AGENTS.md` (the seat communication protocol bullet only);
  new `apps/pocketbase/pb_hooks/guildmasters.js`, `guildmasters.pb.js`, `guild-publishing.js`,
  `guild-publishing.pb.js`, `guild-lessons.js`, `guild-lessons.pb.js`, `guild-rota.js`,
  `guild-classes.js`, `guild-classes.pb.js`; `apps/pocketbase/pb_hooks/workspace-claims.js`,
  `workspace-record-policy.js` (comment and header only), `classroom-presence.pb.js`,
  `business-policy.js`, `workspace-community.js`, `classrooms.js`;
  new migrations `1792200000_guildmaster_seat_display.js`, `1792300000_seat_event_persona.js`,
  `1792400000_guild_publications.js`, `1792400001_guild_withdrawn_status.js`,
  `1792400002_guild_lessons.js`, `1792500000_guild_class_schedule.js` (prefixes verified
  unused on 2026-10-31);
  new `libs/guildmasters/__init__.py`, `rota.py`, `__main__.py`, `README.md`;
  `scripts/ci/ocn_classroom_live.py`, `scripts/ci/ocn_classroom_fleet.py`;
  `apps/web/src/components/broadcast/AgentActivity.jsx` and its test,
  `apps/web/src/lib/seatComms.js` (`toSeatEvent` persona field and doc comment), new
  `apps/web/src/lib/guildPublications.js`, new
  `apps/web/src/components/workspace/GuildPublicationsPanel.jsx` and its test,
  `apps/web/src/pages/workspace/AdminPage.jsx` (one tab),
  `apps/web/src/components/workspace/workspaceHelpers.jsx` (status maps: add `withdrawn`),
  `apps/web/src/lib/observability/config.js` (only to name the withdraw mutation if the
  mutation telemetry pattern requires it);
  `apps/web/src/lib/classrooms.js` (classroom detail accepts shared guild material and the
  adapter sends `room.material`), `apps/web/src/pages/workspace/ClassroomsPage.jsx` (the shared
  lesson panel only), new tests `apps/web/src/lib/__tests__/classrooms.test.js` and
  `apps/web/src/pages/workspace/__tests__/ClassroomsGuildMaterial.test.jsx`;
  `README.md` (only the generated Libraries catalogue row for `libs/guildmasters/README.md`,
  written by `python scripts/ci/readme_check.py --write`, which `readme_check` requires);
  `.bits/growth.lock.json` (regenerated only by `python scripts/ci/system_growth.py --write`,
  after the code commits, so the review head's source suite matches the repository);
  new tests `tests/upgrade/guildmaster-registry.test.mjs`, `test_guildmasters.py`,
  `guild-publishing.test.mjs`, `guild-lessons.test.mjs`, `guild-rota.test.mjs`,
  `guild-classes.test.mjs`, `test_guild_rota.py`, `test_ocn_classroom_rota.py`; added tests in
  `tests/upgrade/workspace-claims.test.mjs` (existing expectations unchanged) and
  `classroom-presence.test.mjs` (the `gm:forge` test converted to a seat account);
  `tests/upgrade/test_classroom_native.py` (hooks, migrations, seed seat account, new native
  cases, optional extra environment), `test_workspace_native.py` (hook copy list only),
  `test_native_fixture_contracts.py` (expected classroom migration set only);
  new `docs/guildmasters.md`; `docs/claim-authority.md`, `docs/classrooms.md`,
  `docs/workspace-administration.md`; `.env.example` (one variable name) and
  `docker-compose.yml` (one passthrough with an empty default).
- Must not touch: the up or down step of any existing migration;
  `1791800000_seat_display_is_persona.js` or anything that reads its persona variable (no
  box-to-persona mapping in any file, test, commit or doc);
  `1792000000_classroom_global_and_access.js`, and no code that reads or writes
  `classroom_audit` or `classroom_access`, nor global classes (CLASSROOM-GLOBAL-001);
  `ocn-login.pb.js` and the rooms sidecar verifier (LIVE-UTILIZATION-001);
  `classroom-media.js` and `classroom-realtime-lib.js` (the publisher allowlist semantics stay);
  `workspace-administration.js` (seat roles stay granted by hand through `member.set`);
  `tutorial-learning.js`, the tutorials collection rules and `pb_migrations/data/*.json`;
  `scripts/ci/ocn_seat_session.py`, `scripts/ci/ocn_telemetry.py` and their tests
  (OCN-TELEMETRY-001; read only by the parity test); `apps/web/src/data/personas.js`
  (read-only consumer); `apps/trade_assist/**` (read-only parity); `services/**`, the Discord bot
  and any Discord gating; `docker-compose.staging.yml`, `scripts/deploy/**`, `.gitlab-ci.yml`,
  `.gitlab/ci/**`, `scripts/ci/hostinger_checks.py` (no new CI check); `CHANGELOG.md`; any
  fleet map; secrets or `secrets/**`; any staging or production
  configuration, host or deployment.
- No secret values, real emails, IP addresses or box/host placement anywhere; configuration by
  variable name only, and new behaviour fails safe when its configuration is absent.
- One SRS per PR; every commit ends with the `SRS:` and `Dispatch:` trailers of this dispatch.
