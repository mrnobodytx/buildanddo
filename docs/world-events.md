# --- CGRF Header ------------------------------------------------
# File:        docs/world-events.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/events.py, apps/world_twin/episode.py, apps/world_twin/projection.py, apps/world_twin/capture.py, apps/pocketbase/pb_hooks/workspace-replay.js
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/world_twin/events.py; CONSUMES apps/world_twin/episode.py; CONSUMES apps/world_twin/projection.py; CONSUMES apps/world_twin/capture.py; CONSUMES apps/pocketbase/pb_hooks/workspace-replay.js
# Intent:      Describe the connected world-event, replay and semantic projection boundary without inventing provider transport or verification authority.
# ----------------------------------------------------------------

# World Events and Correlated Replay

The existing complete mission export now feeds the existing world-twin package:

```text
Native mission -> authorized complete capture -> world-event/v1
                                                    |
                                       scoped episode / replay
                                                    |
                                      semantic-twin.graph/v2
                                                    |
                           user / agent / guild / project / community
```

Citadel owns identity, canonical state, raw evidence and independent review.
BuildAndDo compiles a selected capture. No new database, vendor collector, public
page, model runtime, event bus or operational authority is created here.

## One Envelope

`apps.world_twin.events.WorldEvent` is an immutable strict contract. Inspect the
complete wire schema with `python -m apps.world_twin schema`.

| Field | Meaning |
|---|---|
| `schema_version` | Exactly `buildanddo.world-event/v1`; required on the wire. |
| `event_id` | Content address covering the observation and all world metadata. |
| `tenant_id` | Must equal `observation.scope_id`; supplied from receiving scope. |
| `observation` | Existing `libs.evolution.event.CitadelEvent`, with its ID unchanged. |
| `observation.actor_id`, `actor_kind` | Canonical attribution; a requester is not inferred to be an executor. |
| `observation.mission_id`, `observation.correlation_id` | Explicit join boundaries, not guesses from timestamps. |
| `observation.subject_id`, `subject_version` | Exact source subject/revision. |
| `observation.source_digest`, `source_ref` | Retained source-byte identity and its opaque reference. |
| `observation.occurred_at`, `observed_at`, `ingested_at` | Aware UTC-normalized times; occurrence precedes observation and ingestion. |
| `context_id`, `guild_id`, `project_id`, `guildmaster_id` | Explicit context, with absent associations left null. |
| `release_sha` | Full captured release revision, or null. Not inferred from the compiler checkout. |
| `outcome` | Recorded `NONE`, `SUCCESS`, `FAILURE` or `UNCERTAIN`, not a verifier decision. |
| `traces` | Bounded opaque references with layer, provider, optional trace/span and content digest. |
| `capabilities`, `participants` | Attributed claims and related identities; not self-issued proof. |
| `visibility` | Private by default; never sufficient alone to publish. |

Trace layers are human, browser, application, edge, infrastructure, compute,
decision, verification and result. Provider names can describe PostHog, Datadog,
Cloudflare, Ray, security or other captures without introducing provider SDKs.
Trace handles cannot contain credentials, query strings or fragments. No trace
URL is fetched or constructed, and no replay transcript is copied into a link.

The wrapper accepts the existing dotted Citadel event vocabulary, such as
`telemetry.snapshot`, as well as uppercase world event names. It does not rename
core events or change the semantic v2 schema. Hashes use the existing semantic
serialization profile, not a claim of RFC 8785 compatibility or authentication.

Ingestion retries retain identity. Source-record identity includes the subject
and occurrence, so distinct records in the same captured document do not collide.
Conflicting content for one record revision is refused rather than last-write-wins.

## Episodes and Projections

`WorldEpisode` partitions on tenant, mission, correlation and release. Its
lineages reuse `libs.evolution.episode.Episode` separately per authority tier.
Explicit attempt links must satisfy the existing predecessor, revision and time
checks. Adjacent timestamps and matching third-party trace IDs create no links.

An episode retains failed attempts and returns a timeline, opaque references,
missing layers and incomplete lineage. Its `causal_state` is `TEMPORAL_ONLY` and
`executed` is false: this is a flight record, not execution or causal inference.
Missing release IDs remain missing and are not joined to a later known release.

`compile_projection(events, scope, reviews=(), review_policy=None)` produces an
existing `semantic-twin.graph/v2` plus visible replay and per-event measures.
`ProjectionScope` is **receiving context, not a client authorization token**:

- The receiver sets tenant, subject, view and `as_of` cutoff.
- It explicitly supplies `allowed_event_ids` after native/CSEG authorization.
- User and agent views select attributed actor events; guild and project views
  use explicit associations; the community view uses the authorized tenant slice.
- Full captured attempt lineage is validated before narrowing to a view. A view
  with a hidden predecessor stays partial without exposing that predecessor's ID.
