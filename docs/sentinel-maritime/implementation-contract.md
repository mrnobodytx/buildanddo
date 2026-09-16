# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/sentinel-maritime/implementation-contract.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docs/sentinel-maritime/blueprint.md, docs/sentinel-maritime/contracts.md, docs/sentinel-maritime/integrity.md, docs/sentinel-maritime/system-plan.json, docs/sentinel-maritime/work-orders.json
# EnumType:    Doc
# EnumEdges:   EXTENDS docs/sentinel-maritime/blueprint.md; CONSUMES docs/sentinel-maritime/contracts.md; CONSUMES docs/sentinel-maritime/integrity.md; CONSUMES docs/sentinel-maritime/system-plan.json; CONSUMES docs/sentinel-maritime/work-orders.json
# DAG Node:    none
# Intent:      Bind Astra's future maritime work to existing Sentinel owners and one verified end-to-end cue instead of disconnected modules or duplicate authority.
# ───────────────────────────────────────────────────────────────

# Astra // Sentinel Maritime master implementation contract

**SM-EXEC-1.0 | Architecture SM-BL-1.1 | Owner brief: 2026-09-16**

Extend the existing Sentinel system at https://sentinel.citadel-nexus.com.
Optimize for completing one permitted live observation through world state,
detection, NNC, proof, analyst review, receipted handoff, outcome and replay using
existing Citadel infrastructure. A module's presence does not establish its
implementation: runtime behavior, telemetry, tests, evidence, SBOM relationships
and rollback must agree on the same candidate.

This is a public handoff contract. **No Astra run or private dispatch is created.**
`work-orders.json` contains all 13 proposed work orders and traces all 55 sections
of the owner's build brief. The receiving owner resolves the actual repository,
owners and module paths before authorizing source changes. The public BuildAndDo
repository holds the plan, not the private maritime services.

## 1. Program controls and contract precedence

```text
PROGRAM_ID       SENTINEL-MARITIME-V1
PRODUCT          Sentinel Maritime Intelligence Engine
TARGET_SURFACE   https://sentinel.citadel-nexus.com
PROGRAM_MODE     EXTEND_EXISTING / REUSE_BEFORE_NEW
APPLICATION      Deep Blue Observer
SYSTEM_TYPE      software intelligence synthesis + cue governance
PRIMARY_OUTPUT   governed ThreatCue + evidence envelope
AUTHORITY        existing NNC deterministic admission
MODEL_AUTHORITY  NONE
DEPLOYMENT       existing Sentinel application and services
NEW_STANDALONE_UI NO
NEW_MERKLE_IMPL  NO
CUI_PHASE_1      DISABLED
PROD_WRITES      HOLD until release gates AND receiving human authority
EXECUTION_STATE  NOT_DISPATCHED
```

The owner's 55-section brief is the product decision source; contracts.md defines
the reconciled semantics, integrity.md defines commitment ownership, and this
document binds execution. No proposal overrides the receiving repository's
authorization or safety boundary. A conflict is recorded against its contract
and resolved by the responsible owner before dependent work; do not silently
install an alternative auth, database, graph, evidence or release service.

Three reconciliations apply throughout:

- CandidateCue precedes admission. AdmissionDecision has ADMIT/HOLD/DENY;
  SUPPRESS/ESCALATE are separate triage/review dispositions. ThreatCue records
  ADMIT for one action, audience and immutable projection. Surfacing permission
  cannot be reused as export permission.
- The shared scope envelope supplies tenant_id and mission_id even where the
  brief's simplified JSON omitted them. Public/commercial/CUI classification
  never removes tenant, mission, purpose or source-license restrictions.
- Detached proof/view projections join later receipts and epoch membership.
  Neither a cue, image, release nor epoch can hash its own future digest/receipt.
  Handoff also needs PENDING/UNKNOWN, beyond the brief's three terminal states.

## 2. Wave 0: discover owners before code

The first operation in the receiving environment is its required governance and
read-only discovery. A Ready/In progress private dispatch must cover that work.
Do not clone an assumed repository, create paths from the illustrative tree, run
installers, mutate shared state or contact government endpoints from this plan.

Return an inventory with, for each capability: accountable human/service owner,
repository and exact source revision, actual module/route location, interface
version, auth/scope model, dependencies, existing tests, allowed evidence
references and dated runtime/image identity where available. Report unknowns as
unknowns. A familiar service name or homepage response is not proof of ownership
or compatibility. A source-only finding cannot be called runtime verified.

