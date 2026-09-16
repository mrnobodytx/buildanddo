# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/lanes/diu-sentinel-maritime/submission_checklist.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/registry/diu-sentinel-maritime/opportunity.yaml, foundry/templates/submission_checklist.md
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON foundry/registry/diu-sentinel-maritime/opportunity.yaml; USES_TEMPLATE foundry/templates/submission_checklist.md
# DAG Node:    foundry.lane.diu-sentinel-maritime
# Intent:      Separate deterministic package checks from human approval and portal submission.
# ───────────────────────────────────────────────────────────────

# Submission checklist — DIU Sentinel Maritime

## Machine-checkable

- [ ] Registry and results validate.
- [ ] Requirement and claim evidence is complete.
- [ ] Experiments and benchmarks reproduce from frozen inputs.
- [ ] Final rendered file identities and format checks are recorded.

## Human authority

- [ ] Current official requirements, deadline and eligibility were reviewed.
- [ ] Claims, IP, data rights, pricing and company facts were approved.
- [ ] Team, partner, physical-evidence and certification statements were approved.
- [ ] The exact portal package was approved and its submission receipt preserved.

Compiler output never checks the human-authority boxes.
