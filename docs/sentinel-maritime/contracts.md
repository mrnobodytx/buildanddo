# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/sentinel-maritime/contracts.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docs/sentinel-maritime/blueprint.md, docs/sentinel-maritime/integrity.md
# EnumType:    Doc
# EnumEdges:   EXTENDS docs/sentinel-maritime/blueprint.md; DEPENDS_ON docs/sentinel-maritime/integrity.md
# DAG Node:    none
# Intent:      Define reviewable maritime evidence, cue, admission and measurement semantics before private adapters and government interfaces are implemented.
# ───────────────────────────────────────────────────────────────

# Sentinel Maritime design contracts 1.1

Part of `SM-BL-1.1`. These are product-level semantic contracts for receiving-seat
implementation and review. Wire schemas, transport bindings, migrations and
government interface compatibility are not implemented by this document.

## Shared envelope and references

Every persisted observation, assertion, state snapshot, feature set, cue revision,
decision and receipt has a schema ID/version, stable record ID, immutable revision
ID, producer identity/version, recorded time, security boundary, rights reference
and provenance references. Event time and ingest time remain distinct. Use UTC
timestamps with explicit offsets and source precision/clock uncertainty.

`tenant_id` and `mission_id` are mandatory on every mission-domain object,
request context, event and scoped reference, including CandidateCue, VesselState,
AdmissionDecision, CueProof, HandoffReceipt and ReplayRun. Source, rights, policy
and release catalogue entries bind an authorized tenant/mission scope when used;
catalogue reuse is not permission for a cross-scope read. Enforce scope through
the existing identity/authorization owner on relational, graph, artifact, cache,
query, subscription and replay paths. No traversal or background task may drop
these constraints. Cross-mission use inside one tenant also requires permission.

References name immutable record revisions and, once admitted by the integrity
owner, artifact digests/epoch references. A mutable "latest" URL cannot be the
sole supporting evidence. Corrections append a revision with `supersedes` and a
reason. Retraction does not rewrite the original evidence or silently remove it
from an old decision. Access, retention and erasure follow the applicable rights
policy; retaining a hash does not authorize retaining or exporting its source.

Confidence contains a value only with a scale, producer method/version and
calibration reference (or an explicit `uncalibrated` state). A ranking score is
not a probability. Missing confidence is unknown, not zero. Preserve individual
measurement uncertainty, association uncertainty and inference confidence.

The security envelope separates public/commercial access, CUI marking and source
license restrictions. Unclassified does not mean redistributable. Unresolved
rights or classification block the dependent export. Provider identifiers and
citations are evidence references, never authentication credentials.

## Observation and maritime entities

| Contract | Required semantic fields |
|---|---|
| Observation | Shared scoped envelope; `observation_id`, `source_id`, `source_type`, `source_record_id`, `event_time`, `ingest_time`, geometry or explicit absence, `measurements`, `entity_candidates`, confidence/calibration, quality, provenance, `data_rights_id` and revision, classification, `raw_hash`, `normalized_hash`. Hash only permitted source bytes through the existing canonical format. Missing source/time/rights/provenance/hash prevents accepted ingest. |
| VesselState | Shared scoped envelope; `entity_id`, `state_revision`, `valid_at`, `computed_at`, identifiers and identity confidence, current position/track and route-history refs, port/zone/related-entity refs, distinct observed/inferred/predicted state, confidence, supporting/contradicting/stale evidence, resolver version and producing release reference. |
| Voyage | Stable ID/revision, subject vessel, time bounds, departure/arrival hypotheses, route/track refs, completion state and supporting/contradicting evidence. |
| Port / Zone | Stable ID/revision, named geometry/coordinate reference, effective dates, source/rights, zone meaning and any applicable policy reference. Geometry is not an authorization grant. |
| MaritimeEvent | ID/revision, type, participant hypotheses, time interval/uncertainty, location/geometry, observed or inferred status, feature/evidence refs and producing detector version. |
| Association | Candidate source/target entities, relation type, effective interval, resolver version, supporting/contradicting evidence and confidence. |

