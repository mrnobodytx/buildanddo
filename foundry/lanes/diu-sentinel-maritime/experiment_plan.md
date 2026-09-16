# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/diu-sentinel-maritime/experiment_plan.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/diu-sentinel-maritime/opportunity.yaml, foundry/templates/experiment_plan.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/diu-sentinel-maritime/opportunity.yaml; USES_TEMPLATE foundry/templates/experiment_plan.md
# DAG Node:    foundry.lane.diu-sentinel-maritime
# Intent:      Preregister lane hypotheses, baselines, procedures and stopping rules.
# ───────────────────────────────────────────────────────────────

# Experiment plan

Reproduce analysis under input permutations, retain contradictory observations and demonstrate that candidates remain HOLD.

Scope: Existing public mission-suite source with explicit synthetic observations; private Sentinel and NNC are outside this run.

Dataset: foundry/fixtures/diu-sentinel-maritime.json; SHA-256: 3327bf386a38a193c5d9ff070a0dfec5b3916c976fca7abee1573bbdef99b74b.

Candidates: ordered-observations, shuffled-observations.

Seeds: [17, 29, 43]; repeats: 2; timeout per attempt: 30 seconds.

Each attempt starts in a new working directory with the frozen input. Candidates receive the same dataset and seed. Logs are bounded and unsuccessful outcomes stay in the comparison.

| Metric | Unit | Direction | Local threshold |
|---|---|---|---|
| analysis_replay_match | matching analysis / reference | higher | {"operator": "==", "value": 1} |
| hold_fraction | held / generated candidates | higher | {"operator": "==", "value": 1} |
| candidates | candidates | neutral | {"operator": ">=", "value": 1} |
| admitted | admitted candidates | neutral | {"operator": "==", "value": 0} |
| elapsed_ms | milliseconds with tracemalloc enabled | lower | {} |
| peak_python_bytes | traced Python allocation bytes | lower | {} |

Independent verification recomputes file fingerprints, run identities, sample counts and summaries. Replay checks computational bytes against the retained source closure; it does not reassert machine-dependent timing.

## Method

The reference calls the existing mission-suite engine twice: once with the frozen observation order and once with a seeded permutation. It compares the derived analysis rather than the input-bound proof, since permuted inputs legitimately have different input fingerprints. Candidates retain HOLD and no admission/release authority is granted.

## Next research study

Follow the existing Sentinel ownership/discovery handoff and SM-BL-1.1 work orders. Receiving seats must verify actual private runtime, data rights, NNC admission and the operating demonstration against current DIU instructions.
