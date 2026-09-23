# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-KNOWLEDGE-UNIT-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-KNOWLEDGE-UNIT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     AGENTS.md, apps/career/assessments.py, apps/career/ledger.py
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-KNOWLEDGE-UNIT-001-* branches; DEPENDS_ON apps/career/assessments.py
# DAG Node:    none
# Intent:      Specify a versioned, sourced, testable Knowledge Unit whose public receipt and learner mastery levels are computed from evidence, never asserted.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-KNOWLEDGE-UNIT-001 — Knowledge Unit contract and receipt

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

Lessons are abundant; their lineage is not. A reader cannot tell where a lesson's
claims came from, which standard it covers, who checked it, whether it is current,
or whether a learner can apply it. BuildAndDo needs one auditable object for that.

## Scope

- Add `apps/knowledge_units/`: a Knowledge Unit schema (claims, sources, standard
  mappings, explanation, examples and counterexamples, assessment item references,
  a transfer task with rubric, author, reviewer, version, review dates, professional
  and public surfaces), a validator, a receipt compiler and a learner mastery ladder
  (KNOW, UNDERSTAND, DEMONSTRATE, APPLY, VERIFIED).
- CLI: `python -m apps.knowledge_units check|receipt|mastery`.
- One clearly synthetic sample unit, tests and a coverage gate.

## Out of scope

- Applying to TEA as a CPE provider, recruiting a teacher guild, or any other
  external or regulatory action (human work).
- Real TEKS content or mappings: no standards catalogue is in this repository, so
  standard mappings stay `DECLARED` until a reviewer other than the author confirms them.
- Issuing CPE credit or any certification. A unit can declare suggested hours;
  credit is `NOT_ISSUED` unless a provider approval reference is supplied, and even
  then the receipt only records the reference.
- PocketBase, web or schema changes.

## Invariants

- Every claim cites at least one listed source; a unit with an uncited claim fails.
- A unit is `VERIFIED` only when its reviewer differs from its author and every
  claim and item is reviewed; otherwise `DRAFT` or `IN_REVIEW`. Past its next
  review date it is `STALE`, whatever it was before.
- A retracted claim cannot be deleted; it stays in the unit with its reason.
- Mastery rungs come only from graded assessment events and a transfer-task review:
  KNOW needs a pass on recall items; UNDERSTAND a pass on explanation items;
  DEMONSTRATE both; APPLY a transfer task marked meeting the rubric; VERIFIED an
  APPLY review by someone other than the learner and the unit author. Watching or
  reading earns nothing.

## Acceptance evidence

1. `python tests/knowledge_units/check_knowledge_units.py` passes with at least 80
   percent statement coverage per module.
2. `python scripts/ci/verify_public_boundary.py` and `python scripts/ci/agent_context.py --check` pass.

## Rollback

Delete `apps/knowledge_units`, `tests/knowledge_units`, `tests/fixtures/knowledge_units`,
this spec and its dispatch, registry and output entries.
