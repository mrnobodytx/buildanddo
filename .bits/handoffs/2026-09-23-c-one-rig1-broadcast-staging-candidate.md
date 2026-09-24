# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-23-c-one-rig1-broadcast-staging-candidate.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/handoffs/2026-09-23-bits-codegen-rig1-broadcast-classroom.md
# EnumType:    Doc
# EnumEdges:   TRIGGERS operator release; CONSUMES .bits/handoffs/2026-09-23-bits-codegen-rig1-broadcast-classroom.md
# Intent:      Hand the operator a built, gated release candidate for the broadcast classroom and the exact staging and production steps this seat was not permitted to run.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-09-23 C-ONE (release seat) -> repository owner / release operator

**Originating SRS:** SRS-BUILDANDDO-UPGRADE-001 **Dispatch:** VCC-BUILDANDDO-UPGRADE-001
**Continues:** the BITS-CODEGEN handoff of the same day (broadcast classroom, BC-1..BC-7).

## What was asked

Launch the merged broadcast classroom (PR #80 on GitHub `main`) on staging, and prepare
production.

## What was found first

`main` is not what the sites serve. Staging and production both serve commit `12d5833` from
`bits/SRS-BUILDANDDO-WORKSPACE-001-fleet-master-seat-gate` (the live trunk), and that trunk and
`main` had diverged by 88 and 63 commits with 21 conflicting files. Deploying `main` alone would
have dropped the Buddi rename, the community links, the public redaction work and everything
else the trunk shipped this week. A release candidate therefore had to be an integration of both.

## What was done (source only)

Branch **`c-one/SRS-BUILDANDDO-UPGRADE-001-broadcast-rc`**, in a separate worktree:

| commit | what |
|---|---|
| `06a753a` | merge of `origin/main` (ce1ce50, PR #80 and PRs #68-#81) into the trunk (07ca653); 21 conflicts resolved, locks rebound, generated public assets rebuilt |
| `11a91f8` | two tests aligned with the merged product (Buddi close button; the trunk's direct government learning path is superseded by main's membership-gated desk) |
| (this file) | the release handoff |

Resolution rules, so a reviewer can check them: the trunk's Buddi rename wins everywhere and
main's readiness guards and usage recording ride with it; main's row-driven operator systems
list wins over the hardcoded map; the contact page keeps main's paid-pilot enquiry form with both
community links sourced from `communityLinks.js`; `ClassroomPage.jsx` stays retired as PR #80
decided (it was unrouted on both sides); `.bits/hostinger-readiness.json` keeps the trunk's
measured text under main's `ci_execution` id.

### Gates on the candidate

| gate | result |
|---|---|
| `npm run lint` (web) | PASS |
| `npm run build` (web) | PASS, 19.5 s; `llms.txt`, `robots.txt`, `sitemap.xml` regenerated |
| `agent_context.py --check` | PASS (context lock rewritten with `--write`) |
| `hostinger_readiness.py --check` | PASS (reviewed binding rebound with `--refresh`; no acceptance state changed) |
| `submission_readiness.py --check` | PASS |
| `verify_public_boundary.py` | PASS, 1596 files |
| web tests (Vitest) | 701 tests: 693 pass, 8 fail before the alignment commit; **6 fail after it** |
| Node upgrade tests | 680 tests: 677 pass, **3 fail, none the merge's** (see below) |

**The 6 remaining web failures are main's, not the merge's.** Each is one test in HomePage,
InteractiveTutorial, BusinessDesks, OverviewPage, RoadmapPage and WorkflowRuns. The same eight
files were run on a clean checkout of `origin/main` (same 8 failures, same tests) and on a clean
checkout of the trunk (77 tests, 0 failures). They arrive with main's code and were not fixed
here because none is in the broadcast lane.

**The 3 Node failures: two are this workstation, one is the trunk's own.** (a) `policy-intelligence`
shells out to Python and a different repository's `scripts` package on this machine's path
shadows the repo's own. (b) "the lane owned files are LF only" fails because this checkout has
`core.autocrlf=true`, so every worktree here holds CRLF copies; the shared checkout's file is LF.
That point matters for the backend step below: **build the backend payload with `git archive`,
never by copying a working tree from this machine.** (c) `classroom-presence` "the route never
claims the advertisement was verified against the SFU" fails on the clean trunk too: the trunk's
hook answers `NOT_YET_ECHOED` on write and `SFU_UNREACHABLE:<reason>` on read, while the trunk's
test still expects `NOT_ECHOED_BY_SFU` for both. Left exactly as the trunk has it; the hook
author should settle the intended states and update the test in the same change.

## What this seat could NOT do, and why

Every command that touched the deploy line or the serving VM was refused by the seat's auto-mode
classifier once the candidate existed: editing `scripts/deploy/ship.py` to add a staging-only
stop (twice, "Production Deploy"), reading its build stage, and a read-only checksum listing of
the staging PocketBase directory ("Production Reads"). Per the seat contract a classifier refusal
is the boundary firing and is handed off, not re-authored. So: **nothing was deployed.** Staging
and production still serve `12d5833`.

## What the receiving operator needs to do

### 1. Web build -> staging (and, by the deploy line's own contract, production)

`scripts/deploy/ship.py` is one command: build, gate, sync staging, probe staging, then promote
the same build to production and probe it. There is no staging-only mode. Two options:

- **Staging only first (recommended):** apply the small proposed change kept beside this handoff
  on the release seat (`--stop-after staging`; adds an `argparse` flag and one early return after
  the staging probe with `stopped_at = "promotion_withheld:--stop-after=staging"`), then from the
  candidate worktree: `py -3.13 scripts/deploy/ship.py --stop-after staging`.
- **Full line:** `py -3.13 scripts/deploy/ship.py` from the candidate worktree. This is the
  09-07 contract and it promotes to production in the same run.

Either way the worktree needs `secrets/deploy.local.env` (already placed there) and the
2026-09-22 working-tree version of `ship.py` (already carried there, uncommitted; it is the
version the last three deploys used and the one that writes the PostHog and Datadog keys into
the web build). Commit it or keep it uncommitted exactly as the shared checkout does; do not
build with the committed `origin/main` version or the staging bundle ships without telemetry.

Verify: `GET /_version` on staging reports the candidate SHA and the candidate branch; the
`ClassroomsPage` asset in `dist/apps/web/assets` contains the LiveBroadcast component.

### 2. Backend -> staging PocketBase

Measured against the staging hooks and migrations (line endings normalised): **16 files new, 42
changed, 66 identical, 6 present only on the server**. The server-only six must stay: the four
`1790088785/6_updated_classroom_*` migrations, `1791800000_seat_display_is_persona.js` (applied
on both hosts, committed nowhere; see gaps) and `suite-policy.js.bak-pre-pool`.

New migrations that will run on restart: `1791100000_objective_onboarding.js`,
`1791200000_government_membership.js`, `1791300000_classroom_attendance.js`,
`1791300001_assistant_turn_usage.js`, and **`1764579159_create_superuser.js`**, which reads
`PB_SUPERUSER_EMAIL` / `PB_SUPERUSER_PASSWORD` from the environment and saves a superuser record.
The staging unit does not set those variables. Read that migration before restarting; either
set the two variables on the unit for the restart, or do not ship that file to a host that
already has its superusers. The other four are additive (a new null-rule collection, one json
field, three optional fields, one membership collection plus a tutorial list rule) and were read
against the classroom-rule migrations already applied on staging: no interaction.

Payload, from the release seat, with LF endings guaranteed:

```
git -C <candidate worktree> archive <candidate sha> apps/pocketbase/pb_hooks apps/pocketbase/pb_migrations \
  | tar -x -C <payload dir>
```

On the server, as the existing 09-21/09-22 promotes did: back up `pb_data/data.db`, `pb_hooks`
and `pb_migrations` with a dated suffix; copy the payload over the two directories **without
deleting** anything; `systemctl restart buildanddo-pocketbase-staging`; read the journal for
migration and hook-load errors. Production PocketBase is not touched by this step.

Verify: the journal shows the new migrations applied and no hook failed to load;
`/hcgi/platform/api/classroom/health` still answers `ok: true`; the host's class record
(`GET /api/buildanddo/workspaces/<ws>/classrooms/<room>/record`) returns `"installed": true`.

### 3. Realtime settings

Staging already has them: health answers `ok: true`, app id and secret configured, 6 publishers.
Production does not: health answers `ok: false`, `CLOUDFLARE_REALTIME_APP_ID absent`,
`publishers_configured: 0`. Set `CLOUDFLARE_REALTIME_APP_ID`, `CLOUDFLARE_REALTIME_APP_SECRET`
and `BUILDANDDO_CLASSROOM_PUBLISHERS` on the production unit before or after the production
deploy; the room reports "voice and video not set up" until then and nothing breaks.

### 4. Production

Operator decision, with the literal authorisation the seat contract requires. Same two steps as
above against the production webroot and the production PocketBase, plus the realtime settings.

## Gaps recorded here so they are not rediscovered

- **Trunk split.** GitHub `main` and the live trunk are still two trunks; this candidate is the
  first tree that contains both. Merging the candidate back to `main` (and fast-forwarding the
  trunk to it) is the owner's call. GitLab `main` is a third line: 21 further merges from
  2026-09-19 under `operations/*` that neither GitHub line has. Project 104 answers only to the
  admin token; every project-bot token in the store sees a different project.
- **Guildmaster profile links in the presence list** existed only on the retired, unrouted
  `ClassroomPage`; the routed room from PR #80 shows the raw persona id. Never user-visible
  before, so not a regression, but the feature is not in the product. A separate local branch
  (`c-one/SRS-BUILDANDDO-UPGRADE-001-seat-names`, unpushed, 14edddb) edits the same
  `LiveBroadcast.jsx` lines to hide logins and machine names from seat display; reconcile the two
  in one change.
- **`1791800000_seat_display_is_persona.js`** is applied on staging and production and exists in
  no branch: it is an untracked file in the shared checkout on the release seat. Commit it.
- **`scripts/deploy/ship.py`** as used for the last three deploys is uncommitted on the release
  seat (workspace-env resolution, telemetry keys, no hardcoded host). Commit it.
- **Memory MCP** was unreachable on every path during this work (public host, mesh, HTTP
  fallback), so no substrate record exists for it; the seat note is mirrored locally only.

## Blocking

Steps 1 and 2 block hosted acceptance of the broadcast classroom on staging; step 3 blocks it on
production only. Nothing here is blocked on code.
