// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-access.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-SITE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workflow-policy.js, apps/pocketbase/pb_hooks/government-access.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflow-policy.js; CONSUMES apps/pocketbase/pb_hooks/government-access.js
// DAG Node:    none
// Intent:      Resolve current workspace authority and validate bounded commands without trusting client roles or historical authorship.
// ───────────────────────────────────────────────────────────────

const base = require(`${__hooks}/workflow-policy.js`);
const DEFAULTS = { revision: 0, description: '', wiki_enabled: false, forum_enabled: false, forum_moderation: true };
const CONTROL_FIELDS = ['workspace', 'protocol_version', 'revision', 'description', 'wiki_enabled', 'forum_enabled', 'forum_moderation'];
const PROVIDERS = {
    discord: { label: 'Discord bot', kind: 'community', fields: ['guild_id', 'channel_id'], modes: ['read', 'reviewed_publish'] },
    reddit: { label: 'Reddit', kind: 'community', fields: ['subreddit'], modes: ['read', 'reviewed_publish'] },
    datadog: { label: 'Datadog', kind: 'sink', fields: ['binding'], modes: ['telemetry'] },
    posthog: { label: 'PostHog', kind: 'sink', fields: ['binding'], modes: ['telemetry'] },
    firecrawl: { label: 'Firecrawl', kind: 'extension', fields: ['binding'], modes: ['read'] },
    n8n: { label: 'n8n', kind: 'extension', fields: ['binding'], modes: ['reviewed_run'] },
    supabase: { label: 'Supabase', kind: 'extension', fields: ['binding'], modes: ['read'] },
    mautic: { label: 'Mautic', kind: 'extension', fields: ['binding'], modes: ['reviewed_publish'] },
    twenty: { label: 'Twenty', kind: 'extension', fields: ['binding'], modes: ['read'] },
};

function conflict(message) { throw new ApiError(409, message); }
function exact(value, fields) {
    if (!base.fields(value, fields) || Object.keys(value).length !== fields.length)
        base.invalid('Use the listed fields for this command.');
}
function id(value, empty = false) {
    if (typeof value !== 'string' || !((empty && value === '') || /^[a-zA-Z0-9_-]{1,64}$/.test(value)))
        base.invalid('Choose a valid record identifier.');
    return value;
}
function bounded(value, max, required = true) {
    if (!base.text(value, max, required)) base.invalid(`Keep text within ${max} characters${required ? ' and provide a value' : ''}.`);
    return value.trim();
}
/** Validate a bare lowercase host name: no scheme, path, port, credentials or IP address. */
function domainName(value, required = true) {
    const name = bounded(value, 253, required).toLowerCase();
    const labels = name.split('.');
    if (name && (labels.length < 2 || labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
        !/[a-z]/.test(labels[labels.length - 1]) || labels[labels.length - 1].length < 2))
        base.invalid('Enter a domain name without a scheme, path or credentials.');
    return name;
}
function revision(value) {
    if (!Number.isSafeInteger(value) || value < 0) base.invalid('Supply the saved revision.');
    return value;
}
function canonical(value, depth = 0) {
    if (depth > 6) base.invalid('Command nesting exceeds the supported format.');
    if (Array.isArray(value)) return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']';
    if (value && typeof value === 'object')
        return '{' + Object.keys(value).sort().map((name) => JSON.stringify(name) + ':' + canonical(value[name], depth + 1)).join(',') + '}';
    return JSON.stringify(value);
}
function role(app, auth, workspaceId) {
    // Only workspaces.owner is an ownership grant. Legacy membership rows named
    // owner retain administrator capabilities but cannot manage administrators.
    const workspace = base.find(app, 'workspaces', workspaceId);
    const actual = base.role(app, auth, workspaceId);
    return { workspace, role: workspace.getString('owner') === auth.id ? 'owner' : actual === 'owner' ? 'admin' : actual };
}
function requireRole(app, auth, workspaceId, roles = ['owner', 'admin', 'editor', 'viewer']) {
    const scope = role(app, auth, workspaceId);
    if (!roles.includes(scope.role)) throw new ForbiddenError('Your current workspace role does not allow this action.');
    return scope;
}
function controls(app, workspace) {
    base.schema(app, 'workspace_controls', CONTROL_FIELDS);
    const rows = app.findRecordsByFilter('workspace_controls', 'workspace = {:workspace}', '', 2, 0, { workspace });
    if (rows.length > 1) throw new ApiError(503, 'Workspace settings need operator review.');
    return rows[0] || null;
}
function settings(record) {
    if (!record) return { ...DEFAULTS };
    return { revision: Number(record.get('revision')), description: record.getString('description'),
        wiki_enabled: record.getBool('wiki_enabled'), forum_enabled: record.getBool('forum_enabled'),
        forum_moderation: record.getBool('forum_moderation') };
}
function workspaceId(e) { return id(e.request.pathValue('workspace')); }
function access(e) {
    base.authenticated(e);
    const workspace = workspaceId(e);
    const scope = requireRole(e.app, e.auth, workspace);
    return { workspace, role: scope.role, settings: settings(controls(e.app, workspace)),
        can_admin: ['owner', 'admin'].includes(scope.role), can_grant_admin: scope.role === 'owner',
        can_write: scope.role !== 'viewer', government: require(`${__hooks}/government-access.js`).status(e.app, e.auth) };
}
function envelope(e) {
    base.authenticated(e);
    const workspace = workspaceId(e);
    const body = e.requestInfo().body;
    exact(body, ['action', 'revision', 'request_key', 'payload']);
    bounded(body.action, 40); revision(body.revision);
    if (typeof body.request_key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.request_key) ||
        !base.fields(body.payload, Object.keys(body.payload || {})) || canonical(body).length > 30000)
        base.invalid('Supply a bounded command and a valid retry key.');
    return { workspace, body };
}
function page(e, name = 'page') {
    const value = e.requestInfo().query?.[name] || '1';
    if (!/^[1-9][0-9]{0,3}$/.test(String(value))) base.invalid('Choose a page from 1 to 9999.');
    return Number(value);
}
function list(app, collection, filter, params, number = 1, size = 20) {
    const items = app.findRecordsByFilter(collection, filter, '-created,-id', size + 1, (number - 1) * size, params);
    return { rows: items.slice(0, size), page: number, has_more: items.length > size };
}
function audit(app, auth, workspace, body, operation) {
    base.schema(app, 'workspace_admin_events', ['workspace', 'actor', 'request_key', 'command', 'result', 'action', 'target', 'revision']);
    const prior = app.findRecordsByFilter('workspace_admin_events',
        'workspace = {:workspace} && actor = {:actor} && request_key = {:key}', '', 1, 0,
        { workspace, actor: auth.id, key: body.request_key });
    if (prior.length) {
        if (canonical(base.json(prior[0], 'command')) !== canonical(body)) conflict('This retry key belongs to a different command.');
        return { ...base.json(prior[0], 'result'), replayed: true };
    }
    const result = operation();
    const receipt = new Record(app.findCollectionByNameOrId('workspace_admin_events'));
    Object.entries({ workspace, actor: auth.id, request_key: body.request_key, command: body, result,
        action: body.action, target: result.id || workspace, revision: result.revision }).forEach(([key, value]) => receipt.set(key, value));
    app.save(receipt);
    return { ...result, replayed: false };
}

module.exports = { ...base, DEFAULTS, CONTROL_FIELDS, PROVIDERS, conflict, exact, id, bounded, domainName, revision,
    canonical, requireRole, controls, settings, workspaceId, access, envelope, page, list, audit };
