# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-EVOLUTION-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .bits/srs/SRS-BUILDANDDO-EVOLUTION-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-EVOLUTION-001.md; DEPENDS_ON .bits/srs_registry.yml
# Intent:      Bound and verify the additive evolution loop before any receiving runtime integration.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-EVOLUTION-001

**SRS:** SRS-BUILDANDDO-EVOLUTION-001 **Risk:** A1
**Seat:** BITS-CODEGEN **Status:** in_progress

## Task table

| Phase | Task | Gate | Status |
|---|---|---|---|
| A | Typed observations, adapters, episodes and candidates | `python -m unittest tests.upgrade.test_evolution_events -v` | PASS: 19 tests |
| B | Replay, shadow, typed promotion, compilation and registry | `python -m unittest tests.upgrade.test_evolution_learning -v` | PASS: 24 tests |
| C | Local journal, CLI and historical benchmark | `python -m unittest tests.upgrade.test_evolution_cli -v` | PASS: 20 tests |
| D | Actual benchmark, coverage, contract regression and governance | Smoke block below | PASS: 9/9 smoke; 16 modules above 91% coverage |

## Scope

Add libs/evolution/**, scripts/citadel-evolve, tests/upgrade/test_evolution*.py,
docs/verified-evolution.md, .bits/out/VCC-BUILDANDDO-EVOLUTION-001/** and the
receiving-runtime handoff in .bits/handoffs/2026-09-21-bits-codegen-cmax-b-evolution-runtime.md.
Register this spec and dispatch atomically under the A1 fast path. Regenerate
the context/readiness locks as required by the existing governance. Preserve
the session-managed branch. No existing runtime, policy or workflow changes.

## Memory Brief

Phase 1 release ingestion is already merged. Typed P0 verification, promotion,
source/context identity and transaction contracts are the safety kernel. The
latest sprint source implementation is not deployed acceptance. The owner asks
for numerical chronological learning from real BuildAndDo history, separate
discovery/holdout evidence, proposal-only compilation and reversible demotion.
Model agreement cannot establish truth; historical ordering cannot establish
causality; captured public exports cannot authenticate their claimed identities.

## Smoke test

```bash
python -m unittest discover -s tests/upgrade -p 'test_evolution*.py' -v
python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py'
python -m mypy --strict libs/evolution
python -m ruff check libs/evolution tests/upgrade/test_evolution*.py
python -m libs.evolution --state /tmp/buildanddo-evolution.sqlite benchmark --repository . --limit 100
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
```

Each phase prints PASS or FAIL after its gate. Source tests and the historical
run cannot substitute for independently captured runtime TEVV or model outcomes.
