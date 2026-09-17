# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-DECISION-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-DECISION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DECISION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     AGENTS.md, apps/pocketbase/pb_hooks/workflow-policy.js, services/praxis_evidence
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-DECISION-001-* branches; DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js
# DAG Node:    none
# Intent:      Specify a small typed decision API that can improve behind a stable boundary without granting action or verification authority.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-DECISION-001 — Decision Runtime Phase 1

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

BuildAndDo exposes the mechanics of routing, evidence, provenance, authority and
verification whenever a caller only needs a bounded judgment. That makes simple
integration expensive and encourages callers to bypass the existing boundaries.
The public developer contract should reduce this to a typed `decide()` call while
leaving action and verification as separate, already-governed operations.

## Intent

Provide a dependency-free Phase 1 decision runtime with six question types,
deterministic-first routing, authority-bounded escalation, structured evaluation
capture and an authenticated PocketBase adapter. A decision may cite existing
evidence but never creates evidence, performs an action or marks an outcome verified.

## Scope

- Add `apps/decision/` with typed question primitives, result contracts, router
  backends and a single asynchronous `decide()` entry point.
- Add six trial workload definitions for challenge selection, issue classification,
  urgency, action/no-action, read-only tool routing and evidence support.
- Add dependency-free benchmark metrics and privacy-bounded structured decision
  logging suitable for later outcome and human-correction attachment.
- Add one PocketBase route at
  `POST /api/buildanddo/workspaces/{workspace}/decide` using existing native auth
  and current workspace membership checks. It emits structured decision records;
  it does not add a persistence schema or remote transport.
- Add Python behavior/coverage tests and a Node JSVM route test.

## Out of scope

- Actions, workflow execution, mission transitions or changes to A0–A3 policy.
- Evidence creation, verification settlement or promotion to a verified state.
- External models, provider SDKs, credentials, network calls, training or deployment.
- A new datastore, background worker, event bus integration or private-plane bridge.

## Invariants

- `decide()` is the only Python entry point intended for callers in Phase 1.
- Rules run first; local classification runs only for unmatched questions; frontier
  fallback is a structured stub and requires at least A1 authority.
- No backend can exceed the caller's maximum authority. Unavailable escalation
  produces a typed abstention, not an implicit permission increase.
- Every `DecisionResult.verified` is `False`, including evidence-support workloads.
- Structured logs contain state hashes and question contracts, never raw state.
- Public request and response names do not expose internal implementation fabrics.

## Acceptance evidence

1. `python tests/upgrade/check_decision_runtime.py` passes all behavior tests and
   reports at least 80 percent statement coverage for every `apps/decision` module.
2. `node --test tests/upgrade/decision-runtime.test.mjs` proves native auth,
   workspace scoping, typed response shape, authority fencing and non-verification.
3. `python -m unittest tests.upgrade.test_decision_runtime` covers all primitives,
   routing order/escalation, workloads, malformed input, state references, logging
   and benchmark calculations.
4. `python scripts/ci/verify_public_boundary.py` reports `PASS`.
5. `python scripts/ci/agent_context.py --check` reports a current context lock.

## Rollback

Remove the additive `apps/decision` package, its two test gates, this spec and its
dispatch/registry entries. No schema or persisted application state needs reversal.
