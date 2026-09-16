# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/requirements_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/requirements_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/requirements_matrix.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Provide a lane-owned workspace for requirement status and acceptance evidence.
# ───────────────────────────────────────────────────────────────

# Requirements matrix

| ID | Requirement | Acceptance | Status | Evidence | Justification |
|---|---|---|---|---|---|
| ISR-REQ-01 | Compare H.264, H.265 and AV1 transmission baselines on a frozen EO video set. | Encoder versions, settings, bytes, latency and reconstruction metrics are preserved per sequence. | open | none | none |
| ISR-REQ-02 | Build temporal scene memory, mission relevance, ROI or behavior selection and semantic packet generation. | Every packet traces to source frames, model versions, selections, confidence and uncertainty. | open | none | none |
| ISR-REQ-03 | Reconstruct a useful low-bandwidth receiver view and quantify information loss. | Preregistered mission utility and reconstruction measures compare semantic and codec baselines. | open | none | none |
| ISR-REQ-04 | Demonstrate measured feasibility on the required edge-hardware class before making a DP2 claim. | Actual device receipts report sustained wattage, memory, temperature, latency and failures. | blocked | none | none |

This is the registered source baseline. compile --runs derives partial requirement updates from the selected measured campaign; verified satisfaction still requires a scoped review.
