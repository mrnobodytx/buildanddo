# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/sentinel-maritime/white-paper.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docs/sentinel-maritime/blueprint.md, docs/sentinel-maritime/contracts.md, docs/sentinel-maritime/integrity.md, docs/sentinel-maritime/system-plan.json
# EnumType:    Doc
# EnumEdges:   EXTENDS docs/sentinel-maritime/blueprint.md; CONSUMES docs/sentinel-maritime/contracts.md; CONSUMES docs/sentinel-maritime/integrity.md; CONSUMES docs/sentinel-maritime/system-plan.json
# DAG Node:    none
# Intent:      Provide one evidence-qualified maritime solution narrative that can support either submission format without inventing operating or commercial results.
# ───────────────────────────────────────────────────────────────

# Sentinel Maritime Intelligence Engine

**Citadel Nexus Inc. | Deep Blue Observer | White-paper source WP-1.0**

Architecture baseline: **SM-BL-1.1**, 2026-09-16. Internal review / fallback
submission source; seven planned page sections. Pagination has not been rendered.
The owner's brief describes one solution document: either a 16:9 deck of at most
15 slides or a white paper of at most 10 pages. Official solicitation, FAQ and
portal rules remain unverified (REQ-08). Select one format; the deck must contain
its own evidence and qualifications. Do not rely on this paper as an unapproved
second attachment. The evidence and company-fact registers are in system-plan.json.

## 1. Executive summary and mission problem

Sentinel Maritime is the proposed maritime extension of Citadel's existing
Sentinel product: a software-based, supplier-neutral intelligence synthesis and
cue-governance layer. It is designed to combine permitted open, commercial and,
in later authorized phases, government observations into a persistent,
evidence-backed world model. Composite detectors identify changes and
cross-source correlations. NNC evaluates whether a candidate supports a specific
operational action; admitted ThreatCues carry evidence, uncertainty, policy and
release context into existing government systems.

The mission problem is the gap between receiving observations and delivering
an intelligible, permitted cue. A vessel may have a routine AIS history, a later
coverage gap, an ambiguous image association and conflicting identifiers.
Analysts need to understand what changed, what supports that interpretation,
what disagrees, and which collection or review could resolve the uncertainty.
Retaining that history also permits review after conditions or software change.

The owner-supplied Deep Blue brief emphasizes multi-source fusion, suspicious
activity tracking, pattern correlation, lower-noise prioritization and integration
with existing platforms. These are requirement interpretations pending official
citations (REQ-01–04). The proposed deliverable is software and integration,
using existing observation suppliers and watch-floor interfaces. It includes
neither new sensors nor autonomous targeting or a conclusion of criminal guilt.

| Capability | Current evidence | Deep Blue specialization |
|---|---|---|
| Persistent world model | Owner-reported Sentinel foundation; private source/runtime unverified | Maritime ontology and versioned vessel state |
| Evidence and provenance | Public BuildAndDo source inspected; native/live acceptance pending | Maritime source lineage and cue proof |
| Graph and temporal state | Owner-reported private graph services; unverified here | Vessel, route, event and contradiction relations |
| NNC governance | Owner-reported private capability; owner/API/runtime discovery required | Maritime action-specific policy pack |
| Mission/evidence workflow | Public mission, research and workflow source inspected | Analyst disposition and acknowledged handoff |
| Maritime adapters and features | Planned | Permitted feeds, entity resolution and detectors |
| AIS/SAR/EO/RF synthesis | Design supports it; no validated fusion result | Cross-source association and mission evaluation |
| Government-system adapters | No existing integration claimed | Contracted partner integration |
| CUI environment | No accepted boundary claimed | Separately authorized compliance transition |

The twelve public source fingerprints identify inspected bytes, not a running
maritime system. The owner reports an existing Sentinel at
https://sentinel.citadel-nexus.com; served revision, service ownership and maritime
behavior still need receiving-seat evidence. This proposal extends that product.

