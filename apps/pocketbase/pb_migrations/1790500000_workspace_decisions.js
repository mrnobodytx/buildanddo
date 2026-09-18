// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790500000_workspace_decisions.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-17
// Depends:     apps/pocketbase/pb_hooks/decision-runtime.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/decision-runtime.js
// DAG Node:    none
// Intent:      Retain private workspace decision state and receipts behind native authenticated routes and rollback fencing.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const name = 'workspace_decisions';
    const exists = () => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const relation = (field, target) => ({ name: field, type: 'relation', required: true,
        collectionId: app.findCollectionByNameOrId(target).id, maxSelect: 1, cascadeDelete: false });
    const text = (field, max, required = true) => ({ name: field, type: 'text', max, required });
    const json = (field, maxSize) => ({ name: field, type: 'json', maxSize });
    const protocol = { name: 'protocol_version', type: 'number', min: 0, onlyInt: true };
    const definition = { name, type: 'base', listRule: null, viewRule: null,
        createRule: null, updateRule: null, deleteRule: null,
        fields: [relation('workspace', 'workspaces'), relation('owner', 'users'),
            text('decision_id', 100), text('request_key', 128), text('request_hash', 64),
            text('state_hash', 64), text('trace_id', 128), text('route', 128),
            json('state', 128000), json('questions', 128000), json('answers', 256000),
            json('confidence', 16000), json('result', 512000), json('outcome', 128000),
            { name: 'authority', type: 'select', values: ['A0', 'A1', 'A2', 'A3'], maxSelect: 1, required: true },
            { name: 'verified', type: 'bool' }, { name: 'latency_ms', type: 'number', min: 0 },
            { name: 'cost_usd', type: 'number', min: 0 }, protocol,
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false }],
        indexes: [
            'create unique index idx_decision_request on workspace_decisions (workspace, owner, request_key)',
            'create unique index idx_decision_identity on workspace_decisions (workspace, owner, decision_id)',
        ] };
    const existing = exists();
    if (!existing) { app.save(new Collection(definition)); return; }
    for (const key of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (existing[key] !== definition[key]) throw new Error('Review custom workspace_decisions rules.');
    for (const field of definition.fields) {
        const actual = existing.fields.getByName(field.name);
        if (!actual && field.name === 'protocol_version') continue;
        if (!actual || Object.keys(field).some((key) => JSON.stringify(actual[key]) !== JSON.stringify(field[key])))
            throw new Error('Review custom workspace_decisions fields.');
    }
    if (!definition.indexes.every((index) => existing.indexes.includes(index)))
        throw new Error('Review custom workspace_decisions indexes.');
    if (!existing.fields.getByName('protocol_version')) {
        existing.fields.add(new Field(protocol)); app.save(existing);
    }
}, (app) => {
    // Retain immutable decisions for later outcome recording; disable the API.
    let collection;
    try { collection = app.findCollectionByNameOrId('workspace_decisions'); }
    catch (error) { if (String(error.message).includes('no rows in result set')) return; throw error; }
    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[rule] !== null) throw new Error('Review custom decision rules before rollback.');
    if (collection.fields.getByName('protocol_version')) {
        collection.fields.removeByName('protocol_version'); app.save(collection);
    }
});
