// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/administration.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workspace-record-policy.js, apps/pocketbase/pb_hooks/workspace-administration.js, apps/pocketbase/pb_hooks/workspace-community.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-record-policy.js; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-administration.js; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-community.js
// DAG Node:    none
// Intent:      Expose authenticated administration and community commands while protecting native workspace record writes.
// ───────────────────────────────────────────────────────────────

const scopedCollections = ['services', 'missions', 'signals', 'workflows', 'roadmap_items', 'erp_contacts', 'erp_objectives', 'erp_tasks',
    'social_channels', 'social_content', 'specialist_desks', 'support_sources', 'corrections', 'daily_editions', 'challenge_submissions',
    'operations', 'operation_runs', 'seat_events', 'evidence'];
onRecordCreateRequest((e) => require(`${__hooks}/workspace-record-policy.js`).enforce(e, 'create'), ...scopedCollections);
onRecordUpdateRequest((e) => require(`${__hooks}/workspace-record-policy.js`).enforce(e, 'update'), ...scopedCollections);
onRecordDeleteRequest((e) => require(`${__hooks}/workspace-record-policy.js`).enforce(e, 'delete'), ...scopedCollections);
onRecordCreateRequest((e) => require(`${__hooks}/workspace-record-policy.js`).workspaceCreate(e), 'workspaces');

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/access', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-access.js`).access(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/admin', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-administration.js`).snapshot(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/admin', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-administration.js`).command(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/integrations', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-administration.js`).integrations(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/wiki', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-community.js`).wiki(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/forums', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-community.js`).forums(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/forums/{id}', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-community.js`).thread(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/community', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/workspace-community.js`).command(e));
}, $apis.requireAuth('users'));
