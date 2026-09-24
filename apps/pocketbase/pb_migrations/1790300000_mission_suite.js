// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790300000_mission_suite.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// DAG Node:    none
// Intent:      Persist scoped suite state, immutable run inputs and retry receipts without exposing raw collection writes.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    // PocketBase 0.39.8 does not expose a saved Field's properties as plain
    // values: `type` is a METHOD (reflect.methodValueCall) and numeric bounds
    // like `min` are *float64 POINTERS that read as typeof 'object'.
    // JSON.stringify returns undefined for the method and an opaque {} for the
    // pointer, so EVERY existing field compared as drift and re-applying this
    // migration threw - which aborted PocketBase startup on any rollback.
    // Resolve the bound value, then normalise both sides to comparable text.
    const norm = (holder, key) => {
        const raw = holder[key];
        const value = typeof raw === 'function' ? raw() : raw;
        const json = JSON.stringify(value);
        if (json === undefined) return String(value);
        if (json === '{}' && value !== null && typeof value === 'object') return String(value);
        return json;
    };
    const relation = (name, collection, required = true) => ({ name, type: 'relation', collectionId: app.findCollectionByNameOrId(collection).id,
        maxSelect: 1, required, cascadeDelete: false });
    const text = (name, max, required = false) => ({ name, type: 'text', max, required });
    const number = (name) => ({ name, type: 'number', min: 0, onlyInt: true });
    const json = (name, maxSize) => ({ name, type: 'json', maxSize });
    const stamp = () => [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    const locked = { type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
    const definitions = [
        { ...locked, name: 'suite_controls', fields: [relation('workspace', 'workspaces'), relation('mission', 'missions'),
            number('protocol_version'), number('revision'), number('state_revision'), { name: 'enabled', type: 'bool' },
            json('rights', 30000), json('parameters', 2000), json('observations', 150000), text('active_run', 64), text('state_run', 64), ...stamp()],
        indexes: ['create unique index idx_suite_control on suite_controls (workspace, mission)'] },
        { ...locked, name: 'suite_runs', fields: [relation('workspace', 'workspaces'), relation('mission', 'missions'), relation('owner', 'users'),
            number('protocol_version'), number('revision'), number('config_revision'), number('base_revision'), number('attempt'),
            text('suite', 24, true), text('status', 24, true), text('binding', 64), text('source_sha256', 64),
            text('input_canonical', 200000, true), text('input_sha256', 64, true), text('result_canonical', 650000), text('result_sha256', 64),
            relation('processor', 'users', false), { name: 'lease_until', type: 'date' }, { name: 'processed_at', type: 'date' },
            text('failure', 64), relation('evidence', 'evidence', false), text('review_note', 1200),
            relation('reviewed_by', 'users', false), { name: 'reviewed_at', type: 'date' }, ...stamp()],
        indexes: ['create index idx_suite_queue on suite_runs (workspace, status, created, id)',
            'create index idx_suite_mission on suite_runs (workspace, mission, created desc)'] },
        { ...locked, name: 'suite_receipts', fields: [relation('workspace', 'workspaces'), text('mission', 64), relation('actor', 'users'),
            text('request_key', 80, true), text('action', 40, true), text('command_sha256', 64, true), json('result', 5000), ...stamp()],
        indexes: ['create unique index idx_suite_retry on suite_receipts (workspace, actor, request_key)'] },
    ];
    const existing = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    // Validate every existing collection before creating or updating any of them.
    for (const definition of definitions) {
        const actual = existing(definition.name);
        if (!actual) continue;
        for (const key of Object.keys(locked)) if (actual[key] !== locked[key]) throw new Error(`Review custom ${definition.name}.${key}.`);
        for (const field of definition.fields) {
            const saved = actual.fields.getByName(field.name);
            if (!saved && field.name === 'protocol_version') continue;
            if (!saved || Object.keys(field).some((key) => norm(saved, key) !== norm(field, key)))
                throw new Error(`Review custom ${definition.name}.${field.name}.`);
        }
        if (!definition.indexes.every((index) => actual.indexes.includes(index))) throw new Error(`Review ${definition.name} indexes.`);
    }
    for (const definition of definitions) {
        const actual = existing(definition.name);
        if (!actual) app.save(new Collection(definition));
        else if (definition.name !== 'suite_receipts' && !actual.fields.getByName('protocol_version')) {
            actual.fields.add(new Field(number('protocol_version'))); app.save(actual);
        }
    }
}, (app) => {
    // Disable the protocol while retaining inputs, results, reviews and replay
    // receipts. Re-up restores only the marker, after validating the schema.
    for (const name of ['suite_controls', 'suite_runs']) {
        const collection = app.findCollectionByNameOrId(name);
        if (collection.fields.getByName('protocol_version')) {
            collection.fields.removeByName('protocol_version'); app.save(collection);
        }
    }
});
