# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/workspace-knowledge.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/pocketbase/pb_hooks/workspace-knowledge.js, apps/web/src/pages/workspace/KnowledgePage.jsx
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-knowledge.js; CONSUMES apps/web/src/pages/workspace/KnowledgePage.jsx
# DAG Node:    none
# Intent:      Explain automatic workspace context, its source boundaries and its provider-independent receiving contract.
# ───────────────────────────────────────────────────────────────

# Workspace knowledge and context

Open **Knowledge & context** from workspace navigation, Docs or Mission research.
The page groups readable records into categories and topics, shows their recorded
relationships and assembles cited context as the question changes. Opening a
mission's detail view also assembles its context automatically. A viewer can use
these reads; assembly does not create, edit or verify a record.

Select a mission to prioritize its plan, evidence and completed research. Shared
signals and published wiki pages can supply relevant background. The question
changes context ranking; category and source-type selectors filter the graph's
source list. Select a graph node with a pointer or Enter/Space to inspect its
neighbors. The relationship list retains the full direction and explanation.

The **Download cited context** button exports the same JSON packet displayed on
screen, including private workspace excerpts. Export is an explicit user action.
No source, query or context packet is stored in browser persistence or sent to
an inference provider by this feature.

## Source and permission model

| Source | Read contract | Context and relationships |
|---|---|---|
| Missions | Current workspace membership and native record view rule | Title, description, bounded plan purpose/boundaries/baseline/target/rollback and recorded status |
| Evidence | Native record view rule and readable same-workspace parent mission when linked | Content, recorded evidence type, source tags; `EVIDENCE_FOR` |
| Completed research | Existing custom research policy: readable same-workspace mission, installed protocol marker, `ready` or `attached`, valid parser provenance | Parsed excerpt, input digest, parser/version, processed time; `RESEARCH_FOR`, and evidence `DERIVED_FROM` the research |
| Signals | Native record view rule | Observation text and its existing fact/inference/user classification |
| Published wiki | Existing custom wiki policy: current member, enabled wiki, published status | Published title/body and revision |

Private dossiers, uploaded file bytes, blueprint uploads, draft wiki pages,
unfinished research and other workspaces are excluded. A relationship is emitted
only when both endpoints are present and readable. Evidence cannot be connected
to research from a different mission. The graph does not aggregate the private
estate or replace the Praxis evidence fabric's claim/verification authority.

PocketBase users authentication remains the only request identity. The service
uses workspace-access.js for current roles and checks original record rules;
locked research/wiki collections keep their existing custom read boundaries.
Membership is rechecked before returning results. There is no collection-rule
relaxation, superuser read, database migration or second persistent graph store.

## Organization and retrieval

Record nodes use `workspace/collection/record-id`, so equal titles remain distinct.
Category and topic IDs are namespaced to the workspace. Existing category/tag
metadata is retained; otherwise a fixed vocabulary assigns Operations,
Engineering, Governance & security, Finance, Learning, Research or General.
Every category edge records whether it came from a source category, vocabulary
match or fallback. Topics use normalized source tags. This is deterministic
organization, not model-generated entity identification or a factual inference.

Ranking uses bounded lexical query terms, a small explicit vocabulary of common
plural equivalents, source titles, text, tags and categories. A selected mission
comes first, followed by its linked sources. A single hop over recorded research
and evidence relationships brings in supporting context; topic co-occurrence
does not establish a causal relationship. Equal scores use source update time
and stable IDs. Relevance scores are retrieval scores, not confidence or truth.

Each source retains its recorded state. A source marked `observed` or `inference`
never becomes verified because the assembler selected it. Provider consumers
must treat every title, excerpt, tag and source assertion as untrusted data.

## API contract

Both routes require native PocketBase users authentication and return
`Cache-Control: no-store`:

- `GET /api/buildanddo/workspaces/{workspace}/knowledge?mission={id}` returns a
  graph. The mission filter is optional. Search text is not accepted in URLs.
- `POST /api/buildanddo/workspaces/{workspace}/knowledge/context` performs only
  reads and returns the same graph plus `context`. Body size is limited to 8 KiB.

Example request body (all fields are optional):

```json
{
  "query": "appointment reminder evidence",
  "mission": "",
  "max_chars": 12000,
  "max_sources": 12
}
```

