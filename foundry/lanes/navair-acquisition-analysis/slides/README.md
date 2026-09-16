# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/navair-acquisition-analysis/slides/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/navair-acquisition-analysis/opportunity.yaml, foundry/templates/slides/README.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/navair-acquisition-analysis/opportunity.yaml; USES_TEMPLATE foundry/templates/slides/README.md
# DAG Node:    foundry.lane.navair-acquisition-analysis
# Intent:      Provide a numbered, evidence-linked slide workspace for this lane.
# ───────────────────────────────────────────────────────────────

# NAVAIR Acquisition Analysis — briefing sources

The compiler emits five linked Markdown briefing slides from the selected campaign:

1. Problem and scope — Provide deterministic retrieval with inspectable scoring, graded relevance and stable source citations before expanding to acquisition corpora.
2. Implemented method — The retrieval module tokenizes a frozen corpus with a Unicode word/case-fold rule. BM25 and cosine TF-IDF score the same queries and documents. Term contributions and source hashes accompany every hit; document IDs resolve equal scores. Recall and precision use explicit relevant/retrieved denominators, nDCG uses graded judgments, and MRR uses the full ranking.
3. Observed results — actual candidate metrics, sample counts, repeat agreement and failures.
4. Evidence gaps — The current comparison is lexical retrieval over authored fixtures. It establishes no government-corpus accuracy, embedding quality, CUI suitability or tested container.
5. Next work — Acquire an explicitly releasable domain corpus, independent expert relevance judgments and a held-out query set. Add approved dense/hybrid retrieval baselines, then build and accept the required Docker deliverable on its declared runtime.

Run compile with --runs after validating the lane campaign. The generated slides
and white paper share the same evidence; final presentation rendering and any
official slide-count requirement remain separate acceptance checks. The existing
Sentinel planning deck is prior art, not an automatically approved submission.
