// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/knowledge.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/workspace-knowledge.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-knowledge.js
// DAG Node:    none
// Intent:      Expose private read-only graph and context assembly through PocketBase users authentication without logging queries in URLs.
// ───────────────────────────────────────────────────────────────

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/knowledge', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-knowledge.js`).snapshot(e));
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/knowledge/context', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-knowledge.js`).assemble(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(8192));
