# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/diu-sentinel-maritime/slides/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/diu-sentinel-maritime/opportunity.yaml, foundry/templates/slides/README.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/diu-sentinel-maritime/opportunity.yaml; USES_TEMPLATE foundry/templates/slides/README.md
# DAG Node:    foundry.lane.diu-sentinel-maritime
# Intent:      Provide a numbered, evidence-linked slide workspace for this lane.
# ───────────────────────────────────────────────────────────────

# DIU Sentinel Maritime — briefing sources

The compiler emits five linked Markdown briefing slides from the selected campaign:

1. Problem and scope — Reuse the existing public mission-suite analysis and proof path while measuring deterministic behavior before private Sentinel/NNC integration.
2. Implemented method — The reference calls the existing mission-suite engine twice: once with the frozen observation order and once with a seeded permutation. It compares the derived analysis rather than the input-bound proof, since permuted inputs legitimately have different input fingerprints. Candidates retain HOLD and no admission/release authority is granted.
3. Observed results — actual candidate metrics, sample counts, repeat agreement and failures.
4. Evidence gaps — This is the already-present portable public engine. Its reference run does not establish private Sentinel deployment, live maritime detection quality, NNC integration or a 48-hour operating demonstration.
5. Next work — Follow the existing Sentinel ownership/discovery handoff and SM-BL-1.1 work orders. Receiving seats must verify actual private runtime, data rights, NNC admission and the operating demonstration against current DIU instructions.

Run compile with --runs after validating the lane campaign. The generated slides
and white paper share the same evidence; final presentation rendering and any
official slide-count requirement remain separate acceptance checks. The existing
Sentinel planning deck is prior art, not an automatically approved submission.
