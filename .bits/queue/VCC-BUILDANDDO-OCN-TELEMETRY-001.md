# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-OCN-TELEMETRY-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-OCN-TELEMETRY-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-OCN-TELEMETRY-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs/SRS-BUILDANDDO-OCN-TELEMETRY-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-OCN-TELEMETRY-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that builds the OCN receipt publisher offline, off by default, with a
#              gate per task and the A3 boundary written down.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-OCN-TELEMETRY-001

**SRS:** SRS-BUILDANDDO-OCN-TELEMETRY-001 **Risk:** A2 **Seat:** C-ONE **Status:** in_progress

## Objective

Every OCN probe receipt can become marked PostHog and Datadog telemetry from the release workstation, off
by default and proven by readback, and no fleet box sends or holds anything for it.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Register the SRS, its spec and this dispatch | `python scripts/ci/agent_context.py --check` after the lock is regenerated | done |
| 2 | The publisher: registry, adapters, builders, gates, credentials, transport, ledger, `publish` and `run` | `python -m unittest tests.upgrade.test_ocn_telemetry` | done |
| 3 | `verify` with controls C1-C5 and the privacy readbacks, against fakes only | `python -m unittest tests.upgrade.test_ocn_telemetry` | done |
| 4 | The offline selftest, registered as `CHECKS['ocn_telemetry']` | `python scripts/ci/ocn_telemetry.py selftest` prints PASS | done |
| 5 | Retire box-side capture in `ocn_seat_session.py` | `python -m unittest tests.upgrade.test_ocn_seat_session` | done |
| 6 | Docs: `docs/observability/ocn-telemetry.md`, and the service in `datadog-ci.md` | `python scripts/ci/public_redaction.py scan docs/observability` prints PASS | done |
| 7 | Regenerate the readiness and context locks, LF | `python scripts/ci/hostinger_readiness.py --check`; `python scripts/ci/agent_context.py --check` | done |
| 8 | Repository gates | `python scripts/ci/submission_readiness.py --check`; `python scripts/ci/verify_public_boundary.py` | done |
| 9 | Every added line and commit message, scanned with the private fleet map | the added-line sweep and the branch sweep exit 0 | done |
| 10 | Dry run on real receipts with the private map; the operator reviews one payload set | `publish --mode dry-run --receipt state/ocn_feature_sweep/staging.latest.json` shows both gates PASS | pending (next step, no vendor write) |
| 11 | A3: the estate preconditions, then a verified staging pilot, then the estate drivers | `verify --pending` reads VERIFIED with C1-C5 held | pending (operator) |

Every gate is judged by its exit code, never through a pipe.

## Evidence (2026-09-24, release workstation, Windows, LF checkout)

Built offline in a worktree from the staging line at `def2bfb`. Nothing was sent to PostHog, Datadog
or anything else: every test and the selftest ran with sockets refused.

- **Unit tests:** `python -m unittest tests.upgrade.test_ocn_telemetry tests.upgrade.test_ocn_seat_session
  tests.upgrade.test_datadog_metrics` ran 137 of 137 (105, 23 and 9), with the environment cleared. Each
  of the 17 adapters has its own named test, on a receipt shaped like that probe's real output.
- **Controls on the tests.** Thirteen mutations of the guarded behaviour were each caught by the test
  that guards it, and none of those tests fails on the clean code. The mutations were:
  - a leak gate or tag gate that passes everything;
  - an adapter that copies probe text;
  - a wrapper that adds a byte to stdout;
  - a switch that defaults to send, or a CI guard that is off;
  - a ledger that never finds a delivery;
  - readback that always finds, or a canary that always holds;
  - a run id spliced into the query;
  - verify that never waits;
  - pending runs that include dry runs;
  - a renamed seat check.

  Run against the previous seat script, the new seat tests fail six assertions.
- **Selftest:** `python scripts/ci/ocn_telemetry.py selftest` passes 14 of 14 with no socket opened.
  Run through the harness, `hostinger_readiness.py --run ocn_telemetry` reports PASS with exit 0. The
  feature sweep and journey selftests are unchanged and exit 0.
- **The other 16 probes** are byte-identical to `def2bfb`. The seat script is 1,985 bytes smaller: its
  base64 is 27,648 characters, from 30,296.
