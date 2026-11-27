# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-10-31-BITS-CODEGEN-C-ONE-curriculum-private.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     .bits/srs/SRS-BUILDANDDO-CURRICULUM-PRIVATE-001.md, .bits/queue/VCC-BUILDANDDO-CURRICULUM-PRIVATE-001.md, scripts/ci/lesson_keys.py, apps/pocketbase/pb_hooks/lesson-keys.pb.js, scripts/deploy/staging-readback.sh, .gitlab/ci/github-plane.yml
# EnumType:    Doc
# EnumEdges:   TRIGGERS cross-seat handoff
# Intent:      Give the operator the exact A3 steps that install the private lesson keys before the stripped curriculum ships.
# ───────────────────────────────────────────────────────────────

# Handoff 2026-10-31 BITS-CODEGEN -> C-ONE (repository operator)

**Originating SRS:** SRS-BUILDANDDO-CURRICULUM-PRIVATE-001 **Dispatch:** VCC-BUILDANDDO-CURRICULUM-PRIVATE-001

## What was asked

The owner asked on 2026-09-24: "move the curriculum out of public into the gitlabs private".
On 2026-10-31 the owner narrowed it to answer keys only: each knowledge check's `answer` and
`explanation` go private, while questions, choices and lesson bodies stay public. Keys already
published stay in public git history. The client-graded mission-learning quizzes are a
separate follow-up.

## Why it cannot be done on the public plane

The keys have to live somewhere the public repository and its mirror cannot reach: a private
GitLab project and the PocketBase hosts. Creating that project, installing a file and a systemd
drop-in on each host, deploying the backend, and adding a protected CI/CD variable or runner
are all A3. They need host access, GitLab administration and the key material itself. No agent
seat holds any of these, and none may.

## What was done instead

The repository side is in the PR for this SRS:

- The four curriculum data files no longer carry the 35 answers and explanations.
- PocketBase grades from a private key file it reads at runtime, named by
  `BUILDANDDO_LESSON_KEYS_FILE` or else `lesson-keys.json` in its data directory. Keys an
  existing database already holds still grade; a file entry must agree with them.
- Without a usable key, a lesson answers 503 "not installed" or 404 (community quiz), and never
  passes by default.
- `GET /api/buildanddo/learning/keys-health` reports the key state and lesson counts only.
  `pocketbase lesson-keys check [file]` is the read-only operator check.
- `scripts/deploy/staging-readback.sh` full mode fails unless keys-health shows `PRIVATE` with
  no unavailable lesson.
- `scripts/ci/lesson_keys.py` exports, verifies and compares, and never prints a key.
- The GitLab keyed lane ships disabled.

Nothing in this file carries a key value, an explanation, a hash of either, a key-file hash, a
host name or a private URL. Keep it that way in the reply (H13).

Until H1-H3 are done, merging and deploying the new hooks makes every lesson whose key is not
already stored in the database ungradable. The PR stays on `actor:mixed` plus `hold`.

## What the receiving seat needs to do

Placeholders in angle brackets are yours to fill in at the terminal, never in this file:

- `<merge-base>` is the PR's merge-base, `git merge-base <PR head> origin/main`. Its data files
  still carry the keys; `export` refuses a stripped revision with exit 1.
- `<backend base>` is the URL under which an environment's PocketBase serves `/api`. On the
  deployed sites that is the origin plus the same-origin backend prefix the web client uses
  (`apps/web/src/lib/pocketbaseClient.js`); in the docker staging stack it is the origin.
- `<public API origin>` is a bare origin, with no path, whose `/api/v1/public` reaches that
  environment's PocketBase: the site origin where the edge forwards it, or a local port forward
  to the PocketBase listener. `lesson_keys.py digests` accepts nothing else.

Never `cat`, paste, attach or log a key file, and never put one in a ticket.

**H0. Owner confirmation.**

- Confirm SRS-BUILDANDDO-CURRICULUM-PRIVATE-001 is `ready` or `in_progress` and that the
  recorded owner decisions stand.
- Keep the PR labelled `actor:mixed` and `hold` until H1-H3 are recorded as done here.
  `gitlab_plane.py` refuses to merge a PR labelled `hold`.
