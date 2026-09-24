# CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-BUDDI-002.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-BUDDI-002
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-BUDDI-002
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/pocketbase/pb_hooks/tutorial-learning.js, apps/pocketbase/pb_migrations/1788800000_create_praxis_evidence_fabric.js,
#              apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js, apps/edge/src/index.js
# EnumType:    Doc
# EnumEdges:   GOVERNS apps/pocketbase/pb_hooks/public-api.pb.js; GOVERNS apps/pocketbase/pb_hooks/public-api.js;
#              GOVERNS apps/pocketbase/pb_hooks/buddi-intake.js; GOVERNS apps/pocketbase/pb_migrations/1792100000_buddi_intake.js;
#              GOVERNS apps/edge/src/public-api.js
# Intent:      Give the public voice agent's eight tools real endpoints that answer from platform data, or say plainly
#              that they cannot.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-BUDDI-002 — Buddi's tool endpoints on the platform backend

## Why this exists

The public ElevenLabs agent, Buddi, carries eight webhook tools that call
`https://buildanddo.com/api/v1/public/...`. Measured 2026-09-22 by the C-ONE dispatch: every one of
those URLs answers `200 text/html` - the site shell - because no such route exists. A status-code
check reads that as success, so the agent was being handed a web page and told it was data. The
backend is PocketBase under `/hcgi/platform`; nothing there served these paths either.

## What a "challenge" is here, and what is public

- The Challenge Desk (`/app/missions`) and the home page's challenge form write `missions` and
  `challenge_submissions`. Both are workspace-private (1789900000_secure_workspace_rbac). They are
  never read by these endpoints.
- The public, demo-safe challenges are the **authored lessons**: `tutorials` records that carry a
  `slug` and a `curriculum_version` (seeded by the curriculum migrations from
  `pb_migrations/data/*.json`). The site already ships the same lessons to anonymous readers
  (TutorialCatalog on the home page and Docs; README: "every lesson readable without an account").
  Each lesson is a bounded exercise with a server-checked verification path. Any other `tutorials`
  record is not returned.
- A run of a lesson is a learner's own `tutorial_learning` record, and a run of a Challenge Desk
  challenge is a workspace mission. Neither is public, so a `mission_id` never resolves here.
- Public evidence is whatever the praxis evidence fabric and the evidence witness publish with a
  public view rule, checked at request time, plus each lesson's own references and content digest.

## Requirements

1. **R1 - routes.** Five A0 reads (`product-context`, `challenges/demo`, `challenges/{id}/state`,
   `evidence`, `replay/{id}`) and three A2 requests (`challenges/request`, `feedback`,
   `support/handoff`) under `/hcgi/platform/api/v1/public/`, with the exact parameters of the tool
   contracts.
2. **R2 - provenance.** Every response carries `authority` (`A0` or `A2`), `source` and `as_of`.
3. **R3 - no fabrication, no disclosure.** Reads return only the public records above. An unknown
   id, and an id that exists but is not public, both answer the same `404 {"state":"UNKNOWN"}`. A
   filter that matches nothing answers an empty list with a plain reason, never a made-up item.
4. **R4 - bounded writes.** A2 routes answer `503` while `BUDDI_TOOL_SECRET` is unset, `401` unless
   `x-buddi-tool-secret` matches it (constant time), `400` for a body outside the tool schema,
   `429` past 5 writes per conversation or 200 per hour, and otherwise a durable receipt from the
   server-only `buddi_intake` collection. A retried identical request returns its original receipt.
   A handoff notifies moderators through `BUDDI_HANDOFF_DISCORD_WEBHOOK` when that is set.
5. **R5 - edge.** `buildanddo-edge` forwards `/api/v1/public/*` to `/hcgi/platform/api/v1/public/*`
   preserving method, query, body and headers, refuses malformed paths without forwarding them, and
   never lets the HTML shell answer an API path. `/api/webhooks/*` is left untouched.
6. **R6 - configuration by name.** The new environment names are declared where the repository
   declares PocketBase environment; no value is written anywhere.

## Non-goals

Deployment, pushing, editing the ElevenLabs tool definitions (the three A2 tools must be given the
`x-buddi-tool-secret` header by whoever owns the agent), a post-call webhook receiver (owned by the
private control plane under USO-BITS-ELEVENLABS-WEBHOOK-001), CSP or Permissions-Policy changes,
and any read of workspace-private or per-learner records.

## Verification

```bash
BUILDANDDO_TEST_POCKETBASE=/path/to/pocketbase-0.39.8 python tests/upgrade/test_public_api_native.py --require-binary
node --test tests/upgrade/public-api.test.mjs
npm --prefix apps/edge test
```
