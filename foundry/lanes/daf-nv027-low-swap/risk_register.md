# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/daf-nv027-low-swap/risk_register.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/daf-nv027-low-swap/opportunity.yaml, foundry/templates/risk_register.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/daf-nv027-low-swap/opportunity.yaml; USES_TEMPLATE foundry/templates/risk_register.md
# DAG Node:    foundry.lane.daf-nv027-low-swap
# Intent:      Track lane technical, scientific, rights, schedule and submission risks.
# ───────────────────────────────────────────────────────────────

# Risk register — DAF NV027 Brain-Inspired Low-SWaP

| ID | Risk | Effect | Mitigation and acceptance | Owner / state |
|---|---|---|---|---|
| daf-nv027-low-swap-R1 | Skipping projections can change temporal predictions outside the fixture; preserve identical state dynamics and measure false/missed decisions across adverse sequences before hardware claims. | Misleading research conclusion | Preserve fixed inputs, explicit denominators and negative cases; independent future evaluation | Lane receiving seat / open |
| daf-nv027-low-swap-R2 | A fixture result is presented as an operating or qualifying capability | Unsupported proposal assertion | Record synthetic scope in every summary/brief; require scoped digest-bound reviews | Proposal owner / open |
| daf-nv027-low-swap-R3 | Code, data or a result changes between execution and compilation | Report differs from evidence | Verify source/fixture/run manifests and recompute summaries; reject altered bytes | Common foundry / implemented local gate |
| daf-nv027-low-swap-R4 | A process fails or is interrupted | Missing trials appear successful | Retain failed/cancelled receipts, exclude incomplete groups and keep candidate failed | Common foundry / implemented local gate |
| daf-nv027-low-swap-R5 | Official topic, deadline, eligibility or data rights are assumed | Nonconforming submission | Attach current official sources and a named human review before final packaging | Proposal owner / unresolved |

Rollback removes the reference candidate or reverts the source change through
review. Retain experiment receipts for comparison; a new run gets a new output
location. No shared database or deployment rollback is needed for local execution.