- GitLab must pass the exact PR head before the hold is lifted.
- Verify: `grep -A4 'code: SRS-BUILDANDDO-CURRICULUM-PRIVATE-001' .bits/srs_registry.yml`
  shows the status. `gh pr view <PR> --json labels,statusCheckRollup` shows both labels and a
  passing `gitlab-ci/buildanddo` status on the head.

**H1. Export and verify the keys** (trusted workstation, full clone). This can run before merge
because history still holds the keys.

- Create the output directory first: `install -d -m 0700 state/private`. `/state/` is
  git-ignored, so a fresh clone has neither directory, and the tool refuses an output path
  whose directory does not exist.
- Export: `python3 -I scripts/ci/lesson_keys.py export --source-rev <merge-base> --out state/private/lesson-keys.json`.
  The tool writes the file with mode 0600, and `/state/` is git-ignored.
- Check out the PR head, then run:
  `python3 -I scripts/ci/lesson_keys.py verify --keys state/private/lesson-keys.json --require-private --against-rev <merge-base>`.
- Verify: `stat -c '%a' state/private` prints `700`. The verify run exits 0 with state OK,
  lessons 35, bound 35, version_match 35, in_range 35, integrity true, private true,
  strip_equal 4/4 and lock_match 4/4. `git status --short --ignored state/` shows `state/`
  only as ignored (`!!`).

**H2. Private GitLab project.**

- Create a separate private project. Its name and owner are the owner's choice. It must not be
  the mirror project, whose `buildanddo-source` and `review/pr-N` branches are force-synced and
  boundary-scanned.
- Add `curriculum/lesson-keys.json` through a merge request. Allow maintainers only, protect the
  default branch, and configure no mirroring.
- Verify: an unauthenticated request for the file's raw URL returns 404, for example
  `curl -s -o /dev/null -w '%{http_code}\n' '<raw file URL>'` prints `404`. Project settings
  show visibility Private and no push or pull mirror.

**H3. Install the file on each PocketBase host.** This is safe before merge, because the
deployed hooks ignore the file.

- `install -d -o root -g <pocketbase service group> -m 0750 /etc/buildanddo`, if the directory
  does not exist yet.
- `install -o root -g <pocketbase service group> -m 0640 lesson-keys.json /etc/buildanddo/lesson-keys.json`
- Create `/etc/systemd/system/buildanddo-pocketbase-staging.service.d/30-lesson-keys.conf` and
  `/etc/systemd/system/buildanddo-pocketbase.service.d/30-lesson-keys.conf`, each containing:

  ```ini
  [Service]
  Environment=BUILDANDDO_LESSON_KEYS_FILE=/etc/buildanddo/lesson-keys.json
  ```

- Run `systemctl daemon-reload`. The variable takes effect at the next restart.
- `apply_production_runtime_config.py` copies only its own named portable drop-ins, so place
  this drop-in on both units by hand.
- Delete the workstation copy once H2 and H3 are verified.
- Verify on each unit:
  - `systemctl show -p Environment <unit>` lists `BUILDANDDO_LESSON_KEYS_FILE` and does not list
    `BUILDANDDO_LESSON_KEYS_SYNTHETIC`.
  - `sudo -u <service user> test -r /etc/buildanddo/lesson-keys.json && echo readable` prints
    `readable`.
  - `stat -c '%a %U %G' /etc/buildanddo/lesson-keys.json` shows `640 root <pocketbase service group>`.

**H4. Owner lifts the hold and merges.**

- Verify: the PR is merged, and `gh pr view <PR> --json labels` no longer lists `hold`.

**H5. Staging rehearsal on a copy** (before deploying the merged SHA).

- Back up `pb_data/data.db`, `pb_hooks` and `pb_migrations` with a dated suffix.
- Build a rehearsal directory from a copy of the service directory. Copy the database with
  `sqlite3 data.db ".backup <rehearsal>/pb_data/data.db"`, then overlay
  `git archive <merged sha> apps/pocketbase/pb_hooks apps/pocketbase/pb_migrations`.
- Run `python3 scripts/ci/migration_preflight.py --dir <rehearsal>` and require that the service
  starts.
