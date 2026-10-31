// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/guild-publishing.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/guild-publishing.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/guild-publishing.js; VERIFIED_BY tests/upgrade/guild-publishing.test.mjs
// Intent:      Expose the guild publication history and the owner/admin withdrawal command through native users authentication.
// ----------------------------------------------------------------

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/guild-publications', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/guild-publishing.js`).list(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/guild-publications', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/guild-publishing.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(30000));
