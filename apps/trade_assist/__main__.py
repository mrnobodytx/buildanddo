# ─── CGRF Header ──────────────────────────────
# File:        apps/trade_assist/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-TRADE-ASSIST-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-TRADE-ASSIST-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/trade_assist/cli.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/trade_assist/cli.py
# DAG Node:    none
# Intent:      Allow python -m apps.trade_assist.
# ─────────────────────────────────────────────────────────────

"""Run the trade assist CLI."""

from apps.trade_assist.cli import main

raise SystemExit(main())