Wave 1 also versions Entity, Vessel, Track, TrackPoint, Emitter, Sensor,
Organization, Event, Claim, Relationship, EvidenceArtifact, DataSource,
DataRightsContract, PolicyPack, ReleaseManifest, EvidenceEpoch and ReplayRun.
Claim separates the asserted value from the cited observation and its producing
method. Relationship records scoped endpoints, type, time, evidence and whether
the link is observed or hypothesized. Do not create a new generic ontology if an
existing Sentinel object already provides these semantics.

DataRightsContract requires `data_rights_id`, revision, source and owner,
license/contract reference, allowed purposes, retention rule, redistribution,
derivative and export permissions, allowed recipients/jurisdictions,
classification/CUI restrictions, expiry, revocation and contract hash. Retain
the applicable versions on observations, claims, cues, proofs and handoffs.
Rights checking is an executable ingest/query/derivation/export gate in the
receiving system. Unknown rights produce HOLD of the dependent action; explicit
prohibition produces DENY. An expired or revoked grant cannot authorize export.

Identifiers include scheme, value, issuer/source, validity interval and evidence.
An identifier is not an immutable vessel identity: identifiers can conflict or be
reassigned. Preserve ambiguous candidates and reversible merge/split history.
Neither equal names nor a shared operator automatically establishes identity or
wrongdoing. Operator/person relationships require permitted data and explicit
provenance; this design adds no collection of private user dossiers.

Normalize coordinates to WGS84 / EPSG:4326 and GeoJSON longitude then latitude
while preserving the original measurement/coordinate system. Track gaps remain gaps; an inferred
position carries its method and uncertainty. Late/out-of-order observations may
produce a new state revision without rewriting what an earlier cue saw.

Relationship vocabulary includes `VISITED`, `ENTERED`, `EXITED`, `OBSERVES`,
`RENDEZVOUS_WITH`, `ASSOCIATED_WITH`, `SUPPORTS`, `CONTRADICTS`, `DESCRIBES`,
`DERIVED_FROM`, `PRECEDES`, `INVOLVES`, `SUPPORTED_BY`, `CONTRADICTED_BY`,
`ADMITTED_BY` and `HANDED_OFF_AS`.
Relationships carry time bounds, provenance and observed/inferred status. A
causal-context edge must state whether it is a hypothesis; temporal order and
correlation alone are not established causation.

## CandidateCue, ThreatCue and admission states

CandidateCue requires the shared scoped envelope, `candidate_id` and revision,
subject entity/state refs, cue type, versioned feature values, supporting and
contradicting evidence, temporal/graph context, captured model-output refs,
confidence/calibration, uncertainty, generation time/version and release/rights
context. It has no external handoff permission. An unresolved association is a
claim, not a destructive entity merge. Duplicate sources and uncertain association
cannot silently increase independent corroboration.

SM-BL-1.1 narrows the 1.0 use of ThreatCue for candidate and held records:
**ThreatCue is an immutable revision admitted by NNC for a specified action.**
The underlying candidate and all HOLD/DENY decisions remain represented. An
authorized review UI can show all three with their type and verdict; it cannot
construct a ThreatCue or mutate an authoritative decision from a status control.

The complete cue revision is the unit of review, admission and handoff. The
recipient gets an authorized projection plus references it can actually access.

