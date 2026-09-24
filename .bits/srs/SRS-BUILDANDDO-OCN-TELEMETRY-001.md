# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-OCN-TELEMETRY-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-OCN-TELEMETRY-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-OCN-TELEMETRY-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs_registry.yml, scripts/ci/public_redaction.py, scripts/ci/emit_datadog_metrics.py,
#              scripts/ci/ocn_seat_session.py
# EnumType:    Doc
# EnumEdges:   GOVERNS scripts/ci/ocn_telemetry.py; GOVERNS scripts/ci/ocn_seat_session.py;
#              GOVERNS tests/upgrade/test_ocn_telemetry.py; GOVERNS docs/observability/ocn-telemetry.md
# Intent:      Turn finished OCN probe receipts into marked PostHog and Datadog telemetry, published only
#              from the release workstation, off by default, and proven by readback rather than by a 200.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-OCN-TELEMETRY-001 — OCN receipts become marked telemetry, published from the release workstation

## Why this exists

Measured at `def2bfb` (the staging line) and at `21ffb6b` (main) on 2026-09-24:

- There are 17 OCN probes, `scripts/ci/ocn_*.py`. Only `ocn_seat_session.py` emits telemetry, and it
  sends to PostHog only, from the fleet box itself, with the key passed on the command line. Its
  events carry the box's seat id as `distinct_id`, a person named after the box, and the box's egress
  address as `ocn_box_ip`. That goes against the operator's rule of 2026-09-22: no machine name and no
  address on any surface this estate publishes to.
- Nothing reads telemetry back. The seat script's docstring points at a `verify_ocn_telemetry()` that
  exists nowhere, and the estate aggregate counts PostHog 200 answers, which prove nothing: PostHog
  answers 200 for an invalid key and never stores that event (measured 2026-09-20).
- No OCN probe reports to Datadog at all.

The design was decided by a judged comparison of two designs (2026-09-24). The operator then decided:

- **PostHog:** project 597897, with every event flagged as agent traffic (`is_ocn_agent`, `$lib`
  `bnd-ocn-telemetry`). Events are personless: no person profiles and no `$identify`. No `$pageview`.
  Per-check events only for journeys and lifecycles. The sending machine's address is never kept: agent
  events carry the unspecified address as `$ip`.
- **Datadog:** events and logs only. Custom metrics exist behind a flag that stays off.
- **Telemetry is off by default.** Excluding agent events from the public activity figure is an estate
  change outside this repository. It is a precondition for any PostHog send, not part of this work.

## Requirements

1. **R1 - off by default.** With `BUILDANDDO_OCN_TELEMETRY` unset and no `--telemetry`, nothing is sent,
   no credential store is opened and no file is written. The receipt block reads `UNSENT` with reason
   `DISABLED`. `dry-run` prints what would be sent to stderr, runs the gates, records counts in the
   ledger and still sends nothing. `BUILDANDDO_OCN_TELEMETRY=off` vetoes every `--telemetry` and `--mode`
   flag, so turning it off is the rollback; `publish` without `--mode` follows the switch and is a dry run
   while it is unset.
2. **R2 - one publisher, on the release workstation, from finished receipts.** `scripts/ci/ocn_telemetry.py`
   is the only module that knows PostHog and Datadog. It uses the standard library only, reads each
   probe's receipt after the probe has reached its verdict, and never ships anything to a fleet box.
   16 of the 17 probes stay byte-identical; `ocn_seat_session.py` only loses its capture. It never
   imports `scripts/deploy/ship.py` (which resolves secrets at import) or `data_dog_private` (whose bridge
   writes a PostHog event into another project on every call).
3. **R3 - the wrapper never changes a probe.** `ocn_telemetry.py run -- <probe command>` passes the child's
   stdout through byte for byte and exits with the child's own exit code, under `off`, `dry-run` and
   `send` with a failing transport alike. It publishes only after the child has exited, and publishes
   nothing after a KeyboardInterrupt. It never publishes `selftest`, `routes`, `legs` or `seats`.
4. **R4 - a closed registry and allowlist adapters.** The registry names exactly the 17 probes. One pure
   adapter per probe copies only allowlisted fields; an unknown state becomes `other` and an unknown
   receipt shape is refused (`UNKNOWN_SCHEMA`). The outcome follows each probe's own rule and never
   re-judges it (the table is in `docs/observability/ocn-telemetry.md`).
5. **R5 - personas, never machines.** `distinct_id` takes one of ten values: `ocn:<persona>` for the eight
   guildmasters, `ocn:multiple` or `ocn:unplaced`. A box id is resolved to its guildmaster through the
   private fleet map in memory, and never leaves the process or reaches the ledger. A seat identity
   refusal is sent nowhere (`IDENTITY_REFUSED`, SRS-BUILDANDDO-COMMUNITY-WEB-001 R6).
6. **R6 - the PostHog shape.** One `/batch/` request to project 597897 per receipt, with the key named
   `BUILDANDDO_PH` only, which must start with `phc_`. Every event carries `is_ocn_agent`, `$lib`,
   `$process_person_profile: false` and `$geoip_disable: true`. No `$pageview`, `$identify`, `$set`,
   `$session_id` or `$current_url`. One `ocn_probe_run` per receipt; `ocn_probe_check` events only for
   the probes marked for them, at most 60 per receipt with controls always kept. One
   `ocn_telemetry_control` event goes out in its own request with a deliberately invalid key.
7. **R7 - the Datadog shape.** Site us5 only. One event per judged receipt and one log per check plus a
   run summary, only for receipts less than 17 hours old. No host on any signal. Tags are bounded:
   `service`, `env`, `team`, `ocn_probe`, and on events and logs `ocn_outcome`, `ocn_persona` and
   `ocn_run`. Metrics exist only behind `--dd-metrics` (off): gauges only, no run id or persona tag, at
   most 178 series.
