# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-23-c-one-staging-current-before-production.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-WORKSPACE-001, SRS-BUILDANDDO-LIVE-UTILIZATION-001
# CAPS:        B
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     tools/buildanddo_release.py, .bits/handoffs/2026-09-23-c-one-rig1-broadcast-staging-candidate.md
# EnumType:    Doc
# EnumEdges:   CONSUMES tools/buildanddo_release.py; SUPERSEDES the staging half of the 2026-09-23 broadcast candidate handoff
# Intent:      Record that staging now serves the live trunk, how it got there, what broke on the way, and the exact gated steps production still needs.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-09-23 C-ONE -> release operator: staging is current; production is not

**Operator framing (2026-09-23):** bring staging current before production. Production has not
been touched by anything in this handoff.

## What staging serves now [measured, external readback]

| surface | state |
|---|---|
| web, `/_version` | commit `343061e` on `bits/SRS-BUILDANDDO-WORKSPACE-001-fleet-master-seat-gate`; controller readback PASS (health 200, SHA match, flagship lesson readback) |
| trunk tip at time of writing | `eab300f`; differs from `343061e` only in `.bits/` lock and queue files, so the served bundle is byte-for-byte the tip's build |
| PocketBase, staging unit | active; 55 hooks, 55 migrations; `/api/health` 200; `/api/classroom/health` ok, six publishers; `/api/ocn/health` READY; `/api/classroom/presence/health` ok; zero PocketBase log errors after restart |
| backend delta vs the trunk | identical except `1764579159_create_superuser.js`, withheld on purpose (see below) |

## How it was done (two governed tools, one fix each)

**Web:** `py -3.13 tools/buildanddo_release.py pipeline-stage --ack-authority A3 --skip-install`.
This is the controller's staging-only verb: build, package, ssh-webroot deploy to the staging
root, external readback. It had never run against this repository's layout, and two defects
surfaced and were fixed in the same session:

1. `doctor` crashed when no release env file was named (`DEFAULT_SECRET` None after the
   redaction change). Fixed in `1924fa2`.
2. The artifact search preferred the repo-level `dist` over `dist/apps/web`, so the first deploy
   replaced the staging webroot with a tree whose root had no `index.html`. **Staging answered 500
   from 23:29:25Z until the controller's own rollback at 23:31:20Z** (both timestamps from its
   receipts). The controller's readback caught it; nothing reached production. Fixed in
   `343061e`: `dist/apps/web` is the first candidate and `pick_artifact_dir` refuses any tree
   without a root `index.html` before a remote write. Seven tests cover the P0 guard-list fix and
   this one.
3. The P0 identity gate held on the product's own `RETIRED_PHRASES` guard list. Fixed in
   `979edad`: a bare quoted list entry in a file declaring `RETIRED_PHRASES` is reported as
   commentary and no longer gates; the same phrase as copy still does.

**Backend:** `docs/operations/runbooks/staging_classroom_backend_setup.py` (estate) gained
`--hooks=` / `--migrations=` overrides that ship named files from the committed bytes of the
trunk (LF), and was run with the two files the inventory diff named:
`1791800000_seat_display_is_persona.js` (now recorded in `_migrations`; a logged no-op until
`BUILDANDDO_SEAT_PERSONAS` is set on the unit) and `1790700000_ocn_seat_users_fleet_boxes.js`
(comment-only change to an already-applied migration). Backup taken, restart verified, rollback
path intact.

## Facts worth not rediscovering

- `git archive` from a checkout with `core.autocrlf=true` emits CRLF. The LF payload needs
  `git -c core.autocrlf=false -c core.eol=lf archive ...`; the committed blobs are LF.
- An untracked `apps/edge/` in the shared checkout breaks `npm ci` at the root (workspace not in
  the lockfile). Set it aside for the install; it belongs to the BUDDI-002 branch.
- Python tests that import `scripts.ci` need `PYTHONPATH=<repo>` on the release workstation,
  where a foreign `scripts` package is exported on the path.
