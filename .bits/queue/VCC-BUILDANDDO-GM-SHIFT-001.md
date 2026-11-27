# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-GM-SHIFT-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-GM-SHIFT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-GM-SHIFT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-11-21
# Depends:     .bits/srs/SRS-BUILDANDDO-GM-SHIFT-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-GM-SHIFT-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-GM-SHIFT-001.md
# DAG Node:    none
# Intent:      Track the integration of BuildAndDo guildmaster units into Citadel's existing mission loop.
# ─────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-GM-SHIFT-001

**SRS:** SRS-BUILDANDDO-GM-SHIFT-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

The guildmasters do one graded BuildAndDo unit each weekday through Citadel's
existing mission loop, reviewed by a peer guild, observed where Citadel already looks,
and stopped by the existing kill switch. This repository records the integration; it
carries no grader or runtime of its own.

## Authority

- Owner decisions, 2026-11-21 (planning session): work scope, gate, cadence, and
  "use the system Citadel Nexus already has".
- Owner dispatch VCC-BUILDANDDO-GM-SHIFT-OPS-001, 2026-11-21: Datadog disarmed build
  plus one supervised smoke run. Arming the weekday dispatcher is a separate owner act.
- Owner instruction, 2026-11-22: if PostHog is lost, CNWB must keep the same Scout skill and
  process, powered by one guildmaster box, correlating the CNI guildmaster service with
  BuildAndDo (task I).

## Tasks

| Phase | Task | Gate | Status |
|---|---|---|---|
| A | Back up the 8 run-as workflows and 16 guildmaster agents before any change | Backup manifest with sha256 per file | done — 25 files, outside the repository |
| B | Control record (`armed: false`), KILL workflow (disarm only), Bits credit tripwire | KILL test run succeeds; control record reads back `armed: false` | done |
| C | Run-as workflows: API trigger 30 to 4 a day, `tool_calls` output; agent call unchanged | All 8 published, run-as identity unchanged | done |
| D | Mission workflow: `kind=qa`, Dev through its own run-as workflow, rota peer reviewer through its run-as workflow, read-only prompts, strict verdicts | Spec validates; self-review refused; draft decision-path tests | done — published, then hardened after the review below |
| E | One supervised QA unit, end to end | Instance succeeds with a parsable verdict naming both guilds | done — Alex (Commerce) authored, Quill (Writers, rota week 2) re-ran the queries and returned PASS |
| F | Weekday dispatcher, unpublished, gated on `control:global` (armed and unexpired) | Spec validates; does nothing while disarmed; loop tested without agents | done — "BuildAndDo · guild weekday units" (weekdays 13:23 UTC), unpublished |
| G | Report verdicts to the `guildmaster-behaviour` PostHog Scout | `guildmaster_operation` events with `project=buildanddo`, read back from PostHog | done — display copy after each record; Scout skill v3 checks it |
| H | Arm | Owner instruction in their own words; the arming checklist below | owner |
| I | PostHog-independent Scout: the same skill on one guildmaster box over the CNWB ledger, judging CNI guildmaster behaviour and BuildAndDo units per guild | Bundle tests pass on disposable PostgreSQL 16; the parity gate passes; every HogQL query runs in PostHog; two adversarial reviews disposed | prepared — the code belongs to CNWB (SRS-CN-GM-SCOUT-001, proposed); GitLab writes to CNWB were refused and CNWB is frozen; landing steps below |

## Evidence, 2026-11-21

- **E.** The supervised unit ran the published Commerce run-as workflow as `gm-commerce`.
  - Alex reported 5 findings, each with evidence ids, and marked the rest UNMEASURED.
  - The top finding: no Synthetics test covers `/signup`. The others are a single-session long-task burst on `/signup`, stale lazy-chunk 404s after a deploy, baseline-regression warnings in the logs, and Error Tracking issues that belong to other services.
  - Quill re-ran the material queries as `gm-writers` and answered PASS. One count Quill flagged was a hedged minor overcount (3 against 2).
  - The workflow output names both guilds, both guildmasters and both conversations.
- **F.** The dispatcher reads `control:global` first and rechecks it before every unit, so KILL stops the remaining units mid-run.
  - It also reads `control:pauses` (guilds and kinds) and caps the day at `budget:limits.author_per_day`.
  - It records each unit's verdict in the GM Shift records datastore, keyed by dispatcher instance and guild.
  - Every unit stays read-only, and the mission workflow refuses self-review.
