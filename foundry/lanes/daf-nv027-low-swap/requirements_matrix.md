# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/daf-nv027-low-swap/requirements_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/daf-nv027-low-swap/opportunity.yaml, foundry/templates/requirements_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/daf-nv027-low-swap/opportunity.yaml; USES_TEMPLATE foundry/templates/requirements_matrix.md
# DAG Node:    foundry.lane.daf-nv027-low-swap
# Intent:      Provide a lane-owned workspace for requirement status and acceptance evidence.
# ───────────────────────────────────────────────────────────────

# Requirements matrix

| ID | Requirement | Acceptance | Status | Evidence | Justification |
|---|---|---|---|---|---|
| NV027-REQ-01 | Compare a frozen monolithic baseline with a heterogeneous neural runtime under identical tasks. | Both candidates use the same datasets, splits, seeds, scoring and compute accounting. | open | none | none |
| NV027-REQ-02 | Evaluate perception, temporal, transformer, spiking and graph or vector memory subsystems behind a dynamic compute gate. | Ablations identify each subsystem, gate decision and active compute path. | open | none | none |
| NV027-REQ-03 | Establish a scientifically testable contribution rather than relabeling orchestration with biological terms. | The plan states novelty, falsifier, baselines and statistical test before candidate evaluation. | open | none | none |
| NV027-REQ-04 | Produce a Phase I simulation or small prototype with reproducible resource measurements. | Frozen code, configuration and repeated results reproduce accuracy, latency and resource values. | open | none | none |

This is the registered source baseline. compile --runs derives partial requirement updates from the selected measured campaign; verified satisfaction still requires a scoped review.
