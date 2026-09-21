# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/handoffs/2026-09-21-bits-codegen-cmax-b-capability-runtime.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     docs/capability-tokens.md, libs/capability_tokens/verification.py
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON docs/capability-tokens.md; DEPENDS_ON libs/capability_tokens/verification.py
# Intent:      Keep federation trust, private data publication, real execution and payments with their receiving authority.
# ───────────────────────────────────────────────────────────────

# Capability protocol receiving-runtime handoff

**From:** BITS-CODEGEN **To:** CMAX-B / IDE1 / COPILOT
**Dispatch:** VCC-BUILDANDDO-CAPABILITY-TOKEN-001 **Status:** prepared; not dispatched externally
**Receiving authority:** explicit human A3 dispatch before activation

## Available source

libs/capability_tokens and scripts/cnwb provide strict portable contracts,
bounded conformance, pinned local federation, proposal-only invocation/composition,
passports, reviewed public pattern exports and integer economic accrual estimates.
They reuse the existing evolution rules/replay and semantic verification/transaction
contracts. No signing keys, deployment or payment authority is included.

## Receiving actions

1. Authenticate publishers and receipt authors before populating ReviewPolicy
   receipt pins or supplying federation generation digests. Obtain pins over an
   independently authenticated path; advertised names and self-hashes are not trust.
   Define namespace ownership, revocation distribution, freshness and external
   journal anchoring without granting new execution authority.
2. Attach actual supported skill/MCP runners under existing AAXP policy. Retain
   sandbox/security/negative/replay/rollback/compatibility outputs. The local runner
   cannot certify opaque scripts or external tool effects. Real rollback acceptance
   must show actual state restored, not just a correct compensation proposal.
3. Bind proposals through conformance.draft_transaction and the existing
   ChangeContract/SemanticTransaction path. Enforce current tenant membership,
   authority, tools, targets, preconditions, forbidden effects, output schemas and
   independent verification. Composition is a plan, not an executor.
4. Export permitted CallObservation/VerificationReceipt captures and attach them
   to the exact implementation/source/SBOM/environment. Preserve actual timestamps,
   costs, failure classes, result digests and identity separation. Connect receipt
   capture back to the existing evolution event/episode loop.
5. Have the data owner review SharingDraft and passport publication under explicit
   human A3 grants. Only reviewed public projections may enter remote distribution;
   raw episodes, examples, tenant identities and private receipts stay isolated.
   Test consent expiry/revocation and actual multi-tenant boundaries.
6. Have the financial owner define real metering acceptance, payment receipts,
   currency/tax/refund policy and payout execution. Local statements are accrual
   estimates. They do not establish collected revenue, pay royalties or replace
   the private economic ledger.

## Acceptance and rollback

Retain one authenticated cross-registry import, current certificate, governed
proposal-to-effect-to-independent-result chain, immutable passport and actual
scope-isolation denial. Demonstrate an implementation update losing its old
certification and transitive revocation stopping future use.

Retain a separately approved public pattern/passport export that contains no
private source data. Test unknown costs and refunded outcomes before any payment
activation. Preserve all failed captures and review decisions.

Disable receiving adapters and revoke the affected version to stop future use.
Retain journals/receipts. Do not silently replay uncertain effects or infer a
refund/rollback from a local calculation. CK/CAPS/CKS remain pending.
