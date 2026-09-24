# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/career_passport/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     libs/career_passport/cli.py
# EnumType:    Scaffold
# EnumEdges:   CONSUMES libs/career_passport/cli.py
# Intent:      Expose the bounded career compiler as a standard Python module command.
# ───────────────────────────────────────────────────────────────

"""Run the career compiler without a third-party runtime."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
