# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-DEVELOPMENT-LOOP-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-DEVELOPMENT-LOOP-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     .bits/srs/SRS-BUILDANDDO-DEVELOPMENT-LOOP-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   DEPENDS_ON .bits/srs/SRS-BUILDANDDO-DEVELOPMENT-LOOP-001.md; DEPENDS_ON .bits/srs_registry.yml
# Intent:      Bound the requested integration to existing evidence, proposal and authority contracts with retained operational gaps.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-DEVELOPMENT-LOOP-001

SRS: SRS-BUILDANDDO-DEVELOPMENT-LOOP-001. Status: in_progress.
Risk: A1. Seat: BITS-CODEGEN. Actor: agent.

## Memory Brief

Phase 1 ingestion, evolution, capability tokens and Day-21 tools are merged.
Provider PASS strings, self-hashes and model agreement do not establish truth.
Use the existing ReviewPolicy, VerificationReceipt, ReplayCase, PromotionProof
and ActionProposal boundaries. The historical Hostinger candidate and its 12/12
probe are not current 18-profile acceptance or official submission. The sandbox
initially restored an older ancestor; locally available merged work was brought
forward before integration. Retain the session-managed branch.

## Task table

| Phase | Task | Gate | Status |
|---|---|---|---|
| A | Authenticated repository observations into the existing journal | `python -m unittest tests.upgrade.test_development_sources -v` | PASS: 9 tests; actual candidate run captured |
| B | Provenance assessment, sprint ranking and mission packet bridge | `python -m unittest tests.upgrade.test_development_intelligence -v` | PASS: 11 tests; one real-source P0 packet proposed |
| C | Frozen test-selection predictions and independent outcome admission | `python -m unittest tests.upgrade.test_development_loop -v` | PASS: 22 tests; independent gate preserved |
| D | Real dogfood, qualification limits and submission audit | Retained verify script and smoke block | PASS for local experiment/audit; real qualification and submission HOLD |

## Scope and gates

Add libs/evolution/development_sources.py, libs/evolution/intelligence.py,
libs/evolution/development.py, focused tests, docs, this registration/dispatch,
receiving handoff and .bits/out/VCC-BUILDANDDO-DEVELOPMENT-LOOP-001 evidence.
Regenerate context/readiness locks required by existing governance. Do not modify
existing application/runtime, safety contracts, workflows or prior evidence.
Every phase records PASS or FAIL; fix in-scope source failures with retained
red/green evidence. Missing external evidence remains a named operational HOLD.

```bash
python -m unittest discover -s tests/upgrade -p 'test_development*.py' -v
python -m unittest discover -s tests/upgrade -p 'test_evolution*.py'
python -m unittest discover -s tests/upgrade -p 'test_capability_token*.py'
python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py'
python -m mypy --strict --explicit-package-bases libs/evolution/development_sources.py libs/evolution/intelligence.py libs/evolution/development.py
python -m ruff check libs/evolution/development_sources.py libs/evolution/intelligence.py libs/evolution/development.py tests/upgrade/test_development*.py
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
python scripts/ci/hostinger_readiness.py --check
python scripts/ci/submission_readiness.py --check
```

Actual local experiment: 105 semantic objects, three selected suites, 42 tests,
no failures/skips, zero independently graded pairs and no promoted capability.
Existing focused regressions: 63 evolution, 50 capability-token and 122
semantic-twin tests pass. Broader acceptance: 3/18 profiles PASS, four FAIL,
one HOLD and ten BLOCKED. Source Node reaches 477/509 after local process
permissions are restored; 32 existing migration-fixture cases lack `$filepath`.
Source Python executes 688 tests without failures but skips six dependency-bound
cases. See this dispatch's report and receiving handoff for exact evidence and
remaining owners. Contract checks and refreshed locks cannot override those states.
