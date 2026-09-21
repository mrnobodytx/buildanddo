# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/evolution/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-EVOLUTION-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-EVOLUTION-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/evolution/cli.py
# EnumType:    Service
# EnumEdges:   CONSUMES libs/evolution/cli.py
# Intent:      Make the governed local lifecycle runnable without installation or third-party dependencies.
# ───────────────────────────────────────────────────────────────

"""Run the local evolution CLI through Python's module entry point."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
