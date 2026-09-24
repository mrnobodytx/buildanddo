# ─── CGRF Header ──────────────────────────────
# File:        .bits/srs/SRS-BUILDANDDO-QUIZ-001.md
# Stage:       04_HYPOTHESIZE
# SRS:         SRS-BUILDANDDO-QUIZ-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-QUIZ-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-24
# Depends:     AGENTS.md, .bits/srs/SRS-BUILDANDDO-TRUST-001.md, apps/web/tools/generate-community.mjs, scripts/discordbot/service.py
# EnumType:    Doc
# EnumEdges:   GATES claude/* and bits/SRS-BUILDANDDO-QUIZ-001-* branches; EXTENDS .bits/srs/SRS-BUILDANDDO-TRUST-001.md; DEPENDS_ON apps/pocketbase/pb_hooks/tutorial-learning.js
# DAG Node:    none
# Intent:      Remove the last public copy of lesson answers by grading the Discord quiz on the server.
# ────────────────────────────────────────────────────────────

# SRS-BUILDANDDO-QUIZ-001 — Server-graded community quiz

**Status:** in_progress **Risk:** A2 **Seat:** BITS-CODEGEN

**Authorization:** the repository owner requested this on 2026-09-24, as the
follow-up to SRS-BUILDANDDO-TRUST-001, with the standing instruction that no
secrets may be exposed. Recorded here before implementation.

## Problem

SRS-BUILDANDDO-TRUST-001 removed knowledge-check answers from the web bundle,
`tutorials` REST reads and the learning, government and classroom feeds. One
public copy remains: `apps/web/tools/generate-community.mjs` writes
`community-catalog.json` into the served build with `check.answer` and
`check.explanation` for every starter and government lesson, because the
Discord bot grades its quiz locally from that file. Anyone can read the answers
from the site, so the website's server-checked certificate needs no learning.

## Scope

1. Stop publishing `check.answer` and `check.explanation` in
   `community-catalog.json`; keep the question and choices so the bot can ask.
2. A PocketBase route, `POST /api/buildanddo/community/quiz/check`, grades one
   choice for one lesson slug from the `tutorials` collection and returns
   `{correct}`, with the explanation only when the choice is correct.
3. The route accepts only the community bot, by a bearer token compared in
   constant time against `BUILDANDDO_COMMUNITY_BOT_TOKEN`; unset or short
   configuration refuses with 503.
4. Attempts are bounded per Discord user and lesson, and per Discord user, in a
   shared in-process limiter with a bounded number of tracked keys.
5. The bot calls the route using `BUILDANDDO_POCKETBASE_URL` and the new token
   variable, and says plainly when grading is unavailable.
6. The build fails if any file in its output carries an authored lesson's
   answer field or explanation fingerprint, including `community-catalog.json`.
7. `BUILDANDDO_COMMUNITY_BOT_TOKEN` is declared by name only in `.env.example`,
   the compose PocketBase environment and the bot documentation.

## Out of scope

- Moving `apps/pocketbase/pb_migrations/data/*.json` or removing answers from
  them. The migrations seed from these files and the repository is public; the
  owner has not yet decided where authored answers should live. Until then the
  source files remain a readable copy for anyone who opens the repository.
- Linking Discord identities to website accounts or awarding website progress
  from Discord. Quiz answers in Discord stay practice only.
- Setting the token on any host, registering commands or deploying the bot.

## Invariants (security)

- No token value is written to the repository, a log line, an API response or a
  test fixture beyond obviously synthetic test strings.
- A wrong answer never reveals the correct choice or the explanation.
- Government lessons are members-only on the website and are never graded
  through the anonymous bot route.
- Missing or unsafe configuration fails closed with a plain message.
- Neither the token nor the submitted choice nor the answer is logged.

## Acceptance

1. `community-catalog.json` contains no `answer` or `explanation` field; the
   bot parses and asks every lesson from it.
2. The build gate fails on a planted answer or explanation anywhere in the
   output, and passes the real build.
3. The route returns `{correct: false}` on a wrong choice, `{correct: true,
   explanation}` on a right one, 503 without a usable token, 401 on a wrong or
   missing token, 403 for a government lesson, and 429 over the limit.
4. The bot grades through the route and reports unavailability without
   inventing a result.
5. Node upgrade tests, the bot suite with its coverage gate, lint, build, the
   boundary check, context and readiness checks pass.

## Verification

`node --test tests/upgrade/*.test.mjs`,
`python3 tests/upgrade/check_discordbot.py`, `npm run lint`, `npm run build`,
`python scripts/ci/verify_public_boundary.py`,
`python scripts/ci/agent_context.py --check`,
`python scripts/ci/hostinger_readiness.py --check`,
`python scripts/ci/submission_readiness.py --check`.
