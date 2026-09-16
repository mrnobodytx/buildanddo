# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/navair-acquisition-analysis/claim_evidence_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/navair-acquisition-analysis/opportunity.yaml, foundry/templates/claim_evidence_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/navair-acquisition-analysis/opportunity.yaml; USES_TEMPLATE foundry/templates/claim_evidence_matrix.md
# DAG Node:    foundry.lane.navair-acquisition-analysis
# Intent:      Provide a lane-owned workspace for exact claims, falsifiers and evidence support.
# ───────────────────────────────────────────────────────────────

# Claim-evidence matrix

| ID | Claim | Requested | Supported | Evidence |
|---|---|---|---|---|
| NAVAIR-CLM-01 | The proposed system can rank related acquisition documents deterministically. | proposed | unsupported | none |
| NAVAIR-CLM-02 | Every recommendation can retain a source and transformation path. | proposed | unsupported | none |

The reference workload does not automatically promote these claims. See the generated evidence index for byte-checked observations and explicit source-locator limitations.
