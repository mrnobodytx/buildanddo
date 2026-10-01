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
by default and proven by readback, and no fleet box sends anything for it or needs a key. Until the A3
collector change, the estate collector still passes `BUILDANDDO_PH` (a public `phc_` client key) on every
seat's command line, which the seat script ignores; dropping it is the first A3 driver step.

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
| 11 | A3: the estate preconditions (then `BUILDANDDO_OCN_TELEMETRY_POSTHOG=1`), then a verified staging pilot, then the estate drivers, first dropping `--ph-key` | `verify --pending` reads VERIFIED with C1-C5 held | pending (operator) |
| 12 | Review fixes: 36 confirmed findings, each reproduced first, fixed with a test that fails without it | the unit tests and the selftest pass; 71 mutants, one or more per finding, are each caught | done |

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

## Review fixes (2026-09-24)

Three reviewers reported 36 confirmed findings against `3172828` (one of them twice). Each was
reproduced offline before it was fixed, with the real probes and the network patched out where a probe
was involved. The fixes are in eight groups:
- **Adapters** (`dfb22f7`): a VOID sweep or walk judges only the controls that voided it, and the
  checks_failed gauge goes only beside the outcome gauge. project_fleet's own race checks are relabelled,
  not duplicated. The three probes that take `--env` but never record it need `--env` (`NO_ENV`). A
  request with no answer is TRANSPORT_FAULT, not REFUSED. Only the seven perception scores and the eight
  inventory collections become property names.
- **Templating and the leak gate** (`1d243ec`): the segment after `records` is `:id` whatever its shape,
  an email becomes `:email` before anything is slugged, and the leak gate refuses anything email-shaped.
- **Delivery** (`4f5b61c`): `BUILDANDDO_OCN_TELEMETRY=off` vetoes every flag, and `publish` without
  `--mode` follows the switch. PostHog waits for `BUILDANDDO_OCN_TELEMETRY_POSTHOG=1`. A failed Datadog
  part leaves the receipt degraded, and a re-publish posts only what was not accepted; `--force` never
  posts an accepted Datadog body again. The budget is a wall clock. An interrupt mid-publish is recorded
  before it carries on. A dry run no longer overwrites the ledger's record of a send (found while fixing
  the retry, not in the review).
- **Verify** (`f315fc6`): legacy capture is counted across the project since the first send, and only a
  request with no status is read back as possibly delivered.
- **The run wrapper** (`359d96d`): a receipt that names its own command decides, and the `--write`
  fallback reads only the invocation's own env.
- **Sibling imports** (`b90f43a`): siblings come from the publisher's own package or folder, never from a
  `scripts` package elsewhere on the import path.
- **Socket guards** (`c51210a`): both test modules record every attempt and fail on one, and each guard,
  the selftest's included, is shown to refuse.
- **Docs** (`84d2864`): the collector still passes the public capture key to every seat until its A3
  change, which the seat script ignores.

Evidence, offline, with sockets refused:
- Unit tests: 188 of 188 (155, 24 and 9). The selftest passes 17 of 17 with no socket opened, with the
  workstation's own switch set to off as well as unset.
- Against `3172828`'s publisher, 53 of the 179 telemetry and seat tests fail. Every test added for a code
  defect is among them.
- 71 mutants, one or more per finding (the review's own, and the reverse of each fix), are each caught.
  Run against `3172828` and its 128 tests, 38 of the review's 39 test-gap mutants passed. Only the
  literal-URL capture mutant was caught (by the source grep); its assembled-URL twin passed while the
  process guard refused 8 connection attempts.
- The review's reproduction scripts, re-run on the fixes, show each defect gone. A VOID sweep has 2
  failed checks (its controls), not 19. A publish under a 1-second budget takes 1.0 s, not 4.0 s. A
  refused send leaves nothing pending, and a stand-in `scripts` package on PYTHONPATH is never imported.
- AEGIS: `ocn_telemetry.py` and both test files audit clean=1, dead_code=0, logic=0.
- The locks, gates and sweeps are listed in the pull request. They were run on this tree after the locks
  were regenerated LF.

After the review round (2026-09-24):
- The staging line after #109 (`82df1fb`) is merged in. #109 gave the feature sweep an `UNMEASURABLE`
  row state; the adapter already publishes those rows unjudged, and every run state the sweep writes is in
  its vocabulary. Only the two locks overlapped; they were regenerated over the merged tree.
- Two defects the fixer found are closed:
  - A PostHog batch that was accepted while its invalid-key twin never went out read as a clean `SENT`,
    and verify's C1 then held on nothing. The PostHog sink now records `control_state`. Such a send is
    degraded and fails `--strict`, and C1 reads `UNMEASURED`, which blocks `VERIFIED`, unless the twin
    went out. A ledger written before the field existed falls back to the twin's HTTP status.
  - A real send inherited `first_published_at` from an earlier dry run, which widened verify's window.
    Only a previous real send's time is kept now.
- Four tests cover them, and reversing any of the five changes makes one fail. Unit tests: 192 of 192.

Decisions for the operator:
- `publish` with no `--mode` and the switch unset is still a dry run, as before. It writes the ledger's
  counts and sends nothing. R1's "no file is written" holds for `run`.
- `--force` re-posts the PostHog pair only, because Datadog keeps every copy it accepts.

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
