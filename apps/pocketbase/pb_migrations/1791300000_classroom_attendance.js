// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791300000_classroom_attendance.js
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
// DAG Node:    none
// Intent:      Keep an append-only attendance history so a host can see who came and when, which the overwritten member rows cannot.
// ───────────────────────────────────────────────────────────────
//
// classroom_members keeps one row per person and overwrites joined_at on every
// rejoin, and classroom_presence rows expire, so neither can answer "how many
// people were here at 14:00". This collection records each start, end, join and
// leave once, inside the same transaction as the command that caused it. It is
// locked like every classroom collection: only the classroom hooks read or
// write it, and only aggregate counts ever leave the server.

migrate((app) => {
    // A Go-bound field exposes `type` as a method, so JSON.stringify(saved.type) is undefined and a raw
    // comparison refused every re-apply on native PocketBase ("Review custom ..."). Read values the
    // way the classroom_rooms and classroom_presence migrations do.
    const norm = (holder, key) => {
        const raw = holder[key];
        const value = typeof raw === 'function' ? raw() : raw;
        const json = JSON.stringify(value);
        if (json === undefined) return String(value);
        if (json === '{}' && value !== null && typeof value === 'object') return String(value);
        return json;
    };
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const relation = (name, collectionId, required = true) =>
        ({ name, type: 'relation', collectionId, required, cascadeDelete: true, maxSelect: 1 });
    const definition = {
        type: 'base', name: 'classroom_attendance',
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            relation('workspace', app.findCollectionByNameOrId('workspaces').id),
            relation('room', app.findCollectionByNameOrId('classroom_rooms').id),
            relation('owner', app.findCollectionByNameOrId('users').id),
            { name: 'event', type: 'select', values: ['start', 'end', 'join', 'leave'], maxSelect: 1, required: true },
            { name: 'at', type: 'date', required: true },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        indexes: ['create index idx_classroom_attendance on classroom_attendance (workspace, room, at, id)'],
    };
    const actual = exists(definition.name);
    if (!actual) { app.save(new Collection(definition)); return; }
    // Re-running is a no-op only for an identical, still-locked definition.
    for (const key of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (actual[key] !== definition[key]) throw new Error(`Review custom classroom_attendance.${key}.`);
    for (const field of definition.fields) {
        const saved = actual.fields.getByName(field.name);
        if (!saved || Object.keys(field).some((key) => norm(saved, key) !== norm(field, key)))
            throw new Error(`Review custom classroom_attendance.${field.name}.`);
    }
    const shape = (index) => String(index).toLowerCase().replace(/[`"[\]]/g, '')
        .replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
    const present = (actual.indexes || []).map(shape);
    if (!definition.indexes.every((index) => present.includes(shape(index)))) throw new Error('Review classroom_attendance indexes.');
}, (app) => {
    // Rollback keeps the recorded history, as the classroom migration does for
    // sessions: deleting attendance people already produced is not a schema
    // decision, and the hooks work with or without the collection. It only
    // refuses to leave a collection behind that someone opened to clients.
    let collection;
    try { collection = app.findCollectionByNameOrId('classroom_attendance'); }
    catch (error) { if (String(error.message).includes('no rows in result set')) return; throw error; }
    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[rule] !== null) throw new Error(`Review custom classroom_attendance.${rule} before rollback.`);
});
