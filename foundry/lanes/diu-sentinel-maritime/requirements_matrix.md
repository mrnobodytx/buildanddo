# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/diu-sentinel-maritime/requirements_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/diu-sentinel-maritime/opportunity.yaml, foundry/templates/requirements_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/diu-sentinel-maritime/opportunity.yaml; USES_TEMPLATE foundry/templates/requirements_matrix.md
# DAG Node:    foundry.lane.diu-sentinel-maritime
# Intent:      Provide a lane-owned workspace for requirement status and acceptance evidence.
# ───────────────────────────────────────────────────────────────

# Requirements matrix

| ID | Requirement | Acceptance | Status | Evidence | Justification |
|---|---|---|---|---|---|
| MAR-REQ-01 | Preserve observation, world-state, cue, admission, evidence and outcome semantics from the public baseline. | The lane maps each implementation and experiment artifact to the versioned contracts without semantic drift. | open | none | none |
| MAR-REQ-02 | Demonstrate deterministic replay, conflicting evidence handling and fail-closed release behavior. | Repeated bounded scenarios match source and result identities while unadmitted cues remain HOLD. | open | none | none |
| MAR-REQ-03 | Produce a measurable 48-hour demonstration and government integration plan. | The plan defines denominators, data rights, operator actions, failure handling and preserved receipts. | open | none | none |
| MAR-REQ-04 | Separate public source evidence from private Sentinel, NNC, feed, release and deployment acceptance. | No compiled claim treats planned private work or fixture behavior as an operating capability. | open | none | none |

This is the registered source baseline. compile --runs derives partial requirement updates from the selected measured campaign; verified satisfaction still requires a scoped review.
