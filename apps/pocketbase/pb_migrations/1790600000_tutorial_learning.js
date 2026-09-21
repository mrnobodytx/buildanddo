// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// DAG Node:    none
// Intent:      Retain account-owned tutorial checkpoints and completion certificates behind authenticated commands.
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
    let saved;
    try { saved = app.findCollectionByNameOrId('tutorial_learning'); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    const definition = {
        name: 'tutorial_learning', type: 'base', listRule: null, viewRule: null,
        createRule: null, updateRule: null, deleteRule: null,
        fields: [
            { name: 'owner', type: 'relation', collectionId: app.findCollectionByNameOrId('users').id, required: true, maxSelect: 1, cascadeDelete: true },
            { name: 'tutorial', type: 'relation', collectionId: app.findCollectionByNameOrId('tutorials').id, required: true, maxSelect: 1, cascadeDelete: false },
            { name: 'snapshot', type: 'json', maxSize: 100000, required: true },
            { name: 'content_digest', type: 'text', required: true, max: 64, pattern: '^[a-f0-9]{64}$' },
            { name: 'next_section', type: 'number', min: 0, max: 20, onlyInt: true },
            { name: 'practiced', type: 'bool' },
            { name: 'completed_at', type: 'date' },
            { name: 'certificate', type: 'json', maxSize: 6000 },
            { name: 'protocol_version', type: 'number', min: 0, onlyInt: true },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
            'create unique index idx_tutorial_learning_identity on tutorial_learning (owner, tutorial)',
            'create index idx_tutorial_learning_history on tutorial_learning (owner, completed_at, updated desc, id)',
        ],
    };
    if (!saved) { app.save(new Collection(definition)); return; }
    for (const key of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (saved[key] !== definition[key]) throw new Error(`Review custom tutorial_learning.${key}.`);
    for (const field of definition.fields) {
        const actual = saved.fields.getByName(field.name);
        if (!actual && field.name === 'protocol_version') continue;
        if (!actual || Object.keys(field).some((key) => norm(actual, key) !== norm(field, key)))
            throw new Error(`Review custom tutorial_learning.${field.name}.`);
    }
    if (!definition.indexes.every((index) => saved.indexes.includes(index))) throw new Error('Review tutorial_learning indexes.');
    if (!saved.fields.getByName('protocol_version')) {
        saved.fields.add(new Field(definition.fields.find((field) => field.name === 'protocol_version')));
        app.save(saved);
    }
}, (app) => {
    // Disable commands while retaining every checkpoint, certificate and old progress row.
    const collection = app.findCollectionByNameOrId('tutorial_learning');
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[key] !== null) throw new Error(`Review custom tutorial_learning.${key} before rollback.`);
    if (collection.fields.getByName('protocol_version')) {
        collection.fields.removeByName('protocol_version'); app.save(collection);
    }
});
