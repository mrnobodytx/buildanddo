// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790200000_private_dossiers.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/1790100000_mission_research.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790100000_mission_research.js
// DAG Node:    none
// Intent:      Store account-owned encrypted dossiers and content-free retry receipts behind locked native collection APIs.
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
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const dossierId = exists('user_dossiers')?.id || 'bdodossiers0001';
    const owner = () => ({ name: 'owner', type: 'relation', required: true, maxSelect: 1,
        collectionId: app.findCollectionByNameOrId('users').id, cascadeDelete: true });
    const dossier = () => ({ name: 'dossier', type: 'relation', required: true, maxSelect: 1,
        collectionId: dossierId, cascadeDelete: true });
    const number = (name) => ({ name, type: 'number', min: 0, onlyInt: true });
    const sealed = () => [{ name: 'key_id', type: 'text', required: true, max: 32 },
        { name: 'sealed', type: 'text', required: true, max: 196608, hidden: true }, number('revision')];
    const stamps = () => [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    const locked = { type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
    const definitions = [
        { ...locked, id: dossierId, name: 'user_dossiers', fields: [owner(), number('protocol_version'), ...sealed(), ...stamps()],
            indexes: ['create unique index idx_private_dossier_owner on user_dossiers (owner)'] },
        { ...locked, name: 'dossier_entities', fields: [owner(), dossier(), ...sealed(), ...stamps()],
            indexes: ['create index idx_private_entities_owner on dossier_entities (owner, dossier, updated desc, id)'] },
        { ...locked, name: 'dossier_events', fields: [owner(), dossier(),
            { name: 'request_key', type: 'text', max: 80, required: true }, ...sealed(), ...stamps()],
            indexes: ['create unique index idx_private_dossier_retry on dossier_events (owner, request_key)'] },
    ];
    // Review drift before writing any collection, including during migration replay.
    for (const definition of definitions) {
        const actual = exists(definition.name);
        if (!actual) continue;
        for (const name of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (actual[name] !== definition[name]) throw new Error(`Review custom ${definition.name}.${name}.`);
        for (const field of definition.fields) {
            const value = actual.fields.getByName(field.name);
            if (!value && field.name === 'protocol_version') continue;
            if (!value || Object.keys(field).some((key) => JSON.stringify(typeof value[key] === 'function' ? value[key]() : value[key]) !== JSON.stringify(field[key])))
                throw new Error(`Review custom ${definition.name}.${field.name}.`);
        }
        if (!definition.indexes.every((index) => actual.indexes.includes(index))) throw new Error(`Review ${definition.name} indexes.`);
    }
    for (const definition of definitions) {
        const actual = exists(definition.name);
        if (!actual) app.save(new Collection(definition));
        else if (definition.name === 'user_dossiers' && !actual.fields.getByName('protocol_version')) {
            actual.fields.add(new Field(number('protocol_version'))); app.save(actual);
        }
    }
}, (app) => {
    // Retain encrypted content and deletion receipts; disable the command protocol.
    // Dropping retry history would allow an old accepted create to resurrect a deletion.
    for (const name of ['user_dossiers', 'dossier_entities', 'dossier_events']) {
        const collection = app.findCollectionByNameOrId(name);
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (collection[rule] !== null) throw new Error(`Review custom ${name}.${rule} before rollback.`);
    }
    const collection = app.findCollectionByNameOrId('user_dossiers');
    if (collection.fields.getByName('protocol_version')) {
        collection.fields.removeByName('protocol_version'); app.save(collection);
    }
});
