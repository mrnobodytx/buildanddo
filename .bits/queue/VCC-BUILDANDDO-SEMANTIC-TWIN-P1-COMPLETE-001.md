# ─── CGRF Header ────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-19
# Depends:     .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001.md
# DAG Node:    semantic-twin.phase-1.complete
# Intent:      Authorize the Phase 1 v2 integration repair and local evidence validation without deployment, signing or external-write authority.
# ───────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001

**SRS:** SRS-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

## Continuation authority and gates

The owner's 2026-09-19 request to complete the remaining half of Phase 1
authorizes repairing existing ingestion against the merged Phase 0 v2 contracts.
The earlier task results below describe the pre-merge implementation, not current
acceptance. This continuation must pass all four gates:

| Phase | Task | Gate | Status |
|-------|------|------|--------|
| A | Rebuild source, claims and receipts as typed v2 envelopes | `python -m unittest tests.upgrade.test_semantic_twin_ingestion -v` | done |
| B | Integrate all adapters, canonical epochs and context replay | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete -v` | done |
| C | Verify Phase 0 compatibility and negative integrity cases | `python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py' -v` | done |
| D | Compile current evidence, record gaps, and validate governance | `python scripts/ci/verify_public_boundary.py` and `python scripts/ci/agent_context.py --check` | done; runtime inputs remain unavailable |
| E | Reconcile PR #55 with main while retaining both integration suites | `python -m unittest tests.upgrade.test_semantic_twin_integration -v` and the combined suite | done |

The owner's follow-up requests resolution of PR #55's merge conflicts. Preserve
main's snapshot/deferred-edge APIs and the Phase 1 batch/proof implementation,
reconcile their consumer documentation, and regenerate this dispatch's evidence.

## Objective

Complete all ten remaining Phase 1 capabilities as deterministic local adapters,
semantic reconciliation and replayable proof compilation.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Release-state receipt ingestion | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.ReleaseStateTests -v` | done |
| 2 | Local Git evolution ingestion | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.GitHistoryTests -v` | done |
| 3 | SBOM and lock ingestion | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.SbomTests -v` | done |
| 4 | Captured GitLab export ingestion | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.ProviderExportTests.test_gitlab_export -v` | done |
| 5 | Captured Datadog export ingestion | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.ProviderExportTests.test_datadog_export -v` | done |
| 6 | Typed memory ingestion | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.MemoryTests -v` | done |
| 7 | Symbol evidence and staleness | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.ClaimIntelligenceTests -v` | done |
| 8 | Release-truth reconciliation | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.ReconciliationTests -v` | done |
| 9 | Semantic epoch and inclusion proofs | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.MerkleEpochTests -v` | done |
| 10 | Context proof query and replay | `python -m unittest tests.upgrade.test_semantic_twin_phase1_complete.ContextProofTests -v` | done |

## Constraints

- Files this dispatch may touch: `libs/semantic_twin/phase1/**`,
  `libs/semantic_twin/ingestion/**`, `libs/semantic_twin/README.md`,
  `tests/upgrade/test_semantic_twin_ingestion.py`,
  `tests/upgrade/test_semantic_twin_phase1_complete.py`, additional focused Phase 1
  migration tests, this SRS/dispatch,
  `.bits/srs_registry.yml`, `.bits/context.lock.json`, and
  `.bits/out/VCC-BUILDANDDO-SEMANTIC-TWIN-P1-COMPLETE-001/**`.
- Files it must not touch: `tools/buildanddo_release.py`, Phase 0 contracts,
  workflows, application runtime, deployment,
  private-plane paths or existing dispatch evidence.
- Excluded effects: credentials, external writes, deployment, runtime persistence,
  signing, attestation or canonical promotion. Connected read-only evidence checks
  may establish availability; raw private observations must remain outside Git.

## Smoke test

```bash
python -m unittest tests.upgrade.test_semantic_twin_phase1_complete -v
python -m unittest discover -s tests/upgrade -p 'test_semantic_twin*.py' -v
python -m mypy --strict libs/semantic_twin/ingestion libs/semantic_twin/phase1
python -m ruff check libs/semantic_twin/ingestion libs/semantic_twin/phase1 tests/upgrade/test_semantic_twin_ingestion.py tests/upgrade/test_semantic_twin_phase1_complete.py tests/upgrade/test_semantic_twin_integration_v2.py
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```

## Definition of done

- [x] All ten task gates pass.
- [x] Every new module measures at least 80 percent line coverage.
- [x] Public-boundary and measured-context gates pass.
- [x] Memory and report artifacts preserve runnable verification evidence.
- [x] Out-of-scope live-provider and private-plane work remains unperformed.

## Operational acceptance still requires inputs

The code and local fixtures do not establish a current production release. Supply
public controller receipts and GitLab/Datadog exports for the intended release.
No such local inputs are present in this continuation; connected Datadog lookups
did not return matching runtime evidence in the checked window. Until those inputs
are available, operational acceptance remains PARTIAL even when all code gates pass.
