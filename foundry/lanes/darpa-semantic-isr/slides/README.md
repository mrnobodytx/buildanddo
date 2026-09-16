# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/slides/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/slides/README.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/slides/README.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Provide a numbered, evidence-linked slide workspace for this lane.
# ───────────────────────────────────────────────────────────────

# DARPA Semantic ISR — briefing sources

The compiler emits five linked Markdown briefing slides from the selected campaign:

1. Problem and scope — Make the bandwidth/reconstruction tradeoff of selective semantic updates measurable at the protocol level before coupling it to video detectors and edge hardware.
2. Implemented method — The sender encodes either complete scene annotations or quantized relevant-object deltas with periodic keyframes and explicit removals. The receiver parses the actual JSON bytes, enforces sequence order, clears state on keyframes and applies updates/removals. Relevant-object recovery and coordinate error are compared with frame truth.
3. Observed results — actual candidate metrics, sample counts, repeat agreement and failures.
4. Evidence gaps — Relevance labels are supplied truth. JSON packet savings are not video compression performance, detector accuracy, a radio demonstration, physical feasibility or DP2 qualification.
5. Next work — Attach current official requirements and DP2 qualification evidence. Establish real EO/video datasets and detector outputs, compare against conventional video codecs, then measure reconstruction utility, latency and power on declared hardware.

Run compile with --runs after validating the lane campaign. The generated slides
and white paper share the same evidence; final presentation rendering and any
official slide-count requirement remain separate acceptance checks. The existing
Sentinel planning deck is prior art, not an automatically approved submission.
