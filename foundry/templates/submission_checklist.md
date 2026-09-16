# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/templates/submission_checklist.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/README.md
# EnumType:    Doc
# EnumEdges:   EXTENDS foundry/README.md
# DAG Node:    foundry.templates
# Intent:      Keep machine checks separate from the human and portal approvals needed for submission.
# ───────────────────────────────────────────────────────────────

# Submission checklist — {{topic}}

## Machine-checkable

- [ ] Registry and results validate.
- [ ] Every requirement disposition cites acceptable evidence.
- [ ] Every included claim is supported at its requested level.
- [ ] Benchmark artifacts reproduce from frozen inputs.
- [ ] Final source and rendered file digests are recorded.
- [ ] Page, slide, attachment and naming constraints pass.

## Human authority

- [ ] Current official topic, FAQ, deadline and eligibility were reviewed.
- [ ] Proposal truthfulness and final claims were approved.
- [ ] IP, data rights, price, cost and commercialization were approved.
- [ ] Team, key-personnel, partner and customer statements were approved.
- [ ] Required physical evidence and certifications were reviewed.
- [ ] The exact portal package was approved and its receipt preserved.

Compiler output never checks the human-authority boxes.
