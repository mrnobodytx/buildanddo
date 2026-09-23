# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-KNOWLEDGE-UNIT-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-KNOWLEDGE-UNIT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-KNOWLEDGE-UNIT-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-KNOWLEDGE-UNIT-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-KNOWLEDGE-UNIT-001.md
# DAG Node:    none
# Intent:      Authorize the additive Knowledge Unit contract without regulatory, credential or external effects.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-KNOWLEDGE-UNIT-001

**SRS:** SRS-BUILDANDDO-KNOWLEDGE-UNIT-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

A Knowledge Unit can be validated, receipted and used to compute a learner's
mastery rung from evidence alone.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Unit schema and validator | `python -m unittest tests.knowledge_units.test_units.UnitTests && echo PASS` | done |
| 2 | Receipt with state, staleness and CPE boundary | `python -m unittest tests.knowledge_units.test_units.ReceiptTests && echo PASS` | done |
| 3 | Mastery ladder from evidence | `python -m unittest tests.knowledge_units.test_units.MasteryTests && echo PASS` | done |
| 4 | CLI and coverage | `python tests/knowledge_units/check_knowledge_units.py && echo PASS` | done |
| 5 | Boundary and context | `python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

## Constraints

- May touch: `apps/knowledge_units/**`, `tests/knowledge_units/**`,
  `tests/fixtures/knowledge_units/**`, this dispatch, the SRS, the registry,
  `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json` (refresh only),
  `.bits/out/VCC-BUILDANDDO-KNOWLEDGE-UNIT-001/**`.
- Must not touch: existing application, PocketBase, web, CI or private-plane files.
