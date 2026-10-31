# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-CURRICULUM-PRIVATE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CURRICULUM-PRIVATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CURRICULUM-PRIVATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-31
# Depends:     AGENTS.md, .bits/srs/SRS-BUILDANDDO-TRUST-001.md, .bits/srs/SRS-BUILDANDDO-QUIZ-001.md, apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_hooks/community-quiz.js, apps/pocketbase/pb_hooks/public-api.js
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-CURRICULUM-PRIVATE-001-* branches; EXTENDS .bits/srs/SRS-BUILDANDDO-QUIZ-001.md; DEPENDS_ON apps/pocketbase/pb_hooks/tutorial-learning.js
# DAG Node:    none
# Intent:      Move knowledge-check answer keys out of the public tree into a private key file the server reads at runtime.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-CURRICULUM-PRIVATE-001 — Private lesson answer keys

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN

## Authorization

The repository owner requested this on 2026-09-24, in these words:

> move the curriculum out of public into the gitlabs private

This SRS records that request as its authority before any implementation, the
way SRS-BUILDANDDO-QUIZ-001 recorded its own. It is not agent
self-authorization: the work changes shared hooks, data files, CI and
governance, so it is A2 and rests on the owner's request.

The owner settled the open scope questions in chat on 2026-10-31:

1. **Answer keys only.** Each knowledge check's `answer` and `explanation` go
   private. Questions, choices and lesson bodies stay public as open-book
   content.
2. **Git history is accepted as it is.** Answers already published stay in
   public git history. There is no history rewrite, and no checks are
   re-authored under this SRS.
3. **The client-graded mission-learning quizzes are a separate follow-up.** The
   four quizzes in `apps/web/src/lib/missionLearning.js` are out of scope here.
   They are recorded below as a finding for their own SRS.

For the remaining decisions the owner accepted the plan defaults:

- A key file that is configured but unreadable or invalid falls back to keys
  already stored in the database. Only lessons that need the file fail closed.
- Staging readback requires keys: full mode needs state PRIVATE and zero
  unavailable lessons.
- Contributors may opt in to synthetic keys locally, and only through
  `BUILDANDDO_LESSON_KEYS_SYNTHETIC=1`.
- Keys already held in the production database are kept.
- The public-api shape change for lessons that cannot be graded is accepted
  (`content_digest: null`, verifier state `UNAVAILABLE`).
- The GitLab keyed lane ships disabled (`BUILDANDDO_LESSON_KEYS_ENABLED`
  unset) until the operator decides to enable it.
- The PR carries `actor:mixed` plus a `hold` label until operator handoff
  steps H1-H3 are recorded as done. The owner chooses the push target.

Everything on GitLab, a VM, staging, production or a secret is A3. It is
delivered only as an operator handoff, never executed by an agent.

## Problem

SRS-BUILDANDDO-TRUST-001 removed knowledge-check keys from the web bundle,
`tutorials` REST reads and the learning feeds. SRS-BUILDANDDO-QUIZ-001 removed
them from the community catalogue. One public copy remains: the authored
curriculum files under `apps/pocketbase/pb_migrations/data/` still carry
`check.answer` and `check.explanation` for all 35 lessons. The migrations seed
from those files, and the repository is public. QUIZ-001 left them unchanged
"pending owner decision". The 2026-09-24 request is that decision, and this SRS
carries it out.

## Scope

1. **Classification.** Knowledge-check keys are private golden data. The scope
   is `lessons[].lesson.check.answer` and `lessons[].lesson.check.explanation`
   for the 35 lessons in
   `apps/pocketbase/pb_migrations/data/{starter-tutorials,government-submissions,authority-repairs-lessons,broadcast-classroom-lessons}.json`
   (25, 8, 1 and 1 lessons).
2. **Strip.** A text-level strip removes exactly those 70 members from the four
   tracked data files. Every other byte stays: top-level version strings, the
   lesson counts, ids, slugs, `mission`, `mission_plan`, `reference_status` and
   `source_evidence`. No migration is added and no existing migration changes.
