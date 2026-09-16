# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/navair-acquisition-analysis/benchmark_report.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/navair-acquisition-analysis/opportunity.yaml, foundry/templates/benchmark_report.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/navair-acquisition-analysis/opportunity.yaml; USES_TEMPLATE foundry/templates/benchmark_report.md
# DAG Node:    foundry.lane.navair-acquisition-analysis
# Intent:      Report lane measurements, source identities and failed runs without inventing results.
# ───────────────────────────────────────────────────────────────

# Benchmark report — NAVAIR Acquisition Analysis

The executable comparison is registered in experiment.yaml. Actual attempts,
resource observations, candidate distributions and local acceptance outcomes are
retained in the selected campaign and rendered by compile --runs.

Current validation record: .bits/out/VCC-BUILDANDDO-UPGRADE-001/foundry-validation.json.

## What is measured

Ranked hits with explanations and citations; precision@k, recall@k, nDCG@k and reciprocal rank for each query and the aggregate.

## Interpretation

The current comparison is lexical retrieval over authored fixtures. It establishes no government-corpus accuracy, embedding quality, CUI suitability or tested container.

Only successful complete repeat groups enter aggregate statistics. Failed
attempts remain visible with their actual return status; repeat agreement does
not establish external validity. A future corpus or method requires a new pinned
plan and a new campaign, preserving the earlier evidence for comparison.
