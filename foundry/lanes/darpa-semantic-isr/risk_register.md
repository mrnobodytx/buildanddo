# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/risk_register.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/risk_register.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/risk_register.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Track lane technical, scientific, rights, schedule and submission risks.
# ───────────────────────────────────────────────────────────────

# Risk register — DARPA Semantic ISR

| ID | Risk | Effect | Mitigation and acceptance | Owner / state |
|---|---|---|---|---|
| darpa-semantic-isr-R1 | Dropping low-salience objects can remove later mission context; retain measurable truth coverage, keyframes, explicit state deletion and receiver sequence-error tests. | Misleading research conclusion | Preserve fixed inputs, explicit denominators and negative cases; independent future evaluation | Lane receiving seat / open |
| darpa-semantic-isr-R2 | A fixture result is presented as an operating or qualifying capability | Unsupported proposal assertion | Record synthetic scope in every summary/brief; require scoped digest-bound reviews | Proposal owner / open |
| darpa-semantic-isr-R3 | Code, data or a result changes between execution and compilation | Report differs from evidence | Verify source/fixture/run manifests and recompute summaries; reject altered bytes | Common foundry / implemented local gate |
| darpa-semantic-isr-R4 | A process fails or is interrupted | Missing trials appear successful | Retain failed/cancelled receipts, exclude incomplete groups and keep candidate failed | Common foundry / implemented local gate |
| darpa-semantic-isr-R5 | Official topic, deadline, eligibility or data rights are assumed | Nonconforming submission | Attach current official sources and a named human review before final packaging | Proposal owner / unresolved |

Rollback removes the reference candidate or reverts the source change through
review. Retain experiment receipts for comparison; a new run gets a new output
location. No shared database or deployment rollback is needed for local execution.