3. **Runtime resolver.** A new library, `apps/pocketbase/pb_hooks/lesson-keys.js`,
   loads one private key file (schema `buildanddo.lesson-keys/1`). The file is
   named by `BUILDANDDO_LESSON_KEYS_FILE`, or defaults to `lesson-keys.json` in
   the PocketBase data directory. Entries are keyed by slug. Each entry is bound
   to `curriculum_version` and to sha256 of the canonical `{question, choices}`.
   The resolver merges `answer` and `explanation` in memory only and never
   writes to `tutorials`.
4. **Routing.** Every place a gradable lesson is built goes through the
   resolver:
   - tutorial-learning detail and start, for learners not yet enrolled;
   - community-quiz grading;
   - public-api digests.

   Enrolled learners keep their frozen snapshots unchanged. The published
   `content_digest` and the certificate digest share one formula.
5. **Fail closed, never auto-pass.**
   - A lesson with no key gets 503 "not installed", and no enrollment is
     created.
   - A file entry that disagrees with the lesson gets 503 "needs an operator
     review".
   - An invalid file falls back to keys already stored in the database, and
     fails closed only for lessons that need the file.
   - The quiz returns 404 or 503.
   - public-api publishes `content_digest: null` and verifier state
     `UNAVAILABLE` for a lesson that cannot be graded.
6. **Operator verification inside the PocketBase binary.**
   - `pocketbase lesson-keys check [file]` is read-only and reports counts and
     states only.
   - `GET /api/buildanddo/learning/keys-health` reports state and counts only.
   - `scripts/deploy/staging-readback.sh` full mode requires state PRIVATE and
     zero unavailable lessons.
7. **Key tooling.** A stdlib-only tool, `scripts/ci/lesson_keys.py`, with these
   subcommands:
   - `export`, from `--source-rev`, from `--from-db` on a database copy, or
     from both: the copy's stored key wins, and the revision fills every
     public lesson the copy holds no key for;
   - `verify`, for coverage, binding, range and integrity, with
     `--require-private` and an `--against-rev` byte-identity oracle against
     the pre-strip readiness lock;
   - `synthetic`;
   - `strip`, with a round-trip proof;
   - `digests`, which captures and compares public `content_digest` values.

   It prints counts and slugs only. It writes key files with mode 0600, and only
   to ignored or out-of-repo paths. It exits 0 for OK, 1 for failure and 3 for
   BLOCKED.
8. **Synthetic keys for every public test lane.** They are generated at test
   time from public data only:
   `answer = int(sha256('synthetic:' + slug)[:8], 16) % len(choices)`, plus a
   labelled placeholder explanation. Tests never read real keys and never skip;
   a missing PocketBase binary stays BLOCKED. The two test regex literals that
   disclose correct choices are removed
   (`tests/upgrade/authority-repairs-lessons.test.mjs:98` and
   `tests/upgrade/broadcast-lessons.test.mjs:158`).
9. **A non-vacuous bundle gate.**
   - It takes explanation fingerprints from the key file and covers all four
     curricula, adding `authority-repairs-lessons.json`.
   - It runs as a CLI that imports only node built-ins.
   - Public builds print a visible SKIP line.
   - `BUILDANDDO_LESSON_KEYS_REQUIRED=1`, or `--require-keys`, makes missing
     keys or too few fingerprints fatal.
   - A planted-leak test proves the scan detects.
10. **Public boundary policy**, in `scripts/ci/verify_public_boundary.py` and
    `.buildanddo/public/path-policy.json`. The check fails when:
    - a tracked data-file check carries `answer` or `explanation`;
    - a file named `lesson-keys.json` is tracked;
    - any tracked file holds a key document, whatever its name, extension or
      `synthetic` label: JSON with an object at any depth whose
      `schema_version` is `buildanddo.lesson-keys/1`, or text that writes that
      member outside the known sources naming the schema. No key file,
      synthetic or not, is ever committed, so the label exempts nothing.

    Failures report path and slug, never values.
