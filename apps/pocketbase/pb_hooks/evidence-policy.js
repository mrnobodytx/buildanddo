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

/** Preserve evidence selected by a completed review, including legacy missions. */
function retainReviewed(e) {
    let executions;
    try { executions = e.app.findRecordsByFilter('business_jobs', 'evidence = {:evidence}', '', 1, 0, { evidence: e.record.id }); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    if (executions?.length) access.invalid('Execution evidence is retained with its exact result. Record a separate correction.');
    const original = e.record.original();
    const missionId = original.getString('mission') || e.record.getString('mission');
    if (!missionId) return;
    const mission = access.find(e.app, 'missions', missionId);
    const review = access.json(mission, 'mission_review', {});
    if (mission.getString('status') === 'verified' && ['test', 'evaluate', 'verify', 'validate'].some((key) => review?.[key]?.evidence === e.record.id))
        access.invalid('This evidence supports a verified mission. Create a correction or new evidence; keep the reviewed record.');
}

/** Validate evidence ownership and its mission before an ordinary API write. */
function enforce(e, creating) {
    author(e);
    if (!creating) {
        retainReviewed(e);
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
    retainReviewed(e);
    return e.next();
}

module.exports = { enforce, remove };
