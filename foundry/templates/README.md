# ─── CGRF Header ───────────────────────────────────────────────
# File:        foundry/templates/README.md
# Stage:       06_PLAN
# SRS:         SRS-BUILDANDDO-UPGRADE-001
# CAPS:        pending
# CK:          pending
# Dispatch:    VCC-BUILDANDDO-UPGRADE-001
# Seat:        BITS-CODEGEN
# Owner:       Citadel Nexus Inc.
# Created:     2026-09-16
# Depends:     foundry/README.md
# EnumType:    Doc
# EnumEdges:   EXTENDS foundry/README.md
# DAG Node:    foundry.templates
# Intent:      Explain how lane scaffolds and compiled artifacts use the reusable output templates.
# ───────────────────────────────────────────────────────────────

# Foundry templates

These files define the minimum reviewer-facing shape for every lane. Tokens use
double braces: `{{lane_id}}`, `{{topic}}`, and `{{opportunity_path}}`.

A lane may add sections, but it must retain evidence state, source identity,
acceptance criteria and unresolved gaps. Generated matrices are rebuilt from
`opportunity.yaml` and `results.json`; narrative documents remain human-authored.
