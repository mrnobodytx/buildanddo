// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/tutorial-learning.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     apps/pocketbase/pb_hooks/tutorial-learning.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/tutorial-learning.js
// DAG Node:    none
// Intent:      Keep personal learning commands authenticated, bounded and uncached through native PocketBase auth.
// ───────────────────────────────────────────────────────────────

routerAdd('GET', '/api/buildanddo/learning', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/tutorial-learning.js`).list(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/learning/states', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/tutorial-learning.js`).states(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/learning/{id}', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/tutorial-learning.js`).detail(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/learning/{id}', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/tutorial-learning.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(4000));
