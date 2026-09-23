// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/career-profile.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CAREER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CAREER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/career-profile.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/career-profile.js; PRODUCES GET /api/buildanddo/career/profile
// DAG Node:    none
// Intent:      Serve the signed-in user's Citadel-held career profile with native auth and no-store, so it loads at login and is never cached.
// ───────────────────────────────────────────────────────────────

routerAdd('GET', '/api/buildanddo/career/profile', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    const result = require(`${__hooks}/career-profile.js`).load(e);
    return e.json(result.status, result.body);
}, $apis.requireAuth('users'));
