# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/diu-sentinel-maritime/benchmark_report.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/diu-sentinel-maritime/opportunity.yaml, foundry/templates/benchmark_report.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/diu-sentinel-maritime/opportunity.yaml; USES_TEMPLATE foundry/templates/benchmark_report.md
# DAG Node:    foundry.lane.diu-sentinel-maritime
# Intent:      Report lane measurements, source identities and failed runs without inventing results.
# ───────────────────────────────────────────────────────────────

# Benchmark report — DIU Sentinel Maritime

The executable comparison is registered in experiment.yaml. Actual attempts,
resource observations, candidate distributions and local acceptance outcomes are
retained in the selected campaign and rendered by compile --runs.

Current validation record: .bits/out/VCC-BUILDANDDO-UPGRADE-001/foundry-validation.json.

## What is measured

Existing engine version/source identity, entity/world-state analysis, deterministic candidate results, proof fingerprints and HOLD/admission counts.

## Interpretation

This is the already-present portable public engine. Its reference run does not establish private Sentinel deployment, live maritime detection quality, NNC integration or a 48-hour operating demonstration.

Only successful complete repeat groups enter aggregate statistics. Failed
attempts remain visible with their actual return status; repeat agreement does
not establish external validity. A future corpus or method requires a new pinned
plan and a new campaign, preserving the earlier evidence for comparison.
