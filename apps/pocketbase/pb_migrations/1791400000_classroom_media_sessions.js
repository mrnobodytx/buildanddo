// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// Intent:      Bind provider sessions and published tracks to native classroom attendance instead of trusting caller-supplied session identifiers.
// ----------------------------------------------------------------

migrate((app) => {
    const relation = (name, target) => ({ name, type: 'relation', required: true, maxSelect: 1,
        collectionId: app.findCollectionByNameOrId(target).id, cascadeDelete: true });
    const definition = {
        name: 'classroom_media_sessions', type: 'base',
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [relation('workspace', 'workspaces'), relation('room', 'classroom_rooms'), relation('owner', 'users'),
            relation('membership', 'classroom_members'),
            { name: 'member_revision', type: 'number', min: 1, onlyInt: true, required: true },
            { name: 'provider_app', type: 'text', max: 200, required: true },
            { name: 'session_id', type: 'text', max: 200, required: true },
            { name: 'tracks', type: 'json', maxSize: 4000 },
            { name: 'active', type: 'bool' }, { name: 'busy', type: 'bool' },
            { name: 'expires_at', type: 'date', required: true },
            { name: 'protocol_version', type: 'number', min: 0, onlyInt: true },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }],
        indexes: ['create unique index idx_classroom_media_session on classroom_media_sessions (provider_app, session_id)',
            'create index idx_classroom_media_owner on classroom_media_sessions (workspace, room, owner, active)'],
    };
    let collection;
    try { collection = app.findCollectionByNameOrId(definition.name); }
    catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
    if (!collection) { app.save(new Collection(definition)); return; }
    for (const name of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[name] !== definition[name]) throw new Error(`Review custom classroom_media_sessions.${name}.`);
    for (const field of definition.fields) {
        const current = collection.fields.getByName(field.name);
        if (!current && field.name === 'protocol_version') continue;
        if (!current || Object.keys(field).some((name) => JSON.stringify(current[name]) !== JSON.stringify(field[name])))
            throw new Error(`Review custom classroom_media_sessions.${field.name}.`);
    }
    const shape = (index) => String(index).toLowerCase().replace(/[`"[\]]/g, '')
        .replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
    if (!definition.indexes.every((index) => (collection.indexes || []).map(shape).includes(shape(index))))
        throw new Error('Review classroom_media_sessions indexes.');
    if (!collection.fields.getByName('protocol_version')) {
        // Re-enabled storage does not backfill version 1 on old sessions.
        collection.fields.add(new Field(definition.fields.find((field) => field.name === 'protocol_version')));
        app.save(collection);
    }
}, (app) => {
    let collection;
    try { collection = app.findCollectionByNameOrId('classroom_media_sessions'); }
    catch (error) { if (String(error.message).includes('no rows in result set')) return; throw error; }
    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[rule] !== null) throw new Error(`Review custom classroom_media_sessions.${rule} before rollback.`);
    if (collection.fields.getByName('protocol_version')) {
        collection.fields.removeByName('protocol_version'); app.save(collection);
    }
});
