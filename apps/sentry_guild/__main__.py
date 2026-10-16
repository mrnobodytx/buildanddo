# ─── CGRF Header ──────────────────────────────
# File:        apps/sentry_guild/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-SENTRY-GUILD-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-SENTRY-GUILD-001
# Seat:        C-ONE
# Owner:       Citadel Nexus Inc.
# Created:     2026-10-16
# Depends:     apps/sentry_guild/cli.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/sentry_guild/cli.py
# DAG Node:    none
# Intent:      Allow python -m apps.sentry_guild.
# ─────────────────────────────────────────────────────────────

"""Run the Sentry guild CLI."""

from apps.sentry_guild.cli import main

raise SystemExit(main())
