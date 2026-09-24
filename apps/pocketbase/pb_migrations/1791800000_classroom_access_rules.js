/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791800000_classroom_access_rules.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     1790400000_classroom_rooms.js, 1790600000_classroom_presence.js
// EnumType:    Migration
// EnumEdges:   GRANTS workspace-scoped access to the classroom plane, which had none
// Intent:      All five classroom_* collections carry null rules, which in PocketBase means
//              superuser-only, so an authenticated seat is refused 403 on every one of them.
//              Measured 2026-09-22 from ray-tor1-1 over its own CitadelKey. The data plane was
//              built and deployed on both environments and never given API rules, which is why
//              there is no evidence of any agent using classrooms: authorization forbade it.
// ─────────────────────────────────────────────────────────────────────────────
migrate((app) => {
    // Matches signals/evidence/missions exactly. Every classroom_* collection carries a DIRECT
    // workspace relation - checked, none of them needs to traverse through room - so one predicate
    // serves all five rather than five hand-written variants that could drift apart.
    const MEMBER = "@request.auth.id != '' && (workspace.owner = @request.auth.id"
                 + " || workspace.workspace_members_via_workspace.user ?= @request.auth.id)";

    // READS open everywhere. WRITES only where a human or seat is genuinely the actor.
    //
    // classroom_presence and classroom_receipts stay superuser-only on write ON PURPOSE. Presence
    // is what the route refuses to call verified until the SFU echoes the track back, so a client
    // that could POST its own presence row could assert a track it never sends - defeating the one
    // guarantee that surface makes. Receipts are server-issued for the same reason.
    const PLAN = [
        { name: 'classroom_rooms',    actor: 'host',      write: true },
        { name: 'classroom_members',  actor: 'owner',     write: true },
        { name: 'classroom_messages', actor: 'owner',     write: true },
        { name: 'classroom_presence', actor: 'publisher', write: false },
        { name: 'classroom_receipts', actor: 'actor',     write: false },
    ];

    let changed = 0;
    let skipped = 0;
    for (const spec of PLAN) {
        let collection;
        try {
            collection = app.findCollectionByNameOrId(spec.name);
        } catch (err) {
            console.log('[1791800000] ' + spec.name + ' not found: ' + err);
            continue;
        }
        if (!collection) { console.log('[1791800000] ' + spec.name + ' missing'); continue; }

        // A rule is bound into the JSVM as an OBJECT, so `rule === 'text'` is ALWAYS false and a
        // guard written that way can never fire. Compare through String(), and treat only a
        // genuinely empty value as "not yet set" so re-running cannot clobber a hand-tuned rule.
        const current = collection.listRule === null || collection.listRule === undefined
            ? null : String(collection.listRule);
        if (current !== null && current.indexOf('@request.auth.id') >= 0) {
            console.log('[1791800000] ' + spec.name + ' already has an auth rule - leaving it');
            skipped += 1;
            continue;
        }

        collection.listRule = MEMBER;
        collection.viewRule = MEMBER;
        if (spec.write) {
            collection.createRule = MEMBER + ' && @request.body.' + spec.actor + ' = @request.auth.id';
            collection.updateRule = MEMBER;
            collection.deleteRule = MEMBER + ' && ' + spec.actor + ' = @request.auth.id';
        }
        app.save(collection);
        changed += 1;
    }
    console.log('[1791800000] opened ' + changed + ' classroom collection(s), skipped ' + skipped);
}, (app) => {
    // Down restores superuser-only, which is the state this migration found them in.
    for (const name of ['classroom_rooms', 'classroom_members', 'classroom_messages',
                        'classroom_presence', 'classroom_receipts']) {
        try {
            const collection = app.findCollectionByNameOrId(name);
            if (!collection) continue;
            collection.listRule = null;
            collection.viewRule = null;
            collection.createRule = null;
            collection.updateRule = null;
            collection.deleteRule = null;
            app.save(collection);
        } catch (err) { /* nothing to restore */ }
    }
});
