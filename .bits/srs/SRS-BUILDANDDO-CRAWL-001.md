# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-CRAWL-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-CRAWL-001
# CAPS:        pending
# CK:          pending
# Dispatch:    USO-BUILDANDDO-CRAWL-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-17
# Depends:     apps/web/src/lib/publicPages.js, apps/research/processing.py, apps/research/contracts.py
# EnumType:    Doc
# EnumEdges:   CONSUMES apps/web/src/lib/publicPages.js; EXTENDS apps/research/processing.py; VALIDATES https://buildanddo.tech
# Intent:      Specify repeatable Firecrawl-backed evidence that every canonical public page renders its required public content.
# ───────────────────────────────

# SRS-BUILDANDDO-CRAWL-001 — Public page crawl verification

**Status:** in_progress **Risk:** A1 **Seat:** BITS-CODEGEN

## Problem

BuildAndDo maintains a canonical inventory of public routes, but has no single
verification command that proves those routes return rendered content with the
expected document metadata. A route can therefore remain registered while its
deployment returns an error shell, loses its title or description, or renders
too little content to be useful.

The research subsystem already owns the self-hosted Firecrawl configuration,
HTTP transport and outbound-target policy. Public verification must reuse those
controls instead of adding a second crawler client.

## Intent

Provide a deterministic command that scrapes every canonical public route,
evaluates public rendering invariants, writes a machine-readable report, and
returns a failing process status when any route violates the contract.

## Scope

- Read the canonical `PUBLIC_PAGES` declarations from
  `apps/web/src/lib/publicPages.js` without importing browser-only JavaScript.
- Use `BUILDANDDO_FIRECRAWL_URL` and `BUILDANDDO_FIRECRAWL_KEY` through the
  existing research settings, endpoint, transport and egress-guard patterns.
- Validate scrape success, source HTTP status, expected title, meta description,
  absence of rendered error-state markers and a configurable content floor.
- Apply a focused `/classrooms` contract requiring lesson-oriented content and
  calls to action on its public landing page.
- Emit a stable JSON report with summary and per-page evidence; exit non-zero
  for configuration errors, inventory errors, scrape errors or page failures.
- Add network-free tests using controlled Firecrawl responses.
- Keep CI integration optional: the command is CI-compatible, but changing a
  shared workflow is outside this additive A1 dispatch.

## Out of scope

- Deployment, production mutation or a live-provider acceptance run.
- Changes to the canonical route inventory or research Firecrawl infrastructure.
- Browser interaction, screenshot comparison, accessibility or performance
  budgets.
- Shared GitHub Actions workflow changes.

## Acceptance evidence

1. Focused tests prove passing, metadata, HTTP, content, error-state and
   `/classrooms` behavior without network access.
2. The command writes JSON for both successful and failed page checks.
3. The command returns zero only when every canonical public page passes.
4. Static inspection confirms the command imports the existing research client,
   endpoint, settings and egress guard rather than implementing replacements.

## Verification

```bash
python -m unittest tests.test_crawl_check
python scripts/crawl_check.py --help
python scripts/ci/verify_public_boundary.py
python scripts/ci/agent_context.py --check
```
