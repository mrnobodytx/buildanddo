# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/navair-acquisition-analysis/experiment_plan.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/navair-acquisition-analysis/opportunity.yaml, foundry/templates/experiment_plan.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/navair-acquisition-analysis/opportunity.yaml; USES_TEMPLATE foundry/templates/experiment_plan.md
# DAG Node:    foundry.lane.navair-acquisition-analysis
# Intent:      Preregister lane hypotheses, baselines, procedures and stopping rules.
# ───────────────────────────────────────────────────────────────

# Experiment plan

Compare ranking quality and deterministic explanations on one fixed corpus; exercise the comparison machinery before a domain corpus is accepted.

Scope: Public synthetic text fixtures and hand-authored relevance judgments; lexical candidates only.

Dataset: foundry/fixtures/navair-acquisition-analysis.json; SHA-256: 76fbbcdad7334dd3ea313a0dab38c7519738a68ffab97ba875a725e913327069.

Candidates: bm25, tfidf.

Seeds: [17, 29, 43]; repeats: 2; timeout per attempt: 30 seconds.

Each attempt starts in a new working directory with the frozen input. Candidates receive the same dataset and seed. Logs are bounded and unsuccessful outcomes stay in the comparison.

| Metric | Unit | Direction | Local threshold |
|---|---|---|---|
| ndcg_at_k | ratio | higher | {"operator": ">=", "value": 0.8} |
| precision_at_k | ratio | higher | {} |
| recall_at_k | ratio | higher | {"operator": ">=", "value": 0.8} |
| mrr | ratio | higher | {} |
| elapsed_ms | milliseconds with tracemalloc enabled | lower | {} |
| peak_python_bytes | traced Python allocation bytes | lower | {} |

Independent verification recomputes file fingerprints, run identities, sample counts and summaries. Replay checks computational bytes against the retained source closure; it does not reassert machine-dependent timing.

## Method

The retrieval module tokenizes a frozen corpus with a Unicode word/case-fold rule. BM25 and cosine TF-IDF score the same queries and documents. Term contributions and source hashes accompany every hit; document IDs resolve equal scores. Recall and precision use explicit relevant/retrieved denominators, nDCG uses graded judgments, and MRR uses the full ranking.

## Next research study

Acquire an explicitly releasable domain corpus, independent expert relevance judgments and a held-out query set. Add approved dense/hybrid retrieval baselines, then build and accept the required Docker deliverable on its declared runtime.