- Apply migrations on the copy:
  `sudo -u <service user> <rehearsal>/pocketbase migrate up --dir=<rehearsal>/pb_data --migrationsDir=<rehearsal>/pb_migrations`.
- Run the check:
  `sudo -u <service user> env BUILDANDDO_LESSON_KEYS_FILE=/etc/buildanddo/lesson-keys.json <rehearsal>/pocketbase lesson-keys check --dir=<rehearsal>/pb_data --hooksDir=<rehearsal>/pb_hooks --migrationsDir=<rehearsal>/pb_migrations`.
  It prints one JSON line of state and counts. A binary run in development mode also prints SQL
  debug lines and a timestamp before the JSON, so read only the last line from its first `{`.
- Verify: exit 0, and the JSON shows `"state":"PRIVATE"`, `"mismatch":0`, `"unavailable":0`, and
  `lessons` equal to the installed lesson count.
- On any mismatch:
  - Export from the dated `data.db` backup taken at the start of this step, which predates
    `migrate up`, and fill the lessons it holds no key for from the merge-base. Run it from a
    checkout of the merged SHA whose history includes the merge-base, and keep the output on the
    host:
    `python3 -I scripts/ci/lesson_keys.py export --from-db <dated data.db backup> --source-rev <merge-base> --out /root/lesson-keys-db.json`.
  - Each lesson whose record stores a key keeps the database's key. The merge-base fills the
    rest: the broadcast and authority lessons that pending insert seeds add, and any lesson that
    has no record or is stored without its key. The report counts both sources
    (`from_db`, `from_rev`) and names the filled lessons (`from_rev_slugs`) and the lessons whose
    stored key differs from the merge-base (`differs_slugs`). It never prints a key.
  - Without `--source-rev`, a database copy that lacks any public lesson's key is refused, and
    the refusal names those lessons.
  - Verify: the export exits 0 with `lessons` equal to `public`, and
    `python3 -I scripts/ci/lesson_keys.py verify --keys /root/lesson-keys-db.json --require-private`
    exits 0.
  - Decide privately which source is canonical, update the private project and H3, then re-run
    this step.
- Delete the rehearsal directory afterwards. Verify with `test ! -e <rehearsal> && echo removed`.

**H6. Digest baseline.**

- On a workstation without it, create the output directory as in H1:
  `install -d -m 0700 state/private`.
- Run `python3 -I scripts/ci/lesson_keys.py digests --base-url <public API origin> --out state/private/digests-staging-before.json`.
  This records every public lesson's `content_digest`. The values are public, but keep the file
  out of the repository.
- Verify: `stat -c '%a' state/private` prints `700`. The digests run exits 0 with state OK and
  errors 0. `published` counts the lessons staging serves now, and `missing` counts the lessons
  it has not installed yet.

**H7. Deploy and verify staging.**

- Copy the payload over `pb_hooks` and `pb_migrations` without deleting anything. Restart the
  unit, then read the journal for hook or migration errors.
- Verify:
  - `curl -s <backend base>/api/buildanddo/learning/keys-health` shows `"keys":"PRIVATE"`,
    `gradable` equal to `lessons`, and `"unavailable":0`.
  - `python3 -I scripts/ci/lesson_keys.py digests --base-url <public API origin> --compare state/private/digests-staging-before.json`
    exits 0 with changed 0, lost 0 and errors 0: every previously installed lesson is unchanged.
  - With a disposable account, start and complete one starter lesson, one broadcast lesson and
    one authority lesson.
  - A community-quiz wrong choice returns `{"correct":false}`.
- Never paste a correct choice or an explanation into a log or ticket.

**H8. Production.**

- Repeat H5-H7 against `buildanddo-pocketbase.service`, with a production digest baseline.
- Production is believed to hold 33 lessons. The broadcast and authority lessons arrive through
  their pending insert seeds and resolve from the file.
- Verify: the same checks as H7 against production. keys-health shows `PRIVATE` with no
  unavailable lesson, and the digest comparison reports changed 0, lost 0 and errors 0.

**H9. Docker staging stack** (only if it is used).