## 2. Operational scenario and analyst value

Consider a representative, illustrative mission in an authorized area of interest.
A vessel enters the area with apparently routine AIS behavior. AIS then stops
or its identifier changes. A permitted SAR or EO observation suggests a vessel
near the projected route; RF or another commercial source may add corroboration.
This is a scenario specification, not a report of a detected incident.

```text
Permitted observations -> normalization and rights -> independent evidence
    -> reversible entity-association claims -> versioned vessel state
    -> behavior and correlation features -> CandidateCue
    -> NNC: ADMIT / HOLD / DENY for a named action and recipient
    -> ThreatCue and proof -> analyst review -> permitted handoff
    -> delivery receipt and outcome -> updated evidence-backed state
```

The system preserves each source observation separately. The resolver proposes
that the image and AIS track describe the same vessel with stated uncertainty;
it does not destructively merge identities. Timing error, sparse coverage and
plausible alternative vessels remain visible. A route deviation or rendezvous
hypothesis becomes a candidate for attention. AIS darkness alone is insufficient
to establish either intent or a crime. Two resellers of the same upstream feed
do not provide independent corroboration.

The analyst receives the entity and track, triggering behavior, supporting and
contradicting evidence, confidence with calibration status, missing conditions,
policy/release identity, recommended collection and handoff status. Recommendations
express information needs; they do not task assets. Narcotics smuggling, human
smuggling and piracy are owner-supplied evaluation use cases (REQ-03); mission
experts must supply lawful scenarios and adjudication criteria.

The following contrast illustrates the proposed noise controls; it is not a
measured false-positive reduction:

| Loitering context | Routine example | Review-worthy example |
|---|---|---|
| Known anchorage and common historical behavior | Yes | No / unresolved |
| Dark interval or identity conflict | Neither | Both observed as separate evidence |
| Unusual rendezvous | No | Candidate association, uncertainty retained |
| Independent SAR corroboration | Unneeded for this illustrative routine case | Present, subject to timing/association validation |
| Detection triage | SUPPRESS or low priority; retain state | High-priority CandidateCue |
| Operational admission | No export implied | NNC may still HOLD or DENY |

The technical proposition is to reduce redundant or contextually routine alerts
before analyst interruption while retaining evidence of suppression for audit.
Its effectiveness must be measured against an agreed reference workflow and
negative population, including events the system did not surface.

## 3. Architecture, ThreatCue and deterministic admission

The integration chain is adapters, normalization and data-rights checks, existing
event transport, persistent world model, detection/correlation, NNC, proof and
government gateway. The world model separates observations, claims, entity state,
temporal snapshots and relationships. OBSERVED, INFERRED, PREDICTED, STALE and
CONTRADICTED states remain distinguishable. Graph relationships retain provenance,
time and uncertainty; temporal order alone does not prove causation.

Detection combines inspectable deterministic behavior features, temporal/route
features, graph context, statistical anomalies, optional ML and external
intelligence. A model can propose a feature or candidate; it cannot issue an
authoritative NNC decision. Replacing a model therefore changes inference and
its evaluation obligations without transferring authority to that model.

The simplified outward contract below is a field guide, not an implemented API:

```text
ThreatCue
  schema_version, cue_id, revision, tenant_id, mission_id
  subject_entity + state_revision, related_entities[]
  cue_type, priority, confidence + calibration, uncertainty
  first_seen, last_updated, temporal_context
  behavior_features[], supporting_evidence[], contradicting_evidence[]
  explanation, recommended_collection[]
  admission_decision_ref, admission_verdict = ADMIT
  requested_action, recipient, purpose, authority_expiry
  policy_version, release_root, data_rights_ref, evidence_epoch_ref
  cue_proof_ref, analyst_disposition_ref?, handoff_receipt_ref?
```

