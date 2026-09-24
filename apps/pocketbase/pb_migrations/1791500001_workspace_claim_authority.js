// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js, apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js; DEPENDS_ON apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js
// Intent:      Lock raw claim writes without hooks while preserving scoped reads and historical reports without backfilled authority.
// ----------------------------------------------------------------

migrate((app) => {
    const names = ['support_sources', 'corrections', 'daily_editions', 'specialist_desks', 'social_content', 'social_channels', 'seat_events'];
    const read = "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)";
    const rule = (value) => value == null ? null : String(value);
    const fieldType = (field) => String(typeof field.type === 'function' ? field.type() : field.type);
    const matches = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
    const users = app.findCollectionByNameOrId('users'), workspaces = app.findCollectionByNameOrId('workspaces');
    const relation = (name) => ({ name, type: 'relation', collectionId: String(users.id), maxSelect: 1, cascadeDelete: false });
    const additions = (name) => [
        // Empty schema marker: rollback removes it, not any record's history.
        { name: 'claim_commands', type: 'bool', hidden: true },
        { name: 'claim_revision', type: 'number', min: 0, onlyInt: true },
        ...(name === 'daily_editions' ? [relation('published_by'), { name: 'published_at', type: 'date' }] : []),
        ...(['support_sources', 'social_channels'].includes(name) ? [relation('requested_by'), { name: 'requested_at', type: 'date' }] : []),
    ];
    const plan = names.map((name) => ({ name, collection: app.findCollectionByNameOrId(name), fields: additions(name) }));
    // Normalize native field methods and Go scalar bindings without treating a
    // string "true" or a missing numeric bound as its boolean/numeric counterpart.
    for (const { name, collection, fields } of plan) {
        if (String(collection.type) !== 'base') throw new Error(`Review custom ${name} type.`);
        for (const key of ['listRule', 'viewRule'])
            if (rule(collection[key]) !== read) throw new Error(`Review custom ${name} ${key}.`);
        const prior = { createRule: `${read} && @request.body.owner = @request.auth.id`,
            updateRule: name === 'seat_events' ? null : read,
            deleteRule: name === 'seat_events' ? null : `${read} && owner = @request.auth.id` };
        for (const key of Object.keys(prior))
            if (rule(collection[key]) !== null && rule(collection[key]) !== prior[key]) throw new Error(`Review custom ${name} ${key}.`);
        for (const [key, target] of [['owner', users.id], ['workspace', workspaces.id]]) {
            const field = collection.fields.getByName(key);
            if (!field || fieldType(field) !== 'relation' || !matches(field.collectionId, String(target)) || !matches(field.maxSelect, 1))
                throw new Error(`Review custom ${name}.${key}.`);
        }
        for (const definition of fields) {
            const field = collection.fields.getByName(definition.name);
            if (field && Object.entries(definition).some(([key, value]) => !matches(key === 'type' ? fieldType(field) : field[key], value)))
                throw new Error(`Review custom ${name}.${definition.name}.`);
        }
    }
    for (const { collection, fields } of plan) {
        let changed = false;
        for (const key of ['createRule', 'updateRule', 'deleteRule']) {
            if (rule(collection[key]) !== null) { collection[key] = null; changed = true; }
        }
        for (const definition of fields) if (!collection.fields.getByName(definition.name)) {
            collection.fields.add(new Field(definition)); changed = true;
        }
        if (changed) app.save(collection);
    }
}, (app) => {
    const names = ['support_sources', 'corrections', 'daily_editions', 'specialist_desks', 'social_content', 'social_channels', 'seat_events'];
    const read = "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)";
    const fieldType = (field) => String(typeof field.type === 'function' ? field.type() : field.type);
    const plan = names.map((name) => app.findCollectionByNameOrId(name));
    for (const collection of plan) {
        if (String(collection.type) !== 'base') throw new Error(`Review custom ${collection.name} type before rollback.`);
        for (const key of ['listRule', 'viewRule'])
            if (collection[key] == null || String(collection[key]) !== read) throw new Error(`Review custom ${collection.name} ${key} before rollback.`);
        for (const key of ['createRule', 'updateRule', 'deleteRule'])
            if (collection[key] != null) throw new Error(`Review custom ${collection.name} ${key} before rollback.`);
        const marker = collection.fields.getByName('claim_commands');
        if (marker && (fieldType(marker) !== 'bool' || JSON.stringify(marker.hidden) !== 'true'))
            throw new Error(`Review custom ${collection.name}.claim_commands before rollback.`);
    }
    // Retain all data, revisions, stamps and locked rules. Old hooks also fail
    // closed until the marker is reinstalled by an explicitly reapplied upgrade.
    for (const collection of plan) if (collection.fields.getByName('claim_commands')) {
        collection.fields.removeByName('claim_commands'); app.save(collection);
    }
});