Required discovery covers existing Sentinel web/globe and identity; service/API
owners; PostgreSQL/Supabase state; DKG, temporal, causal and provenance graphs;
NATS; evidence fabric; canonical Merkle/epoch and SBOM owners; NNC; Datadog,
PostHog and edge controls; deployment/release/rollback ownership; and the separate
BuildAndDo mission/evidence adapter. Preserve its private personal dossiers.

Map each of the 33 stable component IDs to **REUSE, EXTEND or BUILD**, with proof
for each reuse base. Existing plan entries are desired dispositions. Unsupported
REUSE/EXTEND is a blocker requiring an owner decision, not permission to duplicate
the service. File mappings remain null until discovered. Exact source paths and
test commands belong in the receiving evidence store, with a sanitized public
index only when permitted.

Wave 0 exits only when the named owner accepts the inventory, necessary bases and
path mappings, scope/auth boundaries, canonical integrity ownership and the
first vertical slice. **No maritime implementation before this gate.** Later
work orders also require their dependencies' actual acceptance; calendar order
does not open a gate. Unresolved optional suppliers may be excluded explicitly
from the first slice rather than silently presented as integrated.

## 3. Canonical contracts and compatibility

Wave 1 maps logical schemas onto existing packages. Version wire schemas,
validation, compatibility and correction rules before producers/consumers.

| Domain | Contracts to map or extend |
|---|---|
| Sources and rights | Observation, DataSource, DataRightsContract, Sensor, Emitter |
| World state | Entity, Vessel, VesselState, Track, TrackPoint, Port, Zone, Organization, Event, Claim, Relationship |
| Detection and authority | CandidateCue, ThreatCue, AdmissionDecision, PolicyPack |
| Evidence and action | EvidenceArtifact, CueProof, AnalystDisposition, HandoffReceipt, OutcomeEvidence |
| Reproducibility | ReleaseManifest, EvidenceEpoch, ReplayRun |

Use UTC with source precision, WGS84 / EPSG:4326 and GeoJSON longitude-latitude
ordering. Point, LineString, Polygon and MultiPolygon geometry requires bounded
size and coordinate validation, including antimeridian tracks, empty/invalid
geometry and gaps. Features carry entity/revision, time, confidence/calibration,
state class, cue priority, classification, source count and accessible evidence.
Unknown confidence is not zero; an uncalibrated score is not a probability.

Every durable reference identifies scope, schema and immutable revision.
Correction/retraction appends lineage. Source record identity plus normalized
revision supports deduplication without treating changed content as a retry.
Out-of-order timestamps must not overwrite fresher state silently. Upgrade and
down-compatibility tests use the discovered schemas and migration framework.

## 4. Adapters, normalization and rights

The adapter contract separates source identity and license from transport.
Map AIS, SAR, EO_IR, RF, OSINT, WEATHER, PORT, OPERATOR and future GOV sources to
Observation, preserving permitted raw hashes, normalized hashes, event/ingest
time, measurement quality, uncertain entity candidates and provenance.
Unknown source, rights, classification or required lineage blocks accepted ingest.

Wave 2 includes one deterministic fixture adapter and one owner-approved live
public source with documented license, provenance, retention, request limits and
coverage. Neither a fixture nor a live weather feed proves AIS/SAR/EO/RF fusion.
Live source selection is a discovery/data-rights decision; no URL, supplier
subscription, credential or data purchase is invented here. Record live coverage
and outages separately from the synthetic negative-control corpus.

Reuse bounded timeouts, retry/backoff, source deduplication and existing queue
ownership. Test malformed/spoofed metadata, source disagreement, partial batches,
backpressure, duplicate delivery and missing feeds. Validate metadata as data;
it cannot instruct an agent, change policy or select an export destination.

Rights enforcement starts in Wave 1 contracts and Wave 2 ingest, persists through
claims/state/proofs, and rechecks at derivation/query/export. Registry records
source owner, license, allowed purpose, retention, redistribution/derivatives,
export recipients/jurisdictions, classification, expiry and version/hash.
Unknown conditions HOLD; explicit prohibitions DENY. Changing a license never
retroactively erases what a historical decision evaluated or grants new access.

