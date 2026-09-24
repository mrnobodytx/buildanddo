// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/workspace-claims.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/workspace-claims.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-claims.js
// Intent:      Expose bounded claim commands only through existing native users authentication.
// ----------------------------------------------------------------

routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/claims', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-claims.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(30000));
