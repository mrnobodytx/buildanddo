// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/business-execution.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/pocketbase/pb_hooks/business-actions.js, apps/pocketbase/pb_hooks/workspace-replay.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/business-actions.js; CONSUMES apps/pocketbase/pb_hooks/workspace-replay.js
// DAG Node:    none
// Intent:      Expose workspace-bound business reads and commands through the existing native authentication boundary.
// ───────────────────────────────────────────────────────────────

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/business', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/business-actions.js`).list(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/mission-replay/{mission}', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-replay.js`).capture(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/business', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/business-actions.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(100000));
