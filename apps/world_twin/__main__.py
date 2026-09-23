# ─── CGRF Header ──────────────────────────────
# File:        apps/world_twin/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-WORLD-TWIN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-WORLD-TWIN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/world_twin/cli.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/world_twin/cli.py
# DAG Node:    none
# Intent:      Allow python -m apps.world_twin.
# ─────────────────────────────────────────────────────────────

"""Run the world twin CLI."""

from apps.world_twin.cli import main

raise SystemExit(main())
