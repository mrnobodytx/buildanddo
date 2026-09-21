# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-EVOLUTION-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     AGENTS.md, libs/semantic_twin/promotions.py, libs/semantic_twin/transactions.py
# EnumType:    Doc
# EnumEdges:   CONSUMES AGENTS.md; CONSUMES libs/semantic_twin/promotions.py; CONSUMES libs/semantic_twin/transactions.py
# Intent:      Connect captured experience to measured proposal competence without increasing execution authority.
# ───────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-EVOLUTION-001 — Citadel Verified Evolution Fabric v1

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Authority and intent

The owner's continuation requests a closed evolution loop on the existing
semantic twin. AGENTS.md permits registering and dispatching additive A1 modules
before implementation. This scope adds a Python standard-library package, local
CLI, tests, documentation and dispatch evidence. Existing application, semantic
contracts, policies, CI and deployment behavior remain outside this dispatch.
Required measured-context/readiness bindings are regenerated after source review.

Competence may improve automatically. Authority may not. Every produced action is
a proposal bound to the existing ChangeContract/SemanticTransaction boundary.
No command executes proposed actions, calls a model/provider, grants authority,
authenticates an exported identity, signs evidence or writes to a remote system.

## Requirements

1. Normalize local captured observations with immutable scope, three timestamps,
   source digests, evidence state, actor, correlation, authority and risk.
   Support captured provider, mission-learning, memory, telemetry and twin data.
2. Build chronological episodes preserving unsuccessful attempts. A complete
   narrative and a passing provider status do not imply independent verification.
3. Discover exact structured pattern/response candidates. Count observations and
   independently supported successes separately; candidates remain hypotheses.
4. Replay on disjoint, later holdout episodes. Exclude discovery identities,
   source revisions and correlations; bind decision inputs to an as-of context.
5. Compare captured model proposals in shadow without effects. Teacher agreement
   is independent of correctness against typed outcome evidence.
6. Measure numerators, denominators, missing labels and resource usage explicitly.
   Privileged competence states require revision-bound PromotionProof and TEVV
   receipts covering the exact replay/shadow artifacts. No verified boolean.
7. Compile structured graph rules to deterministic ActionProposals. Registry
   routing uses configured proposal-only fallbacks and preserves authority/scope.
8. Retain append-only local observations and registry history; demote on unsafe
   proposals, declining measured quality, incompatible inputs or TEVV regression.
9. Benchmark roughly 100 actual local BuildAndDo commits, using parent trees for
   predictions and retained receipts for outcome grading. Missing historical
   tests, repairs, runtime outcomes or model captures remain UNMEASURED. Compare
   chronological epochs only when their corpus and scoring boundaries match.
10. Expose observe, episodes, candidates, replay, shadow, promote, benchmark and
    status commands plus proposal-use/demotion where needed to close the loop.

## Acceptance

- `python -m unittest discover -s tests/upgrade -p 'test_evolution*.py' -v`
  exercises the lifecycle, fail-closed evidence gates, leakage, authority/scope,
  demotion, retry/conflict handling, deterministic rules and CLI persistence.
- `python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py'`
  preserves integration with all existing contract consumers.
- `python -m mypy --strict libs/evolution` and Ruff pass for new production code.
- Standard-library trace coverage measures at least 80 percent of executable
  production lines; synthetic fixtures remain labelled as source-test evidence.
- A real local historical benchmark retains source identities, parent-tree
  boundaries and measured denominators; no invented model or outcome scores.
- Public-boundary, context, sprint readiness and submission-policy checks pass.

## Rollback

Remove the additive package/CLI and its registration; retain or archive ignored
local SQLite journals and captured benchmark outputs. No runtime deployment or
external action is performed, so no remote compensation is required.
