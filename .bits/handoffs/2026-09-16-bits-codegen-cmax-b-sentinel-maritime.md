# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-16-bits-codegen-cmax-b-sentinel-maritime.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     docs/sentinel-maritime/blueprint.md, docs/sentinel-maritime/contracts.md, docs/sentinel-maritime/integrity.md, docs/sentinel-maritime/system-plan.json, docs/sentinel-maritime/white-paper.md, docs/sentinel-maritime/implementation-contract.md, docs/sentinel-maritime/work-orders.json
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/sentinel-maritime/blueprint.md; CONSUMES docs/sentinel-maritime/contracts.md; CONSUMES docs/sentinel-maritime/integrity.md; CONSUMES docs/sentinel-maritime/system-plan.json; CONSUMES docs/sentinel-maritime/white-paper.md; CONSUMES docs/sentinel-maritime/implementation-contract.md; CONSUMES docs/sentinel-maritime/work-orders.json
# DAG Node:    none
# Intent:      Request private ownership and evidence for the frozen maritime design while keeping runtime, release, government and controlled-data authority outside the public repository.
# ───────────────────────────────────────────────────────────────

# BITS-CODEGEN to CMAX-B / IDE1 — Sentinel Maritime baseline

Originating dispatch: VCC-BUILDANDDO-UPGRADE-001. Public work: A0 documentation
inside the existing A2 dispatch. Receiving owner: CMAX-B, with IDE1 for backend
contracts and BuildAndDo integration; CMAX-B assigns the appropriate data-rights,
security and government-interface authorities. Receiving dispatch: not supplied.
This note records the handoff request; it does not create a private dispatch,
activate a seat, grant credentials or authorize any external operation.

## Current receiving action — Wave 0 before code

The owner supplied the narrative and master build contract after the 1.0
baseline. The current plan is **SM-BL-1.1**. Extend the existing Sentinel at
https://sentinel.citadel-nexus.com; do not create another maritime application,
auth system, graph, evidence service or Merkle owner. The hostname is the owner's
target, not a verified served-release or health receipt from this session.

Deliverables now include white-paper.md (WP-1.0, seven planned page sections),
implementation-contract.md (SM-EXEC-1.0), and work-orders.json (SM-WO-00 through
SM-WO-12). Every order has the full 23-field contract, dependency and negative
tests, evidence/rollback requirements and a HOLD on unapproved remote effects.
All 55 owner-brief sections are traced. The JSON is not an accepted private
dispatch, executable queue, generated SBOM or completed test report.

CMAX-B must register receiving scope and identify actual Sentinel repository,
service/API/auth/graph/evidence/NNC/SBOM/release owners. IDE1 maps backend and
BuildAndDo interface boundaries. Accept the actual reuse bases, paths and test
commands in SM-WO-00 before code. Unsupported reuse or missing authority leaves
dependent implementation HOLD. Security/rights/isolation start at schemas and
ingest; Wave 11 does not defer these controls until the end.

Required return: the exact report in implementation-contract.md section 16,
including observed/NOT_RUN results, actual source/image/evidence, SBOM delta,
existing-owner Merkle state, runtime health or UNVERIFIED, regression state,
release HOLD/ELIGIBLE, remote-effect receipts and the next single blocker.
The current blocker is the receiving private dispatch with repository and
accountable ownership. This note neither starts Astra nor grants remote effects.

Narrative release is also HOLD. Resolve REQ-01–10 with official document/revision/
item references, confirm dated team/traction facts or retain their explicit
qualifications, and render/check one selected document. The owner describes
one 15-slide 16:9 deck OR one white paper up to 10 pages; no second attachment
is assumed. Source Markdown has not established a final PDF page count.

## Delivered public artifact

`docs/sentinel-maritime/blueprint.md` records the owner's `SM-BL-1.1` product
decisions and a 15-slide claim map. `contracts.md` defines observation/entity/cue,
NNC admission, handoff/outcome and TEVV semantics. `integrity.md` freezes the
commitment domains and proof obligations. `system-plan.json` lists the 33 supplied
component IDs, 12 planes, planned flows and pinned public source evidence.

These artifacts are a design baseline. There is no maritime runtime release,
generated candidate SBOM, computed operational root, numerical benchmark,
government integration or CUI/compliance acceptance attached.

## Evidence from this checkout

The inspected source baseline is the dossier continuation at
`aab43b3ed686b70df7c304d02566f0e93606dfd6`. Each of the 12 source references in the
inventory pins that commit, path and SHA-256. They prove which source bytes were
inspected; the historical test report is explicitly a report, not a new run.

