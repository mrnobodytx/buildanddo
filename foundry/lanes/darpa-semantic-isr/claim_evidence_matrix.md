# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/claim_evidence_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/claim_evidence_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/claim_evidence_matrix.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Provide a lane-owned workspace for exact claims, falsifiers and evidence support.
# ───────────────────────────────────────────────────────────────

# Claim-evidence matrix

| ID | Claim | Requested | Supported | Evidence |
|---|---|---|---|---|
| ISR-CLM-01 | Semantic packets may preserve declared mission utility at lower bandwidth than standard codec baselines. | proposed | unsupported | none |
| ISR-CLM-02 | Existing public Sentinel planning provides reusable semantic and provenance concepts, not runtime proof. | observed | observed | ISR-EV-SENTINEL-PLAN |
| ISR-CLM-03 | The prototype qualifies for DP2. | proposed | unsupported | none |

The reference workload does not automatically promote these claims. See the generated evidence index for byte-checked observations and explicit source-locator limitations.
