# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/diu-sentinel-maritime/whitepaper.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/diu-sentinel-maritime/opportunity.yaml, foundry/templates/whitepaper.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/diu-sentinel-maritime/opportunity.yaml; USES_TEMPLATE foundry/templates/whitepaper.md
# DAG Node:    foundry.lane.diu-sentinel-maritime
# Intent:      Provide a lane paper whose quantitative and capability claims remain evidence-linked.
# ───────────────────────────────────────────────────────────────

# DIU Sentinel Maritime — technical reference paper

## Problem and approach

Reuse the existing public mission-suite analysis and proof path while measuring deterministic behavior before private Sentinel/NNC integration.

The reference calls the existing mission-suite engine twice: once with the frozen observation order and once with a seeded permutation. It compares the derived analysis rather than the input-bound proof, since permuted inputs legitimately have different input fingerprints. Candidates retain HOLD and no admission/release authority is granted.

## Implemented system

The lane shares closed registry validation, the bounded local runner, benchmark
aggregation and portfolio compilation. Five explicit synthetic observations for three entities, including conflicting positions and a stale observation. Existing engine version/source identity, entity/world-state analysis, deterministic candidate results, proof fingerprints and HOLD/admission counts.

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

This is the already-present portable public engine. Its reference run does not establish private Sentinel deployment, live maritime detection quality, NNC integration or a 48-hour operating demonstration.

Python timing and allocation peaks are machine-specific observations. Fixed
fixture statistics are descriptive; independent scientific generalization needs
a new evaluation design. No population confidence or hardware energy is inferred.

## Next research and work plan

Follow the existing Sentinel ownership/discovery handoff and SM-BL-1.1 work orders. Receiving seats must verify actual private runtime, data rights, NNC admission and the operating demonstration against current DIU instructions.

SOW.md defines the source work packages; risk_register.md tracks evidence and
operational risks. Commercialization remains a customer hypothesis, without
invented pricing, team, traction or customer commitments.

## Submission constraints

Current official topic revision, deadline, eligibility and format require source
review. The registry retains the supplied planning values and missing evidence.
Markdown is an editable technical paper, not a rendered PDF or a measured page
count. Final claim approval, attachments and portal receipt remain human gates.