Every reference resolves an immutable revision inside the authorized tenant,
mission and disclosure boundary. Proof, disposition, receipt and final-epoch
links are joined in the outward view; they are not backfilled into their own
hashed inputs. CandidateCue is the pre-admission object.
AdmissionDecision records ADMIT, HOLD or DENY. SUPPRESS is noise triage and
ESCALATE requests named human review; neither is an alternative grant. A held
candidate may be visible to an authorized reviewer without being eligible for
external handoff. This resolves the brief's combined five-state UI vocabulary
without allowing a UI status or priority score to authorize disclosure.

NNC evaluates provenance, freshness, independent corroboration, uncertainty,
rights, disclosure, mission policy, jurisdiction, current authority and
revocability/compensation. Missing required evidence creates HOLD; an explicit
policy prohibition creates DENY. ADMIT is bound to one cue revision, action,
audience and time. Handoff rechecks mutable rights and authority; analyst review
cannot convert HOLD into ADMIT. The implementation must reuse the existing NNC
owner and authentication system after discovery confirms their contracts.

## 4. Differentiation and operational assurance

Observation providers supply the measurements; maritime analytics products
provide detection or risk interpretation; government common operating pictures
support operational visualization. Sentinel's proposed role is to connect
persistent evidence state, deterministic cue admission, software lineage and
operational handoff in one architecture. These categories can overlap. The
proposal makes no unsupported assertion that competitors lack provenance or
explainability, and it requires no new government watch-floor UI.

**Reproducibility and operational assurance** support that operational value.
A CueProof binds source references, contradictory evidence, the world/feature
snapshot, captured inference, software release and image-derived SBOM reference,
policy, rights and NNC decision. Later analyst dispositions, handoff receipts and
outcomes extend that history as separately committed records. An initial proof
cannot include a future receipt or the final epoch root containing that proof.

The existing integrity owner must maintain separate software-release,
evidence-epoch and data-rights commitments. Public, commercial and future CUI
evidence have separate proof/export boundaries. The final release references
the software, contract and runtime artifacts; an observed activation receipt
references that completed release from outside it. No second Merkle mechanism
or signing authority is proposed.

This lets a reviewer ask which evidence, code, policy and authority generated a
cue, where it was sent, and what happened afterward. Recomputed hashes establish
integrity of the supplied inputs; they do not establish truth, lawful disclosure,
detector accuracy or a deployed service. BuildAndDo's inspected epoch tooling is
evidence-only and its candidate manifest fingerprints source, so private release
admission and image/runtime provenance remain explicit delivery obligations.

Historical replay freezes inputs, source order, evaluation clock, policy,
rights/authority snapshots and captured inference. Deterministic admission must
reproduce its verdict and reasons. Stochastic model regeneration is measured
separately. Divergence causes HOLD of dependent live action; an old replayed ADMIT
never authorizes a new export. Reviewed feedback can improve features through
offline evaluation and release governance, without silently rewriting live policy.

## 5. Demonstration and measurable evaluation

The owner describes approximately 48 hours of real-time operation before a
Phase 2 demonstration; official timing and permitted inputs remain pending
(REQ-02). The following is a proposed rehearsal protocol. Authorization,
licenses, recipient agreement and release/security prerequisites precede T0.

| Window | Activity | Exit evidence |
|---|---|---|
| T0–2 hours | Configure AOR, feeds, rights and policy | Recorded source identities, rights checks, clock/coverage baseline and policy/release references; missing required inputs block dependent work |
| 2–12 hours | Build entity, track and route baseline | Persisted state, uncertain associations, coverage and cold-start report |
| 12–24 hours | Detect changes and correlate candidates | Features and supporting/contradicting evidence; seeded negatives labeled separately from live activity |
| 24–36 hours | NNC, review and suppression/escalation checks | Gate reasons, disposition records, denial/bypass tests and admitted-cue proofs |
| 36–48 hours | Approved handoff, replay and review | Recipient or explicitly simulated receipts, replay comparisons, costs and denominator-based results |

