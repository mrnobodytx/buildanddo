// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_migrations/1791100000_room_kind.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-CLASSROOM-001
// CAPS:         pending
// CK:           pending
// Seat:         C-ONE
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-21
// Depends:      apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// EnumType:     Migration
// EnumEdges:    EXTENDS classroom_rooms with a room kind so a workspace can hold conversations as
//               well as taught sessions
// Intent:       Give the room system a kind, so a chatroom and a classroom are the same governed
//               room with different rules, instead of a second parallel implementation.
// ───────────────────────────────────────────────────────────────

// WHY A KIND RATHER THAN A NEW SUBSYSTEM. classroom_rooms already carries everything a chatroom
// needs and has been proven in use: membership, revision-guarded commands, idempotent request keys,
// retained receipts, per-room messages and presence. A parallel chat_* implementation would have to
// re-earn all of that and would drift from it. One discriminator is additive and reversible.
//
// EXISTING ROWS ARE UNTOUCHED. The field is optional and an empty value reads as 'class', so every
// room written before this migration keeps behaving exactly as it did.

migrate((app) => {
    // PocketBase 0.39.8 does not expose a saved Field's properties as plain values: `type` is a
    // METHOD and numeric bounds are *float64 POINTERS. Compare as normalised text, never with ===.
    const norm = (holder, key) => {
        const raw = holder[key];
        const value = typeof raw === 'function' ? raw() : raw;
        const json = JSON.stringify(value);
        if (json === undefined) return String(value);
        if (json === '{}' && value !== null && typeof value === 'object') return String(value);
        return json;
    };
    const rooms = app.findCollectionByNameOrId('classroom_rooms');
    const declared = { name: 'kind', type: 'select', values: ['class', 'chat'], maxSelect: 1 };
    const existing = rooms.fields.getByName('kind');
    if (!existing) {
        rooms.fields.add(new Field(declared));
        app.save(rooms);
        return;
    }
    // Already present: only accept it if it is the field this migration would have written.
    for (const key of Object.keys(declared)) {
        if (norm(existing, key) !== JSON.stringify(declared[key]))
            throw new Error('Review the custom classroom_rooms.kind field before migrating.');
    }
}, (app) => {
    // Rollback keeps every room and every message; it only removes the discriminator, after which
    // every room reads as a class again.
    let rooms;
    try { rooms = app.findCollectionByNameOrId('classroom_rooms'); }
    catch (error) {
        if (String(error.message).includes('no rows in result set')) return;
        throw error;
    }
    if (rooms.fields.getByName('kind')) {
        rooms.fields.removeByName('kind');
        app.save(rooms);
    }
});
