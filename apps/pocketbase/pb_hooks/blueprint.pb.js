// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/blueprint.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/workspace-blueprints.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-blueprints.js
// DAG Node:    none
// Intent:      Expose authenticated workspace blueprint intake and review through native PocketBase routes and protected research storage.
// ───────────────────────────────────────────────────────────────

routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/blueprints', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    const result = require(`${__hooks}/workspace-blueprints.js`).upload(e);
    return e.json(result.record.status === 'ready' ? 200 : 202, result);
}, $apis.requireAuth('users'), $apis.bodyLimit(22020096));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/blueprints', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-blueprints.js`).snapshot(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/blueprints/{id}', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-blueprints.js`).detail(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/blueprints/{id}/commands', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-blueprints.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(4096));
