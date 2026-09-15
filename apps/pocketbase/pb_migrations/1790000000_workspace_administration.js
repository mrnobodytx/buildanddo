// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js
// DAG Node:    none
// Intent:      Store settings, integration requests and moderated community records behind authenticated commands with retained audit history.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const relation = (name, target, required = true) => ({ name, type: 'relation', maxSelect: 1, required,
        collectionId: app.findCollectionByNameOrId(target).id, cascadeDelete: false });
    const text = (name, max, required = false) => ({ name, type: 'text', max, required });
    const number = (name, min = 0) => ({ name, type: 'number', min, onlyInt: true });
    const select = (name, values) => ({ name, type: 'select', values, maxSelect: 1, required: true });
    const stamps = () => [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const definitions = [
        { name: 'workspace_controls', fields: [relation('workspace', 'workspaces'), number('protocol_version'), number('revision'),
            text('description', 800), { name: 'wiki_enabled', type: 'bool' }, { name: 'forum_enabled', type: 'bool' },
            { name: 'forum_moderation', type: 'bool' }, ...stamps()],
            indexes: ['create unique index idx_workspace_controls_scope on workspace_controls (workspace)'] },
        { name: 'workspace_integrations', fields: [relation('workspace', 'workspaces'),
            select('provider', ['discord', 'reddit', 'datadog', 'posthog', 'firecrawl', 'n8n', 'supabase', 'mautic', 'twenty']),
            { name: 'desired_enabled', type: 'bool' }, { name: 'configuration', type: 'json', maxSize: 2000 }, number('revision', 1),
            relation('requested_by', 'users'), { name: 'requested_at', type: 'date' }, { name: 'check_requested_at', type: 'date' },
            number('applied_revision'), select('observed_state', ['unknown', 'disabled', 'healthy', 'degraded', 'failed']),
            { name: 'observed_at', type: 'date' }, text('receipt_ref', 160), ...stamps()],
            indexes: ['create unique index idx_workspace_integrations_provider on workspace_integrations (workspace, provider)'] },
        { name: 'workspace_admin_events', fields: [relation('workspace', 'workspaces'), relation('actor', 'users'),
            text('request_key', 80, true), text('action', 40, true), text('target', 64, true), number('revision'),
            { name: 'command', type: 'json', maxSize: 131072 }, { name: 'result', type: 'json', maxSize: 131072 }, ...stamps()],
            indexes: ['create unique index idx_workspace_admin_retry on workspace_admin_events (workspace, actor, request_key)',
                'create index idx_workspace_admin_history on workspace_admin_events (workspace, created desc, id desc)'] },
        { name: 'wiki_pages', fields: [relation('workspace', 'workspaces'), relation('owner', 'users'), text('title', 160, true),
            text('slug', 100, true), text('body', 16000, true), select('status', ['draft', 'published', 'archived']), number('revision', 1),
            relation('published_by', 'users', false), { name: 'published_at', type: 'date' }, ...stamps()],
            indexes: ['create unique index idx_wiki_workspace_slug on wiki_pages (workspace, slug)'] },
        { name: 'forum_topics', fields: [relation('workspace', 'workspaces'), relation('owner', 'users'), text('title', 160, true),
            text('body', 8000, true), select('status', ['pending', 'open', 'locked', 'hidden']), number('revision', 1),
            text('moderation_note', 800), relation('moderated_by', 'users', false), { name: 'moderated_at', type: 'date' }, ...stamps()],
            indexes: ['create index idx_forum_topics_scope on forum_topics (workspace, created desc, id desc)'] },
    ];
    const replyDefinition = () => ({ name: 'forum_replies',
        fields: [relation('workspace', 'workspaces'), relation('owner', 'users'), relation('topic', 'forum_topics'),
            text('body', 8000, true), select('status', ['pending', 'visible', 'hidden']), number('revision', 1),
            text('moderation_note', 800), relation('moderated_by', 'users', false), { name: 'moderated_at', type: 'date' }, ...stamps()],
        indexes: ['create index idx_forum_replies_thread on forum_replies (workspace, topic, created desc, id desc)'] });
    // Preflight every existing definition before changing any collection.
    // Only the protocol marker may be absent after a retention-aware rollback.
    const preflight = (definition, collection) => {
        if (!collection) return;
        if (collection.type !== 'base') throw new Error(`Review custom ${definition.name} type.`);
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (collection[rule] !== null) throw new Error(`Review custom ${definition.name} ${rule}.`);
        for (const field of definition.fields) {
            const actual = collection.fields.getByName(field.name);
            if (!actual && field.name === 'protocol_version') continue;
            if (!actual || actual.type !== field.type || (field.collectionId &&
                (actual.collectionId !== field.collectionId || actual.maxSelect !== 1 || actual.cascadeDelete !== false)))
                throw new Error(`Review custom ${definition.name}.${field.name}.`);
        }
        if (!definition.indexes.every((index) => collection.indexes.includes(index)))
            throw new Error(`Review indexes on ${definition.name}.`);
    };
    for (const definition of definitions) preflight(definition, exists(definition.name));
    const replies = exists('forum_replies');
    if (replies) preflight(replyDefinition(), replies);
    for (const definition of definitions) {
        const collection = exists(definition.name);
        if (collection) {
            if (definition.name === 'workspace_controls' && !collection.fields.getByName('protocol_version')) {
                collection.fields.add(new Field(number('protocol_version'))); app.save(collection);
            }
            continue;
        }
        app.save(new Collection({ ...definition, type: 'base', listRule: null, viewRule: null,
            createRule: null, updateRule: null, deleteRule: null }));
    }
    if (!replies) app.save(new Collection({ ...replyDefinition(), type: 'base', listRule: null, viewRule: null,
        createRule: null, updateRule: null, deleteRule: null }));
}, (app) => {
    // Keep members, settings, publications and audit records. Removing only the
    // protocol marker makes commands return 503 even if old hooks still run.
    let controls;
    try { controls = app.findCollectionByNameOrId('workspace_controls'); }
    catch (error) { if (String(error.message).includes('no rows in result set')) return; throw error; }
    for (const name of ['workspace_controls', 'workspace_integrations', 'workspace_admin_events', 'wiki_pages', 'forum_topics', 'forum_replies']) {
        const collection = app.findCollectionByNameOrId(name);
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (collection[rule] !== null) throw new Error(`Review custom ${name} ${rule} before rollback.`);
    }
    if (controls.fields.getByName('protocol_version')) {
        controls.fields.removeByName('protocol_version'); app.save(controls);
    }
});
