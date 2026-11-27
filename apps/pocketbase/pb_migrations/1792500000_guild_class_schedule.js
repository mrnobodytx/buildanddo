/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792500000_guild_class_schedule.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js,
//              apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js;
//              CONSUMED_BY apps/pocketbase/pb_hooks/guild-classes.js; VERIFIED_BY tests/upgrade/guild-classes.test.mjs;
//              VERIFIED_BY tests/upgrade/test_classroom_native.py
// Intent:      Record which classroom the weekly guild class rota created for each workspace, week and slot, once.
// ───────────────────────────────────────────────────────────────
//
// guild_classes is locked (every rule null) and written only by apps/pocketbase/pb_hooks/guild-classes.js.
// One row per (workspace, week, slot), enforced by a unique index: that index is what makes the hourly
// cron idempotent, and a concurrent duplicate fails there and rolls back the room it would have created.
// The class itself is an ordinary classroom_rooms row; deleting it deletes its row here. Seat accounts
// are kept relations (no cascade), so the schedule never vanishes with an account.
//
// `slot` is 0 to 7 and NOT required: PocketBase rejects 0 in a required number field, and slot 0 is the
// first class of every week. The hook always writes it, and the unique index covers it.
//
// Up validates an existing collection before accepting it and is idempotent. Down refuses while any row
// exists or when an operator has opened a rule this migration did not open.

migrate((app) => {
    const norm = (holder, key) => {
        const raw = holder[key];
        const value = typeof raw === 'function' ? raw.call(holder) : raw;
        const json = JSON.stringify(value);
        if (json === undefined) return String(value);
        if (json === '{}' && value !== null && typeof value === 'object') return String(value);
        return json;
    };
    const rule = (value) => value == null ? null : String(value);
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const rooms = exists('classroom_rooms');
    // 1790400000 always runs first; a backend without it has no class for a schedule to name.
    if (!rooms) throw new Error('guild_classes needs classroom_rooms (1790400000_classroom_rooms.js) first.');
    const users = app.findCollectionByNameOrId('users').id;
    const relation = (name, collectionId, required, cascadeDelete) => ({ name, type: 'relation', collectionId, required, cascadeDelete, maxSelect: 1 });
    const text = (name, max) => ({ name, type: 'text', max, required: true });
    const definition = {
        type: 'base', name: 'guild_classes',
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            relation('workspace', app.findCollectionByNameOrId('workspaces').id, true, true),
            text('week', 10),
            { name: 'slot', type: 'number', onlyInt: true, min: 0, max: 7, required: false },
            relation('room', rooms.id, true, true),
            relation('host', users, true, false),
            text('host_seat', 32),
            relation('auditor', users, false, false),
            text('auditor_seat', 32),
            { name: 'starts_at', type: 'date', required: true },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
            'create unique index idx_guild_classes_slot on guild_classes (workspace, week, slot)',
            'create index idx_guild_classes_start on guild_classes (workspace, starts_at)',
        ],
    };
    const actual = exists(definition.name);
    if (!actual) { app.save(new Collection(definition)); return; }
    if (String(actual.type) !== definition.type) throw new Error('Review custom guild_classes.type.');
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (rule(actual[key]) !== null) throw new Error(`Review custom guild_classes.${key}.`);
    for (const field of definition.fields) {
        const saved = actual.fields.getByName(field.name);
        if (!saved || Object.keys(field).some((key) => norm(saved, key) !== norm(field, key)))
            throw new Error(`Review custom guild_classes.${field.name}.`);
    }
    const shape = (index) => String(index).toLowerCase().replace(/[`"[\]]/g, '')
        .replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
    const present = (actual.indexes || []).map(shape);
    if (!definition.indexes.every((index) => present.includes(shape(index))))
        throw new Error('Review guild_classes indexes.');
}, (app) => {
    let collection;
    try { collection = app.findCollectionByNameOrId('guild_classes'); }
    catch (_) { return; }               // nothing to remove
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[key] != null) throw new Error(`Review custom guild_classes.${key} before rollback.`);
    if (app.findRecordsByFilter('guild_classes', "id != ''", '', 1, 0).length)
        throw new Error('Review guild_classes before rollback: removing it would forget which classes the rota scheduled.');
    app.delete(collection);
});