11. **GitLab keyed lane**, disabled unless `BUILDANDDO_LESSON_KEYS_ENABLED=1`,
    and on protected `buildanddo-source` only.
    - `lesson_keys_bundle` is unkeyed: `npm ci` and build, with the dist
      artifact kept one day.
    - `lesson_keys_private` uses environment `lesson-keys` with action
      `prepare` and tag `buildanddo-protected`. It runs no npm, keeps no
      artifacts, and has `allow_failure` exit codes `[3]`.
    - While the lane is enabled, `scripts/ci/gitlab_plane.py` automerge refuses
      PRs that touch the keyed surface: `.gitlab-ci.yml`, `.gitlab/`,
      `scripts/ci/lesson_keys.py`, `apps/web/tools/check-public-lessons.mjs` and
      `scripts/ci/gitlab_plane.py`.
12. **Documentation and governance.**
    - Update `docs/interactive-learning.md` and `docs/discord-bot.md`.
    - Declare the variable names in `.env.example`, and as a dev passthrough in
      `docker-compose.yml`.
    - Add an A3 operator handoff in `.bits/handoffs`, following `TEMPLATE.md`.
    - Review the HS-03 and HS-10 readiness fields, then refresh the readiness
      lock.
    - Run `agent_context.py --write`.

## Out of scope

- Rewriting public git history or force-pushing (AGENTS.md, Hard NO). Keys
  already published stay in history, and in copies served before TRUST-001 and
  QUIZ-001.
- Re-authoring or rotating the 35 knowledge checks. That needs a separate SRS,
  new content and a new migration.
- Moving lesson bodies, questions, choices, the government `mission` or
  `mission_plan`, or `research-sprint.json` off the public plane.
  `government-desk.js` reads those files at runtime.
- The client-graded mission-learning quiz keys in
  `apps/web/src/lib/missionLearning.js`, and the server grading they would need
  in `mission-policy.js`. Recorded as a finding below (owner decision 3).
- Editing any existing migration, adding a hydration migration, or editing the
  data `.cgrf.yaml` sidecars, `research-sprint.json`, `government-desk.js`,
  `workflow-policy.js` `publicLesson`, the vite `?public-lessons` plugin,
  `tutorialCurriculum.js`, `generate-community.mjs` or `scripts/discordbot/**`.
- Stripping keys already stored in production `tutorials.lesson` or in
  `tutorial_learning` snapshots. The owner keeps them (plan default). A later
  strip would be a separate A3 data operation; digests would not change either
  way.
- Any GitLab, VM, staging, production or secret action. These are delivered
  only as the A3 handoff.
- `tests/fixtures/career/bank.json` (marked synthetic),
  `tests/fixtures/knowledge_units/fractions.json` and
  `config/day21/challenge_rules_2026.json`.
- Hand edits to `BUILDANDDO_CANDIDATE_PROVENANCE.json`, `.bits/out/**`,
  `scripts/ci/epoch_chain.json`, `CHANGELOG.md` or `.bits/growth.lock.json`.
  Their own pipelines regenerate or write them back.
- Automating backend deploys, or adding a lesson-keys drop-in to
  `apply_production_runtime_config.py`'s portable drop-in list.

## Invariants (security)

- No key value, explanation, per-lesson key hash or key-file hash appears in
  any log line, fixture, receipt, artifact, error message, commit, spec or
  handoff.
- Never auto-pass. A lesson without a usable key cannot be graded and says so.
- The resolver never writes. It never calls `app.save` on `tutorials`.
- Tests never read real keys. Synthetic keys are generated at test time and
  never committed. A real or synthetic key file is never committed anywhere.
- A key file is synthetic when it says `synthetic: true` or when any
  explanation starts with the fixture placeholder prefix. Its integrity seal
  covers the label and the source as well as the lessons, so a relabel without
  resealing is INVALID. Synthetic keys load only when the environment sets
  `BUILDANDDO_LESSON_KEYS_SYNTHETIC=1`. Otherwise the file is INVALID, and a
  synthetic file never reports PRIVATE.
