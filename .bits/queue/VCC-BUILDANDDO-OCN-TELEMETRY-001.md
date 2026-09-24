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
| 1 | Register the SRS, its spec and this dispatch | `python scripts/ci/agent_context.py --check` after the lock is regenerated | todo |
| 2 | The publisher: registry, adapters, builders, gates, credentials, transport, ledger, `publish` and `run` | `python -m unittest tests.upgrade.test_ocn_telemetry` | todo |
| 3 | `verify` with controls C1-C5 and the privacy readbacks, against fakes only | `python -m unittest tests.upgrade.test_ocn_telemetry` | todo |
| 4 | The offline selftest, registered as `CHECKS['ocn_telemetry']` | `python scripts/ci/ocn_telemetry.py selftest` prints PASS | todo |
| 5 | Retire box-side capture in `ocn_seat_session.py` | `python -m unittest tests.upgrade.test_ocn_seat_session` | todo |
| 6 | Docs: `docs/observability/ocn-telemetry.md`, and the service in `datadog-ci.md` | `python scripts/ci/public_redaction.py scan docs/observability` prints PASS | todo |
| 7 | Regenerate the readiness and context locks, LF | `python scripts/ci/hostinger_readiness.py --check`; `python scripts/ci/agent_context.py --check` | todo |
| 8 | Repository gates | `python scripts/ci/submission_readiness.py --check`; `python scripts/ci/verify_public_boundary.py` | todo |
| 9 | Every added line and commit message, scanned with the private fleet map | the added-line sweep and the branch sweep exit 0 | todo |

Every gate is judged by its exit code, never through a pipe.

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

## Definition of done

- [ ] Every gate command passes and its output is in the pull request.
- [ ] `python scripts/ci/agent_context.py --check` passes.
- [ ] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status updated for the SRS code.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