## 5. Persistent state, storage and entity resolution

Preserve observations, claims, entity state, temporal snapshots, relationships,
uncertainty and conflict as distinct semantics. Reuse the discovered relational
state owner for canonical missions/entities/cues/admissions/handoffs; DKG for
semantic association; temporal graph for tracks/order; causal graph for declared
derivation hypotheses; provenance graph for source-to-outcome lineage; artifact
storage for permitted immutable evidence. Vector retrieval is optional and never
authoritative state. These roles do not mandate six new databases/services.

Resolver evidence can include identifiers/aliases/callsigns, MMSI/IMO/registry,
position-time proximity, track continuity, sensor association, route consistency,
ownership/historical links and attributed operator corrections. Preserve the
association as a versioned claim with confidence, resolver version, supporting
evidence and alternatives. Equal identifiers alone cannot trigger irreversible
merges. Track gaps, staleness, contradictions and observed/inferred/predicted
state survive projections and replay.

Map the brief's VESSEL/PORT/ZONE and observation/claim/cue/decision/receipt edges
to the existing ontology. All endpoints and traversals enforce current scope.
Projection recovery reconciles relational state, graph and artifacts after
duplicates or crashes; it does not invent missing evidence or silently lose a
contradiction. Rebuild indexes from the accepted immutable history.

## 6. Detection, NNC and learning

The initial feature inventory is dark interval, route deviation, zone transition,
unusual port sequence, abnormal loitering/speed/heading, identity inconsistency,
unexpected disappearance/reappearance, rendezvous candidate, repeated rendezvous,
track discontinuity, source disagreement, unusual time-of-day behavior,
historical pattern divergence, area activity-density change and relationship
anomaly. Prioritize a single validated path rather than claim all features work.

Combine deterministic, temporal, graph, statistical, optional ML and external
intelligence evidence into CandidateCue. Freeze feature versions/windows,
coverage assumptions and calibration. Capture inference outputs used by a
decision. Shared upstream data is not independent corroboration. Routine context
can suppress a candidate while preserving the candidate and reason for audit.

NNC's existing owner implements a maritime policy pack, in the predicate order
defined in contracts.md. Models, UI, priority and integration adapters cannot
admit or rewrite a verdict. A known explicit prohibition produces DENY; unknown
evidence produces HOLD. ESCALATE requires named authority and a fresh evaluation,
not a UI override.
Version policy authorship, approval, effective time, supersession and rollback.
Budget and permitted collection scope apply to actions that incur cost.

Analyst dispositions and outcomes feed feature-effectiveness evaluation.
Improvement follows offline evaluation, TEVV and a new approved release. A false
positive click cannot silently train a live model or rewrite NNC policy.

## 7. API and streaming contracts

The routes below are the owner's proposed logical surface, **not implemented
endpoints or confirmed existing paths**. Wave 0 maps them onto current API owners;
Wave 1 versions contracts and Wave 8 tests recipient compatibility. Reuse actual
Sentinel auth and current per-action scope checks. Internal mutations stay private.

| Method / logical route | Contract |
|---|---|
| GET /api/maritime/health | Dependency/coverage state without secrets or private inventories |
| GET /api/maritime/watch; /watch/geojson | Scoped current watch and bounded GeoJSON projection |
| GET /api/maritime/entities | Paginated entity query |
| GET /api/maritime/entities/:id | Scoped entity/state detail |
| GET /api/maritime/entities/:id/history; /evidence; /relationships | Bounded historical/provenance/graph queries |
| GET /api/maritime/tracks/:id | Track with gaps, uncertainty and source lineage |
| GET /api/maritime/cues; /cues/:id; /cues/:id/evidence; /cues/:id/proof | Typed cue/review projections with accessible proof |
| POST /api/maritime/cues/:id/adjudicate | Attributed disposition, never direct admission |
| POST /api/maritime/cues/:id/handoff | Current admission/rights check and durable attempt before send |
| GET /api/maritime/evidence/:id | Authorized evidence projection; no unrestricted artifact URL |
| POST /api/maritime/replay; GET /api/maritime/replay/:id | Bounded authorized replay and truthful status |
| GET /api/maritime/sources; /sources/:id/health | Source coverage, freshness and permitted metadata |
| GET /api/maritime/integrations | Allowed destinations/contracts and observed state |
| POST /api/maritime/integrations/:id/test | Explicit authorized test; read-only queries cannot trigger it |
| GET /api/maritime/metrics/demo | Scoped aggregate observations, never invented healthy counts |
| POST /internal/maritime/observations; /internal/maritime/batch | Private ingest under the existing service identity |