8. **R8 - fail-closed gates before any key.** A tag gate (keys and values inside their enums, the series
   ceiling) and a leak gate (`public_redaction.Rule` with the private fleet map, over every outbound body)
   run before a key or the `$ip` marker is attached. Either failure withholds the whole receipt. The report
   names fields and counts, never values. `send` refuses without a readable fleet map (`NO_FLEET_MAP`).
9. **R9 - credentials by name.** Values come from the store named by `CITADEL_WORKSPACE_ENV` first and the
   ambient environment second, and only their provenance is recorded. `POSTHOG_API_KEY` and
   `POSTHOG_HOST` are never read. A capture key without `phc_`, a readback key with `phc_`, or a
   `DD_SITE` other than us5 is refused. `off` and `dry-run` never open the store. With `CI` or `GITLAB_CI`
   set, `send` and `verify` refuse (`CI_GUARD`) unless `BUILDANDDO_OCN_TELEMETRY_ALLOW_CI=1`. Nothing goes
   to PostHog (`POSTHOG_PRECONDITION`, its key never read) until the operator sets
   `BUILDANDDO_OCN_TELEMETRY_POSTHOG=1`, recording that the estate precondition has landed.
10. **R10 - one transport inside a budget.** Every network call goes through one function: one attempt, no
    retry, no redirect, never raises. All requests share a 10-second budget with at most 3 seconds each,
    both held by the wall clock. A sink that could not start in time is `UNSENT/BUDGET`, and one that
    overran is `UNSENT/TRANSPORT:BUDGET`. `SENT` means the vendor accepted the request
    (PostHog 200, Datadog 2xx), never that it was stored. Nothing the publisher does can raise into a
    probe: an exception becomes `UNSENT/PUBLISHER_ERROR:<class>`.
11. **R11 - deterministic ids and a ledger.** `run_id` and every PostHog event uuid derive from the
    receipt's digest (the receipt without its `ocn_telemetry` block), so the same receipt always gives the
    same ids. The ledger under the gitignored `state/ocn_telemetry/` holds states, counts, digests and
    credential provenance, never payload values, keys, box ids or addresses. A repeat publish posts only
    what the ledger does not record as accepted, and returns `LEDGER_DUPLICATE` when everything was;
    `--force` re-sends the PostHog events with the same uuids and never posts an accepted Datadog body again.
12. **R12 - delivery proved by readback with controls.** `verify` reads PostHog project 597897 back with
    HogQL and Datadog back through events and logs search. `VERIFIED` needs the expected counts and every
    control: C1 the invalid-key event is absent, C2 a never-sent run id returns 0 rows, C3 the project
    named by `POSTHOG_PROJECT_ID` holds nothing of the run (`NOT_CHECKED` when that key cannot read it),
    C4 Datadog answers 403 to an invalid key (any 2xx makes the run `VOID`), C5 a never-sent run id
    returns 0 Datadog events and logs. Privacy readbacks report a kept `$ip` (`IP_STORED`), legacy box
    properties and new agent persons. Without a read key, or on 401 or 403, the result is `UNMEASURED`.
    Nothing is ever `PASS`.
13. **R13 - box-side capture retired.** `ocn_seat_session.py` sends nothing to PostHog. `--ph-key` and
    `--no-capture` stay accepted and do nothing, so existing driver command lines do not exit 2.
    `distinct_id` becomes `ocn:<persona-slug>`, and the receipt keeps every key the estate aggregate
    reads. The script stays standard library only and ships to a box on its own.
14. **R14 - an offline selftest in CI.** `ocn_telemetry.py selftest` runs with a socket guard, builds its
    planted machine name and documentation address at run time, and proves the leak gate blocks both. It
    is registered as `CHECKS['ocn_telemetry']` at level `source` in `scripts/ci/hostinger_checks.py`.
15. **R15 - no address and no machine name.** No line this work adds carries an address or a machine
    name, checked with the private fleet map across every file type. Tests plant only the fixture names
    and documentation addresses `public_redaction.py` allows, built at run time.

## Out of scope (A3, each needs the operator)

- Any live send or live verify, and turning the switch on anywhere.
- The estate precondition: `tools/citadel_activity_projection.py` counts every event in 597897 into the
  public `activity-status.json`. It must exclude agent events (`is_ocn_agent`, or `$lib` starting
  `bnd-ocn`) before the first PostHog send, and the operator adds `is_ocn_agent` to the project's
  test-account filter.
- The estate drivers: `citadel_ocn_perception.collect` stops passing `--ph-key`, publishes each seat record
  through `publish --receipt - --tee`, and its aggregate reads `ocn_telemetry.state`;
  `citadel_ocn_review_round` publishes observation records.
- Datadog custom metrics, which wait for a Plan & Usage check; monitors, dashboards, facets, indexes and
  pipelines; any Datadog agent or key on a box.
- The legacy OCN data in 597897 (six persons named after boxes, events carrying box addresses). Deleting
  it cannot be undone and is the operator's call.

## Acceptance

- `python -m unittest tests.upgrade.test_ocn_telemetry tests.upgrade.test_ocn_seat_session tests.upgrade.test_datadog_metrics`
  passes, with sockets blocked and the environment cleared.
- `python scripts/ci/ocn_telemetry.py selftest` prints `PASS` with no socket opened.
- `hostinger_readiness.py --check`, `agent_context.py --check`, `submission_readiness.py --check` and
  `verify_public_boundary.py` pass, with the locks regenerated LF.
- Every added line passes the private-map scan, and every commit message passes too.
