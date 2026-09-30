// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/publicExposure.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
// EnumType:    ConfigDoc
// EnumEdges:   CONSUMES .bits/srs/SRS-BUILDANDDO-UPGRADE-001.md
// Intent:      Keep build output and edge denial aligned when retiring public operational projections.
// ───────────────────────────────────────────────────────────────

export const RETIRED_PUBLIC_FEEDS = Object.freeze([
    'fleet-status.json', 'platform-health.json', 'roadmap-status.json', 'capabilities.json', 'activity-status.json',
]);

/** Match a retired root publication, including common cached/compressed aliases. */
export function retiredPublicFeed(pathname) {
    let decoded;
    try { decoded = decodeURIComponent(pathname); } catch { return false; }
    const path = decoded.replace(/^\/+|\/+$/g, '').replace(/\.(?:br|gz)$/i, '');
    return RETIRED_PUBLIC_FEEDS.includes(path);
}