- **G.** The PostHog project ingest token lives in the control datastore as
  `config:posthog`; no workflow spec carries it. After each unit's record, the
  dispatcher posts one `guildmaster_operation` event to PostHog:
  - `op=mission_graded`, `project=buildanddo`, `$lib=dd-gm-shift`;
  - distinct id `gm-<seat>`;
  - event uuid = the mission instance.

  A loop test replayed the real smoke unit, and PostHog accepted it. A read-back query
  found exactly one `mission_graded` event, labelled `verdict_source=legacy_smoke`. The
  `guildmaster-behaviour` Scout is at v3, which adds a BuildAndDo units check (missing
  units, verdict streaks, ERROR and HALTED, rota integrity).

## Adversarial review, 2026-11-22

Before arming, three independent reviewers read the live specs, the action contracts,
the smoke-run data and the repository rota: one for runtime correctness, one for safety
and one for grading validity. A skeptic then tried to refute each finding. 29 findings
survived and 4 were refuted.

| Findings | Disposition |
|---|---|
| A failed author or reviewer run counted as BLOCK; a failed author still triggered a review (F1, GRADE-3, GRADE-6) | Fixed: verdicts are PASS, BLOCK, ERROR or HALTED with `verdict_source`; the review is skipped after an author error |
| Pausing a guild did not stop it reviewing (F2) | Fixed: the plan skips any unit whose reviewer is paused |
| Greedy verdict regex; PASS without proof of re-checking; author text spliced into the reviewer prompt (GRADE-2, GRADE-4, SEC-4) | Fixed: one whole JSON object only; qa PASS needs structured checks that all reproduced; author text sits inside per-run markers with verdict objects neutralised |
| Reviewer override could bypass the rota (GRADE-5); no rota parity record (ROTA-2) | Fixed: qa refuses any reviewer but the rota peer; week and rota reviewer are recorded; 480 of 480 pairs match `libs/guildmasters/rota.py` |
| Same-model reviewer is not independent under `apps/integrity` (GRADE-1) | Labelled `review_kind=same_model_peer` everywhere; never presented as independent |
| Kill switch could not stop a unit in flight (F6, SEC-2 in part) | Mitigated: the mission rechecks control before the review and returns HALTED; cancelling in-flight runs from KILL is not available |
| Arming had no expiry and no single owner path (SEC-3 in part) | Fixed in part: an arm needs a future `armed_until`; the UI-only "GM Shift · ARM" workflow is the only arming path built (1 to 14 days) |
| Timeout headroom, record failures, counters, repeat full runs, cap fairness (F4, F5, F7, F9, ROTA-1) | Fixed: 7500 s wait; record retries with a fallback; completed and halted counters; one full run per UTC day; the cap rotates |
| PostHog step design (G1, G2, G3, SEC-6, SEC-7, G-1, G-2) | Fixed: emitted from the dispatcher after the record, guarded by a no-op fallback, with a deterministic uuid; accepted by read-back |
| The metric was described as sent but never was (GRADE-7) | SRS corrected |
| The records datastore claimed a digest chain it does not have (SEC-5 in part) | Description corrected |
| Agents hold the full write-capable Datadog MCP, `gm-*` accounts hold the Standard role, and the QA brief reads public text (SEC-1, high) | Owner decision, arming blocker; see the checklist |
| Restriction policies on the control and records datastores, workflows and budget monitor (SEC-2, SEC-3, SEC-5) | Owner: not reachable through the APIs this session has |
| Publishing the dispatcher is a separate step (F3) | Owner step in the checklist |

## Test evidence, 2026-11-22

- **Mission draft, overrides only, no agents.** All four ran on the draft, which was
  then published:
  - an author error gives ERROR and skips the review;
  - a structured PASS with reproduced checks gives PASS;
  - a gated unit while disarmed gives HALTED and skips the review;
  - a non-rota reviewer override is refused.
- **Dispatcher, real, disarmed.** It stops at the arm check: "control:global is not
  armed".
- **Dispatcher loop.** Datadog cannot override steps inside a loop body, so a test copy
  was used: it reads a separate `control:test` key and calls a stub mission that
  returns instantly.
  - One commerce unit wrote its record and PostHog event (above).
  - **Full run:** eight units planned and eight completed. The eight reviewer pairs all
    differ and match the week-2 rota. A missing PostHog configuration fell back without
    failing a unit.
  - **Second full run the same UTC day:** refused at the day lock (409) before any unit.
  - **Armed at the start but disarmed at the per-unit recheck:** halted with zero units
    and no mission run.

## CNWB fallback Scout, 2026-11-22 (task I)

The bundle is kept outside this repository: it is CNWB code under CNWB's own SRS. It was handed
to the owner as an archive (sha256 `867139092532d451797df4654518e25964bca180d47cb43a5e5148de5a73046a`).
Only the correlation is recorded here.

- **One skill, two runners.** `SKILL.md` (v5) is one body. The PostHog Scout runs it with a HogQL
  pack; a guildmaster box runs it with a SQL pack over the CNWB ledger. Every window and list in
  the HogQL pack is filled from the same `checks.json`. A CI gate fails when:
  - the packs cover different checks;
  - a window is hard-coded;
  - a value falls outside the SQL pack's bounds;
  - the HogQL rota expression, evaluated as written, disagrees with the 60 golden weeks.
