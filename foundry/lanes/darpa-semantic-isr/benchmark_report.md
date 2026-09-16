# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/benchmark_report.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/benchmark_report.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/benchmark_report.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Report lane measurements, source identities and failed runs without inventing results.
# ───────────────────────────────────────────────────────────────

# Benchmark report — DARPA Semantic ISR

The executable comparison is registered in experiment.yaml. Actual attempts,
resource observations, candidate distributions and local acceptance outcomes are
retained in the selected campaign and rendered by compile --runs.

Current validation record: .bits/out/VCC-BUILDANDDO-UPGRADE-001/foundry-validation.json.

## What is measured

Actual wire bytes, packets and reconstructed scene history; byte ratio, relevant-object recall and coordinate error.

## Interpretation

Relevance labels are supplied truth. JSON packet savings are not video compression performance, detector accuracy, a radio demonstration, physical feasibility or DP2 qualification.

Only successful complete repeat groups enter aggregate statistics. Failed
attempts remain visible with their actual return status; repeat agreement does
not establish external validity. A future corpus or method requires a new pinned
plan and a new campaign, preserving the earlier evidence for comparison.
