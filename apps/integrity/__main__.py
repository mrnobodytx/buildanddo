# ─── CGRF Header ──────────────────────────────
# File:        apps/integrity/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-INTEGRITY-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-INTEGRITY-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/integrity/cli.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/integrity/cli.py
# DAG Node:    none
# Intent:      Allow python -m apps.integrity.
# ─────────────────────────────────────────────────────────────

"""Run the integrity CLI."""

from apps.integrity.cli import main

raise SystemExit(main())