Select SSE or WebSocket according to the current Sentinel implementation for
entity/track changes, candidates, admissions, priority changes, dispositions,
handoff receipts and source degradation. Machine subscriptions need bounded
filters, cursor retention, current authorization, reconnection/deduplication,
ordering semantics and backpressure. A revoked subscription must stop receiving
data; a historical cursor does not confer historical access.

Generic destination adapters cover REST, webhook, SSE, the existing message
bridge, GeoJSON, JSON Lines and batch export. Named Sextant/SPAR/MAGE/CSII mappings
await actual receiving contracts. Simulator results are labeled; undocumented
government interfaces are never fabricated. Every network attempt has a durable
receipt and classification/rights-approved payload. Unknown delivery is reconciled
without claiming exactly-once external effects or usefulness from a transport ACK.

## 8. Event fabric and lineage

Use the existing NATS owner and its ACL/mTLS/retention contracts. These are
proposed private subjects under `citadel.sentinel.maritime.`; this public plan
emits none. Reconcile producer/consumer ownership before registration.

```text
observation.raw          observation.normalized
entity.created           entity.updated             entity.resolved
track.updated
claim.created            claim.contradicted          event.created
candidate.created        candidate.updated
nnc.request              nnc.verdict
cue.admitted             cue.held                    cue.denied
cue.updated              analyst.disposition
handoff.requested        handoff.completed           handoff.failed
evidence.committed       epoch.closed
replay.started           replay.completed
security.blocked         rights.denied
```

The cue.held/denied events reference CandidateCue and AdmissionDecision, not an
admitted ThreatCue. Events carry event_id, stream/sequence identity, event_time,
ingest_time, tenant_id, mission_id, correlation_id, causation_id, release_root,
classification, schema_version and immutable rights/provenance references.
NATS sequence numbers are stream-scoped; they are not a global event clock.
Raw payload events may carry protected references rather than licensed bytes.
Replay consumes the declared sequence range and ordering/watermark policy.

One correlation_id follows ingest, normalization, rights, publish, resolution,
state, features, candidate, NNC, ThreatCue, proof and handoff. Correlation does
not imply authorization or establish causal truth. Events and retry receipts
respect retention and the same classification/tenant boundary as their inputs.

## 9. Existing Sentinel UI

Add Maritime as a mission mode in the discovered Sentinel shell and globe/map.
The desired navigation is Overview, Watch, Entities, Cues, Evidence, Replay,
Sources, Integrations, Metrics and Admin. Reuse actual component, theme, auth,
keyboard and mobile patterns; do not create a standalone application or import
BuildAndDo's PocketBase login as a substitute for Sentinel identity.

The Watch screen combines vessels, tracks, zones, ports, AIS and permitted
non-cooperative observations, events, candidates/admitted cues, contradictions
and stale feeds. Filters include sources, time, priority, zones and state class.
The selected entity shows state, confidence, contradictions, evidence and cue
history. Entity detail exposes Summary, Track, Timeline, Evidence, Relationships,
Claims, Cues and Replay using authorized bounded queries.

Cue cards show why a cue fired, both sides of the evidence, calibration and
uncertainty, predicate results, missing conditions, recommended collection,
analyst action and handoff state. The evidence drawer shows source, both times,
hash/reference, permitted normalized representation, rights/classification and
supported/contradicted claims. A missing or denied field is explicitly unavailable.

Use existing theme tokens for ADMIT, HOLD, DENY, SUPPRESS and ESCALATE with text
labels and icons, never color alone. Test keyboard focus, sidebar/tab navigation,
modal close/return, reduced motion, contrast and mobile overflow. No optimistic
success before persisted disposition; no HOLD-to-ADMIT control. Changes of
identity/mission discard private cached/delayed results. Maps have equivalent
keyboard-accessible entity/cue lists.

## 10. Proof, release and supply chain

Follow integrity.md, including the acyclic cue/proof/epoch chain. Reuse the
canonical private epoch owner after its tool/version and conformance are
verified. The public BuildAndDo file-hash manifest and evidence-only epoch are
reference source, not a substitute release admission path.

