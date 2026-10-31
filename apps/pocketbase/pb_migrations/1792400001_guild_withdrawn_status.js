/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792400001_guild_withdrawn_status.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_migrations/1788477655_create_editorial_collections.js,
//              apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1788477655_create_editorial_collections.js;
//              DEPENDS_ON apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js;
//              CONSUMED_BY apps/pocketbase/pb_hooks/guild-publishing.js; VERIFIED_BY tests/upgrade/guild-publishing.test.mjs
// Intent:      Let an owner or admin leave a withdrawn guildmaster edition or post in a state of its own.
// ───────────────────────────────────────────────────────────────
//
// Appends 'withdrawn' to the status select of daily_editions and social_content when absent, the
// way 1789700000 appended 'approved'. Nothing else changes and no row is rewritten. It is its own
// migration so a fixture without the editorial collections (the classroom native suite) can install
// the guild publication and lesson migrations without it.
//
// Down removes the value only while no row uses it; a withdrawn record keeps its state otherwise.

migrate((app) => {
    for (const name of ['daily_editions', 'social_content']) {
        const collection = app.findCollectionByNameOrId(name);
        const status = collection.fields.getByName('status');
        if (!status) throw new Error(`Review custom ${name}.status.`);
        const values = [...(status.values || [])].map(String);
        if (values.includes('withdrawn')) continue;
        status.values = [...values, 'withdrawn'];
        app.save(collection);
    }
}, (app) => {
    for (const name of ['daily_editions', 'social_content']) {
        let collection;
        try { collection = app.findCollectionByNameOrId(name); }
        catch (_) { continue; }
        const status = collection.fields.getByName('status');
        const values = status ? [...(status.values || [])].map(String) : [];
        if (!values.includes('withdrawn')) continue;
        if (app.findRecordsByFilter(name, "status = 'withdrawn'", '', 1, 0).length)
            throw new Error(`Review ${name} before rollback: a withdrawn record would lose its state.`);
        status.values = values.filter((value) => value !== 'withdrawn');
        app.save(collection);
    }
});
