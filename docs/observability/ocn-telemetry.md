# CGRF: SRS=SRS-BUILDANDDO-OCN-TELEMETRY-001 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/observability/ocn-telemetry.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-OCN-TELEMETRY-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-OCN-TELEMETRY-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     scripts/ci/ocn_telemetry.py, scripts/ci/ocn_seat_session.py, scripts/ci/public_redaction.py
# EnumType:    Doc
# EnumEdges:   DOCUMENTS scripts/ci/ocn_telemetry.py; DOCUMENTS posthog.events.ocn;
#              DOCUMENTS datadog.events.buildanddo_ocn; DOCUMENTS datadog.logs.buildanddo_ocn
# Intent:      Say what OCN telemetry sends, where, under which names and tags, how delivery is proved,
#              how to turn it off, and what the operator must do before it may send at all.
# ───────────────────────────────────────────────────────────────

# OCN probe telemetry

The 17 OCN probes (`scripts/ci/ocn_*.py`) write the receipts they always wrote. On the release
workstation, `scripts/ci/ocn_telemetry.py` reads a finished receipt and publishes what it says:
- to PostHog project 597897 (BuildAndDo), as marked, personless agent events;
- to Datadog on us5, as one event per judged run and one log per check.

Nothing runs on a fleet box, no key reaches a box, and no probe imports the publisher. The one probe
that used to send from its box, `ocn_seat_session.py`, no longer does (see [Retired](#retired-box-side-capture)).

Telemetry is **off by default**. Sending is an A3 action and waits for the operator and for the
[preconditions](#operator-preconditions).

## The switch

| Mode | What happens |
|------|--------------|
| `off` (default) | The block reads `UNSENT` / `DISABLED`. No network, no file, no credential store. |
| `dry-run` | Both gates run, the exact payloads go to stderr, and the ledger records counts. Nothing is sent and the store is not opened. A dry run never overwrites the ledger's record of a real send. |
| `send` | The gates run, then keys and the `$ip` marker are attached and each request is sent once. |

`BUILDANDDO_OCN_TELEMETRY=off` vetoes every flag. Otherwise the mode comes from `--telemetry` (for
`run`) or `--mode` (for `publish`), else from `BUILDANDDO_OCN_TELEMETRY`. With neither, `run` is `off`
and `publish` is a dry run. An unknown value is `off`. **Rollback is setting
`BUILDANDDO_OCN_TELEMETRY=off`**: every publish stops, whatever a prepared command or driver passes, and
nothing else needs to change. The switch governs publishing only; `verify` is a separate, explicitly
invoked readback. Data already sent is isolated by `is_ocn_agent` and `$lib` in PostHog and by
`service:buildanddo-ocn` in Datadog.

PostHog also waits for the operator: until `BUILDANDDO_OCN_TELEMETRY_POSTHOG=1` records that the
[preconditions](#operator-preconditions) have landed, a send leaves the PostHog sink `UNSENT` with
`POSTHOG_PRECONDITION` and never reads its key. Datadog goes ahead.

## Commands

PowerShell 5.1 has no `&&`, so each line below is one command.

```
python scripts/ci/ocn_telemetry.py run --telemetry dry-run -- scripts/ci/ocn_feature_sweep.py sweep --box <seat> --env staging --json
python scripts/ci/ocn_telemetry.py publish --receipt state/ocn_feature_sweep/staging.latest.json --mode dry-run
python scripts/ci/ocn_telemetry.py verify --pending
python scripts/ci/ocn_telemetry.py probes
python scripts/ci/ocn_telemetry.py selftest
```

- **`run [options] -- <probe command>`** starts the probe without a shell. A leading `*.py` runs under the
  same interpreter, with `PYTHONIOENCODING=utf-8`, so a non-ASCII table cannot raise under a pipe. The
  probe's stdout passes through byte for byte, its stderr is inherited, and `run` exits with the probe's
  own exit code. Only after the probe has exited does it read the receipt and publish, then print one
  summary line on stderr. After a KeyboardInterrupt it waits for the probe and publishes nothing. An
  interrupt while publishing may leave the publish partial: what already went out is in the ledger, and
  `verify --pending` reads it back. `selftest`, `routes`, `legs` and `seats` are never published: for the
  sweep and the journey the subcommand after the script decides, and for the classroom and project
  orchestrators the receipt's own `command` does, since an option value can come before their command
  (`ocn_classroom_live.py --host forge run`). The receipt is found in this order:
  - the whole stdout as one JSON document;
  - else the last line that starts with `{`, or an indented document that starts on such a line;
  - else the file the probe wrote with `--write`, for this invocation's own `--env` only, so a concurrent
    run for the other environment is never taken for it.

  Options: `--sinks posthog,datadog`, `--probe NAME`, `--expect allow|deny` (rbac matrix cells),
  `--dd-metrics`, `--fleet-map PATH`, `--verify` (read the run back straight after a send).
- **`publish --receipt PATH|-`** reads a receipt file or stdin. It accepts UTF-8 and UTF-16 with a BOM
  (PowerShell 5.1 redirection writes UTF-16), a stream (the last `{` line), or a `node_drive` envelope
  (its stdout). It prints exactly one JSON line on stdout: the `ocn_telemetry` block, or with `--tee` the
  receipt with its block. Box receipts come this way. For example, a seat record from the estate
  collector goes through `publish --probe ocn_seat_session --receipt - --tee`.
  - `ocn_guild_dogfood`, `ocn_mission_work` and `ocn_room_probe` take `--env` but never record it, so
    their receipts need `--env` here; without it they are refused (`NO_ENV`), never guessed. Under `run`,
    the probe command's own `--env` is read. `ocn_rbac_probe` and `ocn_box_exercise` only ever reach
    staging.
  - Publishing a run again posts only what the ledger does not record as accepted, so a failed part is
    retried alone. When everything was accepted the answer is `LEDGER_DUPLICATE`. `--force` also posts
    the PostHog pair again, with the same uuids. A Datadog body that was accepted is never posted twice,
    because Datadog keeps every copy and `verify` counts exactly.
  - `--probe-digest` names the digest of the script that actually ran.
  - `--strict` exits non-zero on anything short of a clean send (any selected sink, or any Datadog part,
    left unsent), or on a failed gate in a dry run.
- **`verify`** is described in [Verify](#verify-runbook).
- **`selftest`** runs offline with every socket refused, and is the CI gate `CHECKS['ocn_telemetry']`.

`publish` and `verify` exit 0 unless `--strict` is given. `run` always exits with the probe's code.

## Probes

The registry is closed at 17 entries. One adapter per probe copies only allowlisted fields, and never
copies `seat`, `box`, `uid`, `seat_uid`, `email`, any `*_ip`, `distinct_id`, `session_id`, workspace,
mission, room, run or job ids, `request_key`, `said`, `why`, `message`, `fields`, `body`,
`lesson_body_head`, `reason`, `detail`, `titles` or `args`. `seat` and `box` are read in memory only, to
find the guildmaster.

| Probe | Receipt | Per-check PostHog events | Datadog event | Published from |
|-------|---------|:-:|---|---|
| `ocn_feature_sweep` | `buildanddo.ocn-feature-sweep/v1` | no | always | `sweep` |
| `ocn_journey_report` | `buildanddo.ocn-journey-report/v1` | yes | always | `walk` |
| `ocn_classroom_fleet` | `buildanddo.ocn-classroom-fleet/v1` | yes | always | `run` |
| `ocn_classroom_live` | `buildanddo.ocn-classroom-live/v1` | yes | always | `run` |
| `ocn_project_fleet` | `buildanddo.ocn-project-fleet/v1` | no | always | `run` |
| `ocn_seat_session` | `buildanddo.ocn-seat-session/v1` | yes | always | every run |
| `ocn_rbac_probe` | recognised by shape | no | only with `--expect` | every cell |
| `ocn_box_exercise` | recognised by shape | yes | always | every run |
| `ocn_content_assessment` | `buildanddo.ocn-content-assessment/v1` | no | always | every run |
| `ocn_subsystem_probe` | `buildanddo.ocn-subsystem-probe/v1` | no | always | every run |
| `ocn_guild_dogfood` | `buildanddo.ocn-guild-dogfood/v1` | yes | always | every action |
| `ocn_guild_forum` | `buildanddo.ocn-guild-forum/v1` | yes | always | every action |
| `ocn_room_probe` | `buildanddo.ocn-room-probe/v1` | yes | always | every action |
| `ocn_mission_lifecycle` | `buildanddo.ocn-mission-lifecycle/v1` | yes | always | every run |
| `ocn_mission_work` | `buildanddo.ocn-mission-work/v1` | yes | always | every run |
| `ocn_observation_record` | `buildanddo.ocn-observation-record/v1` | yes | always | every run |
| `ocn_signal_lifecycle` | `buildanddo.ocn-signal-lifecycle/v1` | yes | always | every run |

Scans (the sweep, the subsystem probe, rbac cells, the content assessment and the project race) send
one PostHog run event; their detail goes to Datadog logs. `python scripts/ci/ocn_telemetry.py probes`
prints this table from the code.

### Outcomes

The outcome always follows the probe's own rule; the publisher never re-judges a probe. The values are
`pass`, `degraded`, `fail`, `partial`, `void`, `unmeasured`, `observed` and `error`. On a VOID sweep or
walk the probe says that no row means what it says, so only the controls that voided it are judged; every
other check goes out unjudged and is never counted as failed.

| Probe | Rule |
|-------|------|
| feature sweep | PASS is pass; REPAIR_NEEDED is fail when `broken` is not empty, else degraded; PARTIAL is partial; VOID is void; UNMEASURED is unmeasured |
| journey report | CLEAN is pass; DEFECTS is fail when a leg is BROKEN or BLOCKED, else degraded; VOID is void; UNMEASURED is unmeasured |
| classroom fleet and live | PASS is pass, FAIL is fail; a `CONTROL` prefix marks a control |
| project fleet | PASS is pass, CONTRACT_BROKEN is fail, UNMEASURED is unmeasured; the probe's own `concurrent-enqueue` and `concurrent-claim` checks go out as kind `race`, with the race verdict as their state |
| seat session | pass when the login is LOGIN_OK, else fail. An identity refusal is sent nowhere (`IDENTITY_REFUSED`, COMMUNITY-WEB-001 R6) |
| rbac cell | observed; with `--expect allow` or `deny`, pass or fail; TRANSPORT_FAULT is unmeasured; LOGIN_FAILED is fail |
| box exercise | observed; the only expectations are its own `(... wanted)` and `(expects ...)` labels; a failed login is fail |
| content assessment, subsystem probe | observed; a control is reported and never gates the outcome |
| guild dogfood | observed; a crash is error |
| guild forum, room probe | pass only on HTTP 200 or 201. The state is ACCEPTED, REFUSED (4xx), SERVER_ERROR (5xx), or TRANSPORT_FAULT when no answer came back (both probes record that as HTTP 0) |
| mission lifecycle | pass only when the mission reached verified |
| mission work | pass only when something was created |
| observation record | pass only when the chain is intact |
| signal lifecycle | pass only when no step failed |

An unknown state is published as `other`, and a receipt of an unknown shape is refused
(`UNKNOWN_SCHEMA`).

### Who the actor is

`distinct_id` takes one of ten values: `ocn:<persona>` for the eight guildmasters (oracle, alex,
sterling, muse, scholar, forge, quill, director-nexus), `ocn:multiple` for a run across several machines
or personas, or `ocn:unplaced` for a box with no guildmaster. A box id is mapped to its guildmaster
through the private fleet map, taken from `--fleet-map`, then `CITADEL_FLEET_MAP`, then the orchestrators'
own estate default. The box id never leaves the process and never reaches the ledger. A box the map does
not know is unresolved: PostHog is skipped (`IDENTITY_UNRESOLVED`) and Datadog records `unplaced`.

Check labels are templated: an email becomes `:email`, a machine name `:box`, a persona `:persona`, an
address `:addr`, and a record id, UUID or long digit run `:id`. Only then is the label slugged, to 64
characters at most, so "`<gm>` joins from `<box>`" becomes `persona-joins-from-box`. Paths lose their query
and fragment, the workspace segment becomes `:workspace`, and the segment after `records` becomes `:id`
whatever its shape (about one PocketBase id in 130 has no digit).

## PostHog

Project **597897**, captured with the key named `BUILDANDDO_PH` only. It must be a `phc_` key.
`POSTHOG_API_KEY`, `POSTHOG_HOST` and `POSTHOG_PROJECT_ID` never decide where capture goes: they name the
Citadel-nexus project. One `POST https://us.i.posthog.com/batch/` per receipt, plus one control request.

**On every event:** `is_ocn_agent: true`, `$lib: bnd-ocn-telemetry`, `$lib_version: 1`,
`$process_person_profile: false`, `$geoip_disable: true`, `ocn_contract`, `ocn_run_id`, `ocn_probe`,
`ocn_env` and `ocn_persona`. After both gates, `$ip` is set to the unspecified address. PostHog uses the
request's own address only when no `$ip` is sent, so the address of the machine that published is not
kept (operator decision, 2026-09-24). `verify` reads this back.

| Event | When | Properties besides the common ones |
|-------|------|-------------------------------------|
| `ocn_probe_run` | one per receipt | `ocn_receipt_sha256` (16 hex), `ocn_publisher_digest`, `ocn_probe_digest`, `ocn_receipt_schema`, `ocn_mode` (read or write), `ocn_actor`, `ocn_guild`, `ocn_personas`, `ocn_outcome`, `ocn_state`, `ocn_reason_code`, `ocn_controls_held`, `ocn_checks_total`, `ocn_checks_failed`, `ocn_checks_controls`, `ocn_checks_truncated`, and per-probe numbers and bounded names: the sweep's broken, degraded and record-missing features, the journey's defect legs, the seat's seven `perc_*` scores, the dogfood inventory's eight collection counts, the content grades, the race verdicts. Only those named scores and collections become property names; any other key a receipt carries is dropped |
| `ocn_probe_check` | one per check, for the probes marked above, 60 at most with controls always kept | `ocn_check`, `ocn_check_kind`, `ocn_check_index`, `ocn_http`, `ocn_check_state` (`HTTP_<n>` becomes `http_other`), `ocn_as_expected`, `ocn_is_control`, `ocn_method`, `ocn_path_template`, `ocn_latency_ms`, `ocn_prerendered_chars` |
| `ocn_telemetry_control` | one per publish, in its own request, under a key no project can hold | `ocn_control: invalid_key`, distinct_id `ocn:control`. PostHog answers 200 and must never store it |

`ocn_reason_code` is one of `NO_SSH_KEY`, `SSH_TIMEOUT`, `NOT_IN_FLEET_MAP`, `SIGN_FAILED`,
`LOGIN_FAILED`, `CONTROLS_FAILED` or `OTHER`. The reason prose itself is never sent.

**Never sent:** `$pageview`, `$identify`, `$set`, `$session_id`, `$current_url`; box or seat ids,
addresses, uids, emails; workspace, mission, room, run or job ids; `request_key`; response text, reason
prose and third-party URLs.

## Datadog

Site **us5** only; a `DD_SITE` that does not normalise to `us5.datadoghq.com` is refused. `DD_API_KEY`
is used on the release workstation only. Only the intake APIs are used: no agent, no DogStatsD, and no
monitor, dashboard, facet, index or pipeline change. No signal carries a host.

| Tag | Values | On |
|-----|--------|----|
| `service` | `buildanddo-ocn` | every signal |
| `env` | `staging`, `production`: the environment probed | every signal |
| `team` | `citadel-nexus` | every signal |
| `ocn_probe` | the 17 registry names | every signal |
| `ocn_outcome` | the 8 outcomes | events and logs |
| `ocn_persona` | the 8 personas, `multiple`, `unplaced` | events and logs |
| `ocn_run` | the run id (a UUID) | events and logs only |
| `ocn_feature` | the sweep's 38 features | the opt-in alive gauge only |

- **Event:** one per judged receipt less than 17 hours old, to `/api/v1/events`. The title reads
  `OCN <probe> on <env>: <OUTCOME>`. The text gives the counts, whether the controls held, the failing
  check ids, the run id and both digests. `alert_type` is success for pass, error for fail and error,
  info for observed, and warning otherwise. `source_type_name` is `buildanddo`, and `aggregation_key`
  is `ocn-<probe>-<env>`. An rbac cell sends logs only unless it was judged with `--expect`.
- **Logs:** a run summary and one log per check (60 at most), for receipts less than 17 hours old, to the
  us5 HTTP intake. `ddsource` and `service` are `buildanddo-ocn`. The status is `info` when a result was
  as expected, `warn` when it was not and on the summary of a fail or void run, and `error` for a failed
  control. The message reads `ocn <probe> <env> <check> <state> http=<n> expected=<bool> run=<id>`,
  and the attributes sit under `ocn.*`.
- **Metrics, opt-in only** (`--dd-metrics` or `BUILDANDDO_OCN_TELEMETRY_DD_METRICS=1`; the operator's
  decision is to leave this off): gauges only, for receipts less than 55 minutes old and at most 9
  minutes ahead. A re-send overwrites the point.

  | Metric | Value | Series at most |
  |--------|-------|---:|
  | `buildanddo.ocn.run.measured` | 1, 0.5 (partial) or 0 (void, unmeasured, error) | 34 |
  | `buildanddo.ocn.run.outcome` | pass 1, degraded 0.5, fail 0; not sent for other outcomes | 34 |
  | `buildanddo.ocn.run.checks_failed` | count; sent only beside the outcome gauge, so never for a void run | 34 |
  | `buildanddo.ocn.feature.alive` | 1 or 0 per sweep feature, only when the controls held; never for a control or an UNMEASURABLE row | 76 |

  The ceiling is 2 environments × 17 probes × 3 run gauges, plus 2 × 38 features: **178 series**. The tag
  gate refuses a catalogue above it. A metric never carries a persona, box, run id, git sha or HTTP code.

No monitor is created: the probes run by hand, so a metric monitor would sit in No Data.

## Gates

Both gates run over every outbound body before any key or the `$ip` marker is attached. Either failure
withholds the whole receipt.
- **Tag gate:** every Datadog tag key inside its set, every value inside its enum, `ocn_run` a UUID and
  on events and logs only, `ocn_feature` on the alive gauge only, no host, and the 178-series ceiling.
- **Leak gate:** the serialized bodies checked by `public_redaction.Rule` with the private fleet map, with
  no allowance for loopback, and for anything shaped like an email address. The report gives counts
  (addresses, machine names, emails) and the field names, never a value.
  `send` refuses without a readable fleet map (`NO_FLEET_MAP`); `dry-run` falls back to the families and
  says so. `public_redaction.py`, like every module the publisher uses, is loaded from the publisher's own
  folder and nowhere else, so a `scripts` package elsewhere on the import path can never stand in for it.

## States

- **UNSENT**, with a reason:

  | Reason | Meaning |
  |--------|---------|
  | `DISABLED` | the switch is off |
  | `DRY_RUN` | a dry run |
  | `CI_GUARD` | `CI` or `GITLAB_CI` is set and `BUILDANDDO_OCN_TELEMETRY_ALLOW_CI=1` is not |
  | `NO_FLEET_MAP`, `LEAK_GATE`, `TAG_GATE` | a gate withheld the receipt |
  | `NO_KEY:<name>`, `KEY_SHAPE`, `SITE_NOT_ALLOWED` | a credential is missing or wrong |
  | `WINDOW` | the receipt is too old for a Datadog signal |
  | `LEDGER_DUPLICATE` | every selected body of this run was already accepted; `--force` re-sends the PostHog pair |
  | `UNKNOWN_SCHEMA`, `NO_RECEIPT`, `NOT_PUBLISHABLE` | nothing publishable was found |
  | `NO_ENV` | a receipt that does not record its environment was published without `--env` |
  | `POSTHOG_PRECONDITION` | `BUILDANDDO_OCN_TELEMETRY_POSTHOG=1` is not set, so nothing goes to PostHog |
  | `IDENTITY_REFUSED`, `IDENTITY_UNRESOLVED` | a seat refusal, or a box the map does not know (PostHog only) |
  | `TRANSPORT:<status>` | the vendor answered and refused: never delivered |
  | `TRANSPORT:<class>`, `TRANSPORT:BUDGET`, `TRANSPORT:INTERRUPTED` | no status came back: the request failed, overran its share of the budget, or was cut off by an interrupt. It may have been delivered |
  | `BUDGET`, `INTERRUPTED` | the request never started: the budget was spent, or an interrupt came first |
  | `PUBLISHER_ERROR:<class>` | the publisher failed; this never raises into the probe |

- **SENT:** the vendor accepted the request (PostHog 200, Datadog 2xx). This is not proof of storage.
- **VERIFIED:** written only by `verify`.

The overall state is VERIFIED only when every sink that was sent is VERIFIED, SENT when any sink is SENT,
and otherwise UNSENT. `degraded: true` marks a partly sent receipt: a selected sink sent nothing, or a
Datadog part failed while another was accepted.

All requests share one budget of 10 seconds (`BUILDANDDO_OCN_TELEMETRY_BUDGET_S`), at most 3 seconds
each, and both are wall-clock limits: each request runs in a thread that is abandoned when its share runs
out, so neither a slow name lookup nor a host whose every address drops packets can hold the probe's exit
code. They go in a fixed order: the PostHog batch, the PostHog control, the Datadog event, the logs, then
the series. There is one attempt, no retry, and no redirect.

## Receipts and the ledger

The probes' own receipts are unchanged. The telemetry state lives under a new key, `ocn_telemetry`,
because seat receipts already carry a `telemetry` key that the estate aggregate reads. The block holds:
- `contract`, `run_id`, `receipt_sha256`, `state`, `degraded` and `reason`;
- `posthog`: state, project, events, http, the control's http, and the note `200 = accepted, not stored`;
- `datadog`: state, site, and the event, logs and series parts;
- `gates`;
- `credentials`: `{NAME: store | environment | absent}`, never a value;
- the ledger path.

`receipt_sha256` covers the receipt without this block, so `run_id` (a uuid5 of it) and every PostHog
event uuid stay the same however often the receipt is published.

The ledger lives at `state/ocn_telemetry/runs/<run_id>.json`, gitignored through `/state/`. It holds
states, counts, body digests, the expected readback counts, both digests, credential provenance and the
verification. It never holds a payload value, a key, a box id or an address.

## Verify runbook

`verify` reads published runs back. It is itself an A3 action: C4 posts under an invalid key. It refuses
under CI (`CI_GUARD`).

```
python scripts/ci/ocn_telemetry.py verify --pending
python scripts/ci/ocn_telemetry.py verify --receipt state/ocn_feature_sweep/staging.latest.json --update-receipt
python scripts/ci/ocn_telemetry.py verify --tags
```

- `--pending` checks every sent run the ledger has not verified, with no ids to type. That includes a
  request that got no status back (it timed out, overran the budget or was interrupted), which stays
  UNSENT until a readback finds it. A request the vendor refused with a status was never delivered, and
  is not read back.
- `--run ID` checks one run.
- `--receipt PATH` checks the run a receipt was published as. With `--update-receipt`, the verified
  block is written back into a persisted `state/<probe>/<env>.latest.json`, and the run id is unchanged.
- `--tags` reads back the opt-in metrics' tag keys. The keys must be a subset of `service`, `team`,
  `env`, `ocn_probe` and `ocn_feature`, and the values must stay inside their enums. It reports keys and
  counts, never values.
- `--wait` polls every 10 seconds, up to 120 by default. Ingestion was measured at about 20 seconds.

Readback keys, by name: `POSTHOG_PERSONAL_API_KEY` (else `BAD_PERSONAL_PH_KEY`; a `phc_` value is
refused), `DD_API_KEY` and `DD_APP_KEY`. `POSTHOG_PROJECT_ID` is read only as the project that must NOT
hold the run.

**PostHog:** HogQL on 597897 with `refresh: blocking`. The run id is passed as a value, never spliced
into the query. The query counts distinct uuids per event for the run within an hour either side of the
receipt time. The expected counts are `ocn_probe_run` 1, `ocn_probe_check` N and `ocn_telemetry_control` 0.

**Datadog:** events search for `ocn_run:<id>` (1 for a judged run), logs search for
`service:buildanddo-ocn ocn_run:<id>` (N + 1), and `max:buildanddo.ocn.run.measured{env,ocn_probe}` when
metrics were sent.

**Controls.** Each one changes only the thing it measures, and a failed control makes the run `VOID`:

| Control | Holds when |
|---------|------------|
| C1 | the invalid-key twin is absent. The key is its only difference, and it got a 200 |
| C2 | a fresh, never-sent run id returns 0 PostHog rows, so the filter discriminates |
| C3 | the project named by `POSTHOG_PROJECT_ID` returns 0 rows for the run. `NOT_CHECKED` when that key cannot read it |
| C4 | the run's summary log, re-posted with an invalid 32-hex key, gets a 403. Any 2xx voids the run |
| C5 | a never-sent run id returns 0 Datadog events and 0 logs |

**Privacy readbacks:** a count of the run's events that keep any address other than the unspecified one
(`IP_STORED` if any); events anywhere in the project still carrying `ocn_seat` or `ocn_box_ip` since the
first send, which this publisher never builds, so any found come from box-side capture still live; and
`is_ocn_agent` persons created since the first send. None of these should be found. If PostHog does not
honour the `$ip` marker, the fallback is the project-wide "Discard client IP data" setting, which is the
operator's decision.

**Results:** `VERIFIED`, `NOT_FOUND` (with `LOGS_NOT_FOUND` when the event arrived without its logs, which
never counts as verified), `VOID`, `UNMEASURED` (no read key, a 401 or a 403), or `NOT_CHECKED` (nothing
was sent). There is never a PASS.

## Operator preconditions

Before the first send:
1. **The public activity figure excludes agents.** The estate's `tools/citadel_activity_projection.py`
   (`sink_posthog`) counts every event in 597897 into the public `activity-status.json`. It must exclude
   `is_ocn_agent` events, or `$lib` starting `bnd-ocn`. That change is in the estate, outside this
   repository. The public number will drop by the share agents make up today; that drop is expected.
2. **The project's test-account filter excludes `is_ocn_agent`.** This is a PostHog setting only the
   operator changes.

   The publisher enforces these two: until the operator sets `BUILDANDDO_OCN_TELEMETRY_POSTHOG=1` on the
   release workstation, recording that both have landed, a send posts nothing to PostHog
   (`POSTHOG_PRECONDITION`) whatever `--sinks` says, and only Datadog is sent.
3. **Datadog Plan & Usage is checked before `--dd-metrics` is ever turned on.** The operator's decision is
   events and logs only for now.
4. **The legacy OCN data stays** until the new stream is VERIFIED: six persons named after boxes, and
   events that carry `ocn_seat` and a box egress address. Deleting them cannot be undone, and the call is
   the operator's. They can be filtered out by `$lib = bnd-ocn-seat`.

The estate drivers change in a separate A3 dispatch:
- `citadel_ocn_perception.collect` stops passing `--ph-key`, publishes each seat record over subprocess
  stdin with `publish --probe ocn_seat_session --receipt - --tee`, and its aggregate reads
  `ocn_telemetry.state`;
- `citadel_ocn_review_round` publishes the observation records;
- the drivers call the publisher from a clean checkout of main, not the shared checkout.

## Retired box-side capture

`ocn_seat_session.py` used to post 14 events per session from its box, with the key passed on the command
line. `--ph-key` and `--no-capture` are still accepted, so old command lines keep working, and they do
nothing.

| Before (from the box) | Now (from the release workstation) |
|-----------------------|-------------------------------------|
| `$identify` with a person named after the box | nothing: events are personless |
| `ocn_session_start`, `ocn_session_end` | `ocn_probe_run` |
| `$pageview` per route, with `$current_url` | `ocn_probe_check`, kind `route`, with a path template |
| `ocn_collection_read` | `ocn_probe_check`, kind `collection` |
| (the data documents sent nothing) | `ocn_probe_check`, kind `data` |
| `ocn_perception` with `perc_*` | `perc_*` on `ocn_probe_run` |
| `$lib bnd-ocn-seat`, `ocn_seat`, `ocn_box_ip`, `$session_id` | `$lib bnd-ocn-telemetry`; no seat, no address, no session |
| distinct_id `ocn:<seat>` | distinct_id `ocn:<persona>` |

Saved insights keyed on the old event names must move to `is_ocn_agent` and `ocn_run_id`.

## Volume and cost

- **PostHog:** a seat session sends 15 events (a run and 14 checks), a journey 17, and each scan 1. A full
  manual round is about 190 events, about 5,700 a month at one round a day. People send about 2,400 a
  month, which is why filtering on `is_ocn_agent` is mandatory.
- **Datadog:** about 17 events and 285 logs per full round, well under $0.05 a month in logs at list
  price. There are no custom metrics while `--dd-metrics` stays off.

## Checks

- `python scripts/ci/ocn_telemetry.py selftest`: offline, sockets refused, with a planted machine name,
  documentation address and email built at run time. It is registered as `CHECKS['ocn_telemetry']` at level
  `source`.
- `python -m unittest tests.upgrade.test_ocn_telemetry tests.upgrade.test_ocn_seat_session`: fakes only,
  with the environment cleared and every socket blocked.
