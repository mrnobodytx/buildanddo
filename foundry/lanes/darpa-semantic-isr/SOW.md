# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/SOW.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/SOW.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/SOW.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Structure measurable lane work packages without creating government commitments.
# ───────────────────────────────────────────────────────────────

# Statement of work — DARPA Semantic ISR

This public reference phase produces executable source and reproducible engineering
evidence. It is not an executed government SOW, an approved budget or a schedule
commitment. The topic-specific constraints remain in opportunity.yaml.

| Work package | Deliverable | Acceptance | Current boundary |
|---|---|---|---|
| WP1 — Freeze evaluation design | Public dataset, two named candidates, seeds/repeats, metrics and thresholds | experiment.yaml validates and dataset digest matches | Implemented public source |
| WP2 — Execute reference | Actual wire bytes, packets and reconstructed scene history; byte ratio, relevant-object recall and coordinate error. | All twelve attempts have recorded outcomes; successful repeats match computational bytes | Runnable local reference |
| WP3 — Compare and retain evidence | Candidate summaries, exact inputs, logs, receipts and error cases | verify checks artifacts and recomputes summaries | Runnable local gate |
| WP4 — Prepare review package | Requirement/claim matrices, benchmark report, technical brief, five source slides and ZIP | Two exports from identical inputs match; authority boxes remain unapproved | Runnable local compiler |
| WP5 — Extend research | Attach current official requirements and DP2 qualification evidence. Establish real EO/video datasets and detector outputs, compare against conventional video codecs, then measure reconstruction utility, latency and power on declared hardware. | New lane SRS defines its independent measurements and reviewer | Separate dispatch required |

## Supplied resources and responsibilities

The reference uses an existing CPU host, Python 3.11+ and PyYAML. BITS-CODEGEN
provides the governed source and local validation. The proposal owner supplies
official sources, eligibility/company facts, data rights and receiving-seat
assignments. Hardware, provider costs and external integrations need explicit
budgets and authority in the next SRS.

## Acceptance exclusions

Relevance labels are supplied truth. JSON packet savings are not video compression performance, detector accuracy, a radio demonstration, physical feasibility or DP2 qualification.

Unmeasured hardware, customer, certification and federal-qualification claims
cannot be accepted by this source phase. Final submission is a separate human act.
