// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/metrics.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/pocketbase/pb_hooks/telemetry.js
// EnumType:    Adapter
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/telemetry.js
// DAG Node:    none
// Intent:      Register real JSVM CRUD and request hooks while keeping telemetry optional.
// ───────────────────────────────────────────────────────────────

// PocketBase callbacks execute in isolated JSVM scopes. Require the helper
// inside every callback; outer lexical bindings are not shared with callbacks.
onRecordAfterCreateSuccess((event) => {
    event.next();
    try {
        require(`${__hooks}/telemetry.js`).record(event, 'create', false);
    } catch (_) {
        /* Fail open. */
    }
});
onRecordAfterUpdateSuccess((event) => {
    event.next();
    try {
        require(`${__hooks}/telemetry.js`).record(event, 'update', false);
    } catch (_) {
        /* Fail open. */
    }
});
onRecordAfterDeleteSuccess((event) => {
    event.next();
    try {
        require(`${__hooks}/telemetry.js`).record(event, 'delete', false);
    } catch (_) {
        /* Fail open. */
    }
});
onRecordAfterCreateError((event) => {
    event.next();
    try {
        require(`${__hooks}/telemetry.js`).record(event, 'create', true);
    } catch (_) {
        /* Fail open. */
    }
});
onRecordAfterUpdateError((event) => {
    event.next();
    try {
        require(`${__hooks}/telemetry.js`).record(event, 'update', true);
    } catch (_) {
        /* Fail open. */
    }
});
onRecordAfterDeleteError((event) => {
    event.next();
    try {
        require(`${__hooks}/telemetry.js`).record(event, 'delete', true);
    } catch (_) {
        /* Fail open. */
    }
});
routerUse((event) => {
    let telemetry;
    try {
        telemetry = require(`${__hooks}/telemetry.js`);
    } catch (_) {
        return event.next();
    }
    return telemetry.observeRequest(event);
});
