# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-INTEGRITY-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     AGENTS.md, apps/career/evidence.py, apps/career/ledger.py
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-INTEGRITY-001-* branches; DEPENDS_ON apps/career/ledger.py
# DAG Node:    none
# Intent:      Make self-reported success structurally worthless: the actor never controls the success definition, the evidence, the verifier, the settlement or the audit.
# ─────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-INTEGRITY-001 — Epistemic Integrity Fabric, slice 1

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

Reward, XP and TP become targets. Any actor that controls its own success
definition, evidence, verifier or settlement will eventually game them
(specification gaming, rubric rewriting, sycophancy, concealed failure).

## Scope

Add dependency-free `apps/integrity/`:

- **Intent contract**: frozen, digest-bound success criteria, disallowed
  shortcuts, required evidence and verifier requirements. Amendment produces a
  new version with a parent digest; reports against an old digest are rejected.
- **Adjudication**: seven named dimensions (OUTCOME, PROVENANCE, SAFETY,
  GENERALIZATION, NEGATIVE_CONTROL, INDEPENDENCE, REPRODUCIBILITY), each a hard
  gate. No averaging: disagreement among independent verifiers is `CONTESTED`
  and kept. Verifier independence is measured by identity and model family.
- **Settlement**: consumes only a verdict. Disclosed failure raises trust;
  concealed failure or a false success claim costs trust and opens an
  investigation; contested or incomplete verdicts hold all reward.
- **Decision trace**: observation, inference, prediction, outcome and
  counterfactual layers kept separate; predictions must precede outcomes.
- **Sycophancy probe**: identical evidence under opposite human stances must
  yield the same conclusion.
- **Audit**: deterministic sampling that includes successes, re-execution, and
  revocation of a PASS whose evidence does not reproduce, listing rewards to reverse.
- CLI `python -m apps.integrity`, tests and a coverage gate.

## Out of scope

Running Kestrel, Nemesis, models or observers; any network, PocketBase, web or
schema change; changing existing XP/TP or promotion code. This slice defines and
enforces the contract those systems report into.

## Invariants

- The actor's own reports and actor-sourced evidence carry no weight.
- A reviewer from the actor's model family is not independent.
- A shortcut reported by any independent verifier fails the verdict.
- `PASS` requires every dimension `PASS`; `Outcome PASS + Provenance missing` is not a pass.
- A system may propose its own success but can never certify it.

## Acceptance evidence

1. `python tests/integrity/check_integrity.py` passes, >= 80 percent statement coverage per module.
2. `python scripts/ci/verify_public_boundary.py` and `python scripts/ci/agent_context.py --check` pass.

## Rollback

Delete `apps/integrity`, `tests/integrity`, this spec, its dispatch and registry entry.