Freeze geography, source set, reference labels, episode deduplication, matching
windows, target population, policy, software image and numeric targets before
evaluation. Use independent mission-domain adjudication, including uncued events.
Compare against the existing analyst workflow. Report outage intervals, censored
sessions, ambiguous labels, sample sizes and uncertainty rather than dropping them.

| Metric | Meaning / denominator | Evidence status |
|---|---|---|
| M-01 Ingest-to-state latency | State commit minus ingest time; source lag separately | UNMEASURED |
| M-02 Event-to-cue latency | Qualifying event to candidate and admitted surface, separately | UNMEASURED |
| M-03 Entity resolution accuracy | Correct / independently evaluated associations; false merges/splits disclosed | UNMEASURED |
| M-04 Track continuity | Correctly associated covered duration / evaluable reference duration | UNMEASURED |
| M-05 Precision | Relevant surfaced episodes / adjudicated surfaced episodes | UNMEASURED |
| M-06 Recall | Matched relevant episodes / all reference relevant episodes, including uncued | UNMEASURED |
| M-07 False-positive rate and burden | FP / (FP + TN) with defined negatives; false cues per entity-hour also | UNMEASURED |
| M-08 Provenance completeness | Complete, resolvable cue lineage / evaluated surfaced revisions | UNMEASURED |
| M-09 Contradiction visibility | Retained and visible / known test conflicts | UNMEASURED |
| M-10 Deterministic verdict replay | Matching verdicts and gate reasons / replayed decisions | UNMEASURED |
| M-11 Time-to-understand | Open to correct comprehension, with task accuracy | UNMEASURED |
| M-12 Time-to-disposition | Open to judgment, with correctness and censoring | UNMEASURED |
| M-13 Time-to-handoff | Eligible projection to receiving acknowledgement; failures counted | UNMEASURED |
| M-14 Cost / monitored scope | Attributed compute, data, storage, egress and support / covered area-hours and entity-hours | UNMEASURED |
| M-15 Analyst usefulness | Useful / reviewed cues under an agreed rubric | UNMEASURED |

Each future result is labeled **CURRENT — measured**, **DEMO TARGET — to validate**
or **UNMEASURED — not yet claimed**. No measured maritime numbers or numeric
performance targets are supplied here. A zero denominator or missing labels means
not evaluable. Demonstration invariants require a proof for every admitted cue
and a durable attempt receipt for every handoff; these are acceptance criteria,
not observed 100% results. Successful delivery also requires acknowledged outcome
semantics, tested rollback, replay and the same candidate's security/release evidence.

## 6. Integration, deployment and security transition

The gateway is planned to offer REST/JSON, streaming events, geospatial output,
ThreatCue and accessible evidence references, historical query and subscriptions.
WGS84 / EPSG:4326, GeoJSON longitude-latitude ordering and UTC form the proposed
geospatial/time contract. Bounded queries, cursors, duplicate handling, backpressure,
schema negotiation and corrections are part of recipient acceptance.

Sextant, SPAR, MAGE and CSII are intended environments named in the owner brief
(REQ-05), not verified integrations. Generic adapters can be tested against an
agreed simulator before a receiving authority supplies its private interface.
A timeout remains unknown delivery; retries keep the same admitted payload and
idempotency identity. Every attempt has a receipt. Transport acknowledgement,
recipient acceptance and useful operational outcome are recorded separately.

Sentinel Maritime remains a mission domain inside the existing Sentinel product.
The existing UI, authentication, event/graph infrastructure and release pipeline
must be identified before implementation. Rollout progresses through OFF, LOCAL,
TEST, SHADOW, DEMO, PILOT and PRODUCTION with recorded gates. Shadow mode can
evaluate authorized live observations while external handoff stays disabled;
moving to a later state requires explicit receiving-owner authority.

