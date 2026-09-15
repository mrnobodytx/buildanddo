// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/workspace-administration.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workspace-access.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// DAG Node:    none
// Intent:      Persist authorized settings, role grants and integration requests with atomic audit receipts and explicit runtime uncertainty.
// ───────────────────────────────────────────────────────────────

const access = require(`${__hooks}/workspace-access.js`);
const ADMINS = ['owner', 'admin'];
function fields(record, names) {
    const result = { id: record.id };
    names.forEach((name) => { result[name] = record.getString(name); });
    return result;
}
function settingsInput(value) {
    access.exact(value, ['name', 'description', 'wiki_enabled', 'forum_enabled', 'forum_moderation']);
    if (!['wiki_enabled', 'forum_enabled', 'forum_moderation'].every((key) => typeof value[key] === 'boolean'))
        access.invalid('Choose the community settings explicitly.');
    return { ...value, name: access.bounded(value.name, 120), description: access.bounded(value.description, 800, false) };
}
function providerInput(value) {
    access.exact(value, ['provider', 'enabled', 'configuration']);
    const provider = Object.prototype.hasOwnProperty.call(access.PROVIDERS, value.provider) && access.PROVIDERS[value.provider];
    if (!provider || typeof value.enabled !== 'boolean') access.invalid('Choose a supported integration and requested state.');
    access.exact(value.configuration, ['mode', ...provider.fields]);
    if (!provider.modes.includes(value.configuration.mode)) access.invalid('Choose a supported integration mode.');
    const configuration = { mode: value.configuration.mode };
    for (const key of provider.fields) {
        const text = access.bounded(value.configuration[key], 64, value.enabled);
        const pattern = key === 'subreddit' ? /^[a-zA-Z0-9_]{3,21}$/ : key === 'binding' ? /^[a-z][a-z0-9._-]{1,63}$/ : /^[0-9]{17,20}$/;
        if (text && !pattern.test(text)) access.invalid('Use a registered binding name, Discord ID or subreddit name; never a URL or credential.');
        configuration[key] = text;
    }
    return { ...value, configuration };
}
function memberCommand(app, actor, scope, action, payload) {
    access.exact(payload, action === 'member.set' ? ['user', 'role'] : ['user']);
    access.id(payload.user);
    const workspace = scope.workspace.id;
    if (payload.user === scope.workspace.getString('owner') || payload.user === actor.id)
        throw new ForbiddenError('Ownership and your own role cannot be changed here.');
    if (action === 'member.set' && !['admin', 'editor', 'viewer'].includes(payload.role))
        access.invalid('Choose administrator, editor or viewer.');
    const rows = app.findRecordsByFilter('workspace_members', 'workspace = {:workspace} && user = {:user}', '', 2, 0,
        { workspace, user: payload.user });
    if (rows.length > 1) throw new ApiError(503, 'Duplicate memberships need operator review.');
    const existing = rows[0];
    if (scope.role !== 'owner' && (payload.role === 'admin' || ['owner', 'admin'].includes(existing?.getString('role'))))
        throw new ForbiddenError('Only the workspace owner may grant or change administrator access.');
    if (action === 'member.remove') {
        if (!existing) access.conflict('That account is no longer a member. Reload the members.');
        app.delete(existing);
    } else {
        access.find(app, 'users', payload.user);
        const record = existing || new Record(app.findCollectionByNameOrId('workspace_members'));
        record.set('workspace', workspace); record.set('user', payload.user); record.set('role', payload.role);
        if (!existing) record.set('invited_by', actor.id);
        app.save(record);
    }
    return payload.user;
}
function integrationCommand(app, actor, workspace, action, payload) {
    const value = action === 'integration.save' ? providerInput(payload) : payload;
    if (action === 'integration.check') {
        access.exact(value, ['provider']);
        if (!Object.prototype.hasOwnProperty.call(access.PROVIDERS, value.provider)) access.invalid('Choose a supported integration.');
    }
    const rows = app.findRecordsByFilter('workspace_integrations', 'workspace = {:workspace} && provider = {:provider}', '', 2, 0,
        { workspace, provider: value.provider });
    if (rows.length > 1) throw new ApiError(503, 'Duplicate integration settings need operator review.');
    if (!rows.length && action === 'integration.check') access.conflict('Save the integration settings before requesting a health check.');
    const record = rows[0] || new Record(app.findCollectionByNameOrId('workspace_integrations'));
    const now = new Date().toISOString();
    if (action === 'integration.save') {
        record.set('workspace', workspace); record.set('provider', value.provider);
        record.set('desired_enabled', value.enabled); record.set('configuration', value.configuration);
        record.set('revision', Number(record.get('revision') || 0) + 1);
        record.set('requested_by', actor.id); record.set('requested_at', now);
        if (!rows.length) record.set('observed_state', 'unknown');
    } else record.set('check_requested_at', now);
    app.save(record);
    return record.id;
}