- Non-private views additionally require explicit sharing, confirmed adult status,
  matching event visibility and the receiver's `shared_entity_ids`. Unknown age
  or missing consent withholds the projection. Opaque traces and reviewer IDs do
  not appear in those views. Fine-grained policy remains with the receiving owner.
- The graph builder resolves existing canonical identities and revisions. Reviewed
  assertions get a distinct source revision and a time no earlier than the review,
  so historical context queries cannot read future verification as an old fact.

Counts measure selected observations, not mission success, competence, followers,
trust or authority. Capability evidence requires a reviewed result and explicit
capability checks. Even then it reads `REVIEWED_EVIDENCE`, with `promoted: false`.
The canonical graph remains A0/OBSERVED; no XP, TP or USO is settled.

## Independent Review Boundary

An embedded event receipt is only a reported receipt. The compiler uses the
existing `libs.capability_tokens.verification.ReviewPolicy` supplied separately
by the receiver. Its content pins must be authenticated outside this compiler.

Each admitted receipt must name `WorldEvent.review_subject`, the exact producer,
current policy, permitted A0 assertion and an independent reviewer. The reviewer
cannot be the actor, an involved participant or the guildmaster attributed to
that event. Evidence must cover the exact underlying Citadel event. Required
checks are `world.provenance`, `world.outcome` and `world.attribution`, plus
`world.capability` when a capability is asserted. Stale/future, altered, unpinned
and wrong-subject reviews do not count. Disagreeing admitted results stay
`CONTESTED`; an observed provider success cannot outweigh them.

Local hashes, chosen reviewer names and local review-policy JSON do not establish
real-world identity or independent execution. A runtime must authenticate them
and resolve the actual evidence before pinning them. This compiler does not
implement Kestrel, Nemesis or any cryptographic signing owner.

## Existing Mission Capture

The native no-store mission-replay route retains its membership, linked-record
read rules and read transaction. It additionally exports `content_canonical`
and a `canonical` string per leaf, preserving the exact JavaScript JSON bytes
that were hashed. Existing browser validation accepts older exports; when these
strings are present it checks them. The new Python importer requires fresh
exports containing those strings. It does not guess Python/JavaScript number
or Unicode serialization equivalence.

The receiver calls:

```python
captured = import_mission_capture(
    raw,
    tenant_id=expected_workspace,
    mission_id=expected_mission,
    actors=authenticated_native_identity_bindings,
    ingested_at=actual_ingestion_time,
)
```

This emits private A0 observations of mission, run, job, evidence and task
snapshots. Status `verified` in the source remains reported status. Source-owned
actor timestamps are retained; `captured_at` is not substituted for all activity.
Rows retain their common canonical mission association for project views.
Source titles, body text, raw inputs/results, answers and source URLs do not enter
derived event data. The original authorized capture is still private evidence.

The importer validates exact groups, leaves, byte hashes, expected scope, actor
bindings, limits, counter types, timestamps, linked records and result hashes.
`HOLD` stays in its `gaps`; a self-consistent file cannot confer source access.
These row snapshots cannot reconstruct unrecorded attempts, vendor traces or
causal effects. No capability is inferred from a task title or mission status.

CLI equivalents operate on explicit local files and print JSON:

```bash
python -m apps.world_twin import-capture --capture capture.json \
  --tenant <workspace-id> --mission <mission-id> --actors actors.json
python -m apps.world_twin compile --events world-capture.json --scope scope.json
python -m apps.world_twin compile --events world-capture.json --scope scope.json \
  --reviews reviews.json --review-policy receiving-review-policy.json
```

`actors.json` maps native account IDs to `{semantic_id, kind}`. `scope.json` is a
`ProjectionScope` wire object with an explicit authorized event inventory. These
files are receiving inputs, never credentials or proof of access. Keep them and
all captures outside public source control.

The shipped `record`, `twin`, `world`, `dispute` and `resolve` prototype commands
remain for existing local ledgers. Those unversioned, unscoped claims are **not**
accepted by the strict interchange compiler. Re-import original sources with
actual tenant, identity and receipt context; do not relabel old ledgers as v1.

## Verification and Receiving Work

```bash
python tests/world_twin/check_world_twin.py
node --test tests/upgrade/sprint-journey.test.mjs
```

The connected test uses the production JSVM mission export through the browser
validator, Python import, episode reconstruction and canonical graph projection.
It includes synthetic Unicode/number-spelling controls and private markers,
unchanged recaptures, source-tampering and denial cases. It is not live PocketBase
or deployment acceptance. The existing required Python 3.11/3.12 coverage matrix
and source discovery include these tests; no replacement test runner is added.

The receiving Citadel/CSEG owner still needs authenticated identity resolution,
event access and publication policy, persistent canonical ingestion, approved
provider adapters, independently authenticated review pins and source readback.
No `.subscribe()` workflow, NATS bridge, Ray deployment, telemetry collector,
automated mission submission or production mutation is activated by this change.
