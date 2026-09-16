# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/experiment_plan.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/experiment_plan.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/experiment_plan.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Preregister lane hypotheses, baselines, procedures and stopping rules.
# ───────────────────────────────────────────────────────────────

# Experiment plan

Compare full-scene transfer with ordered ROI deltas and measure actual receiver recovery and coordinate loss.

Scope: Synthetic scene annotations with supplied relevance labels and JSON wire encoding; no EO detector, video codec or hardware proof.

Dataset: foundry/fixtures/darpa-semantic-isr.json; SHA-256: 542f834a96d132082928f904fb9cdb7d9e54ff1e17bc0a295997fe10ca9cfc93.

Candidates: full-scene-json, roi-delta-json.

Seeds: [17, 29, 43]; repeats: 2; timeout per attempt: 30 seconds.

Each attempt starts in a new working directory with the frozen input. Candidates receive the same dataset and seed. Logs are bounded and unsuccessful outcomes stay in the comparison.

| Metric | Unit | Direction | Local threshold |
|---|---|---|---|
| byte_ratio | encoded / full-scene bytes | lower | {} |
| wire_bytes | bytes | lower | {} |
| mission_object_recall | recovered / required objects | higher | {"operator": "==", "value": 1} |
| position_mae | synthetic grid units | lower | {"operator": "<=", "value": 0.05} |
| elapsed_ms | milliseconds with tracemalloc enabled | lower | {} |
| peak_python_bytes | traced Python allocation bytes | lower | {} |

Independent verification recomputes file fingerprints, run identities, sample counts and summaries. Replay checks computational bytes against the retained source closure; it does not reassert machine-dependent timing.

## Method

The sender encodes either complete scene annotations or quantized relevant-object deltas with periodic keyframes and explicit removals. The receiver parses the actual JSON bytes, enforces sequence order, clears state on keyframes and applies updates/removals. Relevant-object recovery and coordinate error are compared with frame truth.

## Next research study

Attach current official requirements and DP2 qualification evidence. Establish real EO/video datasets and detector outputs, compare against conventional video codecs, then measure reconstruction utility, latency and power on declared hardware.
