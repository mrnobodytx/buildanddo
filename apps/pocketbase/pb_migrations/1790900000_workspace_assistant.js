// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_migrations/1790900000_workspace_assistant.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// EnumType:     Migration
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_migrations/1790000000_workspace_administration.js
// DAG Node:     none
// Intent:       Isolate assistant sessions, plans and learned patterns by account and workspace behind native authenticated routes.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const relation = (name, target) => ({ name, type: 'relation', maxSelect: 1, required: true,
        collectionId: app.findCollectionByNameOrId(target).id, cascadeDelete: false });
    const common = () => [relation('workspace', 'workspaces'), relation('owner', 'users'),
        { name: 'revision', type: 'number', onlyInt: true, min: 0 }, { name: 'protocol_version', type: 'number', onlyInt: true, min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false }, { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    const definitions = [
        { name: 'assistant_sessions', fields: [...common(), { name: 'title', type: 'text', max: 160 }, { name: 'status', type: 'text', max: 20 },
            { name: 'request_key', type: 'text', max: 80 }, { name: 'last_route', type: 'text', max: 300 }],
            indexes: ['create unique index idx_assistant_session_retry on assistant_sessions (workspace, owner, request_key)'] },
        { name: 'assistant_turns', fields: () => [...common(), relation('session', 'assistant_sessions'), { name: 'request_key', type: 'text', max: 80 },
            { name: 'message', type: 'text', max: 4000 }, { name: 'reply', type: 'text', max: 8000 }, { name: 'status', type: 'text', max: 30 },
            { name: 'surface', type: 'json', maxSize: 65536 }, { name: 'plan', type: 'json', maxSize: 65536 }, { name: 'failure', type: 'text', max: 80 }],
            indexes: ['create unique index idx_assistant_turn_retry on assistant_turns (session, request_key)'] },
        { name: 'assistant_patterns', fields: () => [...common(), relation('session', 'assistant_sessions'), relation('turn', 'assistant_turns'),
            { name: 'title', type: 'text', max: 160 }, { name: 'route', type: 'text', max: 300 }, { name: 'steps', type: 'json', maxSize: 32000 },
            { name: 'outcome', type: 'text', max: 30 }, { name: 'observation', type: 'text', max: 600 }],
            indexes: ['create unique index idx_assistant_pattern_turn on assistant_patterns (turn)'] },
    ];
    for (const definition of definitions) {
        const fields = typeof definition.fields === 'function' ? definition.fields() : definition.fields;
        let existing;
        try { existing = app.findCollectionByNameOrId(definition.name); }
        catch (error) { if (!String(error.message).includes('no rows in result set')) throw error; }
        if (!existing) app.save(new Collection({ ...definition, fields, type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null }));
        else {
            if (['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((rule) => existing[rule] !== null) ||
                !definition.indexes.every((index) => existing.indexes.includes(index))) throw new Error('Review assistant isolation before migration.');
            for (const field of fields) {
                const old = existing.fields.getByName(field.name);
                if (!old && field.name === 'protocol_version') existing.fields.add(new Field(field));
                else if (!old || Object.entries(field).some(([key, value]) => old[key] !== value))
                    throw new Error('Review assistant field identity before migration.');
            }
            app.save(existing);
        }
    }
}, (app) => {
    // Retain personal records while disabling the feature; users can export or
    // forget individual sessions through the authorized API before rollback.
    for (const name of ['assistant_sessions', 'assistant_turns', 'assistant_patterns']) {
        let collection;
        try { collection = app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) continue; throw error; }
        collection.fields.removeByName('protocol_version'); app.save(collection);
    }
});
