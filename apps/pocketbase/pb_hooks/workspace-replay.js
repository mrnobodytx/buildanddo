// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-replay.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/workflow-runs.js, apps/pocketbase/pb_hooks/business-actions.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_hooks/workflow-runs.js; DEPENDS_ON apps/pocketbase/pb_hooks/business-actions.js
// Intent:      Capture a bounded mission's readable history in one transaction with exact content digests and explicit integrity gaps.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const workflows = require(`${__hooks}/workflow-runs.js`);
const business = require(`${__hooks}/business-actions.js`);
const LIMIT = 200;
const EVIDENCE = ['workspace', 'mission', 'owner', 'type', 'category', 'title', 'source', 'content', 'url', 'created', 'updated'];
function canonical(value, depth = 0) {
    // The aggregate nests already bounded snapshots more deeply than a command.
    if (depth > 32) throw new ApiError(413, 'Captured history exceeds the nesting limit.');
    if (Array.isArray(value)) return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
    return JSON.stringify(value);
}
function pick(record, fields, json = []) {
    return { id: record.id, ...Object.fromEntries(fields.map((key) => [key, json.includes(key) ? access.json(record, key) : record.getString(key)])) };
}
function readable(app, record, info, workspace) {
    if (record.getString('workspace') !== workspace || !app.canAccessRecord(record, info, record.collection().viewRule))
        throw new ForbiddenError('The complete mission history is not readable by this account.');
    return record;
}
function rows(app, collection, workspace, mission, info) {
    const records = app.findRecordsByFilter(collection, 'workspace = {:workspace} && mission = {:mission}', 'created,id', LIMIT + 1, 0, { workspace, mission });
    if (records.length > LIMIT) throw new ApiError(413, 'This mission exceeds the bounded export limit. Request an operator export; no partial capture was produced.');
    return records.map((record) => readable(app, record, info, workspace));
}

/** Capture observed history without executing work or certifying the outcome. */
function capture(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e), id = access.id(e.request.pathValue('mission')), info = e.requestInfo();
    let result;
    e.app.runInTransaction((app) => {
        access.requireRole(app, e.auth, workspace);
        const record = readable(app, access.find(app, 'missions', id), info, workspace);
        const mission = pick(record, ['workspace', 'owner', 'title', 'description', 'status', 'created', 'updated',
            'mission_approved_by', 'mission_approved_at', 'mission_reviewed_by', 'mission_reviewed_at', 'mission_plan', 'mission_review'], ['mission_plan', 'mission_review']);
        const runs = rows(app, 'workflow_runs', workspace, id, info).map(workflows.output);
        const jobs = business.missionHistory(app, e, workspace, id);
        const evidence = rows(app, 'evidence', workspace, id, info).map((row) => pick(row, EVIDENCE));
        const tasks = rows(app, 'erp_tasks', workspace, id, info).map((row) => pick(row,
            ['workspace', 'owner', 'mission', 'execution', 'evidence', 'objective', 'contact', 'title', 'description', 'status', 'due_date', 'created', 'updated']));
        const issues = [], runIds = new Set(runs.map((row) => row.id)), evidenceIds = new Set(evidence.map((row) => row.id)), jobIds = new Set(jobs.map((row) => row.id));
        for (const job of jobs) {
            if (job.run && !runIds.has(job.run)) issues.push(`Action ${job.id} has no captured workflow run.`);
            if (job.evidence && !evidenceIds.has(job.evidence)) issues.push(`Action ${job.id} has no captured evidence.`);
            if (job.result_sha256 && (!job.result?.reported || $security.sha256(canonical(job.result.reported)) !== job.result_sha256))
                issues.push(`Action ${job.id} result digest does not match.`);
        }
        for (const task of tasks) {
            if (task.execution && !jobIds.has(task.execution)) issues.push(`Task ${task.id} has no captured action.`);
            if (task.evidence && !evidenceIds.has(task.evidence)) issues.push(`Task ${task.id} has no captured evidence.`);
        }
        if (mission.status === 'verified') {
            const snapshots = mission.mission_review?.evidence_snapshot;
            if (!Array.isArray(snapshots) || !snapshots.length) issues.push('The recorded verified outcome has no retained evidence snapshot.');
            else for (const snapshot of snapshots) {
                if (!snapshot || typeof snapshot !== 'object' || snapshot.workspace !== workspace || snapshot.mission !== id)
                    throw new ForbiddenError('The retained review has a different scope and cannot be exported.');
                const current = evidence.find((row) => row.id === snapshot.id);
                if (!current ||
                    Object.keys(snapshot).some((key) => (snapshot[key] || '') !== (current[key] || '')))
                    issues.push(`Reviewed evidence ${snapshot.id} is unavailable or differs from the retained snapshot.`);
            }
        }
        const content = { mission, runs, jobs, evidence, tasks };
        const serialized = canonical(content);
        if (serialized.length > 2_000_000) throw new ApiError(413, 'This mission exceeds the export size limit. No partial capture was produced.');
        const leaves = [];
        for (const [kind, records] of Object.entries({ mission: [mission], runs, jobs, evidence, tasks }))
            for (const row of records) leaves.push({ kind, id: row.id, sha256: $security.sha256(canonical(row)) });
        access.requireRole(app, e.auth, workspace);
        result = { schema_version: 'buildanddo.mission-replay/v1', workspace, captured_by: e.auth.id, captured_at: new Date().toISOString(),
            capture_complete: true, evidence_state: 'recorded', independent_verification: 'not_conferred_by_export',
            integrity: issues.length ? 'HOLD' : 'consistent', integrity_issues: issues, content,
            content_sha256: $security.sha256(serialized), leaves };
    });
    return result;
}
module.exports = { capture };
