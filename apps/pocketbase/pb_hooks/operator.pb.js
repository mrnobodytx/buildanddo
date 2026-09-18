// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/operator.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/workspace-operator.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-operator.js
// DAG Node:    none
// Intent:      Expose current workspace observations through a read-only native-auth operator route.
// ───────────────────────────────────────────────────────────────

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/operator', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-operator.js`).snapshot(e));
}, $apis.requireAuth('users'));
