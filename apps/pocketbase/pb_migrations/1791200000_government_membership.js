// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791200000_government_membership.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/pocketbase/pb_hooks/government-access.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/government-access.js
// Intent:      Store operator-owned membership receipts and remove government lessons from the general catalogue API.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const name = 'government_memberships';
    const fields = [
        { name: 'user', type: 'relation', required: true, collectionId: app.findCollectionByNameOrId('users').id, maxSelect: 1, cascadeDelete: false },
        ...['tier', 'status', 'currency', 'interval', 'payment_reference', 'approved_by'].map((key) => ({ name: key, type: 'text', max: 240 })),
        { name: 'amount_cents', type: 'number', min: 0, onlyInt: true },
        ...['approved_at', 'starts_at', 'expires_at'].map((key) => ({ name: key, type: 'date' })),
        { name: 'protocol_version', type: 'number', min: 0, onlyInt: true },
    ];
    const rules = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
    const indexes = ['create unique index idx_government_membership_user on government_memberships (user)'];
    const tutorials = app.findCollectionByNameOrId('tutorials');
    const prior = "@request.auth.id != ''";
    const restricted = "@request.auth.id != '' && category != 'Government submissions'";
    for (const key of ['listRule', 'viewRule'])
        if (![prior, restricted].includes(String(tutorials[key] ?? ''))) throw new Error('Review custom tutorial access before installing government membership.');
    let existing;
    try { existing = app.findCollectionByNameOrId(name); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    if (existing) {
        if (existing.type !== 'base' || Object.keys(rules).some((key) => existing[key] !== null) ||
            indexes.some((index) => !existing.indexes.includes(index))) throw new Error('Review custom membership access and identities.');
        for (const field of fields) {
            const actual = existing.fields.getByName(field.name);
            if (!actual && field.name === 'protocol_version') continue;
            if (!actual || Object.keys(field).some((key) => JSON.stringify(actual[key]) !== JSON.stringify(field[key])))
                throw new Error('Review custom membership fields.');
        }
        if (!existing.fields.getByName('protocol_version')) { existing.fields.add(new Field(fields[fields.length - 1])); app.save(existing); }
    } else app.save(new Collection({ name, type: 'base', ...rules, fields, indexes }));
    tutorials.listRule = restricted; tutorials.viewRule = restricted; app.save(tutorials);
}, (app) => {
    // Preserve receipts and keep restricted content fenced during rollback.
    let collection;
    try { collection = app.findCollectionByNameOrId('government_memberships'); }
    catch (error) { if (String(error.message).includes('no rows in result set')) return; throw error; }
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[key] !== null) throw new Error('Review custom membership rules before rollback.');
    if (collection.fields.getByName('protocol_version')) { collection.fields.removeByName('protocol_version'); app.save(collection); }
});
