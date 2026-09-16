# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/daf-nv027-low-swap/experiment_plan.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/daf-nv027-low-swap/opportunity.yaml, foundry/templates/experiment_plan.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/daf-nv027-low-swap/opportunity.yaml; USES_TEMPLATE foundry/templates/experiment_plan.md
# DAG Node:    foundry.lane.daf-nv027-low-swap
# Intent:      Preregister lane hypotheses, baselines, procedures and stopping rules.
# ───────────────────────────────────────────────────────────────

# Experiment plan

Demonstrate the accuracy versus compute comparison and preserve gate overhead separately from arithmetic savings.

Scope: Fixed temporal projection and event gating on labelled synthetic sequences; measured Python resources and counted multiplications only.

Dataset: foundry/fixtures/daf-nv027-low-swap.json; SHA-256: fc53aa1f2d389492ab4917884abc6135628855ced648b455f1c1bc38f7f61af7.

Candidates: dense-temporal, event-gated.

Seeds: [17, 29, 43]; repeats: 2; timeout per attempt: 30 seconds.

Each attempt starts in a new working directory with the frozen input. Candidates receive the same dataset and seed. Logs are bounded and unsuccessful outcomes stay in the comparison.

| Metric | Unit | Direction | Local threshold |
|---|---|---|---|
| accuracy | fraction of labelled frames | higher | {"operator": ">=", "value": 0.95} |
| compute_fraction | active / dense multiplications | lower | {} |
| active_multiplications | multiplications | lower | {} |
| gate_feature_checks | feature checks | neutral | {} |
| elapsed_ms | milliseconds with tracemalloc enabled | lower | {} |
| peak_python_bytes | traced Python allocation bytes | lower | {} |

Independent verification recomputes file fingerprints, run identities, sample counts and summaries. Replay checks computational bytes against the retained source closure; it does not reassert machine-dependent timing.

## Method

The simulation applies a fixed projection and leaky temporal state to labelled sequences. Dense execution projects every frame. Event-gated execution skips the projection when input activity is below the frozen gate threshold. Both use identical weights, states and tie rules; multiplication counts and the additional gate-feature checks are recorded separately.

## Next research study

Register a trained brain-inspired architecture, real datasets, accuracy budgets and dense-model controls. Measure wall-clock latency and power on declared target hardware with an accepted instrumentation procedure after simulation evidence warrants it.