- **Correlation keys.** `guild` (or `seat`) only. A BuildAndDo unit is keyed by `unit_id` if
  sent, else `op_id` (the mission instance), so a resent unit counts once and a later grade
  replaces the earlier one. Its rota peer comes from the formula for the dispatcher's `week`,
  never from the stamped `rota_reviewer`.
- **Runner.** Stdlib Python on one box: a systemd timer at 06:20 and 18:20 UTC, as a dynamic
  user. Thresholds are applied in code from `checks.json`, never by a model. Reads and reports go
  through an n8n webhook with its own secret, and the box holds no database key. A malformed
  response is a failed run, never a quiet one. Exit codes 2, 3 and 4 mark a failed run, and an
  n8n watchdog alerts when no run lands for 13 hours.
- **Ledger writes.** Two SECURITY DEFINER functions, one per writer role:
  - guildmaster events keep an allow-list of metadata keys, so message text cannot be stored;
  - Scout rows can be written only by the Scout's report path.

  EXECUTE is revoked from PUBLIC and from Supabase's API roles.
- **What it cannot see yet.** BuildAndDo units reach the ledger only once the dispatcher can
  post to gm-ops, which needs a Datadog HTTP connection (owner). Until then CNWB reports them
  as `not_running`, and PostHog stays the only view of units.

Evidence:
- Four adversarial review rounds, each verified by a skeptic:
  - round 1 confirmed 46 findings plus 9 from a completeness critic, and refuted 16;
  - round 2 found 12 partly fixed and 14 new;
  - round 3 found 12 partly fixed and 6 new;
  - round 4 found 6.

  Every confirmed item was fixed with a test.
- 86 tests run against disposable PostgreSQL 16 clusters, whose server timezone is
  deliberately not UTC. `REQUIRE_PG=1` makes CI fail rather than skip without PostgreSQL.
  Mutation checks show the tests fail when any of these guards is broken:
  - the rota modulus, the week stamp and the HogQL rota arrays;
  - the 15:00 UTC rule;
  - the warm, gap and observed-silence rules;
  - the excluded operations and the rollup rate;
  - the self-review and empty-reviewer rules;
  - the allow-list, the event-type split and the revokes;
  - the regrade key and the required grading time;
  - the report acknowledgement and refused redirects;
  - response validation, including NUMERIC values delivered as text by n8n's Postgres node.
- The SQL rota function matches all 480 golden pairs.
- All seven HogQL queries were run read-only in PostHog project 269641 and returned rows.

Owner landing steps (CNWB):
1. Register SRS-CN-GM-SCOUT-001 and a dispatch in CNWB.
2. Land the bundle on a CNWB branch.
3. Apply the three migrations as the ledger's owner (the index one outside a transaction),
   then create the reader and the two writer roles.
4. Make the n8n edits:
   - a gm-ops ledger branch beside PostHog;
   - the gm-ai rewiring;
   - the gm-scout webhook with its own secret;
   - the watchdog.
5. Install the unit on one guildmaster box (the recommendation is recorded internally). Run
   `--selftest` and `--dry-run`, then enable the timer.
6. Publish the rendered skill v5 to the PostHog Scout, which is still v3, and record its hash.
7. Optional: create the Datadog HTTP connection, with the grading time on every unit, so units
   reach the ledger.

## Arming checklist (owner)

1. Decide SEC-1. The proposal:
   - re-add the Datadog MCP to the 16 guildmaster agents with an explicit read-only
     tool list;
   - give them the GitLab reader as a pinned action tool instead of
     `execute_datadog_workflow`;
   - move the eight `gm-*` service accounts to a custom role cloned from Read Only,
     without `workflows_run`.
2. Add restriction policies: owner-only editor on the control and records datastores,
   the dispatcher, mission, run-as, ARM and KILL workflows, and the budget monitor.
3. Publish "BuildAndDo · guild weekday units".
4. Run "GM Shift · ARM" from the Datadog UI with a number of days and a reason.
5. Watch the first 13:23 UTC run: one record and one PostHog event per unit, and the
   Scout's next report.

Test-only workflows that are still unpublished and can be deleted, which needs owner
confirmation:
- "GM Shift · stub mission (test only)";
- "BuildAndDo · guild weekday units (TEST COPY)";
- "GM Shift · test cleanup (one-shot)".

The test records and the `control:test` item are already deleted.

## Constraints

Read-only units only in phase 1. No secrets, model ids, personal email addresses or
server IP addresses in the repository. Guildmaster PRs (phase 2) never use
`bits/SRS-*` branches and always carry `hold`. Production deploys stay A3.
