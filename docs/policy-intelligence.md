# ─── CGRF Header ───────────────────────────────────────────────
# File:        docs/policy-intelligence.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     apps/research/policy/contracts.py, apps/research/policy/pipeline.py, apps/research/policy/__main__.py, apps/web/src/lib/policyIntelligence.js, apps/web/src/pages/workspace/PolicyPage.jsx, docs/mission-research.md
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/research/policy/contracts.py; CONSUMES apps/research/policy/pipeline.py; CONSUMES apps/research/policy/__main__.py; CONSUMES apps/web/src/lib/policyIntelligence.js; CONSUMES apps/web/src/pages/workspace/PolicyPage.jsx; CONSUMES docs/mission-research.md
# DAG Node:    none
# Intent:      Describe the working public policy pack and review flow while separating source integrity, source verification and private Sentinel activation.
# ───────────────────────────────────────────────────────────────

# Policy intelligence

The public source implements a portable policy domain pack inside the existing
research module and a BuildAndDo consumer at **`/app/policy`**. It normalizes
retained research excerpts, preserves document revisions, projects evidence-linked
relationships, matches tenant watch rules and prepares briefs and source-review
mission proposals. The small-business walkthrough is explicitly synthetic.

The requested Sentinel destination is **`sentinel.citadel-nexus.com/policy`**.
That application's source and its NXC, NATS, DKG, FTS/FAISS and delivery adapters
are not attached to this checkout. This change does not mount that route,
activate a feed, schedule a crawl, send email or create a second private service.
The receiving contract is
`.bits/handoffs/2026-09-18-bits-codegen-cmax-b-policy-intelligence.md`.
The receiving engine's intended location is `services/policy_intelligence/`;
its actual repository path and owners must be established there.

The owner's CENTCOM example supplies product intent. Its RFQ/SOW and status were
not retrieved during this implementation. The code makes no bid, equivalence,
deadline or government-acceptance claim. It is separate from the earlier
SockPuppet notice.

## Use the BuildAndDo consumer

1. Sign in, choose a workspace and open **Policy intelligence**. Choose
   **Explore small-business demo** for a local walkthrough, or import
   `policy.json` compiled for the active workspace ID.
2. Review the feed and the Legislation, Hearings, Committees, Appropriations,
   Executive Policy and Stakeholders views. Search covers the imported titles,
   excerpts and entity labels. Mission-area filters narrow that same pack.
   It is not a query of a connected global Sentinel index.
3. **Include archived captures** exposes earlier document versions.
   **Evidence and relationships** shows exact quoted edges and fingerprints.
   Concurrent conflicting captures remain unresolved. A later capture
   supersedes a snapshot; this does not imply repeal of legislation.
4. **Watchlists** combines a mission area, literal keywords, optional entity
   filters and references to business/system objects whose applicability should
   be reviewed. Keywords use OR within their list, entity IDs use OR within
   their list, and populated filter groups combine with AND.
5. **Alerts** shows candidates and exact match reasons. **Daily Brief** groups
   current matches from daily watches captured in the preceding 24 hours,
   relative to the pack timestamp. Neither view sends a notification.
6. Export a review definition or explicitly **Propose source-review mission**.
   A current writer can save a `proposed` mission through the existing native
   research command. Recover an uncertain proposal before starting another.
7. Use the **Challenge Desk** to finish the plan, obtain required approval,
   record actual evidence and follow the existing verification lifecycle.
   Importing, matching and proposing never create evidence or mint `VERIFIED`.

Imported material, bookmarks and watch edits are held in page memory. Account,
workspace and demonstration-mode changes discard that state. Export the pack
to retain watch edits or share through an approved channel. Bookmarks are
temporary; no bookmark/share database, email transport or background polling
is added. Demo packets cannot write missions. PocketBase rechecks current
membership for every proposal, including replay after revocation.

The proposal retry key derives from the candidate ID, which commits to the
tenant, full watch configuration and observation content. Reimporting the same
candidate, reloading, or recapturing unchanged content recovers the original
proposal for that account/workspace. Changed watch scope or source content
creates a distinct candidate. Capture times and research receipt IDs do not
change content identity; timestamps remain in source exports.

## Compile a portable pack

No dependency was added. The compiler reuses the mission-suite strict JSON
reader, research contracts, typed errors and configured research Processor.
Neither CLI command makes a network call.

```bash
python -m apps.research.policy demo --output /tmp/policy-demo-review
python -m apps.research.policy compile --input /tmp/policy-input.json --output /tmp/policy-research-review
```

The output must be a new directory:

| Artifact | Meaning |
|---|---|
| `policy.json` | Canonical `citadel.policy.v1` tenant pack for import |
| `projection.json` | Derived graph, current/history links, conflicts, candidates and brief groups |
| `brief.txt` | Plain-text brief candidate with source links and fingerprints |
| `manifest.json` | Exact artifact hashes; source verification remains `unreviewed` |

The fixed demo has five synthetic captures, four current observations and
eight watch candidates. It exercises a changed supplier reporting document,
an attributed statement, analysis and an unresolved threshold. Its official
homepage URLs are **not receipts for those invented documents**. The browser
demo is byte-identical to compiler output; no government fetch is implied.

The `compile` input has exactly this shape:

```text
tenant_id: actual workspace ID from the trusted caller
as_of: UTC YYYY-MM-DDTHH:MM:SSZ
observations:
  - parsed: the six original research Parsed fields
    annotations: the twelve classification/graph fields below
    observed_at: actual capture timestamp from the caller
    research_id: retained research record ID, or an empty string
watches: explicit tenant rule list
```

