# ─── CGRF Header ───────────────────────────────────────────────
# File:        .bits/queue/C-ONE-20260912-WRITING-JOURNEY-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-WRITING-JOURNEY-001
# CAPS:        pending
# CK:          pending
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-12
# Depends:     .bits/srs/SRS-BUILDANDDO-WRITING-JOURNEY-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-WRITING-JOURNEY-001-* branches
# Intent:      Authorise the public writing journey page.
# ───────────────────────────────────────────────────────────────

# Dispatch C-ONE-20260912-WRITING-JOURNEY-001

**SRS:** SRS-BUILDANDDO-WRITING-JOURNEY-001 **Risk:** A1 **Seat:** C-ONE **Status:** ready

Authorised by the operator on 2026-09-12, directly: build the public learner journey and the clean-browser
proof, and display the claim separation rather than collapsing it.

## Objective

A visitor can reach `/write`, do the writing exercise end to end, and see four separate claims about their
work — where today there is no public surface on which any educational work can be done at all.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Education API client with honest failure results | `npx esbuild src/lib/writingEducation.js --format=esm --bundle=false --outfile=/dev/null` | done |
| 2 | Public `/write` page rendering the four claims | `npx esbuild src/pages/WritingChallengePage.jsx --jsx=automatic --format=esm --bundle=false --outfile=/dev/null` | done |
| 3 | Route registered without disturbing existing routes | `npx esbuild src/App.jsx --jsx=automatic --format=esm --bundle=false --outfile=/dev/null` | done |
| 4 | Page degrades honestly when the API is absent | browser check at `/write`: shows the real HTTP error, no fabricated challenge, no loading state beside an error | done |
| 5 | Governance lock regenerated | `python scripts/ci/agent_context.py --write` | done |

## Constraints

- Files this dispatch may touch: `apps/web/src/pages/WritingChallengePage.jsx`,
  `apps/web/src/lib/writingEducation.js`, `apps/web/src/App.jsx`, `.bits/srs/`, `.bits/srs_registry.yml`,
  `.bits/queue/`, `.bits/context.lock.json`
- Files it must not touch: PocketBase migrations, deployment scripts, any existing page component
- No deployment. No production mutation. No account/tenancy work.
