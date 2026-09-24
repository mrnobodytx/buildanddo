// CGRF: SRS=SRS-BUILDANDDO-BUDDI-002 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792100000_buddi_intake.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-002
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-002
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     none
// EnumType:    Migration
// EnumEdges:   CONSUMED_BY apps/pocketbase/pb_hooks/buddi-intake.js
// DAG Node:    none
// Intent:      Hold the requests Buddi's three write tools submit, readable and writable by the server only.
// ───────────────────────────────────────────────────────────────

// buddi_intake is where a feedback note, a human-handoff request or a demo-challenge request lands
// when the public voice agent submits one. A person reviews these; nothing here starts work.
//
// EVERY API RULE IS NULL, which in PocketBase means superuser-only: no browser, no signed-in
// account and no anonymous caller can list, read or write a row through the collection API. The
// only write path is pb_hooks/buddi-intake.js, which checks the tool secret, validates the body
// against the tool contract and rate-limits before it saves. The hook also re-checks at request
// time that all five rules are still null and answers 503 otherwise, so loosening a rule in the
// admin UI closes the intake instead of opening it.
//
// NOTHING IN THIS MIGRATION THROWS ON DRIFT. A migration that throws aborts PocketBase startup and
// takes every route down with it (measured on 0.39.8). The runtime guard above already refuses to
// serve a drifted collection, so a startup-time guard would only trade a 503 on three routes for an
// outage of all of them.
//
// DOWN RETAINS EVERY RECEIVED REQUEST. It removes only `protocol_version`, the marker the hook
// requires, so the routes answer 503 after a rollback and serve again after re-up, with the
// requests people already made still there. Deleting the collection would silently lose them.

migrate((app) => {
    const definition = {
        type: 'base',
        name: 'buddi_intake',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
            { name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['feedback', 'handoff', 'challenge_request'] },
            { name: 'payload', type: 'json', required: true, maxSize: 20000 },
            { name: 'payload_digest', type: 'text', required: true, max: 64, pattern: '^[a-f0-9]{64}$' },
            { name: 'conversation_id', type: 'text', required: true, max: 128 },
            { name: 'trace_id', type: 'text', max: 128 },
            { name: 'campaign_id', type: 'text', max: 128 },
            { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['received', 'reviewed', 'closed'] },
            { name: 'notification', type: 'text', max: 60 },
            { name: 'protocol_version', type: 'number', min: 1, onlyInt: true },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
            // One receipt per identical request per conversation: a retried tool call finds its
            // first receipt instead of creating a second row, even when two retries race.
            'CREATE UNIQUE INDEX idx_buddi_intake_replay ON buddi_intake (conversation_id, payload_digest)',
            // The hourly limit counts rows by creation time.
            'CREATE INDEX idx_buddi_intake_created ON buddi_intake (created)',
        ],
    };
    let saved = null;
    try {
        saved = app.findCollectionByNameOrId('buddi_intake');
    } catch (error) {
        if (!String(error).includes('no rows in result set')) throw error;
    }
    if (!saved) {
        app.save(new Collection(definition));
        return;
    }
    // Re-up after a rollback: restore the marker the hook requires and leave everything else,
    // including any drift, for the hook's own request-time check to judge.
    if (!saved.fields.getByName('protocol_version')) {
        saved.fields.add(new Field(definition.fields.find((field) => field.name === 'protocol_version')));
        app.save(saved);
    }
}, (app) => {
    let saved = null;
    try {
        saved = app.findCollectionByNameOrId('buddi_intake');
    } catch (error) {
        if (!String(error).includes('no rows in result set')) throw error;
    }
    if (saved && saved.fields.getByName('protocol_version')) {
        saved.fields.removeByName('protocol_version');
        app.save(saved);
    }
});
