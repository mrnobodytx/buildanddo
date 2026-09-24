// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791500100_tutorial_answer_wait.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-TRUST-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001, VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790600000_tutorial_learning.js
// DAG Node:    none
// Intent:      Record when a learner may answer again after a wrong knowledge check, without touching checkpoints or certificates.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const collection = app.findCollectionByNameOrId('tutorial_learning');
    const field = { name: 'answer_retry_at', type: 'date' };
    const saved = collection.fields.getByName(field.name);
    if (saved) {
        if (String(typeof saved.type === 'function' ? saved.type() : saved.type) !== field.type) throw new Error('Review custom tutorial_learning.answer_retry_at.');
        return;
    }
    collection.fields.add(new Field(field));
    app.save(collection);
}, (app) => {
    // Only the pending wait is dropped; learning commands then report the upgrade as missing.
    const collection = app.findCollectionByNameOrId('tutorial_learning');
    if (collection.fields.getByName('answer_retry_at')) {
        collection.fields.removeByName('answer_retry_at'); app.save(collection);
    }
});
