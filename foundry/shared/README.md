# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/README.md, foundry/shared/federal_foundry/__init__.py
# EnumType:    Doc
# EnumEdges:   EXTENDS foundry/README.md; OWNS foundry/shared/federal_foundry/__init__.py
# DAG Node:    foundry.shared.plan
# Intent:      Describe the reusable validation and compilation boundary shared by all foundry lanes.
# ───────────────────────────────────────────────────────────────

# Shared foundry components

The package contains working implementations of the public interfaces:

| Component | API | Responsibility |
|---|---|---|
| Requirements | RequirementTracker | Validate an entire update batch before changing any requirement; require scoped reviewed evidence for satisfaction |
| Claims | ClaimEvidenceCompiler | Preserve claim wording and reject unsupported or foreign evidence promotion |
| Local execution | LocalExperimentRunner.run | Execute reviewed argv, bound time/logs, preserve inputs and failure/cancellation receipts |
| Benchmark harness | ReferenceBenchmarkHarness.run | Run a registered candidate against its pinned fixture and aggregate repeated seed groups |
| Campaign | run_campaign / verify_campaign | Schedule bounded trials across lanes and recompute all summaries from their receipts |
| Replay | replay_run | Rerun the built-in workload with identical input/source and compare computational bytes |
| Portfolio | PortfolioCompiler | Derive matrices, reports, white-paper sources, slides and a read-only HTML index from checked evidence |
| Export | verify_bundle / package_bundle | Check the complete manifest and produce a reproducible ZIP |

Runtime imports use Python's standard library, PyYAML and the existing public
mission-suite engine. The maritime reference reuses that engine and its evidence
epoch code. It introduces no alternate signing, auth, Merkle or admission owner.

See foundry/README.md for the runnable CLI, input/output contracts, coverage gates
and the explicit limits of each research reference. No frontend or live service
is needed to execute this workflow.