- Configuration is by variable name only. No host placement and no addresses.

## Acceptance

- **A1.** `verify_public_boundary.py --root .` reports PASS with the new
  `curriculum_answer_key` and `private_lesson_keys` rules active.
  `test_public_boundary.py` proves on a temp repo that each rule fails for a
  keyed data file, a tracked `lesson-keys.json`, a renamed key file, a key file
  labelled `synthetic: true` (generated or relabelled), and a key document
  saved under a backup or editor name, another extension, wrapped in an array
  or object, embedded in Markdown or truncated. The known sources that name
  the schema, prose that names it and non-key JSON pass.
- **A2.** `git diff --numstat <merge-base> -- apps/pocketbase/pb_migrations/data/`
  touches exactly the four files, with 35 insertions and 105 deletions. Every
  inserted line matches `^\s*\]$`. `python3 -I scripts/ci/lesson_keys.py strip --check`
  exits 0. A structural test in `lesson-keys.test.mjs` proves top-level version
  strings, counts 25/8/1/1, ids, slugs, `mission` and `source_evidence` are
  byte-identical.
- **A3.** `git diff --quiet <merge-base> -- 'apps/pocketbase/pb_migrations/*.js' apps/pocketbase/pb_migrations/data/research-sprint.json 'apps/pocketbase/pb_migrations/data/*.cgrf.yaml'`
  succeeds: no migration and no sidecar is changed.
- **A4.** Unit tests (`lesson-keys.test.mjs`) and native tests on both
  PocketBase profiles cover the resolver:
  - ABSENT gives 503 "not installed" and creates no enrollment.
  - An invalid file with DB-held keys still grades; an invalid file without DB
    keys gives 503.
  - A synthetic file without `BUILDANDDO_LESSON_KEYS_SYNTHETIC=1` is INVALID.
    So is a synthetic file relabelled `synthetic: false`: unsealed it fails
    integrity, resealed its placeholder explanations still mark it synthetic.
    Neither keys-health nor `lesson-keys check` ever reports it as PRIVATE.
  - A tampered `check_sha256` or `curriculum_version` gives 503 for that lesson
    only.
  - A stored key that differs from the file gives 503.
  - After start, deleting the file still lets the enrolled learner answer and
    finish from the snapshot.
  - The resolver never calls `app.save` on `tutorials`.
- **A5.** Digest parity, in unit tests and natively:
  - The same lesson keyed in the database or keyed by the file gives the same
    `content_digest`.
  - The public-api published digest equals the enrollment and certificate
    digest (`test_public_api_native.py`).
  - The real overwrite migrations 1791100000 and 1791000000, run natively
    against stripped data with the key file present, yield a lesson whose
    resolved digest equals the pre-strip seed's.
- **A6.** Correctness follows the key. One lesson graded under two synthetic key
  sets with different salts accepts only the matching index each time. The
  community quiz returns `{correct: false}` for a wrong choice, 404 for a lesson
  that cannot be graded, and 503 on review errors.
- **A7.** Cross-language binding parity:
  - A node test spawns `python3 -I scripts/ci/lesson_keys.py synthetic` and
    finds its output byte-equal to `tests/upgrade/lesson-keys-fixture.mjs`.
  - Natively, real PocketBase accepts the bindings Python computed for every
    staged lesson, including the three with non-ASCII question or choice text.
