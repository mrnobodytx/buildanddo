// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/government.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/government-desk.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/government-desk.js
// Intent:      Serve protected research content through native authentication without cacheable responses.
// ───────────────────────────────────────────────────────────────

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/government', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    e.response.header().set('Vary', 'Authorization');
    return e.json(200, require(`${__hooks}/government-desk.js`).read(e));
}, $apis.requireAuth('users'));
