# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-dv026-influence/SOW.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-dv026-influence/opportunity.yaml, foundry/templates/SOW.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-dv026-influence/opportunity.yaml; USES_TEMPLATE foundry/templates/SOW.md
# DAG Node:    foundry.lane.darpa-dv026-influence
# Intent:      Structure measurable lane work packages without creating government commitments.
# ───────────────────────────────────────────────────────────────

# Statement of work — DARPA DV026 Influence Benchmarks

This public reference phase produces executable source and reproducible engineering
evidence. It is not an executed government SOW, an approved budget or a schedule
commitment. The topic-specific constraints remain in opportunity.yaml.

| Work package | Deliverable | Acceptance | Current boundary |
|---|---|---|---|
| WP1 — Freeze evaluation design | Public dataset, two named candidates, seeds/repeats, metrics and thresholds | experiment.yaml validates and dataset digest matches | Implemented public source |
| WP2 — Execute reference | Per-round bid ledgers, clearing prices, winning allocations, achieved/optimal value and counterfactual allocation changes. | All twelve attempts have recorded outcomes; successful repeats match computational bytes | Runnable local reference |
| WP3 — Compare and retain evidence | Candidate summaries, exact inputs, logs, receipts and error cases | verify checks artifacts and recomputes summaries | Runnable local gate |
| WP4 — Prepare review package | Requirement/claim matrices, benchmark report, technical brief, five source slides and ZIP | Two exports from identical inputs match; authority boxes remain unapproved | Runnable local compiler |
| WP5 — Extend research | Add reviewed model-agent adapters, measured model latency/cost and behavioral hypotheses. Freeze a wider evaluation population and holdout protocol before testing interventions; obtain official topic and output constraints first. | New lane SRS defines its independent measurements and reviewer | Separate dispatch required |

## Supplied resources and responsibilities

The reference uses an existing CPU host, Python 3.11+ and PyYAML. BITS-CODEGEN
provides the governed source and local validation. The proposal owner supplies
official sources, eligibility/company facts, data rights and receiving-seat
assignments. Hardware, provider costs and external integrations need explicit
budgets and authority in the next SRS.

## Acceptance exclusions

A scripted auction is a mechanism baseline. It does not measure LLM-agent heterogeneity, persuasion effectiveness or a working influence classifier.

Unmeasured hardware, customer, certification and federal-qualification claims
cannot be accepted by this source phase. Final submission is a separate human act.