/** Change one authorized administrative value and its audit in the same transaction. */
function command(e) {
    const { workspace, body } = access.envelope(e);
    if (!['settings.save', 'member.set', 'member.remove', 'integration.save', 'integration.check'].includes(body.action))
        access.invalid('Choose a supported administration command.');
    let result;
    e.app.runInTransaction((app) => {
        const scope = access.requireRole(app, e.auth, workspace, ADMINS);
        let control = access.controls(app, workspace);
        result = access.audit(app, e.auth, workspace, body, () => {
            const before = access.settings(control);
            if (before.revision !== body.revision) access.conflict('Workspace administration changed. Reload before saving your changes.');
            let target = workspace;
            let next = { ...before };
            if (body.action === 'settings.save') {
                const value = settingsInput(body.payload);
                scope.workspace.set('name', value.name); app.save(scope.workspace);
                next = { ...next, ...value }; delete next.name;
            } else if (body.action.startsWith('member.')) target = memberCommand(app, e.auth, scope, body.action, body.payload);
            else target = integrationCommand(app, e.auth, workspace, body.action, body.payload);
            control = control || new Record(app.findCollectionByNameOrId('workspace_controls'));
            Object.entries({ ...next, workspace, protocol_version: 1, revision: before.revision + 1 }).forEach(([key, value]) => control.set(key, value));
            app.save(control);
            return { id: target, workspace, revision: before.revision + 1, action: body.action };
        });
    });
    return result;
}

/** Read bounded membership and audit pages for a current workspace administrator. */
function snapshot(e) {
    access.authenticated(e);
    const workspace = access.workspaceId(e);
    const scope = access.requireRole(e.app, e.auth, workspace, ADMINS);
    const settings = access.settings(access.controls(e.app, workspace));
    const members = access.list(e.app, 'workspace_members', 'workspace = {:workspace} && user != {:owner}',
        { workspace, owner: scope.workspace.getString('owner') }, access.page(e, 'members_page'));
    const audit = access.list(e.app, 'workspace_admin_events', 'workspace = {:workspace}', { workspace }, access.page(e, 'audit_page'));
    return { workspace, name: scope.workspace.getString('name'), owner: scope.workspace.getString('owner'), role: scope.role, settings,
        members: { items: members.rows.map((row) => fields(row, ['user', 'role', 'invited_by', 'created'])), page: members.page, has_more: members.has_more },
        audit: { items: audit.rows.map((row) => ({ ...fields(row, ['actor', 'action', 'target', 'created']), revision: Number(row.get('revision')) })),
            page: audit.page, has_more: audit.has_more } };
}
function observation(record) {
    if (!record) return { state: 'unknown', at: '', current: false, receipt_ref: '', check_pending: false };
    const at = record.getString('observed_at');
    const stamp = Date.parse(at);
    const age = Date.now() - stamp;
    const state = record.getString('observed_state');
    const known = ['disabled', 'healthy', 'degraded', 'failed'].includes(state) && Boolean(record.getString('receipt_ref')) && Number.isFinite(stamp) && age >= 0;
    const current = known && age <= 15 * 60 * 1000 && Number(record.get('applied_revision')) === Number(record.get('revision'));
    const checked = Date.parse(record.getString('check_requested_at'));
    return { state: known ? state : 'unknown', at: known ? at : '', current, receipt_ref: known ? record.getString('receipt_ref') : '',
        check_pending: Number.isFinite(checked) && (!known || checked > stamp) };
}

/** Project requested integration settings separately from dated executor observations. */
function integrations(e) {
    const auth = access.access(e);
    access.schema(e.app, 'workspace_integrations', ['workspace', 'provider', 'configuration', 'desired_enabled', 'observed_at', 'applied_revision']);
    const rows = e.app.findRecordsByFilter('workspace_integrations', 'workspace = {:workspace}', '', 100, 0, { workspace: auth.workspace });
    return { ...auth, items: Object.entries(access.PROVIDERS).map(([key, provider]) => {
        const record = rows.find((item) => item.getString('provider') === key);
        const configuration = record ? access.json(record, 'configuration') : { mode: provider.modes[0], ...Object.fromEntries(provider.fields.map((field) => [field, ''])) };
        // Reject unsupported saved formats instead of projecting private/custom
        // keys into the browser. External receipts never grant administrator power.
        const safe = providerInput({ provider: key, enabled: Boolean(record?.getBool('desired_enabled')), configuration });
        return { provider: key, ...provider, id: record?.id || '', desired_enabled: safe.enabled, configuration: safe.configuration,
            revision: record ? Number(record.get('revision')) : 0, requested_at: record?.getString('requested_at') || '',
            observation: observation(record) };
    }) };
}

module.exports = { command, snapshot, integrations, observation };
