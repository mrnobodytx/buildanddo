# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/USO-BUILDANDDO-CRAWL-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-CRAWL-001
# CAPS:        pending
# CK:          pending
# Dispatch:    USO-BUILDANDDO-CRAWL-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     .bits/srs/SRS-BUILDANDDO-CRAWL-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-CRAWL-001-* branches; VALIDATES scripts/crawl_check.py
# Intent:      Authorize an additive public crawl verifier that reuses the governed research Firecrawl integration.
# ───────────────────────────────

# Dispatch USO-BUILDANDDO-CRAWL-001

**SRS:** SRS-BUILDANDDO-CRAWL-001 **Risk:** A1 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

Every canonical BuildAndDo public route can be checked through the existing
Firecrawl integration with structured, actionable pass/fail evidence.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Register the SRS and dispatch | `python scripts/ci/agent_context.py --check && echo PASS || echo FAIL` | done |
| 2 | Implement canonical inventory loading and governed Firecrawl scraping | `python scripts/crawl_check.py --help >/dev/null && echo PASS || echo FAIL` | done |
| 3 | Implement page and classrooms-specific validation with JSON reporting | `python -m unittest tests.test_crawl_check && echo PASS || echo FAIL` | done |
| 4 | Verify public boundaries and measured agent context | `python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS || echo FAIL` | done |

## Constraints

- Files this dispatch may touch: `.bits/srs_registry.yml`, this SRS and queue
  entry, `.bits/context.lock.json`, `scripts/crawl_check.py`, and focused Python
  tests for the crawl checker, plus the dispatch report, verification and memory
  artifacts under `.bits/out/USO-BUILDANDDO-CRAWL-001/`.
- Files it must not touch: public route definitions, research Firecrawl modules,
  deployment controls, shared CI workflows, provider configuration, secrets,
  private evidence or a running service.
- Anything that would raise the risk tier above A1: live-provider execution,
  production mutation, secret access, egress-policy bypass or shared workflow
  changes.

## Definition of done

- [x] Every gate command passes and the output is in the PR.
- [x] `python scripts/ci/agent_context.py --check` passes.
- [x] `python scripts/ci/verify_public_boundary.py` passes.
- [ ] Registry status remains `in_progress` until merge verification.
- [x] Anything discovered but out of scope is recorded as a finding, not fixed.
