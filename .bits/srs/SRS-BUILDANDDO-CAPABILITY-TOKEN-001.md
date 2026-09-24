# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-CAPABILITY-TOKEN-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     AGENTS.md, libs/evolution/registry.py, libs/semantic_twin/promotions.py
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON AGENTS.md; DEPENDS_ON libs/evolution/registry.py; DEPENDS_ON libs/semantic_twin/promotions.py
# Intent:      Make portable skills measurable capabilities without conferring execution, sharing or payment authority.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-CAPABILITY-TOKEN-001 — Capability Token Protocol v1

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN
**CKS gate:** B+/75 **CKS/CAPS/CK:** pending

## Authority and intent

The owner's September 21 continuation requests the six capability-token protocol
pieces on the already merged evolution fabric. Use the AGENTS.md additive fast
path: register this spec and its dispatch before implementation. This authorizes
new local library, CLI, tests and documentation, plus the required governance
bindings. Preserve existing runtime, policies, CI and the session-managed branch.

## Requirements

1. Freeze a versioned portable contract for typed inputs/outputs, variables,
   skills, dependencies, exact implementation artifacts, compatibility,
   applicability, authority, evidence, rollback, composition, pricing,
   attribution and learning lineage. Hash canonical contracts and exact assets.
2. Execute bounded conformance cases and existing evolution replay. Certification
   requires independent, revision-bound semantic-twin PromotionProof/TEVV covering
   the exact results. An ordinary imported skill starts uncertified. Changes to
   version, implementation, tests or compatibility cannot inherit certification.
3. Provide local federated index import, search, resolve, inspect, install,
   proposal-only invoke, typed composition, update and irreversible version
   revocation with retained history. Pin namespaces, exact content, generations
   and dependencies; reject conflicts, cycles, rollback and revoked dependencies.
4. Provide per-implementation passports from retained metering and exact
   independent outcome receipts. Expose measured denominators, latency, cost,
   verifier and evidence root. Missing observations remain unmeasured.
5. Export only an explicitly reviewed, closed-vocabulary generalized pattern.
   Private events, tenant identifiers, free text and evidence bodies stay local.
   A sharing receipt cannot certify a capability or increase its authority.
6. Compute local metering/royalty/cost-per-verified-result/profit statements using
   integer minor currency units, content-bound verified results and explicit
   attribution. Deduplicate retries and retain refunds. Do not move funds.
7. Import/export the bounded Agent Skills directory format and captured MCP skill
   indexes/tool descriptors. Unsupported formats fail explicitly; imports never
   execute scripts or fetch resources. No vendor-specific hosted integration is
   implied by portable descriptors.
8. Expose the protocol with scripts/cnwb and python -m libs.capability_tokens.
   Exercise a real local conformance run and portable round trip; retain its
   incomplete independent/runtime acceptance honestly.

## Boundaries

Python stdlib plus libs/semantic_twin and libs/evolution only. No credentials,
remote writes, authentication changes, signer, monetary transfers, production
effects or automatic tenant evidence publication. The CLI journal is local and
scope-bound. Trust pins and reviewer identities are supplied by a separately
authenticated receiving process; hashes and typed receipts do not establish
identity authentication. Graph capabilities emit the existing ActionProposal.

## Acceptance

- Run the capability-token unittest suite, existing evolution and semantic-twin
  suites, strict mypy and Ruff.
- Measure at least 80 percent executable-line coverage per production module.
- Test immutable versions, replay leakage, forged/stale evidence, namespace and
  dependency conflicts, revocation, authority preservation, tenant separation,
  composition incompatibility, unsafe archive paths and monetary conservation.
- Run local CLI interoperability, conformance and lifecycle checks with retained
  artifacts. Synthetic receipts remain fixtures, never operational acceptance.
- Validate public boundary, measured agent context, sprint source binding and
  provisional submission governance. Review the existing stale merge binding
  before refreshing; refreshing cannot complete any sprint milestone.

## Rollback

Remove this additive package and entry point while retaining local journals and
receipts for inspection. Registry revocations are append-only; publishing a new
version is the recovery path. No remote systems or balances require compensation.
