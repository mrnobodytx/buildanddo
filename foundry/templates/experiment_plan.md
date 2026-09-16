# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/templates/experiment_plan.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/README.md
# EnumType:    Doc
# EnumEdges:   EXTENDS foundry/README.md
# DAG Node:    foundry.templates
# Intent:      Preregister lane experiments, baselines, falsifiers and stopping rules.
# ───────────────────────────────────────────────────────────────

# Experiment plan — {{topic}}

## Hypothesis and falsifier

State the hypothesis and the observation that would reject it.

## Frozen inputs

List dataset identity, rights, splits, seeds and environment.

## Baselines and candidates

| ID | Role | Version | Parameters | Rationale |
|---|---|---|---|---|

## Procedure

Define repetitions, randomization, resource bounds and failure handling.

## Metrics and analysis

Define denominators, uncertainty, exclusions and multiple-comparison handling.

## Acceptance and stopping rules

Name the result required to advance and the conditions that halt the lane.
