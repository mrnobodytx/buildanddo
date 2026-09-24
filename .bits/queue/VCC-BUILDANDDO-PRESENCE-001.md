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
| 6 | Continuation R5-R6: echo outcomes against an in-memory stand-in for the SFU | `node --test tests/upgrade/classroom-presence.test.mjs` | done: 26 of 26 |
| 7 | Continuation R7: a route that verifies an incompletely held session fails the new tests | the same test with the route broken, then restored byte for byte | done: caught |
| 7a | Continuation R8: the read path compares track names, not `String()` of track objects | the same test; with the previous line restored, three echo tests fail | done |
| 8 | The whole Node suite and the repository gates | `node --test tests/upgrade/*.test.mjs`, `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`, `verify_public_boundary.py` | done: 524 of 524 |

## Constraints

- Files this dispatch may touch: `tests/upgrade/classroom-presence.test.mjs`, the comment in
  `apps/pocketbase/pb_hooks/classroom-realtime-lib.js`, this bookkeeping, and the readiness and context locks.
  Continuation R5-R8 touches the test file, this bookkeeping, the two locks, and one line of
  `apps/pocketbase/pb_hooks/classroom-presence.pb.js`, plus its header.
- The route changes only as R8 describes, on the operator's decision of 2026-09-23. It stays free of network calls
  and credentials of its own.
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

## Evidence, continuation R5-R8 (2026-09-23, local run on Windows, LF checkout)

- **The stand-in:** obviously fake credentials through the fixture's `$os.getenv`, and a `$http.send` that
  answers `GET /apps/<app>/sessions/<id>` from a table and records each request. Nothing opens a socket. The
  default fixture still provides neither.
- **What the new tests found:** on the unchanged route, three of the five fail. Every echo came back
  `NOT_HELD_BY_SFU:[object Object]`, because the read path compared `String()` of each track object with the SFU's
  track names. No row could ever be verified. The route was fixed on the operator's decision (R8).
- **After the fix:** `classroom-presence.test.mjs` passes 26 of 26: 21 before, plus 5. The whole Node suite,
  `node --test tests/upgrade/*.test.mjs` with the web `node_modules` linked, passes 524 of 524.
- **Controls,** each applied and restored byte for byte:
  - a route that verifies a session whose tracks are not all held fails 2 tests;
  - the original `String()` line put back fails 3;
  - a lib that counts an inactive track as held fails 1.
- **The route file** still holds no network call and no credential of its own; that source-reading test passes.
- **Staging:** the staging backend runs this hook. The fix changes its behaviour only after a staging-only
  backend sync, which is not performed here.
- **Gates:** `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check`
  and `verify_public_boundary.py` pass, also in a fresh LF checkout.
