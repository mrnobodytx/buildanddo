# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/shared/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/README.md, foundry/shared/federal_foundry/__init__.py
# EnumType:    Doc
# EnumEdges:   EXTENDS foundry/README.md; OWNS foundry/shared/federal_foundry/__init__.py
# DAG Node:    foundry.shared.plan
# Intent:      Describe the reusable validation and compilation boundary shared by all foundry lanes.
# ───────────────────────────────────────────────────────────────

# Shared foundry components

The `federal_foundry` package is deliberately independent of React, PocketBase,
live providers and government portals. It provides:

- schema and cross-reference validation for opportunity and result records;
- requirement state tracking with verified-evidence gates;
- claim-to-evidence compilation that rejects unsupported promotion;
- typed asynchronous experiment-runner and benchmark-harness protocols; and
- deterministic lane and portfolio bundle generation.

Implementations of the runner protocols belong in lane branches. They must return
bounded, serializable results and evidence locators; an interface result is not
automatically trusted or verified.
