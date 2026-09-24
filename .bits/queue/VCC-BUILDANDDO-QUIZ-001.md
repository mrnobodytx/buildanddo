# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-QUIZ-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-QUIZ-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-QUIZ-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     .bits/srs/SRS-BUILDANDDO-QUIZ-001.md, .bits/srs_registry.yml
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-QUIZ-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-QUIZ-001.md
# DAG Node:    none
# Intent:      Authorize the owner-requested server-graded quiz without deployment, secret or external effects.
# ───────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-QUIZ-001

**SRS:** SRS-BUILDANDDO-QUIZ-001 **Risk:** A2 **Seat:** BITS-CODEGEN **Status:** in_progress

## Objective

The public community catalogue carries no lesson answers, and the Discord quiz
is graded by the server without revealing the right choice on a wrong answer.

## Task table

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Catalogue without answers; build gate scans every output file | `node --test tests/upgrade/public-lessons.test.mjs tests/upgrade/discord-catalogue.test.mjs && echo PASS` | pending |
| 2 | Server grading route, bot token, members-only refusal, rate limit | `node --test tests/upgrade/community-quiz.test.mjs && node --test tests/upgrade/*.test.mjs && echo PASS` | pending |
| 3 | Bot grades through the route and reports unavailability | `python3 tests/upgrade/check_discordbot.py && echo PASS` | pending |
| 4 | Lint, build, boundary | `cd apps/web && npm run lint && npm run build && cd ../.. && python scripts/ci/verify_public_boundary.py && echo PASS` | pending |
| 5 | Context and readiness | `python scripts/ci/agent_context.py --check && python scripts/ci/hostinger_readiness.py --check && python scripts/ci/submission_readiness.py --check && echo PASS` | pending |

## Constraints

- May touch: `apps/web/tools/generate-community.mjs`,
  `apps/web/tools/check-public-lessons.mjs`, `apps/web/tools/build.mjs`,
  new `apps/pocketbase/pb_hooks/community-quiz*.js` files,
  `scripts/discordbot/**`, `tests/upgrade/**`, `docs/discord-bot.md`,
  `.env.example` and `docker-compose.yml` (the variable name only), this
  dispatch, the SRS, the registry, `.bits/context.lock.json`,
  `.bits/hostinger-readiness.lock.json`.
- Must not touch: `apps/pocketbase/pb_migrations/**` (including `data/*.json`),
  secrets or `secrets/**`, deployment execution, private-plane files.
- No secret values anywhere; configuration by variable name only.
