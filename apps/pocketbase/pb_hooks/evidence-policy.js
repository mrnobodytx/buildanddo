// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/evidence-policy.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workflow-policy.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js
// DAG Node:    none
// Intent:      Keep evidence writes with their author and current workspace authority while permitting readable same-workspace mission links.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workflow-policy.js`);

/** Require the current author and a writable workspace for every evidence mutation. */
function author(e) {
    access.authenticated(e);
    if (e.record.getString('owner') !== e.auth.id)
        throw new ForbiddenError('Only the evidence author can change this record.');
    access.writable(e.app, e.auth, e.record.getString('workspace'));
}

/** Validate evidence ownership and its mission before an ordinary API write. */
function enforce(e, creating) {
    author(e);
    if (!creating) {
        const original = e.record.original();
        if (e.record.getString('owner') !== original.getString('owner') ||
            e.record.getString('workspace') !== original.getString('workspace'))
            access.invalid('Evidence ownership and workspace cannot be reassigned.');
    }
    const missionId = e.record.getString('mission');
    if (missionId) {
        const mission = access.find(e.app, 'missions', missionId);
        if (mission.getString('workspace') !== e.record.getString('workspace'))
            access.invalid('Select a mission from this evidence workspace.');
        access.readable(e.app, mission, e.requestInfo());
    }
    return e.next();
}

/** Retain deletion authority with the current writable-workspace author. */
function remove(e) {
    author(e);
    return e.next();
}

module.exports = { enforce, remove };
