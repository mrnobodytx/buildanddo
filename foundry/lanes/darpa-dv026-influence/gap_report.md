# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-dv026-influence/gap_report.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-dv026-influence/opportunity.yaml, foundry/templates/gap_report.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-dv026-influence/opportunity.yaml; USES_TEMPLATE foundry/templates/gap_report.md
# DAG Node:    foundry.lane.darpa-dv026-influence
# Intent:      Keep official-source, engineering, physical and human-approval gaps visible.
# ───────────────────────────────────────────────────────────────

# Gap report — DARPA DV026 Influence Benchmarks

## Implemented reference

The market module clears unit-demand bids across multiple assets and rounds. It freezes seeded valuation adjustments, information sensitivity and bid shading once, then uses the same agents for factual news and the no-news counterfactual. Stable price/identity ordering resolves ties. Allocation value is compared with the feasible highest-value allocation at the same supply.

## Declared opportunity evidence gaps

- DV026-GAP-OFFICIAL: Current official solicitation, deadline and eligibility determination are not attached.
- DV026-GAP-RUNS: No Influence market, agent or classifier benchmark has run in this lane.

## Next acceptance boundary

Add reviewed model-agent adapters, measured model latency/cost and behavioral hypotheses. Freeze a wider evaluation population and holdout protocol before testing interventions; obtain official topic and output constraints first.

A scripted auction is a mechanism baseline. It does not measure LLM-agent heterogeneity, persuasion effectiveness or a working influence classifier.

The generated gap report combines this registry with current requirement states,
failed attempts and human review blockers. Registry deadlines remain unknown and
eligibility remains unverified until official source evidence is provided.
