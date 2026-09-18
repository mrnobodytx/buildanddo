// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/estateSurfaces.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    OPERATOR-PLANE-UNLOCK-001
// Seat:        rig1-release
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     scripts/deploy/ship.py (BUILDANDDO_ESTATE_SURFACES -> VITE_BUILDANDDO_ESTATE_SURFACES)
// EnumType:    ConfigDoc
// EnumEdges:   CONSUMES import.meta.env
// DAG Node:    none
// Intent:      Estate-only workspace surfaces (the Citadel fleet view) stay out of the public BuildAndDo
//              build unless the CNWB build opts in; a route that is not built cannot be reached by URL.
// ───────────────────────────────────────────────────────────────

/** Estate surfaces render only when the build opts in (CNWB internal builds set this to '1'). */
export const ESTATE_SURFACES_ENABLED = import.meta.env.VITE_BUILDANDDO_ESTATE_SURFACES === '1';

/** Keep an entry unless it is marked `estate: true` and estate surfaces are off. */
export const visibleSurfaces = (entries) =>
    entries.filter((entry) => !entry.estate || ESTATE_SURFACES_ENABLED);
