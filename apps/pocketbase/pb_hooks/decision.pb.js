// ─── CGRF Header ──────────────────────────────
// File:        apps/pocketbase/pb_hooks/decision.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-DECISION-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-DECISION-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/workflow-policy.js, apps/decision/contract.py
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js; USES_TEMPLATE apps/decision/contract.py
// DAG Node:    none
// Intent:      Expose the typed decision contract to authenticated workspace members without granting action or verification authority.
// ───────────────────────────────────────────────────────────

routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/decide', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/decision-runtime.js`).decide(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(262144));

routerAdd('GET', '/api/buildanddo/workspaces/{workspace}/decisions/{decision}', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/decision-runtime.js`).detail(e));
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/buildanddo/workspaces/{workspace}/blueprints', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/decision-runtime.js`).blueprint(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(29360128));
