# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/darpa-semantic-isr/whitepaper.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/darpa-semantic-isr/opportunity.yaml, foundry/templates/whitepaper.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/darpa-semantic-isr/opportunity.yaml; USES_TEMPLATE foundry/templates/whitepaper.md
# DAG Node:    foundry.lane.darpa-semantic-isr
# Intent:      Provide a lane paper whose quantitative and capability claims remain evidence-linked.
# ───────────────────────────────────────────────────────────────

# DARPA Semantic ISR — technical reference paper

## Problem and approach

Make the bandwidth/reconstruction tradeoff of selective semantic updates measurable at the protocol level before coupling it to video detectors and edge hardware.

The sender encodes either complete scene annotations or quantized relevant-object deltas with periodic keyframes and explicit removals. The receiver parses the actual JSON bytes, enforces sequence order, clears state on keyframes and applies updates/removals. Relevant-object recovery and coordinate error are compared with frame truth.

## Implemented system

The lane shares closed registry validation, the bounded local runner, benchmark
aggregation and portfolio compilation. Twelve synthetic annotated frames, ten objects per frame, changing relevance and a six-frame keyframe interval. Actual wire bytes, packets and reconstructed scene history; byte ratio, relevant-object recall and coordinate error.

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

Relevance labels are supplied truth. JSON packet savings are not video compression performance, detector accuracy, a radio demonstration, physical feasibility or DP2 qualification.

Python timing and allocation peaks are machine-specific observations. Fixed
fixture statistics are descriptive; independent scientific generalization needs
a new evaluation design. No population confidence or hardware energy is inferred.

## Next research and work plan

Attach current official requirements and DP2 qualification evidence. Establish real EO/video datasets and detector outputs, compare against conventional video codecs, then measure reconstruction utility, latency and power on declared hardware.

SOW.md defines the source work packages; risk_register.md tracks evidence and
operational risks. Commercialization remains a customer hypothesis, without
invented pricing, team, traction or customer commitments.

## Submission constraints

Current official topic revision, deadline, eligibility and format require source
review. The registry retains the supplied planning values and missing evidence.
Markdown is an editable technical paper, not a rendered PDF or a measured page
count. Final claim approval, attachments and portal receipt remain human gates.
