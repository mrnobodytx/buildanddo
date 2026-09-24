# ─── CGRF Header ───────────────────────────────────────────────
# File:        libs/capability_tokens/__main__.py
# Stage:       07_BUILD
# SRS:         SRS-BUILDANDDO-CAPABILITY-TOKEN-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-CAPABILITY-TOKEN-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-21
# Depends:     libs/capability_tokens/cli.py
# EnumType:    Service
# EnumEdges:   DEPENDS_ON libs/capability_tokens/cli.py
# Intent:      Expose the capability protocol through the Python module entry point.
# ───────────────────────────────────────────────────────────────

"""Run the local CNWB capability protocol."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
