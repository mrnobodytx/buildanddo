# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-dv026-influence/experiment_plan.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-dv026-influence/opportunity.yaml, foundry/templates/experiment_plan.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-dv026-influence/opportunity.yaml; USES_TEMPLATE foundry/templates/experiment_plan.md
# DAG Node:    foundry.lane.darpa-dv026-influence
# Intent:      Preregister lane hypotheses, baselines, procedures and stopping rules.
# ───────────────────────────────────────────────────────────────

# Experiment plan

Compare welfare from truthful and heterogeneous shaded bidding under identical supply and seed conditions.

Scope: Scripted unit-demand auctions and counterfactual news only; no LLM agents or influence classification.

Dataset: foundry/fixtures/darpa-dv026-influence.json; SHA-256: 3e06f85257f3d797939d0e2391af2022917a059c203b1065c3155ecb663e7049.

Candidates: truthful-auction, shaded-auction.

Seeds: [17, 29, 43]; repeats: 2; timeout per attempt: 30 seconds.

Each attempt starts in a new working directory with the frozen input. Candidates receive the same dataset and seed. Logs are bounded and unsuccessful outcomes stay in the comparison.

| Metric | Unit | Direction | Local threshold |
|---|---|---|---|
| allocative_efficiency_pct | percent | higher | {"operator": ">=", "value": 90} |
| agent_count | scripted agents | neutral | {"operator": "==", "value": 12} |
| counterfactual_changes | changed allocations | neutral | {} |
| elapsed_ms | milliseconds with tracemalloc enabled | lower | {} |
| peak_python_bytes | traced Python allocation bytes | lower | {} |

Independent verification recomputes file fingerprints, run identities, sample counts and summaries. Replay checks computational bytes against the retained source closure; it does not reassert machine-dependent timing.

## Method

The market module clears unit-demand bids across multiple assets and rounds. It freezes seeded valuation adjustments, information sensitivity and bid shading once, then uses the same agents for factual news and the no-news counterfactual. Stable price/identity ordering resolves ties. Allocation value is compared with the feasible highest-value allocation at the same supply.

## Next research study

Add reviewed model-agent adapters, measured model latency/cost and behavioral hypotheses. Freeze a wider evaluation population and holdout protocol before testing interventions; obtain official topic and output constraints first.