Every candidate's evidence includes source revision, builder/base and image
digests, image-derived package SBOM, runtime provenance, route/schema/policy
contracts, dependency closure, tests, existing evidence/SHACL conformance,
owner-produced receipt/epoch/root and verification. Preserve separate release,
evidence and rights roots and public/commercial/future CUI proof domains.

The system SBOM projection includes component, version, license, source repo and
revision/path/hash, runtime/container, interfaces/dependencies, owner, deployment
and evidence references. Relationships include IMPORTS, CALLS, PRODUCES,
CONSUMES, REQUIRES, DEPENDS_ON, IMPLEMENTED_BY, DEPLOYED_AS, EVIDENCED_BY and
OWNED_BY. Use the existing supported SPDX/CycloneDX package format and a linked
system graph, not a relabeled planning JSON. Managed dependencies require honest
external/version-observed identities, never invented container hashes.

Verify missing/duplicate/tampered inputs and circular-reference rejection with
the existing implementation. Failed required integrity or SBOM completeness
blocks eligibility. Test receipts bind the candidate image/config before final
release construction; they must not depend on the future root being computed.
The receiving owner must establish the existing pre-release identity contract;
no synthetic production root or alternate bypass mode may fill this gap.

## 11. Security from the first schema

Security is a dependency of every wave; Wave 11 consolidates assessment and
hardening. VIEWER, ANALYST, REVIEWER, MISSION_ADMIN, INTEGRATION_SERVICE,
SYSTEM_OPERATOR, AUDITOR and SECURITY_OFFICER map to existing roles. Separate
view, adjudicate, policy authoring/approval, handoff, feed/rights configuration,
deployment and evidence inspection. No application superuser shortcut.

Require current tenant/mission/purpose scope for every storage/graph/query/
subscription/cache/export path. Test role changes, revoked rights, guessed IDs,
cross-tenant and cross-mission traversal, indirect artifacts and background tasks.
Minimize source/analyst content in telemetry and sanitize untrusted metadata.

Phase 1 rejects government CUI. Future CUI requires a separately authorized
profile with isolated data/artifact/graph stores, identity audit, controlled
logging/proofs, approved encryption, export review, retention and sanitization.
No CUI ingestion, security deployment or compliance claim results from defining
that profile. The security authority resolves applicable NIST SP 800-171,
FIPS-validation, DFARS/CMMC, training and media obligations from official terms.

Release checks include dependencies, secrets, containers, licenses, SBOM
completeness, AST security, API authorization, tenant isolation, data rights,
classification propagation and export restrictions. Use existing scanners and
their policies. Absent scanners or evidence are unresolved gates, not PASS.

## 12. Telemetry and operational acceptance

Every service's authorized logs/traces carry env, service, version, release_root,
component, pipeline_stage and classification; tenant_id/mission_id and
correlation_id are scoped references only in permitted telemetry stores. Metrics
use a reviewed bounded-cardinality dimension set; raw source IDs, location,
evidence, analyst notes, tokens and unlimited mission identifiers are excluded
from metric labels. Resolve retention and cross-boundary telemetry in discovery.

Proposed metric namespace: `sentinel.maritime.`. Map to the existing telemetry
owner's types and units, then demonstrate actual ingestion for the same candidate.

```text
ingest.events                 ingest.errors                 ingest.latency_ms
source.staleness_seconds
worldmodel.update_ms          worldmodel.entities           worldmodel.conflicts
entity_resolution.attempts    entity_resolution.confidence
detector.events               detector.candidates
cue.raw                       cue.candidate                 cue.admitted
cue.held                      cue.denied                    cue.suppressed
cue.latency_ms
nnc.evaluations               nnc.gate_failure
provenance.completeness
handoff.requests              handoff.success               handoff.failure
handoff.latency_ms
replay.runs                   replay.determinism
merkle.verify_pass            merkle.verify_fail
sbom.coverage                 rights.block                  security.export_block
```

Counters count deduplicated episodes or attempts as declared; gauges/histograms
record units, time windows, coverage and missing data. Confidence histograms
identify calibration, never imply measured association accuracy. UNKNOWN
handoffs and absent telemetry remain visible; zero is not the default for
missing collection. Trace the pipeline in section 8 and preserve sample/trace
links without exporting protected evidence. Telemetry failure cannot authorize
an otherwise blocked action or manufacture acceptance.

