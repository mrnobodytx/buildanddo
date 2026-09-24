// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1790600000_classroom_presence.js
// Stage:       07_BUILD
// SRS:         SRS-CN-PERSONA-RUNTIME-001
// CAPS:        pending
// CK:          pending
// Dispatch:    C-ONE-20260918-PERSONA-RUNTIME-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// DAG Node:    none
// Intent:      Hold the expiring advertisement a classroom reads to find the teacher's and a manifested guildmaster's SFU session and track names.
// ───────────────────────────────────────────────────────────────
//
// WHY A SEPARATE COLLECTION
//   classroom_members already answers "who is in the room". It does NOT answer
//   "which SFU session and track name do I pull to hear them", which is the only
//   question a subscriber actually needs. Overloading classroom_members would put
//   signalling state on the attendance row that the classrooms.js command surface
//   validates field-by-field, so this is its own record.
//
// TTL, NOT A FLAG
//   Every row carries expires_at. A body that crashes stops refreshing and its row
//   is simply ignored by the reader — nothing has to notice the death and write a
//   tombstone. The hook refuses a row with no expires_at and refuses one further
//   ahead than the bounded TTL, so a client cannot pin a far-future stamp and
//   advertise a dead track forever.
//
//   "Ephemeral" is a claim about STORAGE, not only about semantics, so the hook
//   sweeps this collection: every accepted write deletes the rows of its own room
//   that expired more than five minutes ago. An earlier revision evaluated expiry
//   at read time only, which left a collection described as ephemeral growing
//   without bound.
//
// NO SEAT LABEL IS STORED
//   An earlier revision carried a required `seat` column. callerSeat resolves to
//   auth.get('seat_id') || auth.get('email') || auth.id and this estate's users
//   collection has no seat_id field, so that column WAS the caller's email address,
//   persisted per room per session in a collection nothing pruned. It is gone. The
//   durable identity of a row is `publisher`, an opaque account id, and
//   `access_basis` records whether the write was accepted as the room's host, as a
//   member, or on the strength of the publish allowlist alone.
//
// ACCESS
//   Every rule is null: the collection is locked and only apps/pocketbase/pb_hooks/
//   classroom-presence.pb.js writes or reads it, exactly as the other classroom
//   collections are held. A locked collection means no PocketBase REST client can
//   enumerate rooms, seats or session ids directly.
//
// PREFIX
//   1790600000 was verified unused on 2026-09-18; 1790500000 already carries two
//   migrations (workspace_blueprints and workspace_decisions).

migrate((app) => {
    const exists = (name) => {
        try { return app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error.message).includes('no rows in result set')) return null; throw error; }
    };
    const relation = (name, collectionId, required = true, cascadeDelete = true) =>
        ({ name, type: 'relation', collectionId, required, cascadeDelete, maxSelect: 1 });
    const text = (name, max, required = false) => ({ name, type: 'text', max, required });
    const stamps = () => [{ name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }];
    const locked = { type: 'base', listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };

    const definition = {
        ...locked,
        name: 'classroom_presence',
        fields: [
            relation('workspace', app.findCollectionByNameOrId('workspaces').id),
            relation('room', app.findCollectionByNameOrId('classroom_rooms').id),
            // The authenticated account that wrote the row. A row may only ever be
            // rewritten by its own publisher; the hook enforces that on every upsert.
            relation('publisher', app.findCollectionByNameOrId('users').id),
            // Empty for a human teacher; 'gm-forge' and friends for a manifested
            // guildmaster, slugified by the hook so 'gm:forge' from the Python
            // runtime and 'gm-forge' from a browser land on one spelling. The
            // browser auto-subscribes to persona rows only.
            text('persona_id', 120),
            text('display_name', 120, true),
            { name: 'role', type: 'select', values: ['teacher', 'guildmaster', 'assistant'], maxSelect: 1, required: true },
            // Why the write was allowed into this room: 'host', 'member', or
            // 'publisher_grant' when only the publish allowlist admitted it. A
            // widening is then readable in the data, not only in a hook comment.
            { name: 'access_basis', type: 'select', values: ['host', 'member', 'publisher_grant'], maxSelect: 1, required: true },
            // Cloudflare Realtime session id and the track names published on it.
            text('session_id', 200, true),
            { name: 'tracks', type: 'json', maxSize: 4000 },
            text('app_name', 120),
            text('manifest_id', 80),
            text('capsule_digest', 64),
            { name: 'state', type: 'select', values: ['LIVE', 'DEGRADED', 'ENDED'], maxSelect: 1, required: true },
            { name: 'expires_at', type: 'date', required: true },
            ...stamps(),
        ],
        indexes: [
            'create unique index idx_classroom_presence_session on classroom_presence (room, session_id)',
            'create index idx_classroom_presence_live on classroom_presence (workspace, room, expires_at desc, id)',
        ],
    };

    // Validate an existing collection before touching it, the same way the
    // classroom_rooms migration does: a hand-edited collection is an operator
    // decision, not something a migration may silently overwrite.
    const actual = exists(definition.name);
    if (actual) {
        for (const key of ['type', 'listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
            if (actual[key] !== definition[key]) throw new Error(`Review custom ${definition.name}.${key}.`);
        for (const field of definition.fields) {
            const saved = actual.fields.getByName(field.name);
            if (!saved || Object.keys(field).some((key) => JSON.stringify(typeof saved[key] === 'function' ? saved[key]() : saved[key]) !== JSON.stringify(field[key])))
                throw new Error(`Review custom ${definition.name}.${field.name}.`);
        }
        // PocketBase stores an index as normalized, backticked DDL, so comparing
        // the raw strings this file wrote against what came back turns every
        // re-apply into "Review classroom_presence indexes." - a guard that only
        // ever produces false positives. Compare the shape instead: lower-cased,
        // backticks and quotes dropped, runs of whitespace collapsed. The
        // 1790400000_classroom_rooms.js guard this was copied from has the same
        // defect; it belongs to that file's owner and is not edited here.
        const shape = (index) => String(index).toLowerCase().replace(/[`"[\]]/g, '')
            .replace(/\s+/g, ' ').replace(/\s*([(),])\s*/g, '$1').trim();
        const present = (actual.indexes || []).map(shape);
        if (!definition.indexes.every((index) => present.includes(shape(index))))
            throw new Error(`Review ${definition.name} indexes.`);
        return;
    }
    app.save(new Collection(definition));
}, (app) => {
    // Presence is ephemeral by construction, so rollback drops it rather than
    // preserving rows that are all expired within two minutes anyway. Refuse if an
    // operator has opened the collection up, because that is a change this
    // migration did not make.
    const collection = app.findCollectionByNameOrId('classroom_presence');
    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'])
        if (collection[rule] !== null) throw new Error(`Review custom classroom_presence.${rule} before rollback.`);
    app.delete(collection);
});
