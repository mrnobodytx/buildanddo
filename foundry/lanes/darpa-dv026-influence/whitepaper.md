# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-dv026-influence/whitepaper.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-dv026-influence/opportunity.yaml, foundry/templates/whitepaper.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-dv026-influence/opportunity.yaml; USES_TEMPLATE foundry/templates/whitepaper.md
# DAG Node:    foundry.lane.darpa-dv026-influence
# Intent:      Provide a lane paper whose quantitative and capability claims remain evidence-linked.
# ───────────────────────────────────────────────────────────────

# DARPA DV026 Influence Benchmarks — technical reference paper

## Problem and approach

Make allocation, agent decisions and sensitivity to information independently inspectable before introducing model-controlled behavior.

The market module clears unit-demand bids across multiple assets and rounds. It freezes seeded valuation adjustments, information sensitivity and bid shading once, then uses the same agents for factual news and the no-news counterfactual. Stable price/identity ordering resolves ties. Allocation value is compared with the feasible highest-value allocation at the same supply.

## Implemented system

The lane shares closed registry validation, the bounded local runner, benchmark
aggregation and portfolio compilation. Twelve scripted agents, three assets, six rounds and four dated synthetic news events. Per-round bid ledgers, clearing prices, winning allocations, achieved/optimal value and counterfactual allocation changes.

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

A scripted auction is a mechanism baseline. It does not measure LLM-agent heterogeneity, persuasion effectiveness or a working influence classifier.

Python timing and allocation peaks are machine-specific observations. Fixed
fixture statistics are descriptive; independent scientific generalization needs
a new evaluation design. No population confidence or hardware energy is inferred.

## Next research and work plan

Add reviewed model-agent adapters, measured model latency/cost and behavioral hypotheses. Freeze a wider evaluation population and holdout protocol before testing interventions; obtain official topic and output constraints first.

SOW.md defines the source work packages; risk_register.md tracks evidence and
operational risks. Commercialization remains a customer hypothesis, without
invented pricing, team, traction or customer commitments.

## Submission constraints

Current official topic revision, deadline, eligibility and format require source
review. The registry retains the supplied planning values and missing evidence.
Markdown is an editable technical paper, not a rendered PDF or a measured page
count. Final claim approval, attachments and portal receipt remain human gates.
