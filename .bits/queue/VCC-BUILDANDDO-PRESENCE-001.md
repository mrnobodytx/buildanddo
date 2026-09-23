# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-PRESENCE-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-PRESENCE-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PRESENCE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-PRESENCE-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-PRESENCE-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that brings the presence test and documentation in line with the
#              route's verification contract, with a gate per task.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-PRESENCE-001

**SRS:** SRS-BUILDANDDO-PRESENCE-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

## Objective

The classroom presence route, its shared library and its test state the same verification contract. The test
fails only when the route breaks that contract.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Register the SRS, its spec and this dispatch | `env -u PYTHONPATH py -3.13 scripts/ci/agent_context.py --check` | done |
| 2 | The test asserts the route's contract on write and on read | `node --test tests/upgrade/classroom-presence.test.mjs` (fails 1 of 21 on `ff7b865`) | done: 21 of 21 |
| 3 | The library comment and the test file's offline note agree with the route | the same test, and a review of both comments | done |
| 4 | Controls: the old label on write, and a read that claims `ECHOED_BY_SFU` without an echo, each fail the test | the same test under each control, with the route restored byte for byte | done: 2 of 2 caught |
| 5 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`, `verify_public_boundary.py` | done |

## Constraints

- Files this dispatch may touch: `tests/upgrade/classroom-presence.test.mjs`, the comment in
  `apps/pocketbase/pb_hooks/classroom-realtime-lib.js`, this bookkeeping, and the readiness and context locks.
- `apps/pocketbase/pb_hooks/classroom-presence.pb.js` is not edited.
- No real machine name or address in any file, commit message or pull request text.
- Raises the tier: deploy, push to a live host, any change to the route's behaviour. None is performed here.

## Evidence (2026-09-23, local run on Windows, LF checkout)

- **Before** (`ff7b865`): `classroom-presence.test.mjs` passes 20 of 21. The label test expected
  `NOT_ECHOED_BY_SFU` on write and the route answered `NOT_YET_ECHOED`.
- **After:** 21 of 21. The whole Node suite, `node --test tests/upgrade/*.test.mjs`, passes 519 of 519.
  `source-checker.test.mjs` needs the web `node_modules`; without them it fails with `spawnSync npm ENOENT`,
  unrelated to this change.
- **Controls,** each applied to the route and then restored byte for byte:
  - the old label on write fails the test;
  - a read that claims `ECHOED_BY_SFU` without an echo fails it too.
- **No behaviour change:** `classroom-presence.pb.js` is not edited, and the library differs only in a comment
  (0 code lines).
- **Finding, not fixed here:** no test covers the echo outcomes against a reachable SFU (`ECHOED_BY_SFU`,
  `NOT_HELD_BY_SFU`, `NO_TRACKS_ADVERTISED`). The test double provides no network, by design.
- **Gates:** `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`
  and `verify_public_boundary.py` pass, also in a fresh LF checkout.

## The locks on the integration head (2026-09-23)

The pull request's branch was brought up to date with GitHub's "Update branch" merge, which combines the two
lock files as text. After the merge, the integration head (`fc1e4f1`) failed `hostinger_readiness.py --check`
and `agent_context.py --check`. Its tree differed from the locally verified merge only in those two files.

Both locks are regenerated on the head itself, with LF line endings. By the operator's decision of the same
day, the readiness refresh also covers the eight commits pushed directly to the integration branch (`055bb8f`
through `13ed854`), which had left it stale. No acceptance state changed.

**How to apply:** after "Update branch" on any pull request that touches `.bits/`, regenerate both locks on
the result before merging. A text merge of a lock is not a lock.
