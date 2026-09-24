// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791600100_domain_verification.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-SITE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-SITE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js
// DAG Node:    none
// Intent:      Hold the DNS ownership challenge and its last result on each domain, with the token hidden from record APIs.
// ───────────────────────────────────────────────────────────────

const FIELDS = [
    { name: 'verification_token', type: 'text', max: 128, hidden: true },
    { name: 'verification_requested_at', type: 'date' },
    { name: 'verification_checked_at', type: 'date' },
    { name: 'verification_result', type: 'select', maxSelect: 1, values: ['not_found', 'mismatch', 'lookup_failed', 'verified'] },
    { name: 'verified_at', type: 'date' },
];

migrate((app) => {
    const collection = app.findCollectionByNameOrId('domains');
    let changed = false;
    for (const field of FIELDS) {
        const saved = collection.fields.getByName(field.name);
        if (saved) {
            // Native fields expose type() as a method; stored definitions carry it as a value.
            const type = typeof saved.type === 'function' ? saved.type() : saved.type;
            if (type !== field.type || (field.hidden && saved.hidden !== true)) throw new Error(`Review custom domains.${field.name}.`);
            continue;
        }
        collection.fields.add(new Field(field)); changed = true;
    }
    if (changed) app.save(collection);
    // A status picked from the former Settings dropdown was never checked, so it no longer reads as verified.
    for (const record of app.findRecordsByFilter('domains', "status = 'verified' && verified_at = ''", '', 0, 0)) {
        record.set('status', 'needs_attention'); app.save(record);
    }
}, (app) => {
    // Only the proof fields are dropped; a re-applied up step then treats every verified status as unchecked.
    const collection = app.findCollectionByNameOrId('domains');
    const present = FIELDS.filter((field) => collection.fields.getByName(field.name));
    if (!present.length) return;
    present.forEach((field) => collection.fields.removeByName(field.name));
    app.save(collection);
});