- **A8.** Every public suite passes with synthetic keys, and none is skipped:
  - `node --test tests/upgrade/*.test.mjs`
  - `npm --prefix apps/web run test`
  - `python3 -m unittest tests.upgrade.test_lesson_keys tests.upgrade.test_public_boundary tests.upgrade.test_gitlab_acceptance tests.upgrade.test_gitlab_plane tests.upgrade.test_native_fixture_contracts`
  - the four native drivers with `--require-binary`.

  A missing binary is BLOCKED, never a pass. Tool and test output never
  contains any synthetic explanation string; tests assert this on captured
  stdout and stderr.

  **Observed at the PR head: not met.** The node suite and the Python suites
  listed above pass, and so does `test_tutorial_learning_native`. Four
  commands stay red, each identically at the merge-base and each recorded as a
  finding this SRS must not fix: `npm --prefix apps/web run test` (three
  pre-existing Vitest cases, finding 10), `test_public_api_native` (the stale
  33-lesson count, finding 8), `test_classroom_native` (the `metrics.pb.js`
  startup panic, finding 6) and `test_workspace_native` (propose `priority`,
  finding 7). `tests.assurance.test_runtime`, whose answer paths this SRS
  edited, also fails six of eight cases at both revisions (finding 9). A8 stays
  open until those follow-ups land, and dispatch rows 4 and 5 are `blocked` on
  them.
- **A9.** Build:
  - `npm run build` prints `SKIP: lesson explanation fingerprints need BUILDANDDO_LESSON_KEYS_FILE`
    and passes.
  - `BUILDANDDO_LESSON_KEYS_REQUIRED=1 npm run build` exits non-zero.
  - `public-lessons.test.mjs` plants a synthetic explanation and an
    answer-bearing JSON check in a temp dist and requires both to be detected.
  - With `BUILD_SHA` pinned to one 40-hex value, the dist tree hash at the
    merge-base equals the hash at the PR head, computed over every file except
    `platform-health.json` (finding 12). Both hashes are recorded in the PR
    description.
- **A10.** GitLab contract (`test_gitlab_acceptance.py`):
  - `lesson_keys_bundle` and `lesson_keys_private` run only on push or web to
    protected `buildanddo-source` with `BUILDANDDO_LESSON_KEYS_ENABLED=1`, and
    never on `review/*`.
  - `lesson_keys_private` declares environment `lesson-keys` (action
    `prepare`) and tag `buildanddo-protected`, runs no npm or vite, keeps no
    artifacts, and has `allow_failure` exit codes `[3]`.
  - Neither job writes `reports/` or `state/epochs`.
  - Existing gate rules are unchanged.
- **A11.** Automerge guard (`test_gitlab_plane.py`). With
  `BUILDANDDO_LESSON_KEYS_ENABLED=1`, a PR touching the keyed surface gets the
  verdict "touches the keyed CI surface; a person merges it", and a failure to
  list files refuses the merge. With the variable unset, verdicts are
  unchanged.
- **A12.** Both correct-choice regex literals are gone. A scan of every tracked
  file for the synthetic marker and for real-key fingerprints finds nothing;
  the real-key part runs privately, by the operator only. No real key file,
  digest of a key or key-file hash is committed anywhere.
- **A13.** Governance gates pass at the PR head after the reviewed `--refresh`:
  `hostinger_readiness.py --check`, `submission_readiness.py --check`,
  `agent_context.py --check` and `verify_public_boundary.py`. The handoff file
  exists in `TEMPLATE.md` format, with a verification command per step and no
  values or hashes.
- **A14** (operator, private, after the handoff; reported back as counts only):
  - `verify --against-rev` reports strip_equal 4/4, lock_match 4/4, lessons 35,
    bound 35, integrity ok.
  - On each environment, `pocketbase lesson-keys check` reports state PRIVATE
    with mismatch 0 and unavailable 0.
  - keys-health reports PRIVATE.
  - The digest set for previously installed lessons is unchanged after deploy.

## Operator handoff (A3)

Delivered as `.bits/handoffs/2026-10-31-BITS-CODEGEN-C-ONE-curriculum-private.md`
in the last step of the dispatch. No agent executes any of it.

- **H0** owner confirms this SRS and keeps the PR on `actor:mixed` plus `hold`
  until H1-H3 are recorded; GitLab must pass the exact PR head first.
- **H1** export the keys on a trusted workstation from the PR merge-base, then
  verify them against the PR head with `--require-private --against-rev`.
