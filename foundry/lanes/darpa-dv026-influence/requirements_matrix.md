# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-dv026-influence/requirements_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-dv026-influence/opportunity.yaml, foundry/templates/requirements_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-dv026-influence/opportunity.yaml; USES_TEMPLATE foundry/templates/requirements_matrix.md
# DAG Node:    foundry.lane.darpa-dv026-influence
# Intent:      Provide a lane-owned workspace for requirement status and acceptance evidence.
# ───────────────────────────────────────────────────────────────

# Requirements matrix

| ID | Requirement | Acceptance | Status | Evidence | Justification |
|---|---|---|---|---|---|
| DV026-REQ-01 | Implement a deterministic market kernel with assets, values, order books, bids and clearing. | Repeated runs with the same seed produce byte-identical trades, allocations and utility records. | open | none | none |
| DV026-REQ-02 | Run at least ten versioned LLM-based stock agents through bounded provider adapters. | A manifest identifies every model and adapter version and a run includes at least ten isolated agents. | open | none | none |
| DV026-REQ-03 | Supply dynamic news, randomized events, repeated seeds and counterfactual scenarios. | The event manifest and seed ledger reproduce both factual and counterfactual trials. | open | none | none |
| DV026-REQ-04 | Classify collaboration, deception, anchoring, herding, risk preference and influence behavior. | Preregistered labels, denominators and held-out evaluations accompany each classifier result. | open | none | none |
| DV026-REQ-05 | Measure allocative efficiency without promoting the stated greater-than-90-percent goal before testing. | The harness reports utility denominator, uncertainty and repeated-seed distribution. | open | none | none |

This is the registered source baseline. compile --runs derives partial requirement updates from the selected measured campaign; verified satisfaction still requires a scoped review.
