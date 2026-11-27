/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792300000_seat_event_persona.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_migrations/1788940000_create_community_contributor_collections.js,
//              apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js;
//              CONSUMED_BY apps/pocketbase/pb_hooks/workspace-claims.js; VERIFIED_BY tests/upgrade/workspace-claims.test.mjs
// Intent:      Give seat_events a server-stamped persona, so a guildmaster seat's report names the guildmaster that made it.
// ───────────────────────────────────────────────────────────────
//
// One optional text field. Only workspace-claims.js writes it, from the stored seat account
// (guildmasters.seatOf); it is not an editable claim value, and raw writes stay locked by
// 1791500001. Human reports and every historical row keep it empty: nothing is backfilled.
//
// Up refuses before saving unless seat_events still has the locked claim shape and any existing
// persona field is this one. Down refuses while any report carries a persona, because removing the
// field would erase which guildmaster made it.

migrate((app) => {
    const read = "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)";
    const rule = (value) => value == null ? null : String(value);
    // Go-bound fields expose `type` as a method and boxed scalars; read them as the
    // 1791300001 migration does, calling the method on its own field.
    const norm = (holder, key) => {
        const raw = holder[key];
        const value = typeof raw === 'function' ? raw.call(holder) : raw;
        const json = JSON.stringify(value);
        if (json === undefined) return String(value);
        if (json === '{}' && value !== null && typeof value === 'object') return String(value);
        return json;
    };
    const review = (reason) => new Error(`Review custom seat_events.persona (${reason}).`);
    let collection;
    try { collection = app.findCollectionByNameOrId('seat_events'); }
    catch (_) { throw review('seat_events is missing'); }
    if (String(collection.type) !== 'base') throw review('collection type');
    for (const key of ['listRule', 'viewRule'])
        if (rule(collection[key]) !== read) throw review(key);
    for (const key of ['createRule', 'updateRule', 'deleteRule'])
        if (rule(collection[key]) !== null) throw review(key);
    const field = { name: 'persona', type: 'text', max: 64, required: false, hidden: false };
    const saved = collection.fields.getByName('persona');
    if (saved) {
        if (Object.keys(field).some((key) => norm(saved, key) !== norm(field, key))) throw review('field shape');
        return;
    }
    collection.fields.add(new Field(field));
    app.save(collection);
}, (app) => {
    const norm = (holder, key) => {
        const raw = holder[key];
        const value = typeof raw === 'function' ? raw.call(holder) : raw;
        const json = JSON.stringify(value);
        if (json === undefined) return String(value);
        if (json === '{}' && value !== null && typeof value === 'object') return String(value);
        return json;
    };
    let collection;
    try { collection = app.findCollectionByNameOrId('seat_events'); }
    catch (_) { return; }               // nothing to remove
    const saved = collection.fields.getByName('persona');
    if (!saved) return;
    const field = { name: 'persona', type: 'text', max: 64, required: false, hidden: false };
    if (Object.keys(field).some((key) => norm(saved, key) !== norm(field, key)))
        throw new Error('Review custom seat_events.persona before rollback.');
    if (app.findRecordsByFilter('seat_events', "persona != ''", '', 1, 0).length)
        throw new Error('Review seat_events.persona before rollback: guildmaster reports carry a persona that removing the field would erase.');
    collection.fields.removeByName('persona');
    app.save(collection);
});