Dashboard contracts: 01 Mission Health; 02 Feed & Adapter Health; 03 World Model
Health; 04 Entity Resolution; 05 Detection & Cue Funnel; 06 NNC Admission;
07 Evidence & Provenance; 08 Handoff & Integrations; 09 Replay & Determinism;
10 Security / Data Rights; 11 Release Integrity / SBOM / Merkle; 12 48-Hour Demo
Command Center. Dashboards are proposed, not created by this document.

The funnel is raw observations -> raw anomalies -> candidate episodes -> admitted
cues -> analyst accepted -> handed off. Show counts, deduplication, lag and
eligibility denominators at each stage rather than infer precision from shrinkage.
Baseline observation-to-normalized, normalized-to-state, state-to-candidate,
candidate-to-verdict and verdict-to-handoff before agreeing SLOs. States are
UNMEASURED, BASELINED, TARGET_DEFINED, MEASURED, PASS or REGRESSION; only observed
results can advance them. M-01–15 in contracts.md define the evaluation metrics.

## 13. Demonstration and replay

Map the proposed `sentinel-maritime demo create|status|metrics|evidence|replay|report`
operations into the existing Sentinel administration tooling after discovery;
these are command contracts, not installed commands. Creation and external tests
are explicit mutations requiring receiving authority. A status/read must never
start a feed, purchase data, submit evidence or hand off a cue.

Use the five windows and exit evidence in white-paper.md. The command center
shows mission clock, observations/entities, raw anomalies/candidates,
admitted/held/denied/suppressed cues, source/state/NNC/evidence/handoff/replay
health, and speed/accuracy/noise/trust/cost measurements. Every count resolves to
actual scoped records; no animated synthetic count is presented as live.

Freeze mission/AOR, sources/rights, source and NATS sequence/time ranges, candidate
image/config, release/policy versions, evaluation clock, reference labels,
negative controls, missing-data rules and numeric acceptance targets before a
run. Reconstruct observations, state, candidates, verdicts and cue revisions with
expected-versus-actual evidence. Compare deterministic verdict and gate reasons;
record stochastic inference differences separately. Divergence creates HOLD of
dependent action and an incident/evidence receipt, never an edited expected result.

One live public observation must traverse the chain on the same candidate.
Lack of a naturally qualifying anomaly is not failure evidence of the mission
itself and cannot be fixed by mislabeling a fixture as live. A fixture may test
deterministic rules; disclose separately if the full live cue condition or a
real recipient was unavailable. No recall/FPR claim without an independent
reference population. Agree targets with the mission evaluator before evaluation.

## 14. Testing and release gates

Each work order names positive and negative tests with runnable commands once
the source owner/path is discovered. Test schema/parsers/features/policies at
unit level; adapters/API/events/proof compatibility as contracts; invariants and
classification as property checks; the actual pipeline as integration; immutable
reconstruction as replay; malformed/duplicate/stale/spoofed data as adversarial;
authorization/rights/isolation as security; throughput/latency/recovery against a
frozen corpus; and mission usefulness with named human TEVV evaluators.

`work-orders.json` binds all mandatory negative cases to work orders. In
particular, stale evidence cannot overwrite fresh state; contradiction survives;
models/candidates/UI cannot bypass NNC; denied rights/CUI/foreign-tenant evidence
cannot escape; missing policy/release blocks handoff; integrity failure blocks
release; replay divergence HOLDs; and every handoff has an attempt receipt.

System acceptance requires observed evidence for:

1. Versioned schemas, provenance/rights on every accepted observation, scoped
   graph/state reconciliation and contradiction-preserving replay.
2. Mandatory NNC gates, policy on every decision, release on each operational
   cue, CueProof for every admitted/surfaced cue, current permission for every
   export and a receipt before each handoff attempt.
3. Deterministic historical verdict replay; rights/classification/tenant negatives
   and no CUI crossing the public export boundary.
4. Generated same-image SBOM and runtime provenance, existing-owner Merkle
   recomputation/conformance, required security scans/tests, actual telemetry,
   rollback rehearsal and no undeclared remote effects.
5. One complete permitted live observation-to-outcome chain, analyst review,
   agreed receiving acknowledgement and traceable outcome, without replacing
   live acceptance with source fixtures or a simulator.

