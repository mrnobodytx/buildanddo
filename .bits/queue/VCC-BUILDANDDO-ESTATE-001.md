# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-ESTATE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-ESTATE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-ESTATE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     .bits/srs/SRS-BUILDANDDO-ESTATE-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-ESTATE-001.md; DEPENDS_ON .bits/srs_registry.yml
# DAG Node:    none
# Intent:      Authorize and gate the additive estate compiler while keeping runtime systems and existing code outside this dispatch.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-ESTATE-001

**SRS:** SRS-BUILDANDDO-ESTATE-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

Compile repository evidence into a deterministic module graph, reconciliation,
structural findings and archived seals that downstream graph owners can consume.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Census and CGRF extraction | `python tests/estate/check_estate.py --phase census` | done |
| 2 | Semantic module identification | `python tests/estate/check_estate.py --phase modules` | done |
| 3 | Dependency and PocketBase extraction | `python tests/estate/check_estate.py --phase dependencies` | done |
| 4 | Declaration/observation reconciliation | `python tests/estate/check_estate.py --phase reconcile` | done |
| 5 | Structural shape validation | `python tests/estate/check_estate.py --phase validate` | done |
| 6 | Deterministic seals and deltas | `python tests/estate/check_estate.py --phase seal` | done |
| 7 | Human-readable estate projections | `python tests/estate/check_estate.py --phase report` | done |
| 8 | CLI, actual repository smoke and governance | `python tests/estate/check_estate.py` | done |

## Constraints

- Add apps/estate/**, scripts/estate_census.py, tests/estate/** and
  .bits/out/VCC-BUILDANDDO-ESTATE-001/**.
- Governance bookkeeping: this queue file, its new SRS spec, the registry entry
  and regenerated .bits/context.lock.json.
- Do not modify any existing application, test, CI or deployment code.
- No external effects, secret access, application execution or private-plane work.

## Smoke test

```bash
python tests/estate/check_estate.py
python -m mypy --strict --explicit-package-bases --follow-imports=silent apps/estate scripts/estate_census.py
python -m ruff check apps/estate scripts/estate_census.py tests/estate
python scripts/estate_census.py
python scripts/estate_census.py --report
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```

## Memory Brief

The source conversation calls for discovery beneath verification, promotion of
semantic modules instead of file nodes, reconciliation of declared and observed
estate, and a compiler feeding Graph Operator / DKG. The existing repository
provides CGRF metadata, flat SRS registry, native PocketBase route declarations,
JS aliases and Python package boundaries. No earlier estate implementation exists.

## Definition of done

- [x] All eight phases have observed passing gates.
- [x] The fifteen requested scenarios and cached CLI behavior are covered.
- [x] The actual repo produces a repeatable seal; findings remain visible.
- [x] Public boundary and measured context gates pass.
- [x] Report and three-type memory payload exist.
- [x] Registry remains in_progress until merge verification.
