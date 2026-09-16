# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/daf-nv027-low-swap/benchmark_report.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/daf-nv027-low-swap/opportunity.yaml, foundry/templates/benchmark_report.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/daf-nv027-low-swap/opportunity.yaml; USES_TEMPLATE foundry/templates/benchmark_report.md
# DAG Node:    foundry.lane.daf-nv027-low-swap
# Intent:      Report lane measurements, source identities and failed runs without inventing results.
# ───────────────────────────────────────────────────────────────

# Benchmark report — DAF NV027 Brain-Inspired Low-SWaP

The executable comparison is registered in experiment.yaml. Actual attempts,
resource observations, candidate distributions and local acceptance outcomes are
retained in the selected campaign and rendered by compile --runs.

Current validation record: .bits/out/VCC-BUILDANDDO-UPGRADE-001/foundry-validation.json.

## What is measured

Frame predictions, label agreement, active/dense multiplication counts, active frames, gate-check counts and Python timing/allocation observations.

## Interpretation

Fixed temporal projection is a simulation reference, not a trained neural design. Multiplication savings exclude decay/control overhead and do not establish energy, watts, VRAM or edge-device performance.

Only successful complete repeat groups enter aggregate statistics. Failed
attempts remain visible with their actual return status; repeat agreement does
not establish external validity. A future corpus or method requires a new pinned
plan and a new campaign, preserving the earlier evidence for comparison.
