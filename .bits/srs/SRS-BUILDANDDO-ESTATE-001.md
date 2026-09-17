# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-ESTATE-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     AGENTS.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON AGENTS.md; DEPENDS_ON .bits/srs_registry.yml
# DAG Node:    none
# Intent:      Specify a deterministic repository compiler that supplies estate evidence to Graph Operator without acquiring verification authority.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-ESTATE-001 — Citadel Estate Intelligence

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Motivation

Verification currently starts from known owners. The filesystem, CGRF headers,
SRS registry, imports, manifests and PocketBase registrations must first be
reconciled into a reproducible inventory so missing owners and stale references
are visible. Graph Operator / DKG remains the canonical graph owner.

## Scope and authority

The owner's session request authorizes an additive, local, CPU-only compiler.
Use the A1 fast path in AGENTS.md: register this spec and its dispatch together
before implementation. Add apps/estate, scripts/estate_census.py, tests/estate
and local documentation. The only existing-file bookkeeping is this SRS's
registry entry and the required regenerated context lock. Existing application,
test, CI, migration and governance policy code remains unchanged.

## Compiler contract

1. Census every visible path with stable classification and streamed file hashes.
   Record excluded dependency/build/cache directories as opaque metadata. Do not
   follow symlinks or open secret/runtime database files. Bound text analysis;
   retain explicit analysis-limit notes. Exclude the compiler's state/estate
   output and output-only ancestors from its own input.
2. Identify semantic module roots from existing CGRF, registry, package, hook,
   schema and directory evidence. Files are evidence leaves with one owner;
   nested source folders do not automatically become independent modules.
3. Compile typed module edges from Python ASTs, JS imports/exports/requires and
   JSX bindings, local manifests, CGRF declarations and PocketBase routes.
   Preserve source locations and unresolved/external references.
4. Reconcile declarations, implementations, stale paths, capability duplicates,
   import/declaration differences, schema references and endpoint declarations.
5. Report ModuleShape, RouteShape, GovernanceShape and DependencyShape defects.
   Findings do not grant or revoke application verification.
6. Produce a canonical JSON snapshot with a Merkle census root and SHA-256
   identity. Derive dates from the repository commit, with a fixed epoch for
   non-Git inputs. Use a content-derived seal suffix instead of a run counter.
   Keep history linkage separate from content identity; unchanged reruns preserve
   the cached document. Retain snapshots for precise module/file/edge deltas.
7. Support full compilation, cached reports, module detail, orphan and violation
   lists and comparison with an archived seal ID. No cached view rescans source.

## Exclusions

No network, LLM, GPU, application imports/execution, PocketBase reads/writes,
seat-event publication, deployment, telemetry publishing or DKG ingestion.
Generated seals stay in ignored state/estate and are never committed.
Structural findings about existing code are reported, not repaired.

## Acceptance evidence

- python tests/estate/check_estate.py — behavior tests and at least 80 percent
  statement coverage per compiler module using the repository's stdlib trace
  pattern; includes the fifteen requested scenarios and CLI/cache integration.
- python -m mypy --strict --explicit-package-bases --follow-imports=silent apps/estate scripts/estate_census.py
- python -m ruff check apps/estate scripts/estate_census.py tests/estate
- python scripts/estate_census.py — compile the actual repository.
- python scripts/estate_census.py --report — read the resulting cached report.
- python scripts/ci/verify_public_boundary.py
- python scripts/ci/agent_context.py --check

## Rollback

Remove the additive compiler, entry point, tests and governance records; refresh
the measured context lock. Local state/estate output may be discarded. No
application data, schema or running service is changed.
