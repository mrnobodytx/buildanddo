# ─── CGRF Header ─────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md; EXTENDS libs/semantic_twin
# DAG Node:    semantic-twin.phase-1.release-ingestion
# Intent:      Authorize additive read-only compilation of the public BuildAndDo release path into Phase 0 semantic contracts.
# ──────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001

**SRS:** SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

Compile the bounded BuildAndDo release path from public source, SRS claims and
local receipts into one deterministic, connected semantic graph without
executing deployment code or accessing external systems.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Extract release source semantics with the Python AST | `python -m unittest tests.upgrade.test_semantic_twin_ingestion.SourceIngestionTests -v && echo PASS` | done |
| 2 | Build the connected canonical release-path graph | `python -m unittest tests.upgrade.test_semantic_twin_ingestion.ReleaseGraphTests -v && echo PASS` | done |
| 3 | Extract and classify BuildAndDo SRS claims | `python -m unittest tests.upgrade.test_semantic_twin_ingestion.ClaimExtractionTests -v && echo PASS` | done |
| 4 | Ingest local deployment receipts and verification evidence | `python -m unittest tests.upgrade.test_semantic_twin_ingestion.ReceiptIngestionTests -v && echo PASS` | done |
| 5 | Canonically serialize objects with deterministic leaf digests | `python -m unittest tests.upgrade.test_semantic_twin_ingestion.SerializerTests -v && echo PASS` | done |
| 6 | Pass the complete Phase 1 smoke and repository gates | `python -m unittest tests.upgrade.test_semantic_twin_ingestion -v && python -m compileall -q libs/semantic_twin tests/upgrade/test_semantic_twin_ingestion.py && python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

## Constraints

- Files this dispatch may touch: `libs/semantic_twin/ingestion/**`,
  `tests/upgrade/test_semantic_twin_ingestion.py`,
  `.bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md`,
  `.bits/srs_registry.yml`,
  `.bits/queue/VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001.md`,
  `.bits/context.lock.json`, and
  `.bits/out/VCC-BUILDANDDO-SEMANTIC-TWIN-INGESTION-001/**`.
- Input files under `tools/` and `.bits/` are read-only ingestion targets.
- The implementation must use only Python standard library plus Phase 0.
- Anything that would raise risk above A1: network calls, credentials, external
  writes, deployment, persisted services, canonical promotion or signing.

## Smoke test

```bash
python -m unittest tests.upgrade.test_semantic_twin_ingestion -v
python -m compileall -q libs/semantic_twin tests/upgrade/test_semantic_twin_ingestion.py
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```

## Definition of done

- [x] Every task gate passes and the statuses above are updated to `done`.
- [x] The complete smoke test passes.
- [x] Registry status remains `in_progress` until merge verification.
- [x] No release controller, existing SRS spec or existing receipt is changed.
- [x] Anything discovered but out of scope is reported, not fixed inline.