- **H2** place the key file in a separate private GitLab project, not the
  mirror project.
- **H3** install the file and a systemd drop-in naming
  `BUILDANDDO_LESSON_KEYS_FILE` for each PocketBase unit. This is safe before
  merge, because the deployed hooks ignore the file.
- **H4** owner lifts the hold and merges.
- **H5-H8** rehearse on a copy, capture the digest baseline, deploy and verify
  staging, then production. Every previously installed lesson's digest must be
  unchanged.
- **H9-H13** cover the docker staging stack, clean-up, the optional keyed GitLab
  lane, ongoing upkeep and a counts-only record of the outcome.

## Findings recorded, not fixed

1. **Client-graded mission-learning quizzes.** The four quizzes in
   `apps/web/src/lib/missionLearning.js` (`LESSONS`, lines 145-221) carry their
   correct answers in the public web bundle and are graded in the browser.
   Moving them needs server grading in `mission-policy.js`. Owner decision 3
   (2026-10-31) makes this a separate follow-up SRS.
2. **`scripts/ci/ocn_content_assessment.py`** reads `check.answer` and
   `check.explanation` through the `tutorials` records API. That API has
   omitted both since TRUST-001, so the assessment would report every check as
   unanswerable. It needs its own fix.
3. **`CONTRIBUTING.md:83-86`** says `verify_public_boundary.py` fails on secrets,
   internal hostnames or anything outside the public allowlist. The check
   enforces forbidden prefixes and file names, secret-like literals, actor
   evidence and, since this SRS, the two lesson-key rules. It has no
   internal-hostname rule and does not enforce `public_allowed_prefixes`, so the
   text still overstates it.
4. **`.gitignore:56-59`** says the GitLab CI config must never land in the
   public repository and ignores `/.gitlab-ci.yml`, yet that file is tracked.
   The comment is stale.
5. **SRS-BUILDANDDO-QUIZ-001 and SRS-BUILDANDDO-TRUST-001** are still
   `in_progress` in the registry, while every task in both dispatches is done.

The findings below were met while running this dispatch's gates. Each one
fails identically at the merge-base, so none is caused by this SRS, and none is
fixed here.

6. **`apps/pocketbase/pb_hooks/metrics.pb.js` stops PocketBase 0.39.8 from
   starting.** Its `routerUse(new Middleware({func, priority}))` call raises a
   SyntaxError at load, so every `test_classroom_native` case and the assurance
   classroom paths fail at startup. The Node double in
   `test_native_fixture_contracts` accepts the object form, so the source tests
   pass.
7. **Mission propose returns 400 on `priority`** in `test_workspace_native`
   (two failures and one error), and the assurance mission journey fails with
   it.
8. **`test_public_api_native` expects 33 lessons.** The catalogue has 35, so
   three cases fail on that constant alone. With the count corrected, every
   public-read case passes, including this SRS's key-text assertions.
9. **`tests/assurance/runtime.py` stages too few migrations.** Its
   `EXTRA_MIGRATIONS` list lacks `1791500000_learning_progress_authority.js`,
   `1791500100_tutorial_answer_wait.js` and the classroom kind and attendance
   migrations, so under `BUILDANDDO_ASSURANCE_FULL` the learning and classroom
   routes answer 503 "not installed". Six of the eight `test_runtime` cases
   fail.
10. **Three Vitest cases fail before this SRS:** TalkToBuddi "replaces a stalled
    connection" (timeout), DailyEditionPage "keeps publication disabled for an
    editor" (no Publish button) and WorkflowRuns "renders finished receipts"
    (receipt text missing). They make `npm --prefix apps/web run test`, part of
    the row 4 gate and acceptance A8, red. One run of the InteractiveTutorial
    and TutorialCatalog files also failed once out of four, with neither file
    changed.
