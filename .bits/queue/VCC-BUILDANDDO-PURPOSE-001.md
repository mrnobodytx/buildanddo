# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-PURPOSE-001.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-PURPOSE-001
# CAPS:        B
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-PURPOSE-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     .bits/srs/SRS-BUILDANDDO-PURPOSE-001.md, .bits/srs_registry.yml
# EnumType:    Dispatch
# EnumEdges:   IMPLEMENTS SRS-BUILDANDDO-PURPOSE-001
# DAG Node:    none
# Intent:      Record the C-ONE dispatch that makes the public pages describe an educational platform.
# ───────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-PURPOSE-001

**SRS:** SRS-BUILDANDDO-PURPOSE-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

## Objective

A visitor reading any public page learns the same thing: BuildAndDo is an educational, collaborative platform
where people learn by doing real work together, with people and AI, and keep the evidence.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | `purpose.js`, the one source, and a guard test that fails on a planted phrase | `vitest run src/lib/__tests__/purpose.test.js` | pending |
| 2 | FAQ, About intro, footer, unused Hero, sign-up, pricing and docs intros | the whole web suite | pending |
| 3 | Early-access form asks about learning; stored field names unchanged | the whole web suite | pending |
| 4 | Share image: live domain, re-rendered PNG proven against a render of the unchanged SVG; alt text | `npm run build`; pixel comparison | pending |
| 5 | Repository gates | `hostinger_readiness.py --check`, `agent_context.py --check`, `verify_public_boundary.py` | pending |

## Constraints

- Files this dispatch may touch:
  - `apps/web/src/lib/purpose.js` and its test;
  - `apps/web/src/components/site/{Faq,Footer,Hero,EarlyAccess}.jsx`;
  - `apps/web/src/pages/{AboutPage,SignupPage,PricingPage,DocsPage}.jsx`;
  - `apps/web/src/components/Seo.jsx`;
  - `apps/web/tools/generate-seo.mjs`;
  - `apps/web/public/social-card.{svg,png}`;
  - this bookkeeping and the readiness and context locks.
- The backend and the stored early-access field names do not change.
- No real machine name or address may enter this repository, including test fixtures.
- Raises the tier: deploy, push. Neither is performed without the operator.

## Definition of done

- [ ] Every gate command passes and the output is in the PR.
- [ ] The guard test fails on a planted retired phrase and passes without it.
- [ ] Anything discovered but out of scope is recorded as a finding, not fixed.