- Run `docker compose -f docker-compose.staging.yml cp lesson-keys.json pocketbase:/pb/pb_data/lesson-keys.json`,
  then make the file readable only by the container's PocketBase user.
- `pb_data` backups now include the key file. Protect them accordingly.
- Verify:
  - `docker compose -f docker-compose.staging.yml ps` shows `web` as healthy. Its healthcheck is
    `staging-readback.sh` in full mode, so it stays unhealthy until the keys are installed.
  - `docker compose -f docker-compose.staging.yml exec web /usr/local/bin/staging-readback.sh http://127.0.0.1 full`
    prints `PASS staging readback`.

**H10. Clean-up.**

- The dated `pb_migrations` backup directories still hold keyed data files. Set them to 0700
  root, or delete them after verification.
- Delete the rehearsal copies and `/root/lesson-keys-db.json`.
- Confirm that database backups are access-controlled.
- Verify: `stat -c '%a %U' <each dated backup dir>` shows `700 root`, or the directory is gone.
  `test ! -e /root/lesson-keys-db.json && echo removed` prints `removed`.

**H11. GitLab keyed lane** (optional, after the owner decides).

- Register a runner that takes protected refs only, tagged `buildanddo-protected`. It needs
  `python3` and `node`.
- Create a protected environment `lesson-keys` that only maintainers may deploy to. Confirm on
  this GitLab version that its deploy-access rule applies to `action: prepare` jobs. Either way,
  the variable stays Protected, scoped to `lesson-keys`, and read only on the protected-refs-only
  runner.
- Create the CI/CD variable `BUILDANDDO_LESSON_KEYS` with:
  - type File, Protected, environment scope `lesson-keys`;
  - "Expand variable reference" off;
  - not masked (multi-line JSON cannot be), and hidden if available.
- Set `BUILDANDDO_LESSON_KEYS_ENABLED=1` as a project-level variable.
  - It must also reach the scheduled `github_intake` job, because the automerge keyed-surface
    guard reads it there.
  - While it is set, agent PRs that touch `.gitlab-ci.yml`, `.gitlab/`, `scripts/ci/gitlab_plane.py`,
    `scripts/ci/lesson_keys.py` or `apps/web/tools/check-public-lessons.mjs` wait for a person.
- If a protected-only runner cannot exist, leave the lane disabled.
- Source configuration is not evidence that either job ran. The lane has never executed.
- Verify:
  - Run a web pipeline on `buildanddo-source`. `lesson_keys_bundle` and `lesson_keys_private`
    both pass.
  - `lesson_keys_private` keeps no artifacts.
  - Neither job appears in a `review/pr-N` pipeline.
  - The next intake log prints the `AUTOMERGE: BUILDANDDO_LESSON_KEYS_ENABLED=1` banner line.

**H12. Ongoing upkeep.**

- Whenever a lesson's question or choices change, or a lesson is added, update the private file
  in the same change window. The keyed job, when enabled, turns red on binding drift.
- Re-run `pocketbase lesson-keys check` after every backend deploy, restore or new environment.
- On compromise, re-author the checks under a separate SRS.
- Verify after each change window: `python3 -I scripts/ci/lesson_keys.py verify --keys <private file> --require-private`
  exits 0 against the current `main`, and keys-health on each environment shows `PRIVATE` with no
  unavailable lesson.

**H13. Record the outcome.**

- Add a `## Reply` section below with dates, states and counts only: H1's verify line, each
  environment's check and keys-health result, and the digest comparison counts.
- No values, no digests of keys, no key-file hashes, no host names and no private URLs.
- Verify: `python3 scripts/ci/public_redaction.py scan .bits/handoffs/2026-10-31-BITS-CODEGEN-C-ONE-curriculum-private.md`
  and `python3 scripts/ci/verify_public_boundary.py --root .` both pass with the reply in place.

## Blocking

Public work does not stop. The PR for this SRS does stop: it carries `hold` until H1-H3 are
recorded, because merging and deploying first would leave every lesson without a database-held
key ungradable. That is a closed failure, never a wrong grade, but it is an outage of guided
learning and the community quiz. H5-H13 follow the merge, and H11 is optional.
