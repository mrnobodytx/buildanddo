# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/navair-acquisition-analysis/gap_report.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/navair-acquisition-analysis/opportunity.yaml, foundry/templates/gap_report.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/navair-acquisition-analysis/opportunity.yaml; USES_TEMPLATE foundry/templates/gap_report.md
# DAG Node:    foundry.lane.navair-acquisition-analysis
# Intent:      Keep official-source, engineering, physical and human-approval gaps visible.
# ───────────────────────────────────────────────────────────────

# Gap report — NAVAIR Acquisition Analysis

## Implemented reference

The retrieval module tokenizes a frozen corpus with a Unicode word/case-fold rule. BM25 and cosine TF-IDF score the same queries and documents. Term contributions and source hashes accompany every hit; document IDs resolve equal scores. Recall and precision use explicit relevant/retrieved denominators, nDCG uses graded judgments, and MRR uses the full ranking.

## Declared opportunity evidence gaps

- NAVAIR-GAP-OFFICIAL: Current official instructions, eligible corpus and deadline are not attached.
- NAVAIR-GAP-CORPUS: No frozen acquisition corpus, judgments or container benchmark exists in this lane.

## Next acceptance boundary

Acquire an explicitly releasable domain corpus, independent expert relevance judgments and a held-out query set. Add approved dense/hybrid retrieval baselines, then build and accept the required Docker deliverable on its declared runtime.

The current comparison is lexical retrieval over authored fixtures. It establishes no government-corpus accuracy, embedding quality, CUI suitability or tested container.

The generated gap report combines this registry with current requirement states,
failed attempts and human review blockers. Registry deadlines remain unknown and
eligibility remains unverified until official source evidence is provided.