- The built-surface disclosure scan is PASS with WARNs only: two `state/...` receipt paths quoted
  inside milestone evidence strings in the generated roadmap JSON; a regex family name inside the
  seat-display guard (`seatDisplay.js`), which is the guard naming what it hides; three
  dotted-number literals inside SVG path data that the public-IPv4 rule reads as addresses.

## What production still needs, in order (all gated; nothing here was run)

1. **Web.** The same artifact, promoted: `py -3.13 tools/buildanddo_release.py pipeline-promote
   --ack-authority A3 --promote-production` from a tree at the SHA staging serves, after the
   literal production authorisation the seat contract requires. The controller verifies the
   production readback against the exact artifact digest.
2. **Backend.** Inventory the production PocketBase directory the same way (sha256 of
   `pb_hooks` and `pb_migrations`, read-only), diff against the trunk payload, and ship only the
   delta, additive, with a backup and a verified restart. The staging runbook refuses production
   by design; a production run needs the operator or a production-scoped tool.
3. **Realtime settings on the production unit.** `CLOUDFLARE_REALTIME_APP_ID`,
   `CLOUDFLARE_REALTIME_APP_SECRET`, `BUILDANDDO_CLASSROOM_PUBLISHERS`. Production classroom
   health still reports the app id absent and zero publishers.
4. **The seat workspace record on production** that the feature sweep measured as missing
   (18 routes answering "record missing"). Provisioning, not code.
5. **Superuser migration.** `1764579159_create_superuser.js` reads `PB_SUPERUSER_EMAIL` and
   `PB_SUPERUSER_PASSWORD` and saves a record; a host without them fails the migration and
   PocketBase does not start. Either set both on the unit for that one restart, or keep the file
   off hosts that already have their superusers. It was withheld from staging for this reason.
6. **Seat display names.** On staging this is already done and durable: the six box seats
   display their guildmaster names, and the migration ledger shows
   `1791800000_seat_display_is_persona.js` applied on 2026-09-21 with the mapping present at
   that moment; the variable is no longer on the unit and does not need to be. The migration is
   one-shot: it reads `BUILDANDDO_SEAT_PERSONAS` when it runs and is then recorded as applied, so
   on production the mapping must be present on the unit BEFORE that migration first runs, or
   the migration must be reverted by name (`./pocketbase horizons migrations:revert`, from
   `custom-migrations-cmd.pb.js`) and re-applied with the mapping present. The mapping is derived
   from the fleet map of record and is deliberately not written into this repository.

## Acceptance on the current staging (2026-09-23, after the deploy)

- **Four-box guildmaster class** (`scripts/ci/ocn_classroom_fleet.py run`, each seat signing on
  its own machine): run 3 of 3 passed 19 of 20 checks, readback from a joiner `status=live,
  participants=4, messages=2`, four distinct egress addresses, membership control refused as
  required. The one failed check in runs 1 and 3 was the same step, `sterling speaks`, at
  `stage=ssh` with no HTTP status: the orchestration hop from the release workstation to that
  box failed on its second consecutive call, not the platform (the box's join seconds earlier
  answered 200 and the joiner readback counts it present). Run 1 also saw two transient 409
  "This class changed" refusals that did not recur.
- **Box-side media proof** (`scripts/ci/classroom_video_proof.py` on the Scholar box against
  staging): login 200, session 200, transport connected, ICE completed, two tracks pushed,
  presence health six publishers, verification `ECHO_ON_READ`. Receipt on the box at
  `/tmp/classroom_video_proof.json`, 23:53:41Z.

## Rollback

Web: `py -3.13 tools/buildanddo_release.py rollback-staging --ack-authority A3` restores the
webroot from the backup the deploy took (exercised once today, worked). Backend: the runbook's
`--rollback` restores `pb_hooks.pre-classroom` and `pb_migrations.pre-classroom` and restarts.
