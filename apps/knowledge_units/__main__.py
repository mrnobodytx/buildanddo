# ─── CGRF Header ──────────────────────────────
# File:        apps/knowledge_units/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-KNOWLEDGE-UNIT-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-KNOWLEDGE-UNIT-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-23
# Depends:     apps/knowledge_units/cli.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/knowledge_units/cli.py
# DAG Node:    none
# Intent:      Allow python -m apps.knowledge_units.
# ─────────────────────────────────────────────────────────────

"""Run the Knowledge Unit CLI."""

from apps.knowledge_units.cli import main

raise SystemExit(main())
