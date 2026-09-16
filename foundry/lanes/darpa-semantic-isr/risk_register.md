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

| ID | Risk | Probability | Impact | Trigger | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R-001 | Official requirements may differ from planning input. | medium | high | Official source conflicts with registry. | Reconcile before claims or execution scope advance. | unassigned | open |
| R-002 | Experimental evidence may not support the proposed claim. | medium | high | Preregistered acceptance fails. | Preserve result, analyze failure and narrow the claim. | unassigned | open |
