# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-18-bits-codegen-cmax-b-policy-intelligence.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     docs/policy-intelligence.md, apps/research/policy/pipeline.py, apps/web/src/lib/policyIntelligence.js, .bits/handoffs/2026-09-16-bits-codegen-cmax-b-sentinel-maritime.md
# EnumType:    Adapter
# EnumEdges:   CONSUMES docs/policy-intelligence.md; CONSUMES apps/research/policy/pipeline.py; CONSUMES apps/web/src/lib/policyIntelligence.js; EXTENDS .bits/handoffs/2026-09-16-bits-codegen-cmax-b-sentinel-maritime.md
# DAG Node:    none
# Intent:      Hand the owner-adopted policy rail and tested public domain contract to actual Sentinel owners without inventing private runtime bindings or activation.
# ───────────────────────────────────────────────────────────────

# BITS-CODEGEN to CMAX-B / IDE1 — Policy Intelligence

Originating dispatch: **VCC-BUILDANDDO-UPGRADE-001**.
Receiving private dispatch: **not supplied**.
CMAX-B owns receiving discovery/platform integration; IDE1 coordinates backend,
authentication and BuildAndDo integration. The owner requests this rail alongside
existing work. This file records a handoff request, not a private dispatch,
launched seat, release or external message.

**Blocking input:** actual Sentinel repository/ref, service/UI paths, accountable
owners and Ready/In progress receiving dispatch. The originating session asked
for the source location while completing the public adapter. No secondary
repository is attached. The prior Maritime handoff records the same boundary;
it does not establish that a Sentinel API or private graph was inspected.

The adopted destination is `sentinel.citadel-nexus.com/policy`, with an engine
intended under `services/policy_intelligence/`. These are target boundaries,
not a deployed route or discovered file path. Reuse the actual Sentinel shell,
authentication, broker, graph, vector index, evidence owner and provider clients.

## Reusable public work

- `apps/research/policy/contracts.py`: neutral events, typed quoted relations,
  official-domain admission and bounded tenant watches.
- `apps/research/policy/pipeline.py`: research normalization, existing Processor
  collection seam, capture lineage/conflicts, graph projections, deterministic
  candidates and a rolling 24-hour brief.
- `python -m apps.research.policy`: offline retained-source/demo compilation.
- `/app/policy`: BuildAndDo import/search/review/watch/brief/export consumer.
  Explicit proposals reuse the native research command, current membership and
  durable content-derived retry keys. Demo mode cannot write.
- `docs/policy-intelligence.md`: exact interchange and limits.

The pack is not an authenticated bus envelope. Its hashes detect changed bytes;
they do not authenticate source, importer, tenant, interpretation or reviewer.
Bind tenant and capture time from authenticated execution scope, never from
submitted documents, model output or arbitrary client fields.

## Receiving task table

