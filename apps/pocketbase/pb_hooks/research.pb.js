// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/research.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/mission-research.js, apps/pocketbase/pb_hooks/research-policy.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/mission-research.js; CONSUMES apps/pocketbase/pb_hooks/research-policy.js
// DAG Node:    none
// Intent:      Expose authenticated research routes and protect native file operations without alternate bearer authentication.
// ───────────────────────────────────────────────────────────────

onRecordCreateRequest((e) => require(`${__hooks}/research-policy.js`).upload(e), 'research_uploads');
onRecordDeleteRequest((e) => require(`${__hooks}/research-policy.js`).removeUpload(e), 'research_uploads');
onFileDownloadRequest((e) => require(`${__hooks}/research-policy.js`).download(e), 'research_uploads');
onRecordViewRequest((e) => require(`${__hooks}/research-policy.js`).download(e), 'research_uploads');

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/research', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/mission-research.js`).snapshot(e));
}, $apis.requireAuth('users'));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/research/{id}', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/mission-research.js`).detail(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/research', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/mission-research.js`).command(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(65536));
routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/research-worker/queue', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/mission-research.js`).queue(e));
}, $apis.requireAuth('users'));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/research-worker', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/mission-research.js`).work(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(65536));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/discord-research', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/mission-research.js`).discordCommand(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(65536));
routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/discord-research/upload', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/mission-research.js`).discordUpload(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(22020096));
