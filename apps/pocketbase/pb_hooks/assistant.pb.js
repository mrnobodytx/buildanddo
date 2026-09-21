// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_hooks/assistant.pb.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/workspace-assistant.js
// EnumType:     Route
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-assistant.js
// DAG Node:     none
// Intent:       Mount native authenticated personal assistant routes with no shared tenant or superuser credential.
// ───────────────────────────────────────────────────────────────

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/assistant', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-assistant.js`).snapshot(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/assistant', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-assistant.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(16000));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/assistant/chat', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-assistant.js`).chat(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(64000));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/assistant/knowledge', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-assistant.js`).knowledge(e));
}, $apis.requireAuth('users'));
