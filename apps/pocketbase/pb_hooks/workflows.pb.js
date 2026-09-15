// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workflows.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workflow-runs.js, apps/pocketbase/pb_hooks/workflow-policy.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-runs.js; DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js
// DAG Node:    none
// Intent:      Expose bounded native-authenticated workflow commands and enforce definition invariants on collection requests.
// ───────────────────────────────────────────────────────────────

onRecordCreateRequest((e) => require(`${__hooks}/workflow-policy.js`).enforce(e, true), 'workflows');
onRecordUpdateRequest((e) => require(`${__hooks}/workflow-policy.js`).enforce(e, false), 'workflows');
onRecordDeleteRequest((e) => require(`${__hooks}/workflow-policy.js`).remove(e), 'workflows');

routerAdd('POST', '/api/buildanddo/workflow-runs', (e) => {
    const result = require(`${__hooks}/workflow-runs.js`).start(e);
    return e.json(result.replayed ? 200 : 201, result);
}, $apis.requireAuth());

routerAdd('POST', '/api/buildanddo/workflow-runs/{id}/decisions', (e) => {
    const result = require(`${__hooks}/workflow-runs.js`).advance(e);
    return e.json(200, result);
}, $apis.requireAuth());