11. **Only the key tool's own invocation is unwired.** Its tests already run
    in CI: the Day-21 `day21_full_acceptance` job runs every non-native check
    in `scripts/ci/hostinger_checks.py`, where `source_python` expands
    `@python_tests` to every non-native `tests/upgrade/test_*.py`, including
    `tests.upgrade.test_lesson_keys`, and `source_node` runs
    `lesson-keys.test.mjs` and `public-lessons.test.mjs`. What no required job
    runs is `scripts/ci/lesson_keys.py verify` itself: `agent_context.py`
    reports it as unwired because its collector counts required jobs only, and
    the job that runs it, `lesson_keys_private`, is optional and ships disabled
    by design. No CI include needs to change.
12. **The web dist tree hash is not reproducible.** `platform-health.json` is
    stamped with a wall-clock `generated_at` by `scripts/ci/fleet_report.py`,
    so the full `tree_sha256` differs between any two builds, even of one
    commit. Over the other 243 files, the public build at the merge-base and at
    this SRS's head hash equal, which is the comparison A9 now names.

Found in review and confirmed natively; it predates this SRS and is not fixed
here.

13. **Keys held in the database can be read through record filters.** By owner
    decision, production keeps the keys already stored in `tutorials.lesson`.
    The tutorials list and view rules,
    `@request.auth.id != '' && category != 'Government submissions'` (set in
    `1791200000_government_membership.js`), let any signed-in member filter on
    that JSON field, for example with `lesson.check.answer = N` or
    `lesson ~ '"answer":N'`. A row comes back only for the stored index, so a
    member can read a stored key in a few guesses. The enrich hook in
    `tutorial-learning.js` removes `answer` and `explanation` from response
    bodies only, after the SQL filter has run, and `tutorials` has no
    `onRecordsListRequest` or `onRecordViewRequest` guard. A PocketBase 0.39.8
    probe with synthetic keys confirmed both filter forms. Keys held only by the
    file are not exposed this way: the resolver never writes them, and
    `tutorial_learning` has no API rules. Today this exposes only values that
    are already in public history, while keys-health and the docs describe the
    keys as private. **Precondition for the re-authoring follow-up:** no
    re-authored or corrected key may be stored in the database, by a restore,
    a hand fix or a future hydration, until one of these holds: the database
    holds no keys; a `tutorials` list and view guard refuses non-superuser
    filter and sort expressions that reference `lesson`; or an operator-run A3
    strip has removed the stored keys once the file is installed everywhere.

## Relationship to SRS-BUILDANDDO-QUIZ-001

QUIZ-001 left the curriculum data files unchanged "pending owner decision". The
owner request recorded above settles that question, and this SRS acts on it.
QUIZ-001's spec and registry entry are not edited.

## Known limits

- This removes the keys from the current tree, not from public git history or
  from copies already served. Real secrecy needs re-authored checks, under a
  separate SRS.
- The public `content_digest` covers the explanation, so anyone holding a
  historical explanation can confirm the index in a few hashes. That adds
  nothing beyond what history already shows. No per-lesson key hash or
  key-file hash is ever published.
- Every fresh install needs the key file, or guided grading and the quiz stay
  unavailable. The failure is closed, never a misgrade.
- `scripts/deploy/staging-readback.sh` reads `/api` at the origin root, as the
  docker staging stack serves it. `lesson_keys.py digests` takes a bare origin
  and reads `/api/v1/public` at its root. On a deployment where PocketBase sits
  behind the same-origin backend prefix, the handoff uses the edge route or a
  local port forward instead.

## Verification

`python3 scripts/ci/agent_context.py --check`,
`python3 scripts/ci/verify_public_boundary.py --root .`,
`node --test tests/upgrade/*.test.mjs` (it includes
`tests/upgrade/staging-contract.test.mjs`),
`npm --prefix apps/web run test`,
`python3 -m unittest tests.upgrade.test_lesson_keys tests.upgrade.test_public_boundary`,
the four native drivers with `--require-binary`,
`cd apps/web && npm run lint && npm run build`,
`python3 scripts/ci/hostinger_readiness.py --check`,
`python3 scripts/ci/submission_readiness.py --check`.