| Group | Fields and meaning |
|---|---|
| Identity | `schema_version`, `cue_id`, `revision`, `tenant_id`, `mission_id`, source candidate revision, `subject_entity` (entity plus state revision), `cue_type`. |
| Time | `first_seen` (qualifying event time), `first_detected_at` (engine decision time), `last_updated`, `observation_window`; uncertainty on source time. |
| Ranking | `priority` with policy/scale, `confidence` with calibration/method, `uncertainty` with missing-source and cold-start flags. |
| Evidence | `supporting_evidence`, `contradicting_evidence`, `related_entities`, `behavior_features`, `causal_context`; all reference immutable revisions. |
| Explanation | Human-readable `explanation` traceable to features/evidence; `recommended_collection` with reason, scope and required authority, without automatic tasking. |
| Lifecycle | `status`: OPEN, UNDER_REVIEW, DISPOSITIONED or RETRACTED. Current eligibility is computed separately from the historic decision; retracting a cue does not rewrite its old ADMIT. |
| Reproducibility | `release_root`, detector/model/config versions, `world_snapshot_ref`, input ordering/window, feature snapshots, `policy_version`, immutable rights snapshot and completed evidence-epoch references or explicit pending closure. Pending required proof prevents handoff. |
| Authority | `admission_decision_ref`, `admission_verdict = ADMIT`, requested action, recipient, purpose and expiry for this revision. ADMIT to surface internally does not imply ADMIT to export. |
| Feedback projection | The query/view envelope joins `cue_proof_ref`, attributed `analyst_disposition_ref` and `handoff_receipt_ref` when present. These outward links are not fields of the immutable cue payload that the proof hashes. Absence means not recorded; later records are detached extensions. |

Correction/retraction of a surfaced cue creates a linked correction notification
for recipients allowed to receive it. A cue that is retracted or changes evidence
needs a fresh admission decision. Priority cannot override a failed authority or
disclosure gate. The UI must display contradictions and uncertainty beside the
explanation, including evidence that lowered confidence.

## NNC AdmissionDecision

The decision binds `candidate_id/revision` and the deterministic proposed cue
projection, `requested_action`, recipient/audience,
purpose, geographic/jurisdiction context, decision/evaluation time, policy pack
version, evidence/rights snapshots, authority reference and expiry/revocation
conditions. The decision contains each gate's result and cited reason.

| Gate | Evidence required to evaluate it |
|---|---|
| Provenance | Resolvable lineage, producer and source identity; tamper/quality results. |
| Freshness | Source-specific freshness policy, evidence event time and clock uncertainty. |
| Corroboration | Required independent evidence and shared-upstream source relationships. |
| Uncertainty | A permitted confidence/calibration state and explicit conflicting/missing evidence. |
| Data rights | Current source contracts, retention/derivative/export permission and applicable rights snapshot. |
| Disclosure | Classification, recipient access and approved dissemination projection. |
| Mission policy | Applicable mission/purpose and action-specific policy pack. |
| Jurisdiction | Permitted geography, recipient and use under the recorded authority. |
| Human authority | Required named/role authority, current grant scope, approval and revocation state. |
| Budget | Approved cost/collection budget for the requested action when applicable. |
| Handoff / compensation | Valid recipient contract, deduplication, acknowledgement, correction and cancellation procedure. |

Evaluate provenance, freshness, corroboration, uncertainty, data rights,
disclosure, mission policy, jurisdiction, current authority and
rollback/revocability in that order; budget remains required when applicable.
Record unevaluated later predicates as not evaluated, not PASS. Required gate
results are `PASS`, `FAIL` or `UNKNOWN`, with typed reasons. Missing support or
unknown required context produces `HOLD`; a known policy/rights/authority
prohibition produces `DENY`. This refines 1.0's generic fail-to-HOLD rule. A
policy-declared inapplicable gate records why it does not apply. `ADMIT` means
the specified action satisfies the referenced policy at the recorded time; it
does not declare a subject guilty or approve force.

`SUPPRESS` and `ESCALATE` are separate triage/review dispositions. SUPPRESS retains
the candidate and reason while lowering noise. ESCALATE names the needed human
authority and preserves HOLD until missing conditions are resolved through a
fresh NNC decision. Neither can bypass the three admission verdicts. The UI may
color these states, but it must also show text and predicate reasons.

