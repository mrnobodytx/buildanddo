# ─── CGRF Header ──────────────────────────────
# File:        .bits/queue/VCC-BUILDANDDO-TRADE-ASSIST-001.md
# Stage:       11_COMMIT
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     .bits/srs/SRS-BUILDANDDO-TRADE-ASSIST-001.md
# EnumType:    Doc
# EnumEdges:   GATES bits/SRS-BUILDANDDO-TRADE-ASSIST-001-* branches; DEPENDS_ON .bits/srs/SRS-BUILDANDDO-TRADE-ASSIST-001.md
# DAG Node:    none
# Intent:      Authorize the additive guildmaster content assist without delivery, model providers, storage or web changes.
# ─────────────────────────────────────────────────────────────

# Dispatch VCC-BUILDANDDO-TRADE-ASSIST-001

**SRS:** SRS-BUILDANDDO-TRADE-ASSIST-001 **Risk:** A1 **Seat:** C-ONE **Status:** in_progress

| # | Task | Gate command | Status |
|---|------|--------------|--------|
| 1 | Intake normalization for walk-in and TradeBuilder records | `python -m unittest tests.trade_assist.test_trade_assist.IntakeTests && echo PASS` | done |
| 2 | Guild roster and producer/verifier separation | `python -m unittest tests.trade_assist.test_trade_assist.RosterTests && echo PASS` | done |
| 3 | Provenance-labelled drafting | `python -m unittest tests.trade_assist.test_trade_assist.DraftTests && echo PASS` | done |
| 4 | Oracle claim check and Director Nexus safety check | `python -m unittest tests.trade_assist.test_trade_assist.VerifyTests && echo PASS` | done |
| 5 | Mission, envelope digest and dry-run-only delivery | `python -m unittest tests.trade_assist.test_trade_assist.PackageTests && echo PASS` | done |
| 6 | CLI, coverage, boundary, context | `python tests/trade_assist/check_trade_assist.py && python scripts/ci/verify_public_boundary.py && python scripts/ci/agent_context.py --check && echo PASS` | done |

May touch: `apps/trade_assist/**`, `tests/trade_assist/**`, this dispatch, the SRS, the registry,
`.bits/handoffs/2026-10-16-C-ONE-CNWB-trade-assist.md`, `.bits/context.lock.json`,
`.bits/hostinger-readiness.lock.json` (refresh only).
Must not touch: existing application code, PocketBase, web, CI or private-plane files.
