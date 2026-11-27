/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792400002_guild_lessons.js
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
//              CONSUMED_BY apps/pocketbase/pb_hooks/guild-lessons.js; CONSUMED_BY apps/pocketbase/pb_hooks/classrooms.js;
//              VERIFIED_BY tests/upgrade/guild-lessons.test.mjs
// Intent:      Give guildmaster seats workspace class material of their own, kept apart from the tutorials catalogue.
// ───────────────────────────────────────────────────────────────
//
// guild_lessons is locked (every rule null) and written only by guild-lessons.js. A lesson body is
// reading material: sections, outcomes and references, never a knowledge check or answer key, so
// the tutorials catalogue and its graded learning API are untouched. classroom_rooms.material lets
// a host share one published guild lesson into a class instead of a tutorial; it is optional and
// does not cascade, so a room never disappears with a lesson.
//
// Up validates what already exists and is idempotent. Down refuses while any lesson exists or any
// room still points at one.

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
    const definition = {
        type: 'base', name: 'guild_lessons',
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            { name: 'workspace', type: 'relation', collectionId: app.findCollectionByNameOrId('workspaces').id, required: true, cascadeDelete: true, maxSelect: 1 },
            { name: 'owner', type: 'relation', collectionId: app.findCollectionByNameOrId('users').id, required: true, cascadeDelete: false, maxSelect: 1 },
            { name: 'title', type: 'text', max: 160, required: true },
            { name: 'summary', type: 'text', max: 500, required: false },
            { name: 'lesson', type: 'json', maxSize: 30000 },
            { name: 'status', type: 'select', values: ['draft', 'published', 'withdrawn'], maxSelect: 1, required: true },
            { name: 'revision', type: 'number', onlyInt: true },
            { name: 'published_at', type: 'date' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['create index idx_guild_lessons_scope on guild_lessons (workspace, status, created desc, id)'],
    };
    const shape = (index) => String(index).toLowerCase().replace(/[`"[\]]/g, '')
        .replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
    let lessons = exists(definition.name);
    if (lessons) {
        if (String(lessons.type) !== definition.type) throw new Error('Review custom guild_lessons.type.');
        for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (rule(lessons[key]) !== null) throw new Error(`Review custom guild_lessons.${key}.`);
        for (const field of definition.fields) {
            const saved = lessons.fields.getByName(field.name);
            if (!saved || Object.keys(field).some((key) => norm(saved, key) !== norm(field, key)))
                throw new Error(`Review custom guild_lessons.${field.name}.`);
        }
        const present = (lessons.indexes || []).map(shape);
        if (!definition.indexes.every((index) => present.includes(shape(index)))) throw new Error('Review guild_lessons indexes.');
    }
    const rooms = exists('classroom_rooms');
    const material = rooms && rooms.fields.getByName('material');
    if (!lessons) {
        if (material) throw new Error('Review custom classroom_rooms.material.');
        app.save(new Collection(definition));
        lessons = app.findCollectionByNameOrId(definition.name);
    }
    if (!rooms) return;                 // a backend without classrooms keeps its lessons for later
    const field = { name: 'material', type: 'relation', collectionId: lessons.id, required: false, cascadeDelete: false, maxSelect: 1 };
    if (material) {
        if (Object.keys(field).some((key) => norm(material, key) !== norm(field, key))) throw new Error('Review custom classroom_rooms.material.');
        return;
    }
    rooms.fields.add(new Field(field));
    app.save(rooms);
}, (app) => {
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const lessons = exists('guild_lessons');
    const rooms = exists('classroom_rooms');
    const material = rooms && rooms.fields.getByName('material');
    if (lessons) for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (lessons[key] != null) throw new Error(`Review custom guild_lessons.${key} before rollback.`);
    if (lessons && app.findRecordsByFilter('guild_lessons', "id != ''", '', 1, 0).length)
        throw new Error('Review guild_lessons before rollback: removing it would erase guildmaster class material.');
    if (material && app.findRecordsByFilter('classroom_rooms', "material != ''", '', 1, 0).length)
        throw new Error('Review classroom_rooms.material before rollback: a class still shares guild material.');
    if (material) {
        rooms.fields.removeByName('material');
        app.save(rooms);
    }
    if (lessons) app.delete(lessons);
});
