// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// DAG Node:    none
// Intent:      Retain scoped classroom sessions and recovery receipts behind authenticated commands without exposing native writes.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const roomId = exists('classroom_rooms')?.id || 'bdoclassrooms01';
    const relation = (name, collectionId, required = true, cascadeDelete = true) =>
        ({ name, type: 'relation', collectionId, required, cascadeDelete, maxSelect: 1 });
    const workspace = () => relation('workspace', app.findCollectionByNameOrId('workspaces').id);
    const account = (name, required = true, cascade = true) => relation(name, app.findCollectionByNameOrId('users').id, required, cascade);
    const room = () => relation('room', roomId);
    const text = (name, max, required = false) => ({ name, type: 'text', max, required });
    const number = (name) => ({ name, type: 'number', min: 0, onlyInt: true });
    const date = (name) => ({ name, type: 'date' });
    const stamps = () => [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    const locked = { type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };
    const definitions = [
        { ...locked, id: roomId, name: 'classroom_rooms', fields: [workspace(), account('host', false, false),
            text('host_name', 120, true), text('title', 160, true), text('description', 2000),
            relation('tutorial', app.findCollectionByNameOrId('tutorials').id, false, false), number('section'),
            { name: 'status', type: 'select', values: ['scheduled', 'live', 'ended'], maxSelect: 1, required: true },
            date('starts_at'), date('started_at'), date('ended_at'), number('revision'), number('protocol_version'), ...stamps()],
            indexes: ['create index idx_classroom_workspace on classroom_rooms (workspace, status, created desc, id)'] },
        { ...locked, name: 'classroom_members', fields: [workspace(), room(), account('owner'), text('name', 120, true),
            { name: 'active', type: 'bool' }, date('joined_at'), date('last_seen'), number('revision'), ...stamps()],
            indexes: ['create unique index idx_classroom_member on classroom_members (room, owner)',
                'create index idx_classroom_presence on classroom_members (workspace, room, active, last_seen desc)'] },
        { ...locked, name: 'classroom_messages', fields: [workspace(), room(), account('owner'), text('name', 120, true),
            text('body', 2000, true), ...stamps()],
            indexes: ['create index idx_classroom_discussion on classroom_messages (workspace, room, created desc, id)'] },
        { ...locked, name: 'classroom_receipts', fields: [workspace(), account('actor'), text('request_key', 80, true),
            { name: 'command', type: 'json', maxSize: 30000 }, { name: 'result', type: 'json', maxSize: 10000 }, ...stamps()],
            indexes: ['create unique index idx_classroom_retry on classroom_receipts (workspace, actor, request_key)'] },
    ];
    // PocketBase normalizes index quoting and whitespace when saving collections.
    const shape = (index) => String(index).toLowerCase().replace(/[`"[\]]/g, '')
        .replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
    // Validate every existing definition before creating or re-enabling anything.
    for (const definition of definitions) {
        const actual = exists(definition.name);
        if (!actual) continue;
        for (const key of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (actual[key] !== definition[key]) throw new Error(`Review custom ${definition.name}.${key}.`);
        for (const field of definition.fields) {
            const saved = actual.fields.getByName(field.name);
            if (!saved && field.name === 'protocol_version') continue;
            if (!saved || Object.keys(field).some((key) => JSON.stringify(saved[key]) !== JSON.stringify(field[key])))
                throw new Error(`Review custom ${definition.name}.${field.name}.`);
        }
        const present = (actual.indexes || []).map(shape);
        if (!definition.indexes.every((index) => present.includes(shape(index)))) throw new Error(`Review ${definition.name} indexes.`);
    }
    for (const definition of definitions) {
        const actual = exists(definition.name);
        if (!actual) app.save(new Collection(definition));
        else if (definition.name === 'classroom_rooms' && !actual.fields.getByName('protocol_version')) {
            actual.fields.add(new Field(number('protocol_version'))); app.save(actual);
        }
    }
}, (app) => {
    // Preserve attendance, discussion and retry history while disabling commands.
    for (const name of ['classroom_rooms', 'classroom_members', 'classroom_messages', 'classroom_receipts']) {
        const collection = app.findCollectionByNameOrId(name);
        for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (collection[rule] !== null) throw new Error(`Review custom ${name}.${rule} before rollback.`);
    }
    const collection = app.findCollectionByNameOrId('classroom_rooms');
    if (collection.fields.getByName('protocol_version')) {
        collection.fields.removeByName('protocol_version'); app.save(collection);
    }
});
