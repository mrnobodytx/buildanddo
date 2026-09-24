// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_migrations/1791500000_learning_progress_authority.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js, apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
// DAG Node:    none
// Intent:      Keep historical reading rows owner-readable without allowing raw writes to impersonate guided learning.
// ----------------------------------------------------------------

migrate((app) => {
    const collection = app.findCollectionByNameOrId('tutorial_progress');
    // JSVM rules may be Go string pointers; null remains a distinct locked rule.
    const ruleOf = (value) => value === null ? null : String(value);
    const fieldType = (field) => String(typeof field.type === 'function' ? field.type() : field.type);
    const ownerRule = "@request.auth.id != '' && @request.auth.id = owner";
    if (collection.type !== 'base') throw new Error('Review custom tutorial_progress.type.');
    for (const name of ['listRule', 'viewRule'])
        if (ruleOf(collection[name]) !== ownerRule) throw new Error(`Review custom tutorial_progress.${name}.`);
    const previous = { createRule: "@request.auth.id != '' && @request.auth.id = @request.body.owner",
        updateRule: ownerRule, deleteRule: ownerRule };
    for (const [name, rule] of Object.entries(previous))
        if (ruleOf(collection[name]) !== null && ruleOf(collection[name]) !== rule) throw new Error(`Review custom tutorial_progress.${name}.`);
    const fields = [
        { name: 'owner', type: 'relation', collectionId: app.findCollectionByNameOrId('users').id, required: true, maxSelect: 1, cascadeDelete: true },
        { name: 'tutorial', type: 'relation', collectionId: app.findCollectionByNameOrId('tutorials').id, required: true, maxSelect: 1 },
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['not_started', 'in_progress', 'completed'] },
        { name: 'progress', type: 'number', min: 0, max: 100 },
    ];
    for (const field of fields) {
        const current = collection.fields.getByName(field.name);
        if (!current || fieldType(current) !== field.type || Object.keys(field).some((name) =>
            name !== 'type' && JSON.stringify(current[name]) !== JSON.stringify(field[name])))
            throw new Error(`Review custom tutorial_progress.${field.name}.`);
    }
    if (Object.keys(previous).some((name) => collection[name] !== null)) {
        for (const name of Object.keys(previous)) collection[name] = null;
        app.save(collection);
    }
}, (app) => {
    // Rollback retains history and the security lock; it must not restore manual completion or deletion.
    const collection = app.findCollectionByNameOrId('tutorial_progress');
    const ruleOf = (value) => value === null ? null : String(value);
    if (collection.type !== 'base') throw new Error('Review custom tutorial_progress.type before rollback.');
    for (const name of ['listRule', 'viewRule'])
        if (ruleOf(collection[name]) !== "@request.auth.id != '' && @request.auth.id = owner")
            throw new Error(`Review custom tutorial_progress.${name} before rollback.`);
    for (const name of ['createRule', 'updateRule', 'deleteRule'])
        if (ruleOf(collection[name]) !== null) throw new Error(`Review custom tutorial_progress.${name} before rollback.`);
});
