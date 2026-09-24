// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791300001_assistant_turn_usage.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/1790900000_workspace_assistant.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790900000_workspace_assistant.js
// DAG Node:    none
// Intent:      Keep the answering model and provider-reported token counts on each assistant turn, so agent usage can be measured instead of guessed.
// ───────────────────────────────────────────────────────────────
//
// One optional JSON field. A turn whose provider reported no counts keeps them
// absent, and a failed turn keeps null: nothing here estimates usage or cost.

migrate((app) => {
    const collection = app.findCollectionByNameOrId('assistant_turns');
    const field = { name: 'usage', type: 'json', maxSize: 2000 };
    const saved = collection.fields.getByName('usage');
    if (saved) {
        if (Object.keys(field).some((key) => JSON.stringify(typeof saved[key] === 'function' ? saved[key]() : saved[key]) !== JSON.stringify(field[key])))
            throw new Error('Review custom assistant_turns.usage.');
        return;
    }
    collection.fields.add(new Field(field));
    app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId('assistant_turns');
    if (!collection.fields.getByName('usage')) return;
    collection.fields.removeByName('usage');
    app.save(collection);
});
