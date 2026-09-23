// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/classrooms.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_hooks/classrooms.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/classrooms.js
// DAG Node:    none
// Intent:      Bind classroom reads and commands to native users authentication with private noncached responses.
// ───────────────────────────────────────────────────────────────

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/classrooms', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classrooms.js`).list(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/classrooms/{id}', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classrooms.js`).detail(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/classrooms', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classrooms.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(30000));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/classrooms/{id}/record', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classrooms.js`).record(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/classrooms/{id}/presence', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classrooms.js`).heartbeat(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(2000));
