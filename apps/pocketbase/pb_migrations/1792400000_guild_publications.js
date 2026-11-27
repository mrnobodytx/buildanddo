/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792400000_guild_publications.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1788474000_create_workspace_collections.js;
//              CONSUMED_BY apps/pocketbase/pb_hooks/guild-publishing.js; VERIFIED_BY tests/upgrade/guild-publishing.test.mjs
// Intent:      Hold one locked audit row for every guildmaster publication and every owner/admin withdrawal of one.
// ───────────────────────────────────────────────────────────────
//
// guild_publications is written only by apps/pocketbase/pb_hooks/guild-publishing.js, in the same
// transaction as the publication or withdrawal it records. Every rule is null: no REST client
// can list, write or delete it, and owners/admins read it through the guild-publications route.
// `actor` is an account id and `persona` a public slug; no email is stored.
//
// Up validates an existing collection before accepting it (the 1790600000 pattern) and is
// idempotent. Down refuses while any row exists, because the rows are the audit trail, and
// refuses when an operator has opened a rule this migration did not open.

migrate((app) => {
    // Go-bound fields expose `type` as a method and boxed scalars; call the method on its own
    // field, as 1792300000 does, and compare normalised text.
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
    const relation = (name, collectionId, cascadeDelete) => ({ name, type: 'relation', collectionId, required: true, cascadeDelete, maxSelect: 1 });
    const text = (name, max, required = false) => ({ name, type: 'text', max, required });
    const select = (name, values) => ({ name, type: 'select', values, maxSelect: 1, required: true });
    const definition = {
        type: 'base', name: 'guild_publications',
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        fields: [
            relation('workspace', app.findCollectionByNameOrId('workspaces').id, true),
            // Kept when the account goes: the publication history outlives the seat.
            relation('actor', app.findCollectionByNameOrId('users').id, false),
            text('actor_seat', 32),
            text('persona', 64),
            select('action', ['published', 'withdrawn']),
            select('kind', ['daily_edition', 'social_content', 'forum_topic', 'forum_reply', 'wiki_page', 'guild_lesson']),
            text('target', 64, true),
            text('title', 200),
            text('content_digest', 64),
            text('note', 800),
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
            'create index idx_guild_publications_workspace on guild_publications (workspace, created desc, id)',
            'create index idx_guild_publications_target on guild_publications (workspace, kind, target, action)',
        ],
    };
    const actual = exists(definition.name);
    if (!actual) { app.save(new Collection(definition)); return; }
    if (String(actual.type) !== definition.type) throw new Error('Review custom guild_publications.type.');
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (rule(actual[key]) !== null) throw new Error(`Review custom guild_publications.${key}.`);
    for (const field of definition.fields) {
        const saved = actual.fields.getByName(field.name);
        if (!saved || Object.keys(field).some((key) => norm(saved, key) !== norm(field, key)))
            throw new Error(`Review custom guild_publications.${field.name}.`);
    }
    const shape = (index) => String(index).toLowerCase().replace(/[`"[\]]/g, '')
        .replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
    const present = (actual.indexes || []).map(shape);
    if (!definition.indexes.every((index) => present.includes(shape(index))))
        throw new Error('Review guild_publications indexes.');
}, (app) => {
    let collection;
    try { collection = app.findCollectionByNameOrId('guild_publications'); }
    catch (_) { return; }               // nothing to remove
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[key] != null) throw new Error(`Review custom guild_publications.${key} before rollback.`);
    if (app.findRecordsByFilter('guild_publications', "id != ''", '', 1, 0).length)
        throw new Error('Review guild_publications before rollback: removing it would erase the guildmaster publication audit trail.');
    app.delete(collection);
});
