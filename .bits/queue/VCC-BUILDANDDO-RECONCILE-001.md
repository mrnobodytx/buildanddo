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
| 2 | Merge `origin/main` into a branch from the staging line and resolve every conflict by R2-R6 | `git merge-base --is-ancestor origin/main HEAD`; no conflict markers in the tree | pending |
| 3 | Regenerate the readiness and context locks on the merged tree, LF | `hostinger_readiness.py --check`, `agent_context.py --check`, also in a fresh LF checkout | pending |
| 4 | Run the three suites on the merged tree | `npx vitest run` in `apps/web`; `node --test tests/upgrade/*.test.mjs`; the Python native suites | pending |
| 5 | Repository gates | `submission_readiness.py --check`, `verify_public_boundary.py` | pending |
| 6 | Pull request to the staging line, merged only on the operator's OK | the gates again on a trial merge into the current head | pending |
| 7 | Staging-only deploy of web and backend | readback from staging | pending |
| 8 | Pull request taking the staging line into `main`, merged only on the operator's OK | GitHub reports it mergeable without conflicts | pending |

## Constraints

- Work in a worktree, never in the shared checkout. Check out, merge and commit with `core.autocrlf=false`.
- No real machine name or address in code, tests, commit messages or pull request text.
- The readiness refresh vouches for every commit in the merged tree. That includes main's commits and any
  commit pushed straight to the staging line since the last refresh, so the operator signs off before the merge.
- No production deploy. The staging deploy uses the staging-only path, after the operator merges.