These are requirements, not completed checkboxes. Missing measurements, package
support, feed/recipient access, license proof, authority or runtime evidence
keep the relevant gate HOLD. No arbitrary 80% aggregate can override a required
negative security test or the full-chain definition of done.

## 15. Rollout and work-order state

OFF -> LOCAL -> TEST -> SHADOW -> DEMO -> PILOT -> PRODUCTION is the proposed
rollout. Each transition binds the same accepted candidate, owner, scope and
rollback receipt. No LOCAL-to-PRODUCTION shortcut. Shadow can observe and
evaluate under its approved source rights while external handoff is disabled.
DEMO/PILOT handoff is separately bounded by recipients, period and authority.
Release ELIGIBLE is not deployment permission and NNC ADMIT is not release approval.

Every work order initially has no accepted owner mapping or private dispatch.
Discovery, schema/source edits, local tests, shared tests, telemetry provisioning,
feeds and external handoffs have different effects. The JSON REMOTE_WRITES
contract declares zero authorized effects from this public session and lists
what the receiving authority would need to approve. A nominal HTTP GET can incur
cost or create provider audit records; record those effects as well.

On failure, stop dependent work, preserve sanitized evidence, apply only an
authorized rollback, and return the next single blocker. Do not widen scope or
mark an unavailable test successful. Human authority and receiving dispatch are
required for shared mutations even after tests pass. No external calls are made
by the structural planning audit.

## 16. Work-order fields and mandatory return

All 13 entries contain exactly these fields; no implementation order is ready
until its logical paths/owners and executable tests are resolved by discovery:

```text
WORK_ORDER_ID       OBJECTIVE             WHY
CURRENT_OWNER       REUSE_DECISION        FILES_EXPECTED
SCHEMAS             DEPENDENCIES          EVENTS
APIS                GRAPH_NODES           GRAPH_EDGES
TELEMETRY           SECURITY_IMPACT       DATA_RIGHTS_IMPACT
TESTS               NEGATIVE_TESTS        POSTCONDITIONS
ROLLBACK            EVIDENCE              SBOM_IMPACT
MERKLE_IMPACT       REMOTE_WRITES
```

CURRENT_OWNER distinguishes requested receiving seat from verified accountable
owner. FILES_EXPECTED names logical roles with unresolved real paths. TESTS and
POSTCONDITIONS are requirements until command, dated result and evidence agree.
REUSE_DECISION references the stable inventory IDs. EVIDENCE requires exact
source/image/config identities as applicable and distinguishes local/simulated/
native/live observations. SBOM/MERKLE fields state the existing owner's impact;
they cannot generate an alternative authority. Every order includes explicit
dependency acceptance and rollback, not just a list of module names.

Return after every order, including a failed or discovery-only order:

```text
ASTRA // SENTINEL MARITIME

WORK ORDER
  id / objective / receiving dispatch / scope
DISCOVERY
  existing systems / owners / verified reuse candidates / unresolved mappings
CHANGE
  files changed / created / reused / schema changes
GRAPH
  nodes added / edges added / scoped reconciliation evidence
API
  routes added / changed / auth and compatibility evidence
EVENTS
  producers / consumers / actual subjects and schema versions
TELEMETRY
  metrics / logs / traces / dashboards / monitors / observed evidence
TEST
  unit / contract / integration / negative / replay / security
  command + candidate identity + observed result + unavailable cases
EVIDENCE
  receipt / source SHA / image identity / artifact hashes / permitted references
SBOM
  delta / generated evidence / required unknowns
MERKLE
  existing owner / tool version / admission state / recomputation result
RUNTIME
  observed health / time / scope, or UNVERIFIED with reason
REGRESSION
  PASS / FAIL / NOT_RUN, with evidence and unresolved gates
RELEASE
  HOLD / ELIGIBLE, with gate evidence; never deployment authority
REMOTE WRITES
  count / destinations / approved scope / receipts, including failed attempts
NEXT SINGLE BLOCKER
  concrete missing owner, artifact, permission or failing gate
```

Zero changes, no runtime, no SBOM delta and NOT_RUN are valid discovery results;
invented PASS or synthetic release identities are not. Restricted references
remain in the receiving evidence store; publication uses an approved projection.
The current next blocker is a **receiving private dispatch with the actual
Sentinel repository and accountable owners for Wave 0**. The existing handoff
records that request without activating another seat.