Tenant and mission scope applies to storage, graph traversal, caches, replay,
subscriptions and exports. Viewer, analyst, reviewer, mission administrator,
integration service, operator, auditor and security roles have separate
permissions. Changing policy, approving policy and releasing a cue are distinct
actions. Logs and metric tags exclude raw source content and identifying evidence;
restricted correlation references belong only in authorized telemetry stores.

Phase 1 uses permitted public/commercial data. Before government-provisioned
CUI is ingested, the responsible authority must accept a separate controlled
processing boundary: isolated stores/graphs/artifacts, identity and access audit,
restricted logging/export, retention/sanitization and approved cryptographic
modules in their validated configurations. Hashes and ordinary encryption do
not establish CUI compliance or safe public disclosure.

The owner cites NIST SP 800-171, FIPS-validated encryption, DFARS, CMMC, CDSE
training, media restrictions and sanitization duties (REQ-06). Applicable clause
numbers, revisions, contractual scope and assessment evidence remain to be
confirmed. This paper claims no certification, CUI authorization or completed
controlled environment. A public-safe derivative requires an authorized release
decision; protected leaves, proofs and metadata do not leave automatically.

## 7. Commercial model, team and transition

Government or customer-provided data is the first commercial mode. The customer
maintains its source licenses and provides permitted feeds; Citadel prices the
software, deployment, integration and support scope separately. In the second
mode, Citadel offers an optional commercial-data bundle with explicit pass-through
or bundled charges and source-level rights, retention, derivative-use and
redistribution limits. Vendor replaceability is a design requirement to validate
with adapter conformance and comparable source coverage, not a claim of existing
contracts with every vendor.

Proposed pricing consists of a **Sentinel platform license + deployment tier +
optional commercial data + integration package + support/SLA**. Quotes must state
included users/tenants, monitored geography, source cadence/volume, retention,
compute, egress, source minimums and integration acceptance. No dollar amounts or
unverified unit costs are asserted. The design permits shared deployments and
customer-provided feeds so added users need not automatically buy another
platform or proprietary data stack; license and capacity terms still govern cost.

| Team / sustainment statement | Evidence and qualification |
|---|---|
| Dmitry Richard — architecture, implementation and deterministic orchestration | Owner-supplied role; dated biography and availability confirmation required |
| Dinah Adams — operations and commercialization | Owner-supplied role; role/availability confirmation required |
| Two employees | Owner-reported headcount; effective date and company confirmation pending |
| Existing Sentinel, BuildAndDo and Citadel infrastructure | Owner-reported operating estate; public BuildAndDo source is inspected, current deployment/health/capacity evidence remains pending |
| Commercial infrastructure and program support | Planned sustainment inputs; suppliers, response coverage and costs require agreement |
| Teaming needs | Maritime SME, cleared engineering where required, recipient integration expertise and operational support coverage |

Maritime mission-domain validation is the primary domain gap. The transition
plan pairs the existing engineering foundation with named mission experts and
recipient interface owners, then validates one complete cue chain before broadening
sources or mission areas. A two-person team needs explicit support coverage,
backup ownership, incident response, vulnerability maintenance and training/runbook
commitments; they cannot be inferred from the architecture.

Verified customer count, ARR, paid pilots and paid subscriptions have **not been
supplied for this brief**. No value, including zero, is implied. Insert only
dated, owner-approved aggregate evidence before external submission (REQ-10 and
company-fact register). BuildAndDo users, demonstrations and public source are
not automatically paying customers or revenue. Prospective adjacent markets
include ports, energy, shipping, critical infrastructure, insurance, maritime
logistics and private emergency/security operations; these are opportunities,
not claimed traction.

The proposed funded transition is discovery and confirmed reuse, versioned
contracts, one permitted live observation-to-cue path, demonstrated review/handoff
and replay, then bounded pilot acceptance and sustainment. Its execution contract
is implementation-contract.md and work-orders.json. External submission remains
HOLD until official format/requirement references, company facts, permitted
claims and rendered-document acceptance are resolved.