PolicyPack records policy ID/version, effective time, author, approver, rules,
applicable missions/actions, content hash, superseded version and rollback
version. Never rewrite historical policy or let analyst feedback change it
without offline evaluation, approval and release governance. Missing policy or
release identity blocks handoff, even for a high-priority cue.

Recheck mutable rights, membership/authority, revocation and freshness at actual
handoff. Deterministic replay reconstructs the historical verdict using frozen
inputs, evaluation time and policy. A replayed old ADMIT never grants new runtime
authority. Bind optional model output as a versioned inference artifact; do not
promise reproducible external model generation merely because verdict evaluation
can be replayed.

## Government integration and outcomes

The planned gateway exposes REST/JSON, bounded historical query, subscriptions,
streaming cue changes and geospatial feature output. Transport subjects, API
paths, authentication and receiver-specific mappings await approved contracts;
this document supplies no speculative government endpoint or credential pattern.

The contract negotiation must cover schema/version compatibility, tenant and
purpose authorization, event ordering, bounded pagination, replay cursors,
duplicates, rate limits, backpressure, expiry and correction/retraction delivery.
Geospatial output preserves entity/cue/revision IDs, time bounds, uncertainty,
observed/inferred status, rights and accessible provenance. GeoJSON, if selected,
must use its defined coordinate order and CRS semantics, with agreed geometry
and size limits.

An outbound envelope binds tenant/mission, recipient, cue revision, action admission, approved
projection, idempotency key, release/policy/rights refs and dispatch time. Separate
delivery-attempt records retain failure/retry state. A timeout is unknown delivery,
not success; a retry keeps the same recipient and payload identity or becomes a
new admitted action. The receiver's acknowledgement states accepted/rejected
schema/version and reference. It does not prove a useful operational outcome.

Persist the HandoffReceipt/attempt identity before issuing network I/O, using the
existing transactional outbox or equivalent owner mechanism. Receipt states are
PENDING, UNKNOWN, SUCCESS, FAILED and BLOCKED. The brief's three terminal states
alone cannot represent a crash or lost acknowledgement. Fields include scoped
receipt/cue IDs and revisions, destination/adapter contract, idempotency and
attempt IDs, requested/completed times, payload hash, accessible evidence-root
reference, classification, policy/release/rights references, transport status
and sanitized recipient acknowledgement. SUCCESS requires the agreed receiver
acceptance; a queued payload or HTTP transport success alone may be insufficient.
Retries of an unchanged admitted payload reuse the handoff identity; each attempt
is recorded. A receipt records BLOCKED before any disallowed network effect.
Crash reconciliation may leave UNKNOWN; never claim impossible exactly-once
external delivery. The invariant is no unreceipted attempt and no silent export.

AnalystDisposition records the authenticated reviewer, time, cue revision,
judgment, reasons and supporting evidence. HandoffReceipt records the actual
recipient, admitted projection, delivery/acknowledgement times and correlation
identity. OutcomeEvidence records subsequent observation or adjudication,
attribution, time and uncertainty. These feed new world-state/cue revisions
without retroactively converting an earlier inference into an observed fact.

Disposition vocabulary: CONFIRMED_USEFUL, USEFUL_LOW_PRIORITY, FALSE_POSITIVE,
INSUFFICIENT_EVIDENCE, DUPLICATE, EXPECTED_ACTIVITY, ESCALATED and CLOSED.
Notes and downstream consequences retain classification and access controls.
ReplayRun binds tenant/mission, immutable source set, time/sequence range,
release, policy, frozen evaluation clock and captured inference. It returns
reconstructed states/candidates/decisions plus expected/actual differences,
coverage and determinism status. Divergence holds dependent action and records
the mismatch; it never edits the expected historical decision into agreement.

