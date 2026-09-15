// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790100000_mission_research.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// DAG Node:    none
// Intent:      Retain protected research inputs and processing provenance without allowing clients to forge results or evidence receipts.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const relation = (name, target, required = true) => ({ name, type: 'relation', required, maxSelect: 1,
        collectionId: app.findCollectionByNameOrId(target).id, cascadeDelete: false });
    const text = (name, max, required = false) => ({ name, type: 'text', max, required });
    const number = (name) => ({ name, type: 'number', min: 0, onlyInt: true });
    const select = (name, values) => ({ name, type: 'select', required: true, maxSelect: 1, values });
    const date = (name) => ({ name, type: 'date' });
    const stamps = () => [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    const read = "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)";
    const locked = { type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
    const definitions = [{ ...locked, name: 'research_uploads',
        // Request/download hooks additionally recheck current role and worker leases.
        listRule: `${read} && owner = @request.auth.id`,
        viewRule: `(${read}) || (@request.auth.id != '' && processor = @request.auth.id)`,
        createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
        deleteRule: `${read} && owner = @request.auth.id`,
        fields: [relation('workspace', 'workspaces'), relation('owner', 'users'), relation('processor', 'users', false),
            { name: 'asset', type: 'file', required: true, maxSelect: 1, maxSize: 20971520, protected: true,
                mimeTypes: ['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/zip', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/ogg', 'video/mp4', 'video/webm', 'audio/webm'] },
            text('original_name', 180, true), select('kind', ['document', 'audio', 'video']), number('size'),
            select('origin', ['website', 'discord']), text('source_ref', 64), ...stamps()],
        indexes: ['create index idx_research_uploads_owner on research_uploads (workspace, owner, created desc)',
            "create unique index idx_research_discord_file on research_uploads (workspace, owner, source_ref) where origin = 'discord'"] }];
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const validate = (definition) => {
        const actual = exists(definition.name);
        if (!actual) return;
        for (const name of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (actual[name] !== definition[name]) throw new Error(`Review custom ${definition.name}.${name}.`);
        for (const field of definition.fields) {
            const value = actual.fields.getByName(field.name);
            if (!value && field.name === 'protocol_version') continue;
            if (!value || Object.keys(field).some((key) => key !== 'name' && JSON.stringify(value[key]) !== JSON.stringify(field[key])))
                throw new Error(`Review custom ${definition.name}.${field.name}.`);
        }
        if (!definition.indexes.every((index) => actual.indexes.includes(index))) throw new Error(`Review ${definition.name} indexes.`);
    };
    // Resolve the relation before creating uploads on a fresh database; collection
    // identifiers are stable when supplied explicitly, including on migration replay.
    definitions[0].id = exists('research_uploads')?.id || 'bdoresearchfile';
    definitions.push({ ...locked, name: 'research_submissions', fields: [
        relation('workspace', 'workspaces'), relation('owner', 'users'), relation('mission', 'missions'),
        { name: 'upload', type: 'relation', collectionId: definitions[0].id, maxSelect: 1, cascadeDelete: false },
        number('protocol_version'), number('revision'), number('attempt'), text('title', 160, true),
        select('kind', ['search', 'url', 'document', 'audio', 'video']), text('input', 2048), text('context', 1200),
        select('origin', ['website', 'discord']), text('source_ref', 64),
        select('status', ['queued', 'processing', 'ready', 'blocked', 'failed', 'cancelled', 'attached']),
        text('binding', 64), number('integration_revision'), relation('processor', 'users', false), date('lease_until'),
        { name: 'result', type: 'json', maxSize: 65536 }, text('failure', 64), date('processed_at'),
        relation('evidence', 'evidence', false), text('review_note', 1200), relation('reviewed_by', 'users', false), date('reviewed_at'), ...stamps()],
        indexes: ['create index idx_research_queue on research_submissions (workspace, status, created, id)'] });
    definitions.push({ ...locked, name: 'research_events', fields: [relation('workspace', 'workspaces'), relation('actor', 'users'),
        text('request_key', 80, true), text('action', 40, true), text('target', 64, true), number('revision'),
        { name: 'command', type: 'json', maxSize: 65536 }, { name: 'result', type: 'json', maxSize: 65536 }, ...stamps()],
        indexes: ['create unique index idx_research_retry on research_events (workspace, actor, request_key)'] });
    definitions.forEach(validate);
    for (const definition of definitions) {
        const collection = exists(definition.name);
        if (!collection) app.save(new Collection(definition));
        else if (definition.name === 'research_submissions' && !collection.fields.getByName('protocol_version')) {
            collection.fields.add(new Field(number('protocol_version'))); app.save(collection);
        }
    }
}, (app) => {
    // Retain uploads, extracted sources, review history and Evidence Ledger links.
    // Removing the marker disables all research commands and new uploads.
    const collection = app.findCollectionByNameOrId('research_submissions');
    for (const name of ['research_submissions', 'research_events']) {
        const item = app.findCollectionByNameOrId(name);
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (item[rule] !== null) throw new Error(`Review custom ${name}.${rule} before rollback.`);
    }
    if (!app.findCollectionByNameOrId('research_uploads').fields.getByName('asset')?.protected)
        throw new Error('Review research file protection before rollback.');
    if (collection.fields.getByName('protocol_version')) {
        collection.fields.removeByName('protocol_version'); app.save(collection);
    }
});
