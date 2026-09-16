# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/daf-nv027-low-swap/whitepaper.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/daf-nv027-low-swap/opportunity.yaml, foundry/templates/whitepaper.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/daf-nv027-low-swap/opportunity.yaml; USES_TEMPLATE foundry/templates/whitepaper.md
# DAG Node:    foundry.lane.daf-nv027-low-swap
# Intent:      Provide a lane paper whose quantitative and capability claims remain evidence-linked.
# ───────────────────────────────────────────────────────────────

# DAF NV027 Brain-Inspired Low-SWaP — technical reference paper

## Problem and approach

Measure the compute/accuracy tradeoff of conditional execution before investing in a trained heterogeneous architecture or edge device.

The simulation applies a fixed projection and leaky temporal state to labelled sequences. Dense execution projects every frame. Event-gated execution skips the projection when input activity is below the frozen gate threshold. Both use identical weights, states and tie rules; multiplication counts and the additional gate-feature checks are recorded separately.

## Implemented system

The lane shares closed registry validation, the bounded local runner, benchmark
aggregation and portfolio compilation. Four projection outputs over sixteen features and sixty-four labelled event/background frames. Frame predictions, label agreement, active/dense multiplication counts, active frames, gate-check counts and Python timing/allocation observations.

The experiment plan freezes candidates, dataset bytes, requirement scope and
thresholds before execution. Twelve attempts compare two candidates over three
seeds and two repetitions; deterministic workloads repeat the same fixed corpus.

## Evaluation and evidence

Run the lane using the commands in foundry/README.md. Its generated
benchmark_report.md reports actual metrics, units, denominators and failures.
Every successful measurement has an observed evidence record tied to its bytes;
changed code/data/plan invalidates use of the campaign in a current compilation.
A run does not produce a reviewed claim or government qualification.

The portfolio compiler replaces this source with a report derived from the
selected campaign and preserves this authored paper under authored/whitepaper.md.
The current recorded validation is .bits/out/VCC-BUILDANDDO-UPGRADE-001/foundry-validation.json.

## Limitations

Fixed temporal projection is a simulation reference, not a trained neural design. Multiplication savings exclude decay/control overhead and do not establish energy, watts, VRAM or edge-device performance.

Python timing and allocation peaks are machine-specific observations. Fixed
fixture statistics are descriptive; independent scientific generalization needs
a new evaluation design. No population confidence or hardware energy is inferred.

## Next research and work plan

Register a trained brain-inspired architecture, real datasets, accuracy budgets and dense-model controls. Measure wall-clock latency and power on declared target hardware with an accepted instrumentation procedure after simulation evidence warrants it.

SOW.md defines the source work packages; risk_register.md tracks evidence and
operational risks. Commercialization remains a customer hypothesis, without
invented pricing, team, traction or customer commitments.

## Submission constraints

Current official topic revision, deadline, eligibility and format require source
review. The registry retains the supplied planning values and missing evidence.
Markdown is an editable technical paper, not a rendered PDF or a measured page
count. Final claim approval, attachments and portal receipt remain human gates.
