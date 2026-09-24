# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-RECONCILE-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-RECONCILE-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-RECONCILE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-RECONCILE-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-RECONCILE-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that merges main into the staging line and then the staging line into
#              main, with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-RECONCILE-001

**SRS:** SRS-BUILDANDDO-RECONCILE-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

`main` and the staging line become one line, and nothing either side built is lost.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Register the SRS, its spec and this dispatch | `git log` shows this commit before the merge commit | done |
| 2 | Merge `origin/main` into a branch from the staging line and resolve every conflict by R2-R6 | `git merge-base --is-ancestor origin/main HEAD`; no conflict markers in the tree | done: main at `1d1ffaa` and the staging line at `6524913` |
| 3 | Regenerate the readiness and context locks on the merged tree, LF | `hostinger_readiness.py --check`, `agent_context.py --check`, also in a fresh LF checkout | done |
| 4 | Run the three suites on the merged tree | `npx vitest run` in `apps/web`; `node --test tests/upgrade/*.test.mjs`; the Python native suites | done: see Evidence |
| 5 | Repository gates | `submission_readiness.py --check`, `verify_public_boundary.py` | done |
| 6 | Pull request to the staging line, merged only on the operator's OK | the gates again on a trial merge into the current head | done: #106, merged as `ea97e3b` |
| 7 | Staging-only deploy of web and backend | readback from staging | done: staging serves `ea97e3b`; backend at 109 migrations |
| 8 | Converge main after #105 by R14, as a pull request to the staging line | `git merge-base --is-ancestor origin/main HEAD`; the suites and gates again | in progress |
| 9 | Pull request taking the staging line into `main`, merged only on the operator's OK | GitHub reports it mergeable without conflicts | pending |

## Evidence (2026-09-24, release workstation, Windows, LF checkout)