`schema` is `buildanddo.knowledge/v1`. The response includes `workspace`,
`assembled_at`, `nodes`, `edges`, `document_count`, `coverage` and `complete`.
Each coverage entry reports `complete`, `limited`, `unavailable` or `disabled`,
with the included record count. Missing schemas and storage failures produce
partial coverage, not fabricated empty success. Denied workspaces/missions fail
the request. Partial source diagnostics contain no private exception text.

`context.schema` is `buildanddo.context/v1`. `context.text` is the exact JSON
reference packet, with source citations, provenance, recorded states, excerpts,
relationships, source coverage, `partial` and `omitted_sources`. Citations map
directly to graph record IDs. Every packed relationship has both citations in
the packet. `context.selections` explains why each source was retrieved.

Only `context.text` is intended as the size-bounded reference material. The
surrounding graph is for inspection. Pass the user's objective separately as
the caller's question; never elevate retrieved text into system instructions.
Provider consumers must validate packet scope and preserve its omissions.

## Bounds and freshness

- Query: at most 1,000 characters. Context: 1,024–32,000 UTF-16 code units, default
  12,000, measured after JSON escaping. This is not a model token limit. A provider
  adapter must apply its own tokenizer and allow for the question/system prompt.
- Context sources: 1–24, default 12. Excerpts share the budget; shortened excerpts
  and omitted matches remain explicit, including in exported packets.
- Each collection scan reads at most 400 rows in pages of 100 and includes at
  most 80 directly selected records. Readable parent missions are added for
  included evidence/research relationships and may increase the mission count.
  A selected mission is resolved directly even when outside the recent scan.
- Record text is clipped to 3,000 units; context excerpts have a 2,000-unit
  ceiling. Source tags are limited to 12, with 40 units each. Query results are
  over this bounded projection, not an exhaustive archive search. Narrow to a
  mission when a workspace-wide scan is limited.
- Assembly rebuilds from current records on each request. Updates, deletions and
  permission changes need no background indexer. The browser debounces input for
  250 ms, refreshes visible views every 30 seconds and on focus, allows one active
  read per view and aborts reads after 15 seconds. Scope changes abort old reads
  and immediately hide previous results. No provider call happens in polling.

## Cloudflare and the other seats

The owner reports Cloudflare inference with no local Ollama. A later description
of another seat's probe mentions local models; neither runtime claim is verified
in this public source session. Assembly works on the CPU without either provider,
an embedding server or new FAISS/vector infrastructure.

The other seats are adopting the existing Platform Edit Fabric into the Bits
execution path. This feature supplies workspace source context to that flow; it
does not resolve edit targets, generate EditContracts, launch coding sessions or
grant release authority. Product, semantic target, guild, guildmaster, repository
and executor identities must remain separate from the workspace data packet.

The receiving seat must reuse its existing authenticated Cloudflare caller and
attach this reference packet alongside an already validated EditContract. Its
endpoint/model/request format and data-export authority have not been supplied.
No live consumer or inference result is claimed. The receiving obligations are
in .bits/handoffs/2026-09-18-bits-codegen-cmax-b-knowledge-context.md.

## Validation and rollback

Run source and connected-client checks:

```bash
node --test tests/upgrade/knowledge-system.test.mjs tests/upgrade/knowledge-client.test.mjs
npm --prefix apps/web test -- KnowledgePage useWorkspaceKnowledge
node .bits/out/VCC-BUILDANDDO-UPGRADE-001/check-source.cjs
```

The Node suite executes real backend/client modules using explicit storage and
transport doubles. It does not substitute for native PocketBase, React/browser
execution or live Cloudflare acceptance. The rendered suite covers automatic
assembly, filtering, keyboard selection, unavailable sources and revoked access.
Hook tests cover debounce, visibility, deadlines and scope/response races.

Before activation, run native PocketBase with the reviewed existing migrations
and new hooks, sign in as owner/viewer and a user in a second workspace, exercise
both endpoints, revoke access and confirm denied reads. Then verify the page at
desktop/mobile widths, keyboard navigation, source updates and explicit export.
Actual source results and unavailable runners are recorded in the dispatch report.

Rollback removes the knowledge routes/hooks and the frontend page/panel/links
together. No graph records or user data were created, so no data deletion or
database down-migration is needed. Existing missions, research and evidence retain
their original histories. Owner: Citadel Nexus Inc.