- BuildAndDo uses PocketBase, with bounded missions/workflows, research/evidence
  and private personal dossiers. Native/browser/live acceptance remains pending.
  This does not establish maritime ontology or permission to use personal data.
- `scripts/ci/candidate_manifest.py` fingerprints tracked source and declares
  candidate-only authority. It does not attest an OCI image or deployment.
- `scripts/ci/evidence_epoch.py` has an existing recomputable Merkle format and
  expressly no build/deploy authority. Absent evidence may remain absent.
- `scripts/ci/supply_chain.py` collects dependency/license/advisory evidence; it
  does not supply a complete generated system SBOM.
- The owner-cited `tools/citadel_evidence_epoch.py`, Sentinel/NNC implementation,
  private graphs and actual government/DIU documents were unavailable. Their
  behavior and operating state remain receiving-owner claims to substantiate.

## Receiving task and acceptance table

| Step | Receiving work | Evidence to return through the approved handoff path |
|---|---|---|
| 1 | Register a private Ready/In progress dispatch under the appropriate SRS/authority. Confirm the owner-authored baseline and each component owner. | Receiving dispatch and permitted source/evidence references. No invented signing or admission values. |
| 2 | Locate the actual Sentinel/NNC, graph, state, runtime and release/SBOM sources. Review all REUSE and EXTEND bases. | Exact source/lock/interface references, build/image or managed-service identities, licenses, tests and dated runtime receipts. Reject unsupported reuse; re-scope to BUILD with the owner when needed. |
| 3 | Resolve the existing canonical evidence-epoch tool/version and its relationship to the public BuildAndDo implementation. | Existing serialization/root/proof/admission contract, official recomputation command and test vectors. Use the existing mechanism; do not introduce a second Merkle implementation. |
| 4 | Map the semantic contracts to versioned schemas and actual private services. Define the PocketBase-to-Sentinel mission/evidence adapter. | Reviewed schemas, identity/tenant/purpose authority, ordering/idempotency and correction contracts. Preserve personal dossier isolation. |
| 5 | Build the actual candidate using the receiving pipeline and materialize its package/system SBOM and release graph. | Same-image tests, dependency closure, immutable SOFTWARE/CONTRACT/RUNTIME refs, missing-input/tamper tests, acyclic release manifest and external activation receipt. |
| 6 | Obtain permitted maritime inputs and official evaluation/integration terms. | Source identities/rights, official solicitation/FAQ URLs with revision and item/page, recipient API contracts and sandbox agreement. Product names do not establish integration access. |
| 7 | Implement the maritime specialization and execute the agreed demo/benchmark against that candidate. | Frozen reference corpus, negative controls, numeric results with denominators/confidence intervals, outage/cold-start evidence, replay verdicts and acknowledged handoff or explicitly simulated result. |
| 8 | Assess a later CUI boundary only under its separately approved authority. | Applicable clauses and module/security evidence, approved storage/export/proof separation, training/media/retention controls. No CUI processing or proof publication is authorized by this note. |
| 9 | Promote supported statements into the 15-slide DIU deck. | Claim-by-claim evidence and official requirement references; clear REUSE/EXTEND/BUILD scope, measured versus proposed values and commercial/data assumptions. |

Return a sanitized public evidence index, not private repositories, runtime
configuration, restricted datasets, credentials, internal routes or CUI proof
leaves. A hash or aggregate may itself require release review. The private
evidence store remains the source of truth for restricted receipts.

## Decisions the receiver must resolve

The product boundary is fixed; these are evidence and implementation questions:

1. Which actual source/tool and private authority owns Merkle admission and the
   emitted SBOM standard/version? The cited path is not proof of compatibility.
2. Which versioned operating components substantiate each proposed REUSE/EXTEND
   entry, including the resolver/correlation bases and CUI epoch extension?
3. Which official Deep Blue/DIU documents establish the timing, use cases,
   interface expectations, scoring, format, company facts and controlled-data
   duties in REQ-01–10?
4. Which sources, histories and recipients permit the requested processing,
   retention and disclosure? Which negative/reference population supports recall?
5. Which actual image/runtime, deployment and destination receipts will close
   the gap between public source, private implementation and operating evidence?

## Publication and rollback

The next deck can use the frozen product definition immediately, retaining the
qualification on unverified requirements and reuse claims. External submission
of stronger operating/performance/compliance claims requires their receipts.
The source baseline and public inventory are not a substitute for that evidence.

To change this planning baseline, record an owner-reviewed new version and the
superseded decisions; preserve the original inspection/source references and
governance events. Rolling back these public documents changes no service, schema,
data store, policy, release root or government interface. No private implementation
or activation was attempted by the originating seat.