- **AEGIS:** `ocn_telemetry.py`, `ocn_seat_session.py`, `hostinger_checks.py` and both test files audit
  clean=1, dead_code=0, logic=0.
- **Locks:** regenerated and converted to LF. Before the refresh, `hostinger_readiness.py --check` failed
  on the stale lock (exit 1), which is its control; afterwards it passes (12 milestones).
  `agent_context.py --check` passes with 35 findings and 32 unwired gates, the same counts as before this
  work, and records `scripts/ci/ocn_telemetry.py` as configured in GitLab.
- **Gates:** `submission_readiness.py --check` passes. `verify_public_boundary.py` passes with 1,788
  files and 0 failures. All four gates also pass in a fresh LF clone of the branch.
- **Names and addresses:** `public_redaction.py scan docs/observability` passes with the private fleet
  map. The added-line sweep finds nothing in any added line of any file type, `.py` included. The branch
  sweep finds nothing in any commit message. It reads one inherited name in `hostinger_checks.py`: a
  comment that was already there, which this work does not touch.

Not done here: the plan's later steps are A3 or need the operator. They are a dry run on real receipts
with the private map, the estate preconditions, a verified live pilot, and the estate driver changes.

## Constraints

- Files this dispatch may touch: `scripts/ci/ocn_telemetry.py`, `scripts/ci/ocn_seat_session.py`,
  `scripts/ci/hostinger_checks.py` (one CHECK), `tests/upgrade/test_ocn_telemetry.py`,
  `tests/upgrade/test_ocn_seat_session.py`, `docs/observability/ocn-telemetry.md`,
  `docs/observability/datadog-ci.md`, `.bits/srs_registry.yml`, this dispatch and its spec, and the
  regenerated `.bits/hostinger-readiness.lock.json` and `.bits/context.lock.json`.
- Files it must not touch: the other 16 `scripts/ci/ocn_*.py`, `scripts/ci/datadog_publish.py`,
  `scripts/ci/emit_datadog_metrics.py`, `scripts/ci/public_redaction.py`, `apps/pocketbase/pb_hooks`,
  `apps/web`, and anything outside this repository.
- Work in a worktree, never the shared checkout. Check out and commit with `core.autocrlf=false`.
- No network call to PostHog, Datadog or anything else. Tests block sockets and clear the environment.
- Credentials by variable name only. No address or machine name in code, tests, docs or commit messages.

**Raises the risk tier to A3, so it needs the operator:** any live send or verify; turning the switch on;
the estate precondition that excludes agent events from the public activity figure; the estate driver
changes; enabling Datadog metrics; anything touching the legacy OCN data in project 597897.

## Findings, recorded and not fixed here

- `SRS-BUILDANDDO-LIVE-UTILIZATION-001` is cited by every OCN script's header but has no registry entry
  and no spec, so no branch may claim it.
- `SRS-BUILDANDDO-COMMUNITY-WEB-001` has a spec under `.bits/srs/` but no registry entry.
- `citadel_ocn_perception.collect` ships the seat script base64 inside one `node_drive --cmd` argument.
  Measured by the design review, the Windows command-line limit left about 2,000 characters of headroom;
  this change makes the script smaller, but the collector still has no guard (gzip shipping is estate
  work).
- `tools/day21/day21_browser_capture.py` loads the real site in a headless browser, whose own PostHog and
  RUM SDKs may send unmarked visitor events.
- The bash remotes in `ocn_feature_sweep.py`, `ocn_classroom_fleet.py` and `ocn_project_fleet.py` send a
  bare `Mozilla/5.0` User-Agent, so their traffic looks like a browser, and they time nothing, so no
  latency reaches telemetry for them.
- `classroom_video_proof.py` and `classroom_media_roundtrip.py` also sign in as OCN seats and are not in
  the registry. Joining probe requests to the server's `traceparent` records is not attempted.
- The comment above the `ocn_feature_sweep` CHECK in `scripts/ci/hostinger_checks.py` names a fleet
  machine. It predates this work, which adds a CHECK beside it and leaves it as it is. It belongs to the
  public-redaction cleanup.

## Definition of done

- [x] Every gate command for tasks 1-9 passes; the results are recorded above for the pull request.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code: it stays `in_progress` until a verified pilot.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
