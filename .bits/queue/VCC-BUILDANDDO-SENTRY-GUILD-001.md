# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-SENTRY-GUILD-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     .bits/srs/SRS-BUILDANDDO-SENTRY-GUILD-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-SENTRY-GUILD-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-SENTRY-GUILD-001.md
# DAG Node:    none
# Intent:      Authorize the additive Sentry guild without SDK installs, endpoints, secrets or network calls.
# ─────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-SENTRY-GUILD-001

**SRS:** SRS-BUILDANDDO-SENTRY-GUILD-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Scope guard and event scrubbing | `python -m unittest tests.sentry_guild.test_sentry_guild.ScrubTests && echo PASS` | done |
| 2 | Seer signature check, parsing and run folding | `python -m unittest tests.sentry_guild.test_sentry_guild.SeerTests && echo PASS` | done |
| 3 | Code-free lessons and evidence-gated promotion | `python -m unittest tests.sentry_guild.test_sentry_guild.LessonTests && echo PASS` | done |
| 4 | Metric verification verdicts | `python -m unittest tests.sentry_guild.test_sentry_guild.VerifyTests && echo PASS` | done |
| 5 | Guild handoff, human closer | `python -m unittest tests.sentry_guild.test_sentry_guild.HandoffTests && echo PASS` | done |
| 6 | CLI, coverage, boundary, context | `python tests/sentry_guild/check_sentry_guild.py && python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

May touch: `apps/sentry_guild/**`, `tests/sentry_guild/**`, this dispatch, the SRS, the registry,
`.bits/context.lock.json`, `.bits/hostinger-readiness.lock.json` (refresh only).
Must not touch: existing application code, PocketBase, web, CI or private-plane files.
