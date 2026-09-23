# ─── CGRF Header ──────────────────────────────
# File:        apps/career/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAREER-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAREER-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     apps/career/cli.py
# EnumType:    Adapter
# EnumEdges:   DEPENDS_ON apps/career/cli.py
# DAG Node:    none
# Intent:      Allow `python -m apps.career` to run the local CLI.
# ─────────────────────────────────────────────────────────────

"""Run the career CLI as a module."""

from apps.career.cli import main

raise SystemExit(main())
