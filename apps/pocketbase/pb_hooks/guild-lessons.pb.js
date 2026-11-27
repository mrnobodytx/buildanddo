// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guild-lessons.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/guild-lessons.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/guild-lessons.js; VERIFIED_BY tests/upgrade/guild-lessons.test.mjs
// Intent:      Expose guild lesson reads and guildmaster authoring commands through native users authentication.
// ----------------------------------------------------------------

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/guild-lessons', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/guild-lessons.js`).list(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/guild-lessons', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/guild-lessons.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(30000));