BuildAndDo integration must use its existing mission/evidence lifecycle through
an approved adapter. Current personal dossiers stay private to their user;
maritime entity history is a separate, rights-controlled domain. The source
PocketBase store and the proposed Sentinel state store are distinct authorities.

## TEVV measurement contract

All metric values and numerical targets at `SM-BL-1.1` are **not measured / to be
agreed**. Before a run, freeze geography, period, source availability, exclusion
rules, label/adjudication procedure, matching windows, feature/detector/policy
versions, sampling, target population and run/candidate image identity. Publish
sample counts and intervals of uncertainty with aggregate results.

| ID | Metric | Numerator / denominator or timing definition |
|---|---|---|
| M-01 | Observation-to-world-model latency | Usable state commit time minus ingest time; report p50/p95 and sample count, with source lag measured separately. |
| M-02 | Cue latency | First candidate/surfaced time minus the qualifying event time under the frozen detector rule; report both stages and event clock uncertainty. |
| M-03 | Entity association accuracy | Correct adjudicated associations / evaluated associations; disclose sampling, ambiguous/unresolved cases, wrong merges and false splits. |
| M-04 | Track continuity | Correctly associated covered duration / evaluable reference-track duration; report observation coverage, gaps and inferred continuity separately. |
| M-05 | Precision | Matched relevant surfaced cue episodes / all adjudicated surfaced cue episodes (TP / (TP + FP)); freeze deduplication and event-matching rules. |
| M-06 | Recall | Matched relevant episodes / all relevant episodes in the independently adjudicated reference set (TP / (TP + FN)), including events with no cue. |
| M-07 | False-positive rate and alert burden | FPR = FP / (FP + TN) only with a defined negative event population. Also report false surfaced cue episodes per monitored entity-hour and source coverage. |
| M-08 | Provenance completeness | Surfaced cue revisions with all required resolvable lineage fields / all evaluated surfaced cue revisions; count unavailable/inaccessible lineage. |
| M-09 | Contradiction visibility | Preserved and analyst-visible seeded/adjudicated conflicts / known conflicts; version and scope the negative-control set. |
| M-10 | Replay determinism | Identical reconstructed admission verdicts and gate reasons / replayed decisions for the same immutable inputs, evaluation time and policy. |
| M-11 | Analyst time-to-understand | Cue opened to a correctly completed pre-agreed comprehension task; report task accuracy, task difficulty, interruptions and baseline workflow. |
| M-12 | Analyst time-to-disposition | Cue opened to submitted disposition; report useful/correct judgment rate and censored/unresolved sessions as well as timing. |
| M-13 | API handoff latency | Eligible admitted projection to receiving acknowledgement; report queue/delivery/retry stages, unacknowledged attempts and acceptance errors. |
| M-14 | Cost per monitored area/entity | Attributed compute, storage, egress, data and support cost / area-hours and entity-hours actually covered; report shared allocation and excluded costs. |
| M-15 | Analyst usefulness rate | Cues judged useful under an agreed rubric / reviewed cues, with reviewer agreement; usefulness is distinct from detector precision. |

Use an independent reference set and withheld negative controls. Reviewing only
surfaced cues cannot establish recall or FPR. A denominator of zero, missing
labels or missing telemetry produces `not_evaluable`, with reasons and counts,
rather than a perfect or zero result. Outage intervals, rights-limited coverage,
cold starts and censoring remain visible. A detector's apparent silence does not
establish absence of suspicious activity.

Replay tests include evidence tampering, missing lineage, conflicting identifiers,
stale observations, dependent sources, late events, revoked authority, denied
recipient rights, duplicate/lost handoff responses and changed policies. Freeze
the test corpus and expected decisions before evaluation. Compare analyst
outcomes against their existing workflow under a declared study design.

Cost meters observe authorized activity; they do not initiate source purchases.
TEVV evidence is filed by the existing integrity owner with source rights and
run identity. Publication depends on the same export policy as its inputs.
