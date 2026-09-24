// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/domains.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-SITE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-SITE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/domain-verification.js, apps/pocketbase/pb_hooks/workspace-record-policy.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/domain-verification.js; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-record-policy.js
// DAG Node:    none
// Intent:      Expose workspace domain reads and ownership commands to signed-in members while keeping verification state server-owned.
// ───────────────────────────────────────────────────────────────

onRecordCreateRequest((e) => require(`${__hooks}/workspace-record-policy.js`).domainWrite(e, 'create'), 'domains');
onRecordUpdateRequest((e) => require(`${__hooks}/workspace-record-policy.js`).domainWrite(e, 'update'), 'domains');

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/domain', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/domain-verification.js`).read(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/domain', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/domain-verification.js`).save(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(2000));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/domain/challenge', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/domain-verification.js`).issue(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(2000));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/domain/verify', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    const { code, body } = require(`${__hooks}/domain-verification.js`).verify(e);
    if (body.retry_after) e.response.header().set('Retry-After', String(body.retry_after));
    return e.json(code, body);
}, $apis.requireAuth('users'), $apis.bodyLimit(2000));
