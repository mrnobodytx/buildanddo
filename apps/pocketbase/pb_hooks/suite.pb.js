// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/suite.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_hooks/mission-suite.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/mission-suite.js
// DAG Node:    none
// Intent:      Expose a single bounded native-auth endpoint for callers and registered suite workers.
// ───────────────────────────────────────────────────────────────

routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/suite', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/mission-suite.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(1000000));
