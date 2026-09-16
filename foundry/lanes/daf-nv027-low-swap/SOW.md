# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/daf-nv027-low-swap/SOW.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/daf-nv027-low-swap/opportunity.yaml, foundry/templates/SOW.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/daf-nv027-low-swap/opportunity.yaml; USES_TEMPLATE foundry/templates/SOW.md
# DAG Node:    foundry.lane.daf-nv027-low-swap
# Intent:      Structure measurable lane work packages without creating government commitments.
# ───────────────────────────────────────────────────────────────

# Statement of work — DAF NV027 Brain-Inspired Low-SWaP

This public reference phase produces executable source and reproducible engineering
evidence. It is not an executed government SOW, an approved budget or a schedule
commitment. The topic-specific constraints remain in opportunity.yaml.

| Work package | Deliverable | Acceptance | Current boundary |
|---|---|---|---|
| WP1 — Freeze evaluation design | Public dataset, two named candidates, seeds/repeats, metrics and thresholds | experiment.yaml validates and dataset digest matches | Implemented public source |
| WP2 — Execute reference | Frame predictions, label agreement, active/dense multiplication counts, active frames, gate-check counts and Python timing/allocation observations. | All twelve attempts have recorded outcomes; successful repeats match computational bytes | Runnable local reference |
| WP3 — Compare and retain evidence | Candidate summaries, exact inputs, logs, receipts and error cases | verify checks artifacts and recomputes summaries | Runnable local gate |
| WP4 — Prepare review package | Requirement/claim matrices, benchmark report, technical brief, five source slides and ZIP | Two exports from identical inputs match; authority boxes remain unapproved | Runnable local compiler |
| WP5 — Extend research | Register a trained brain-inspired architecture, real datasets, accuracy budgets and dense-model controls. Measure wall-clock latency and power on declared target hardware with an accepted instrumentation procedure after simulation evidence warrants it. | New lane SRS defines its independent measurements and reviewer | Separate dispatch required |

## Supplied resources and responsibilities

The reference uses an existing CPU host, Python 3.11+ and PyYAML. BITS-CODEGEN
provides the governed source and local validation. The proposal owner supplies
official sources, eligibility/company facts, data rights and receiving-seat
assignments. Hardware, provider costs and external integrations need explicit
budgets and authority in the next SRS.

## Acceptance exclusions

Fixed temporal projection is a simulation reference, not a trained neural design. Multiplication savings exclude decay/control overhead and do not establish energy, watts, VRAM or edge-device performance.

Unmeasured hardware, customer, certification and federal-qualification claims
cannot be accepted by this source phase. Final submission is a separate human act.
