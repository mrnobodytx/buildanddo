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

# Sentinel Maritime design contracts 1.0

Part of `SM-BL-1.0`. These are product-level semantic contracts for receiving-seat
implementation and review. Wire schemas, transport bindings, migrations and
government interface compatibility are not implemented by this document.

## Shared envelope and references

Every persisted observation, assertion, state snapshot, feature set, cue revision,
decision and receipt has a schema ID/version, stable record ID, immutable revision
ID, producer identity/version, recorded time, security boundary, rights reference
and provenance references. Event time and ingest time remain distinct. Use UTC
timestamps with explicit offsets and source precision/clock uncertainty.

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
| Observation | `observation_id`, `schema_version`, `source_id`, `source_type`, `source_record_id`, `event_time`, `ingest_time`, `position` or explicit absence, `measurement`, `entity_candidates`, `confidence`, `provenance`, `rights_ref`, `security_boundary`, `quality_flags`. |
| VesselState | `vessel_id`, `state_revision`, `as_of`, `identifiers`, `position`/uncertainty, `movement_vector`, `route_history_refs`, `voyage_refs`, `associated_port_refs`, `associated_entity_refs`, `observed_behavior_refs`, `inferred_behavior_refs`, `confidence`, `contradiction_refs`, `stale_evidence_refs`, `supporting_evidence_refs`, resolver version. |
| Voyage | Stable ID/revision, subject vessel, time bounds, departure/arrival hypotheses, route/track refs, completion state and supporting/contradicting evidence. |
| Port / Zone | Stable ID/revision, named geometry/coordinate reference, effective dates, source/rights, zone meaning and any applicable policy reference. Geometry is not an authorization grant. |
| MaritimeEvent | ID/revision, type, participant hypotheses, time interval/uncertainty, location/geometry, observed or inferred status, feature/evidence refs and producing detector version. |
| Association | Candidate source/target entities, relation type, effective interval, resolver version, supporting/contradicting evidence and confidence. |

Identifiers include scheme, value, issuer/source, validity interval and evidence.
An identifier is not an immutable vessel identity: identifiers can conflict or be
reassigned. Preserve ambiguous candidates and reversible merge/split history.
Neither equal names nor a shared operator automatically establishes identity or
wrongdoing. Operator/person relationships require permitted data and explicit
provenance; this design adds no collection of private user dossiers.

Normalize reported coordinates to an agreed geospatial contract while preserving
the original measurement/coordinate system. Track gaps remain gaps; an inferred
position carries its method and uncertainty. Late/out-of-order observations may
produce a new state revision without rewriting what an earlier cue saw.

Relationship vocabulary includes `VISITED`, `ENTERED`, `RENDEZVOUS_WITH`,
`ASSOCIATED_WITH`, `SUPPORTS`, `CONTRADICTS`, `PRECEDES` and `SUPPORTED_BY`.
Relationships carry time bounds, provenance and observed/inferred status. A
causal-context edge must state whether it is a hypothesis; temporal order and
correlation alone are not established causation.

## ThreatCue — canonical product unit

The complete cue revision is the unit of review, admission and handoff. The
recipient gets an authorized projection plus references it can actually access.

| Group | Fields and meaning |
|---|---|
| Identity | `schema_version`, `cue_id`, `revision`, `subject_entity` (entity plus state revision), `cue_type`. |
| Time | `first_seen` (qualifying event time), `first_detected_at` (engine decision time), `last_updated`, `observation_window`; uncertainty on source time. |
| Ranking | `priority` with policy/scale, `confidence` with calibration/method, `uncertainty` with missing-source and cold-start flags. |
| Evidence | `supporting_evidence`, `contradicting_evidence`, `related_entities`, `behavior_features`, `causal_context`; all reference immutable revisions. |
| Explanation | Human-readable `explanation` traceable to features/evidence; `recommended_collection` with reason, scope and required authority, without automatic tasking. |
| Lifecycle | `status`: candidate, under_review, dispositioned or retracted. Surfacing/handoff permission is recorded separately per action. |
| Reproducibility | `release_ref`, detector/model/config versions, `world_snapshot_ref`, input ordering/window, feature snapshot refs, policy pack and rights snapshot refs. |
| Authority | `policy_verdict` references an AdmissionDecision for this cue revision, action, audience and boundary; it may be HOLD. |
| Feedback | Attributed `analyst_disposition` and `handoff_receipt` references when present; absence explicitly means not recorded. Outcomes append new evidence. |

Correction/retraction of a surfaced cue creates a linked correction notification
for recipients allowed to receive it. A cue that is retracted or changes evidence
needs a fresh admission decision. Priority cannot override a failed authority or
disclosure gate. The UI must display contradictions and uncertainty beside the
explanation, including evidence that lowered confidence.

## NNC AdmissionDecision

The decision binds `cue_id/revision`, `requested_action`, recipient/audience,
purpose, geographic/jurisdiction context, decision/evaluation time, policy pack
version, evidence/rights snapshots, authority reference and expiry/revocation
conditions. The decision contains each gate's result and cited reason.

| Gate | Evidence required to evaluate it |
|---|---|
| Provenance | Resolvable lineage, producer and source identity; tamper/quality results. |
| Freshness | Source-specific freshness policy, evidence event time and clock uncertainty. |
| Corroboration | Required independent evidence and shared-upstream source relationships. |
| Uncertainty | A permitted confidence/calibration state and explicit conflicting/missing evidence. |
| Policy | Applicable mission/purpose and action-specific policy pack. |
| Disclosure / jurisdiction | Rights, marking, recipient access, permitted geography/use and approved dissemination. |
| Human authority | Required named/role authority, current grant scope, approval and revocation state. |
| Budget | Approved cost/collection budget for the requested action when applicable. |
| Handoff / compensation | Valid recipient contract, deduplication, acknowledgement, correction and cancellation procedure. |

Required gate results are `PASS`, `FAIL` or `UNKNOWN`. Any required FAIL/UNKNOWN
produces `HOLD` for that action with reasons and permitted remediation. A
policy-declared inapplicable gate records why it does not apply. `ADMIT` means
the specified action satisfies the referenced policy at the recorded time; it
does not declare a subject guilty or approve force.

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

An outbound envelope binds recipient, cue revision, action admission, approved
projection, idempotency key, release/policy/rights refs and dispatch time. Separate
delivery-attempt records retain failure/retry state. A timeout is unknown delivery,
not success; a retry keeps the same recipient and payload identity or becomes a
new admitted action. The receiver's acknowledgement states accepted/rejected
schema/version and reference. It does not prove a useful operational outcome.

AnalystDisposition records the authenticated reviewer, time, cue revision,
judgment, reasons and supporting evidence. HandoffReceipt records the actual
recipient, admitted projection, delivery/acknowledgement times and correlation
identity. OutcomeEvidence records subsequent observation or adjudication,
attribution, time and uncertainty. These feed new world-state/cue revisions
without retroactively converting an earlier inference into an observed fact.

BuildAndDo integration must use its existing mission/evidence lifecycle through
an approved adapter. Current personal dossiers stay private to their user;
maritime entity history is a separate, rights-controlled domain. The source
PocketBase store and the proposed Sentinel state store are distinct authorities.

## TEVV measurement contract

All metric values and numerical targets at `SM-BL-1.0` are **not measured / to be
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
