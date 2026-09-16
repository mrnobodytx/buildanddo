# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-dv026-influence/claim_evidence_matrix.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-dv026-influence/opportunity.yaml, foundry/templates/claim_evidence_matrix.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-dv026-influence/opportunity.yaml; USES_TEMPLATE foundry/templates/claim_evidence_matrix.md
# DAG Node:    foundry.lane.darpa-dv026-influence
# Intent:      Provide a lane-owned workspace for exact claims, falsifiers and evidence support.
# ───────────────────────────────────────────────────────────────

# Claim-evidence matrix

| ID | Claim | Requested | Supported | Evidence |
|---|---|---|---|---|
| DV026-CLM-01 | The proposed architecture can run a deterministic multi-agent market experiment. | proposed | unsupported | none |
| DV026-CLM-02 | The experiment can distinguish named influence-related behaviors under preregistered tests. | proposed | unsupported | none |
| DV026-CLM-03 | Existing BuildAndDo replay source is available for adaptation, without proving this lane. | observed | observed | DV026-EV-REPLAY |

The reference workload does not automatically promote these claims. See the generated evidence index for byte-checked observations and explicit source-locator limitations.
