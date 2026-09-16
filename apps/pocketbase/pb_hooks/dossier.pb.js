// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/dossier.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/private-dossier.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/private-dossier.js
// DAG Node:    none
// Intent:      Expose native-authenticated private dossier commands with no-store responses and no search terms in request URLs.
// ───────────────────────────────────────────────────────────────

routerAdd('POST', '/api/buildanddo/dossier/read', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/private-dossier.js`).read(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(16384));
routerAdd('POST', '/api/buildanddo/dossier', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/private-dossier.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(65536));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/discord-dossier', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/private-dossier.js`).discord(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(65536));
