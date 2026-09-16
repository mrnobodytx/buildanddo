# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-dv026-influence/slides/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-dv026-influence/opportunity.yaml, foundry/templates/slides/README.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-dv026-influence/opportunity.yaml; USES_TEMPLATE foundry/templates/slides/README.md
# DAG Node:    foundry.lane.darpa-dv026-influence
# Intent:      Provide a numbered, evidence-linked slide workspace for this lane.
# ───────────────────────────────────────────────────────────────

# DARPA DV026 Influence Benchmarks — briefing sources

The compiler emits five linked Markdown briefing slides from the selected campaign:

1. Problem and scope — Make allocation, agent decisions and sensitivity to information independently inspectable before introducing model-controlled behavior.
2. Implemented method — The market module clears unit-demand bids across multiple assets and rounds. It freezes seeded valuation adjustments, information sensitivity and bid shading once, then uses the same agents for factual news and the no-news counterfactual. Stable price/identity ordering resolves ties. Allocation value is compared with the feasible highest-value allocation at the same supply.
3. Observed results — actual candidate metrics, sample counts, repeat agreement and failures.
4. Evidence gaps — A scripted auction is a mechanism baseline. It does not measure LLM-agent heterogeneity, persuasion effectiveness or a working influence classifier.
5. Next work — Add reviewed model-agent adapters, measured model latency/cost and behavioral hypotheses. Freeze a wider evaluation population and holdout protocol before testing interventions; obtain official topic and output constraints first.

Run compile with --runs after validating the lane campaign. The generated slides
and white paper share the same evidence; final presentation rendering and any
official slide-count requirement remain separate acceptance checks. The existing
Sentinel planning deck is prior art, not an automatically approved submission.
