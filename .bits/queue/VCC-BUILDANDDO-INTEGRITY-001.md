# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-INTEGRITY-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-INTEGRITY-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-INTEGRITY-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-INTEGRITY-001.md
# DAG Node:    none
# Intent:      Authorize the additive integrity fabric without external effects or changes to existing reward code.
# ─────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-INTEGRITY-001

**SRS:** SRS-BUILDANDDO-INTEGRITY-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Frozen intent contract and amendment | `python -m unittest tests.integrity.test_integrity.ContractTests && echo PASS` | done |
| 2 | Hard-gate adjudication, independence, contested verdicts | `python -m unittest tests.integrity.test_integrity.VerdictTests && echo PASS` | done |
| 3 | Disclosure-aware settlement | `python -m unittest tests.integrity.test_integrity.SettlementTests && echo PASS` | done |
| 4 | Decision trace and sycophancy probe | `python -m unittest tests.integrity.test_integrity.TraceTests && echo PASS` | done |
| 5 | Audit sampling and revocation | `python -m unittest tests.integrity.test_integrity.AuditTests && echo PASS` | done |
| 6 | CLI, coverage, boundary and context | `python tests/integrity/check_integrity.py && python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

May touch: `apps/integrity/**`, `tests/integrity/**`, this dispatch, the SRS, the
registry, `.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json` (refresh only).
Must not touch: existing application, reward, PocketBase, web, CI or private-plane files.
