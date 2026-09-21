// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// EnumType:     Migration
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// DAG Node:     none
// Intent:       Retain atomic workspace setup and its stable retry identity without exposing receipts to direct writes.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const fields = [
        { name: 'owner', type: 'relation', collectionId: app.findCollectionByNameOrId('users').id, maxSelect: 1, required: true, cascadeDelete: false },
        { name: 'workspace', type: 'relation', collectionId: app.findCollectionByNameOrId('workspaces').id, maxSelect: 1, required: true, cascadeDelete: false },
        { name: 'request_key', type: 'text', max: 64, required: true },
        { name: 'input', type: 'json', maxSize: 2000 }, { name: 'result', type: 'json', maxSize: 8000 },
        { name: 'protocol_version', type: 'number', onlyInt: true },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    ];
    const index = 'create unique index idx_workspace_onboarding_retry on workspace_onboarding (owner, request_key)';
    let existing;
    try { existing = app.findCollectionByNameOrId('workspace_onboarding'); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    if (existing) {
        if (['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((key) => existing[key] !== null) || !existing.indexes.includes(index))
            throw new Error('Review custom onboarding access before migrating.');
        for (const field of fields) {
            const old = existing.fields.getByName(field.name);
            if (!old && field.name === 'protocol_version') existing.fields.add(new Field(field));
            else if (!old || Object.entries(field).some(([key, value]) => old[key] !== value))
                throw new Error('Review onboarding field identity before migrating.');
        }
        app.save(existing);
        return;
    }
    app.save(new Collection({ name: 'workspace_onboarding', type: 'base', listRule: null, viewRule: null,
        createRule: null, updateRule: null, deleteRule: null, fields, indexes: [index] }));
}, (app) => {
    let collection;
    try { collection = app.findCollectionByNameOrId('workspace_onboarding'); }
    catch (error) { if (String(error.message).includes('no rows in result set')) return; throw error; }
    // Disable the command while retaining completed setup and retry receipts.
    collection.fields.removeByName('protocol_version'); app.save(collection);
});
