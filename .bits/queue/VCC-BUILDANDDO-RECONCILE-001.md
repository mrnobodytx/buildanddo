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
| 2 | Merge `origin/main` into a branch from the staging line and resolve every conflict by R2-R6 | `git merge-base --is-ancestor origin/main HEAD`; no conflict markers in the tree | done: main at `a8a96b9` and the staging line at `48d8468` |
| 3 | Regenerate the readiness and context locks on the merged tree, LF | `hostinger_readiness.py --check`, `agent_context.py --check`, also in a fresh LF checkout | done |
| 4 | Run the three suites on the merged tree | `npx vitest run` in `apps/web`; `node --test tests/upgrade/*.test.mjs`; the Python native suites | done: see Evidence |
| 5 | Repository gates | `submission_readiness.py --check`, `verify_public_boundary.py` | done |
| 6 | Pull request to the staging line, merged only on the operator's OK | the gates again on a trial merge into the current head | pending |
| 7 | Staging-only deploy of web and backend | readback from staging | pending |
| 8 | Pull request taking the staging line into `main`, merged only on the operator's OK | GitHub reports it mergeable without conflicts | pending |

## Evidence (2026-09-24, release workstation, Windows, LF checkout)

The merged tree contains main at `a8a96b9` (with #100, TRUST-001) and the staging line at `48d8468`.

**Baselines.** Each parent was measured the same way on the same machine: the staging line at `987be21` and
main at `4fc9c21`. main needed two empty package markers before its Python suite could import at all, and its
native suites could not start on Windows.

**Conflicts.** The first merge had 53 conflicting files. The live classroom files were merged against
`62b8859`, the commit both lines share, which left real conflicts in 4 files instead of whole-file add/add
conflicts. The two later merges added 7 more: `ship.py` and its test, a lesson test, the header and the
workspace sidebar, and the locks.

**Suites on the final tree:**
- **Node** (`node --test tests/upgrade/*.test.mjs`, PYTHONPATH unset): 782 of 782.
- **Web lint:** clean.
- **Web suite** (Vitest): 826 of 827. The one failure, a TutorialCatalog source-case test, also fails on main at
  `a8a96b9`.
- **Python source suite** (the gate's `source_python`, 72 modules): every failure also fails on a parent, except
  one serializer test. It reads the branch ref of a linked worktree and passes in a detached checkout.
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
- the broadcast lesson test refused the stale evidence record until the run was repeated.

**Fixes found by running the suites.** Each is its own commit:
- chatrooms behind the government gate;
- four migrations that could not re-apply after a rollback;
- main's native suites on Windows;
- the re-run broadcast evidence;
- main's web fixtures without a workspace;
- main's public-lessons plugin on Windows.

## Constraints

- Work in a worktree, never in the shared checkout. Check out, merge and commit with `core.autocrlf=false`.
- No real machine name or address in code, tests, commit messages or pull request text.
- The readiness refresh vouches for every commit in the merged tree. That includes main's commits and any
  commit pushed straight to the staging line since the last refresh, so the operator signs off before the merge.
- No production deploy. The staging deploy uses the staging-only path, after the operator merges.
