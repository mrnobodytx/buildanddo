# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-DEPLOY-SWAP-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-DEPLOY-SWAP-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEPLOY-SWAP-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-DEPLOY-SWAP-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-DEPLOY-SWAP-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that makes ship.py copy a build beside the live site and swap it in,
#              with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-DEPLOY-SWAP-001

**SRS:** SRS-BUILDANDDO-DEPLOY-SWAP-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

A deploy never empties the live site. The build is copied beside it, checked, and swapped in, and the previous
release stays beside it.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Register the SRS, its spec and this dispatch | `env -u PYTHONPATH py -3.13 scripts/ci/agent_context.py --check` | done |
| 2 | Tests for R1-R5, command level and against real directories under `bash` | `python -m unittest tests.deploy.test_ship_swap`, which fails against the current `ship.py` | done: 3 failures and 4 errors before |
| 3 | `_rsync()` copies into `<webroot>.incoming`, checks `index.html`, swaps and keeps `<webroot>.previous` | the same tests pass | done: 8 of 8 |
| 4 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`, `verify_public_boundary.py` | done |

## Constraints

- Files this dispatch may touch: `scripts/deploy/ship.py` (`_rsync` and a new helper for the swap), the new
  `tests/deploy/test_ship_swap.py`, this bookkeeping, and the readiness and context locks.
- `_rsync()` keeps its name, arguments and result shape: `main()` and staging-only callers use it.
- No real machine name or address in code, tests, commit messages or pull request text. Tests use a made-up host
  (`host.invalid`) and never open a connection.
- Raises the tier: running `ship.py`, any deploy, any change on a server. None is performed here.

## Evidence (2026-09-23, local run on Windows, LF checkout)

- **Before** (`230d2b8` with only the new tests): 3 failures and 4 errors.
  - The old `_rsync()` names the live directory in its first command, to empty it, before any copy.
  - After a failed copy, it had already emptied the live directory.
  - It has no swap step for the four `bash` tests to run.
- **After:** 8 of 8.
  - Nothing before the swap names the live directory.
  - The copy goes to `<webroot>.incoming`, and a failed copy issues no swap.
  - Under `bash`, against real directories, the swap replaces the release whole, dotfiles included, and leaves
    no old build file behind. It keeps the release it replaced as `.previous`, refuses a copy without
    `index.html` while changing nothing, and handles a first deploy.
- **Controls,** each applied to `ship.py` and restored byte for byte:
  - removing the `index.html` check fails the refusal test;
  - moving the copy in before the live release moves out fails four tests.
- **Callers:** `tests.deploy.test_release_dora` and `tests.upgrade.test_activity_publish`, which imports
  `ship.py`, pass. Nothing in the repository depended on the old clear step. The release controller
  (`tools/buildanddo_release.py`) already stages its uploads in an incoming directory, and `ship.py` now does
  the same.
- **Gates:** `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`
  and `verify_public_boundary.py` pass, also in a fresh LF checkout.
