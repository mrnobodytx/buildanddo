# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/navair-acquisition-analysis/whitepaper.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/navair-acquisition-analysis/opportunity.yaml, foundry/templates/whitepaper.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/navair-acquisition-analysis/opportunity.yaml; USES_TEMPLATE foundry/templates/whitepaper.md
# DAG Node:    foundry.lane.navair-acquisition-analysis
# Intent:      Provide a lane paper whose quantitative and capability claims remain evidence-linked.
# ───────────────────────────────────────────────────────────────

# NAVAIR Acquisition Analysis — technical reference paper

## Problem and approach

Provide deterministic retrieval with inspectable scoring, graded relevance and stable source citations before expanding to acquisition corpora.

The retrieval module tokenizes a frozen corpus with a Unicode word/case-fold rule. BM25 and cosine TF-IDF score the same queries and documents. Term contributions and source hashes accompany every hit; document IDs resolve equal scores. Recall and precision use explicit relevant/retrieved denominators, nDCG uses graded judgments, and MRR uses the full ranking.

## Implemented system

The lane shares closed registry validation, the bounded local runner, benchmark
aggregation and portfolio compilation. Nine authored public synthetic acquisition descriptions, six queries, graded judgments and top-k of three. Ranked hits with explanations and citations; precision@k, recall@k, nDCG@k and reciprocal rank for each query and the aggregate.

The experiment plan freezes candidates, dataset bytes, requirement scope and
thresholds before execution. Twelve attempts compare two candidates over three
seeds and two repetitions; deterministic workloads repeat the same fixed corpus.

## Evaluation and evidence

Run the lane using the commands in foundry/README.md. Its generated
benchmark_report.md reports actual metrics, units, denominators and failures.
Every successful measurement has an observed evidence record tied to its bytes;
changed code/data/plan invalidates use of the campaign in a current compilation.
A run does not produce a reviewed claim or government qualification.

The portfolio compiler replaces this source with a report derived from the
selected campaign and preserves this authored paper under authored/whitepaper.md.
The current recorded validation is .bits/out/VCC-BUILDANDDO-UPGRADE-001/foundry-validation.json.

## Limitations

The current comparison is lexical retrieval over authored fixtures. It establishes no government-corpus accuracy, embedding quality, CUI suitability or tested container.

Python timing and allocation peaks are machine-specific observations. Fixed
fixture statistics are descriptive; independent scientific generalization needs
a new evaluation design. No population confidence or hardware energy is inferred.

## Next research and work plan

Acquire an explicitly releasable domain corpus, independent expert relevance judgments and a held-out query set. Add approved dense/hybrid retrieval baselines, then build and accept the required Docker deliverable on its declared runtime.

SOW.md defines the source work packages; risk_register.md tracks evidence and
operational risks. Commercialization remains a customer hypothesis, without
invented pricing, team, traction or customer commitments.

## Submission constraints

Current official topic revision, deadline, eligibility and format require source
review. The registry retains the supplied planning values and missing evidence.
Markdown is an editable technical paper, not a rendered PDF or a measured page
count. Final claim approval, attachments and portal receipt remain human gates.
