# ─── CGRF Header ───────────────────────────────────────────────
# File:        tests/assurance/__init__.py
# Stage:       08_TEST
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-22
# Depends:     tests/assurance/run.py
# EnumType:    Test
# EnumEdges:   CONSUMES tests/assurance/run.py
# Intent:      Keep runtime assurance separate from source-only checks so absent runtimes cannot become acceptance.
# ───────────────────────────────────────────────────────────────

"""Run explicit disposable-system assurance profiles."""