The merged tree contains main at `1d1ffaa` (with #100, TRUST-001, and #102, LEARNING-NATIVE-001) and the staging
line at `6524913`.

**Baselines.** Each parent was measured the same way on the same machine: the staging line at `987be21`, main at
`4fc9c21`, and for the web suite main at `a8a96b9`. main needed two empty package markers before its Python suite
could import at all, and its native suites could not start on Windows.

**Conflicts.** The first merge had 53 conflicting files. The live classroom files were merged against
`62b8859`, the commit both lines share, which left real conflicts in 4 files instead of whole-file add/add
conflicts. Four later merges followed both lines as they moved:
- the first two added 7 more: `ship.py` and its test, a lesson test, the header and the workspace sidebar, and
  the locks;
- #102 conflicted in 17: eleven migrations, the learning hook, three learning test files and both locks. Both
  lines had fixed the same two defects, and where they overlap the staging line's form is kept. #102 changed no
  web file, so the web results below still hold;
- the staging line's CLASSROOM-GLOBAL-001 migration (`801102c`) and its lock rebind (`6524913`) conflicted only
  in the registry, which keeps both new entries, and in the locks. The migration arrives unchanged, and it
  changes no web file.

**Suites on #106's merged tree:**
- **Node** (`node --test tests/upgrade/*.test.mjs`, PYTHONPATH unset): 782 of 782.
- **Web lint:** clean.
- **Web suite** (Vitest): 826 of 827. The one failure, a TutorialCatalog source-case test, also fails on main at
  `a8a96b9`.
- **Python source suite** (the gate's `source_python`, 72 modules, 1,167 tests): every failure also fails on a
  parent, except one serializer test. It reads the branch ref of a linked worktree and passes in a detached
  checkout. The runs after #102 and after the CLASSROOM-GLOBAL-001 merge each failed exactly the same 73 tests
  as the run before them.
- **Praxis target guard** (`tests/praxis_evidence/test_target_guard.py`): 7 of 7.
- **Native suites** (PocketBase 0.39.8, each test in its own process):

  | Suite | Merged | Staging line |
  |---|---|---|
  | classroom | 10 of 10 | 3 of 3 |
  | learning | 6 of 6 | 4 of 4 |
  | suite | 8 of 8 | 7 of 8 |
  | workspace | 5 of 8 | 3 of 6, same 3 failures |
  | dossier | 0 of 4 | 0 of 4, same 4 failures |

**Controls:**
- removing the chatroom guard fails the chatroom test;
- putting the raw field comparison back fails both native rollback tests;
- dropping the owner and mode step fails its swap test;
- a roadmap row in another workspace fails that test again;
- the broadcast lesson test refused the stale evidence record until the run was repeated;
- with the praxis guard's public-address refusal removed, its new test fails on both of its addresses, and main's
  real production address is refused on both URL forms (checked without printing it);
- the added-line scan finds nothing in an empty diff, and it catches a planted fleet name, a planted address and
  a fixture name outside a test;
- one native run is void, not counted: its runner did not set `BUILDANDDO_TEST_POCKETBASE`, so all 32 tests
  skipped and still printed `OK`. The native results above come from runs whose every verdict ran.

**Fixes found by running the suites.** Each is its own commit:
- chatrooms behind the government gate;
- four migrations that could not re-apply after a rollback;
- main's native suites on Windows;
- the re-run broadcast evidence;
- main's web fixtures without a workspace;
- main's public-lessons plugin on Windows.

**Names and addresses (R13).** Every line the merge adds to the staging line was scanned with the private fleet
map, `.py` files included, which the repository's own scan skips. Before the fix, 10 added lines in 6 files and 1
file name carried main's production address or a machine name. Afterwards one family match remains, the hosting
plan key R13 names. Git Bash rewrites `origin/<branch>:<path>` into a Windows path list, so every scan reads
commit ids.

**Found, not changed here.** `1790000000_workspace_administration.js` still compares a field's `type` directly,
the defect R10 fixed elsewhere. It is the same on both lines and latent: it fires only if that migration is rolled
back and re-applied, and then the server does not start. It needs its own fix and a native re-apply test.

## Staging deploy of #106 (2026-09-24, staging only)

- **Rehearsal.** The seven migrations new to staging ran against an online-backup copy of staging's database,
  with staging's own binary: all applied (102 to 109), every classroom collection's rules stayed null, and the 12
  existing classes became workspace classes. The copy was deleted.
- **Configuration.** `BUILDANDDO_APP_URL` was set to staging's own address before the sync, with the operator's
  approval, because main's password-reset migration applies once. The env file was backed up first.
- **Backend.** The database was backed up (integrity ok), then the hooks and migrations were synced and the
  service restarted: active, health 200, no error lines in the journal. On the live database, reset links now
  open staging's own page.
- **Control.** Two routes that only the merged code serves answered 404 before the sync and 401 after it.
- **Web.** Build, lint and the integrity gate passed. Staging's `/_version` reads back `ea97e3b`, and
  production's `/_version` was the same before and after.

## Convergence after #105 (2026-09-24, R14)

The staging line at `ea97e3b` (#106) and main at `4c60b79` (#105 and #103) differed in 52 files. Each file the
merge touched was compared three ways: ours, #105's branch tip before it merged main back (`9481315`), and main.

- **35 files** where main's copy was exactly #105's resolution: ours stays. Each difference was read, and each was
  a choice, not a loss.
- **8 files** where main gained work after #105: merged onto ours, with #105's copy as the base.
- **9 files** combined by hand.
- **89 files** git merged itself: 80 only received main's later work, and the rest keep #106's lines.

**Kept by R14:** the chatroom guard, `SystemRoot` in the native harness, presence verified against the SFU, the
new mark and wordmark, `norm()` in 13 migrations, the swap's owner/mode step, the address-free deploy host, the
repointed handoff references.

**Defects main already had, fixed here.** Each is its own commit, and each fails on a clean checkout of `4c60b79`:
- `broadcast-lessons.test.mjs` called `repoPath()` without importing it (2 tests);
- `learningFixture()` lost its `progressAuthority` option in #103's merge (50 tests);
- the authority-repair lesson test ran the learning hook with no `$dbx` and a filter-string `countRecords`
  (2 tests);
- the answer-wait migration refused a boxed native field type, which main's own test models.

**Evidence (R12).** The convergence changed a file in the broadcast run's scope, so the run was repeated on the
converged sources: 127 of 127, Node 24.20.0. The record follows main's model and binds the committed revision
`7301df8`.

**Names and addresses (R13).**
- main's staging-candidate handoff lost the machine name from its file name, and its references follow.
- main's new praxis isolation test uses a documentation address where it named the production VM.
- One branch name that contains a machine name stays verbatim in #105's branch-archive lists.

**Suites on the converged tree:**
- node: 881 of 881. A clean checkout of main fails 54 of 876.
- Python source suite, 1,188 tests: every failure also fails on a parent. The one that did not fail on the staging
  line is a symlink test that Windows refuses without privilege, and main fails it here too.
- Native suites:
  - learning 11 of 11, with main's 5 new tests;
  - classroom 10 of 10;
  - suite 8 of 8;
  - workspace 11 of 14, the staging line's same 3 failures, with main's 6 new tests passing;
  - dossier 0 of 4, as on the staging line.
- Web: 857 of 858. The one failure, and main fails it too, is a product question. The daily edition test expects
  a disabled Publish button for an editor, while the page hides publishing from anyone who is not an owner or
  admin.
- Web lint: clean. A planted syntax error fails it, so the pass is real.
- Additional fixes, each its own commit and each failing on a clean checkout of main:
  - the agent activity panel redacts seat logins and machine names again;
  - the media rollback count reaches past main's new authority lesson;
  - the claim rollback uses revert();
  - two workspace page tests get a complete motion mock.
- Evidence: the broadcast run is recorded on the final revision, `7301df8`: 127 of 127.

## Constraints

- Work in a worktree, never in the shared checkout. Check out, merge and commit with `core.autocrlf=false`.
- No real machine name or address in code, tests, commit messages or pull request text.
- The readiness refresh vouches for every commit in the merged tree. That includes main's commits and any
  commit pushed straight to the staging line since the last refresh, so the operator signs off before the merge.
- No production deploy. The staging deploy uses the staging-only path, after the operator merges.
