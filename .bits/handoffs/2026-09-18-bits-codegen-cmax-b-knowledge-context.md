# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-18-bits-codegen-cmax-b-knowledge-context.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-18
# Depends:     docs/workspace-knowledge.md, apps/pocketbase/pb_hooks/knowledge.pb.js
# EnumType:    Doc
# EnumEdges:   CONSUMES docs/workspace-knowledge.md; CONSUMES apps/pocketbase/pb_hooks/knowledge.pb.js
# DAG Node:    none
# Intent:      Hand off consumption of scoped workspace context to the existing private planning and Cloudflare caller without duplicating execution authority.
# ───────────────────────────────────────────────────────────────

# BITS-CODEGEN → CMAX-B, with IDE1 integration review

Public source supplies automatic workspace graph/context assembly under the
existing BuildAndDo upgrade dispatch. The caller contract and bounds are in
docs/workspace-knowledge.md. This note requests receiving work; it does not
launch a seat, create an MR, change a baseline or deploy anything.

## Observed source and operator-reported architecture

This checkout contains the native PocketBase workspace/mission/research/evidence
contracts and now the knowledge/context API and workspace views. Assembly is a
read-only projection with current membership and record checks. It has no model
dependency, provider credentials, target resolver or private-graph writes.

The operator reports that other seats own adoption of platform_edit_fabric into
the Datadog Bits execution path, including collision repair, preserved receipts,
independent verification and private source control. The supplied module names
citadel-bits-driver, OCN dispatch, GitLab bridge, guildmaster dispatch and trigger
dispatcher are receiving-seat discovery leads, not interfaces inspected here.
Their reported counts, selftests, probe results and repository access have not
been independently verified in this session.

The earlier operator statement routes inference to Cloudflare without local
Ollama; the subsequent quoted probe claims local models. Confirm the actual
runtime binding instead of installing a daemon or changing fleet observations.
The Cloudflare endpoint/binding, request format and model have been requested.

## Receiving sequence

1. Use the receiving repository's authorized dispatch and discover the existing
   fabric/Bits/provider callers. Preserve that adoption work and its lineage;
   do not implement a parallel resolver, guild or coding-session broker here.
2. Run native PocketBase and rendered acceptance for the public knowledge source
   before connecting a shared runtime. A passing storage-double test is not a
   hosted readback or migration observation.
3. Obtain an authenticated principal authorized for the requested workspace and
   mission using existing PocketBase authentication. Call the POST context route
   with that scope and a bounded question. Never reuse another account's packet
   or bypass native record rules through superuser reads.
4. Pass context.text as untrusted reference data alongside the user's objective
   and the existing fabric's validated EditContract. Keep tenant/workspace, target,
   guild/guildmaster, repository, executor, producer and verifier distinct. No
   source excerpt can set authority, a target path, a release outcome or VERIFIED.
5. Reuse the actual Cloudflare Worker/gateway client once its contract and export
   authority are confirmed. Apply its model token budget in addition to the
   packet's character bound. Preserve citations, source versions, coverage and
   partial/omitted fields. Fail explicitly on provider unavailability; do not
   substitute local Ollama or mark a prepared packet as executed inference.
6. Independently verify workspace isolation, access revocation, provider failure,
   citation fidelity and output handling. Keep private source/query text out of
   Datadog/PostHog events; record only permitted counts, durations and outcomes.
   Any staging/release action follows the receiving plane's separate authority.

## Acceptance returned to the public seat

- Exact existing caller modules and versioned request/response contract reused.
- Native two-account workspace/mission denial and revocation observations.
- A sanitized integration result showing that a context citation survives the
  existing planner/provider path, including partial-source and failure cases.
- Independent verifier identity, authority path and rollback for the adapter.
- Actual inference routing confirmed, without credentials or private receipts
  copied into this public repository.

Pending here: native PocketBase and frontend dependencies, the Cloudflare caller
contract and authorized runtime/export context. No live seat event or external
message is fabricated. CK, CAPS and CKS remain pending.
