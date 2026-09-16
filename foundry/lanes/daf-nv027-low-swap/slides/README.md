# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/daf-nv027-low-swap/slides/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/daf-nv027-low-swap/opportunity.yaml, foundry/templates/slides/README.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/daf-nv027-low-swap/opportunity.yaml; USES_TEMPLATE foundry/templates/slides/README.md
# DAG Node:    foundry.lane.daf-nv027-low-swap
# Intent:      Provide a numbered, evidence-linked slide workspace for this lane.
# ───────────────────────────────────────────────────────────────

# DAF NV027 Brain-Inspired Low-SWaP — briefing sources

The compiler emits five linked Markdown briefing slides from the selected campaign:

1. Problem and scope — Measure the compute/accuracy tradeoff of conditional execution before investing in a trained heterogeneous architecture or edge device.
2. Implemented method — The simulation applies a fixed projection and leaky temporal state to labelled sequences. Dense execution projects every frame. Event-gated execution skips the projection when input activity is below the frozen gate threshold. Both use identical weights, states and tie rules; multiplication counts and the additional gate-feature checks are recorded separately.
3. Observed results — actual candidate metrics, sample counts, repeat agreement and failures.
4. Evidence gaps — Fixed temporal projection is a simulation reference, not a trained neural design. Multiplication savings exclude decay/control overhead and do not establish energy, watts, VRAM or edge-device performance.
5. Next work — Register a trained brain-inspired architecture, real datasets, accuracy budgets and dense-model controls. Measure wall-clock latency and power on declared target hardware with an accepted instrumentation procedure after simulation evidence warrants it.

Run compile with --runs after validating the lane campaign. The generated slides
and white paper share the same evidence; final presentation rendering and any
official slide-count requirement remain separate acceptance checks. The existing
Sentinel planning deck is prior art, not an automatically approved submission.