`parsed` contains `text`, `citations`, `processor`, `version`, `input_sha256`
and `truncated`. This adapter accepts a single URL scrape with exactly one
citation matching the requested URL. Ambiguous search results, substituted
redirect sources and query/file hashes supplied as URL hashes fail closed.
All security/egress requirements in `docs/mission-research.md` still apply.

`annotations` contains `source_id`, `url`, `document_id`, `title`, `kind`,
`state`, `attribution`, `published_at`, `mission_areas`, `entities`, `relations`.
These are explicit adapter/operator annotations, **not automatically established
facts from prose**. Annotations and quoted interpretations remain unreviewed.

| Field | Values |
|---|---|
| Mission areas | `defense`, `cybersecurity`, `healthcare`, `small_business`, `energy`, `homeland_security` |
| Kinds | `legislation`, `hearing`, `committee`, `appropriation`, `executive_policy`, `statement`, `regulation` |
| Source registry | `congress`, `govinfo`, `federal_register`, `white_house`, `senate`, `house` |
| Entities | `bill`, `committee`, `hearing`, `official`, `statement`, `appropriation`, `program`, `issue`, `organization` |

Each registry admits HTTPS URLs only under its official `.gov` domain.
Admission does not establish availability, redistribution rights or authenticity
of an imported excerpt.

A watch has `id`, `name`, sorted `mission_areas`, unique literal `keywords`,
sorted `entity_ids`, sorted `object_refs`, `cadence` (`realtime` or `daily`)
and integer `window_hours` (1–744). Both candidate types respect that capture
window; the daily brief additionally uses the last 24 hours. The UI creates
seven-day rules. Rules are data, never regexes or code. Object references are
configured review targets, not inferred assertions of impact.

`collect(processor, annotations, tenant_id=..., observed_at=...)` is the async
receiving seam over an **already configured** research Processor. It uses the
existing scrape path. It creates no client, reads no credentials and starts no
worker or publisher. The private adapter supplies authenticated tenant binding,
capture time, schedule/cursors, rate limits, source-specific parsing and receipts.

## Evidence states and graph

| State | Meaning and limit |
|---|---|
| `OBSERVED` | Annotated source observation; imported material still needs authenticity and semantic review |
| `ATTRIBUTED` | A named person's/organization's statement; attribution is required |
| `ANALYZED` | Sourced interpretation, kept separate from an official action |
| `UNRESOLVED` | Missing or conflicting information retained for review |

The schema excludes politician quality, party scores, candidate rankings,
persuasion instructions, inferred motives, authority overrides and verification
stamps. A quotation can contain political opinions or hostile instructions;
it stays inert text, never a prompt, command or rule. Hashes do not establish
authenticity, correctness or independent verification.

Each relation has `source`, `relation`, `target`, `quote` and `state`.
Endpoints must exist with matching types; the quote must appear verbatim in
the retained excerpt. This locates the annotation's evidence without approving
its interpretation. `event` and `source` are reserved node references.

Supported relations are `member_of`, `referred_to`, `concerns`, `affects`,
`funds`, `made_by` and `supported_by`. `supersedes` derives only from capture
order for the same registry/document/URL. Concurrent versions have no arbitrary
ordering; a later version links to every conflicting predecessor. All versions
remain in the archive. Changed entity types or a changed URL for an existing
document are rejected; differing labels remain source-specific aliases.

Limits: 100 observations, 20 watches and 300,000 UTF-8 bytes per pack; 16,000
UTF-16 units, 32 entities and 64 quoted relations per observation. The URL
input hash, extracted-text hash, processor/version, research ID, publication/
capture times and truncation flag are distinct. The pack does not claim an
original PDF/HTML hash for bytes it has not retained.

The browser accepts canonical compiler JSON and recomputes pack, observation,
URL and excerpt fingerprints. Extra/duplicate keys, invalid relations, foreign
tenants, future captures and forged verification values fail admission. Admitted
objects are immutable. A user can deliberately reauthor and rehash false input;
it remains unreviewed and can only become an explicit proposed review task.

## Verification and remaining integration

```bash
python tests/upgrade/check_policy_intelligence.py
node --test tests/upgrade/policy-intelligence.test.mjs
python -m mypy --strict --follow-imports=silent --explicit-package-bases apps/research/policy
python -m ruff check apps/research/policy tests/upgrade/test_policy_intelligence.py tests/upgrade/check_policy_intelligence.py
npm --prefix apps/web test -- --run src/pages/workspace/__tests__/PolicyPage.test.jsx
```

Python exercises real domain code and the Processor with an explicit Firecrawl
response fixture. Node compares Python/browser projections and runs existing
PocketBase handlers against transactional storage fixtures. These do not prove
a live government fetch, native PocketBase, deployed UI or Sentinel integration.
The dispatch report records observed execution and unavailable frontend tools.

Receiving acceptance covers official feeds/rights and original receipts,
tenant isolation, bus replay, source review, existing graph/search ownership,
scheduling, alert consent/delivery, Sentinel navigation and a reviewed mission
outcome. The handoff defines the dependent tasks. A pack hash is not a CK stamp.

Rollback removes the public route/navigation and stops importing packs. No
migration or private service was added. Retain user-created missions and their
existing audit receipts; rolling source back must not delete user evidence.