| Order | Work | Required acceptance evidence |
|---|---|---|
| PI-00 | Register authority; locate Sentinel UI/backend, source adapters, NATS schema/ACLs, NXC, DKG, search, evidence and telemetry owners. | Actual repository/ref/path map, dispatch and baseline tests. Dependent implementation remains blocked without this. |
| PI-01 | Bind the public contract into the approved private engine. Reuse existing Firecrawl/search and structured official-source adapters. | Installed-version contract tests and sanitized source receipt; no duplicated provider/auth infrastructure. |
| PI-02 | Register Congressional action/hearing/committee, appropriations and executive-policy feeds with versions, rights, cadence, retry and freshness budgets. Use the existing scheduler for cursors/conditional retrieval/backfill. | Actual endpoints/identifiers and successful fetch, unchanged fetch, correction, outage and delayed-source cases. A domain allowlist alone is insufficient. |
| PI-03 | Map observations to the existing canonical envelope and JetStream subjects under mTLS and per-tenant ACLs; use the current durable inbox/outbox. Agree subjects with its owner. | Source/event hashes and duplicate, redelivery, ordering, crash-recovery and foreign-tenant denial tests. No public-mirror runtime emitter. |
| PI-04 | Feed admitted records through NXC and the existing DKG/FTS/FAISS owners; preserve conflicting versions and tenant/purpose filters. | Source-to-node/edge/index receipts, corrections with both predecessors, revoked access and cross-tenant search negatives. Public projections are not installed indexes. |
| PI-05 | Verify source authenticity and semantics before publication eligibility. Preserve attribution, analysis, uncertainty and counterevidence separately. | Original receipt, exact quotes, parser version, current official status and reviewer/procedure; negative stale/conflict/uncited-analysis cases. Models/hashes cannot mint VERIFIED. |
| PI-06 | Mount `/policy` in Sentinel with Feed, Legislation, Hearings, Committees, Appropriations, Executive Policy, Stakeholders, Watchlists, Alerts, Daily Brief and Evidence/Sources. | Same-build permission, stale/private-state cleanup, source/history, empty/outage, keyboard/mobile and browser tests. Public `/app/policy` is a separate consumer. |
| PI-07 | Connect watches/briefs to existing delivery controls and tenant-scoped persistent bookmarking/sharing. Use approved email/notification transport and recipient consent. | Durable delivery deduplication, opt-out/revocation, review, failed/uncertain delivery recovery and actual receipts. Public candidates start `review_required`/`not_connected`. |
| PI-08 | Materialize eligible signals through existing BuildAndDo signal/mission authority. Preserve object mappings and candidate identity; separately authorize any automatic proposal producer. | Event → signal → proposed review mission → reviewed evidence → independently verified outcome; duplicate/stale/revoked-producer and denied-approval cases. Public proposals currently require an explicit member action. |
| PI-09 | Add bounded source/category/state/outcome counters, age and failure telemetry to existing PostHog/Datadog. Project approved public demo status through existing CSCC ownership. | Sanitized actual telemetry/readback and failure tests. No raw documents, people, recipients or credentials; no new runtime call to the reserved notify webhook. |
| PI-10 | Run a small-business regulatory scenario on an approved actual public source with frozen acceptance conditions; keep synthetic regression separate. | Source/index/graph/query/candidate/review/delivery receipts, mission/evidence/outcome lineage, measured latency/limits and rollback readback. Product tests do not establish procurement acceptance. |

Observation identity commits to content; repeated capture times/research receipt
IDs do not change it. Candidate identity additionally commits to tenant and full
watch configuration. Retain all actual capture receipts in the existing evidence
owner even when the projection deduplicates unchanged content. Use the current
transactional boundary for exactly-once business effects; JetStream delivery
alone does not provide that guarantee. Fence changed bindings, membership and
cancelled work before completion or publication.

`supersedes` means a newer capture of the same document, not legal repeal.
Bills, amendments and legislative/legal status require official structured
records and their own quoted evidence. Public statement tracking requires
attribution and dates, not an inferred private political profile.

## Verification and synthesis boundary

Retain the fetched artifact digest and derived excerpt digest in the existing
private evidence format. Research `input_sha256` for a URL hashes the submitted
URL string; `excerpt_sha256` hashes retained text. Neither is an original
PDF/HTML digest. Preserve truncation, missing diagrams/transcripts, extraction
failures and new revisions rather than silently replacing old receipts.

Existing inference may perform bounded synthesis after scoped retrieval.
Document content remains user input. Require citation spans, ANALYZED state
and unresolved contradictions; no document-selected credentials/endpoints,
arbitrary tools, influence recommendations or verification values. Neutrality
acceptance also checks selective omission, not just absence of ranking fields.

## Return and rollback

Return sanitized source/ref mapping and actual pass/fail/not-run evidence for
PI-00–PI-10, with blockers, source/schema identities, timestamped runtime receipts
and the existing reviewer's decision. Public tests do not establish private
integration, information accuracy, legal applicability or federal compliance.

The receiving service owner controls activation/rollback. Disable policy
subscription/delivery through its existing controls, fence in-flight work and
preserve source corrections, proposals and reviewed evidence. This originating
session used no private launcher, secret, certificate, bus connection or email.
