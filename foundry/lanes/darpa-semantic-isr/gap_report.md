# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/gap_report.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/gap_report.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/gap_report.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Keep official-source, engineering, physical and human-approval gaps visible.
# ───────────────────────────────────────────────────────────────

# Gap report — DARPA Semantic ISR

## Implemented reference

The sender encodes either complete scene annotations or quantized relevant-object deltas with periodic keyframes and explicit removals. The receiver parses the actual JSON bytes, enforces sequence order, clears state on keyframes and applies updates/removals. Relevant-object recovery and coordinate error are compared with frame truth.

## Declared opportunity evidence gaps

- ISR-GAP-DP2: DP2 eligibility and current official requirements have not been verified.
- ISR-GAP-DATA: No rights-cleared frozen EO benchmark corpus is attached.
- ISR-GAP-HARDWARE: No physical edge-hardware power, thermal, memory or latency run exists.

## Next acceptance boundary

Attach current official requirements and DP2 qualification evidence. Establish real EO/video datasets and detector outputs, compare against conventional video codecs, then measure reconstruction utility, latency and power on declared hardware.

Relevance labels are supplied truth. JSON packet savings are not video compression performance, detector accuracy, a radio demonstration, physical feasibility or DP2 qualification.

The generated gap report combines this registry with current requirement states,
failed attempts and human review blockers. Registry deadlines remain unknown and
eligibility remains unverified until official source evidence is provided.
