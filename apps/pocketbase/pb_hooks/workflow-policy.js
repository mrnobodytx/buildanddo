// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workflow-policy.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js
// DAG Node:    none
// Intent:      Enforce workspace roles and bounded saved workflow definitions before a run can record evidence.
// ───────────────────────────────────────────────────────────────

const KINDS = ['read', 'transform', 'approval', 'notify', 'record', 'execute'];
const OPEN = ['running', 'awaiting_approval'];

function invalid(message) {
    throw new BadRequestError(message);
}
function text(value, maximum, required = true) {
    return typeof value === 'string' && value.length <= maximum && (!required || value.trim() !== '');
}
function fields(value, allowed) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) &&
        Object.keys(value).every((key) => allowed.includes(key));
}
function json(record, name, fallback = null) {
    const raw = record.getString(name);
    if (!raw || raw === 'null') return fallback;
    try {
        return JSON.parse(raw);
    } catch {
        invalid('The saved workflow data is invalid. Reload the definition before continuing.');
    }
}
/** @param {unknown} lesson Stored lesson body. @returns {unknown} The same lesson without the knowledge-check answer or its revealing explanation. */
function publicLesson(lesson) {
    if (!lesson || typeof lesson !== 'object' || Array.isArray(lesson) || !lesson.check || typeof lesson.check !== 'object') return lesson;
    const { answer: _answer, explanation: _explanation, ...check } = lesson.check;
    return { ...lesson, check };
}
function steps(value, required = false) {
    if (!Array.isArray(value) || value.length > 20 || (required && !value.length))
        invalid('Use up to 20 steps and add at least one before activating or starting a workflow.');
    const ids = new Set();
    return value.map((step) => {
        if (!fields(step, ['id', 'name', 'kind', 'detail', 'action']) ||
            !text(step.id, 64) || !/^[a-zA-Z0-9_-]+$/.test(step.id) || ids.has(step.id) ||
            !text(step.name, 160) || !KINDS.includes(step.kind) || !text(step.detail, 300, false))
            invalid('Each step needs a unique identifier, a name, a listed kind and a short detail. Edit and save legacy steps first.');
        ids.add(step.id);
        const result = { id: step.id, name: step.name.trim(), kind: step.kind, detail: step.detail.trim() };
        if (step.kind === 'execute') result.action = require(`${__hooks}/business-action-policy.js`).action(step.action);
        else if (Object.hasOwn(step, 'action')) invalid('Only executable steps may carry an action.');
        return result;
    });
}
function authenticated(e) {
    if (!e.auth || !e.auth.id || e.auth.collection().name !== 'users')
        throw new ForbiddenError('Sign in with a workspace account.');
}
function schema(app, name, required) {
    let collection;
    try {
        collection = app.findCollectionByNameOrId(name);
    } catch (error) {
        if (!String(error.message).includes('no rows in result set')) throw error;
        throw new ApiError(503, 'The workflow backend upgrade is not installed yet.');
    }
    if (!required.every((field) => collection.fields.getByName(field)))
        throw new ApiError(503, 'The workflow backend schema is incomplete.');
    return collection;
}
function find(app, collection, id) {
    try {
        return app.findRecordById(collection, id);
    } catch (error) {
        if (!String(error.message).includes('no rows in result set')) throw error;
        throw new NotFoundError('The requested workspace record is unavailable.');
    }
}
function role(app, auth, workspaceId) {
    const workspace = find(app, 'workspaces', workspaceId);
    if (workspace.getString('owner') === auth.id) return 'owner';
    const members = app.findRecordsByFilter('workspace_members',
        'workspace = {:workspace} && user = {:user}', '', 1, 0,
        { workspace: workspaceId, user: auth.id });
    const member = members[0];
    if (!member || member.getString('workspace') !== workspaceId || member.getString('user') !== auth.id ||
        !['owner', 'admin', 'editor', 'viewer'].includes(member.getString('role')))
        throw new ForbiddenError('Current workspace membership is required.');
    return member.getString('role');
}
function writable(app, auth, workspaceId, approval = false) {
    const actual = role(app, auth, workspaceId);
    if (!(approval ? ['owner', 'admin'] : ['owner', 'admin', 'editor']).includes(actual))
        throw new ForbiddenError(approval ? 'A workspace owner or admin must decide this approval.' :
            'A workspace owner, admin or editor must record this work.');
}
function readable(app, record, info) {
    if (!app.canAccessRecord(record, info, record.collection().viewRule))
        throw new ForbiddenError('This record is not readable by your account.');
}

/** Validate a workflow definition while preserving server-owned run timestamps. */
function enforce(e, creating) {
    authenticated(e);
    const record = e.record;
    schema(e.app, 'workflows', ['steps', 'last_run']);
    const original = creating ? null : record.original();
    if (creating ? record.getString('owner') !== e.auth.id :
        record.getString('owner') !== original.getString('owner') ||
        record.getString('workspace') !== original.getString('workspace'))
        invalid('Workflow ownership and workspace cannot be reassigned.');
    writable(e.app, e.auth, record.getString('workspace'));
    const status = record.getString('status');
    if (!['draft', 'active', 'paused'].includes(status) || (creating && status !== 'draft'))
        invalid('Save a draft before activating the workflow.');
    record.set('steps', steps(json(record, 'steps', []), status === 'active'));
    record.set('last_run', creating ? '' : original.getString('last_run'));
    return e.next();
}

/** Retain workflow definitions referenced by durable run history. */
function remove(e) {
    authenticated(e);
    writable(e.app, e.auth, e.record.getString('workspace'));
    schema(e.app, 'workflow_runs', ['workflow']);
    if (e.app.findRecordsByFilter('workflow_runs', 'workflow = {:workflow}', '', 1, 0,
        { workflow: e.record.id }).length)
        invalid('This workflow has run history. Pause it to keep its receipts.');
    return e.next();
}

module.exports = { KINDS, OPEN, invalid, text, fields, json, publicLesson, steps, authenticated,
    schema, find, role, writable, readable, enforce, remove };
