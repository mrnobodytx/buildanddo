# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/diu-sentinel-maritime/claim_evidence_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/diu-sentinel-maritime/opportunity.yaml, foundry/templates/claim_evidence_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/diu-sentinel-maritime/opportunity.yaml; USES_TEMPLATE foundry/templates/claim_evidence_matrix.md
# DAG Node:    foundry.lane.diu-sentinel-maritime
# Intent:      Provide a lane-owned workspace for exact claims, falsifiers and evidence support.
# ───────────────────────────────────────────────────────────────

# Claim-evidence matrix

| ID | Claim | Requested | Supported | Evidence |
|---|---|---|---|---|
| MAR-CLM-01 | A substantial public Sentinel Maritime planning baseline exists in this repository. | observed | observed | MAR-EV-BASELINE |
| MAR-CLM-02 | Portable deterministic maritime analysis source exists for lane adaptation, without proving deployment. | observed | observed | MAR-EV-SUITE |
| MAR-CLM-03 | Sentinel Maritime is an operating DIU-ready capability. | proposed | unsupported | none |

The reference workload does not automatically promote these claims. See the generated evidence index for byte-checked observations and explicit source-locator limitations.
