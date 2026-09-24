/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ─────────────────────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1791900000_classroom_rules_are_null.js
// Stage:       06_IMPLEMENT
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     1791800000_classroom_access_rules.js
// EnumType:    Migration
// EnumEdges:   SUPERSEDES 1791800000_classroom_access_rules.js
// Intent:      1791800000_classroom_access_rules.js grants workspace-scoped API rules to the five
//              classroom_* collections. classrooms.js refuses to serve when ANY of those rules is
//              non-null, so applying that migration is what makes every classroom route answer
//              503 "The classroom backend needs an operator review before it can be used."
//
//              Measured 2026-09-22. Production had it applied and answered 503 on
//              /api/buildanddo/workspaces/{id}/classrooms. Staging had it applied too, but its
//              rules had been nulled by hand during the 09-21 repair, which is why staging served
//              and production did not. The working state existed only in staging's database and
//              not in this repository: rebuilding staging from migrations would have broken it
//              again, and nobody would have known until a class failed to open.
//
//              Null is not an oversight here, it is the design. classrooms.js reads every
//              collection through privileged findRecordsByFilter after running its own
//              access.requireRole check. Direct API rules would open a second door to the same
//              data that does not pass through that check - so the hook treats any non-null rule
//              as a misconfiguration and fails closed rather than serving through the weaker path.
//
//              This migration puts the working state in git. It is deliberately idempotent: it
//              nulls what is already null without complaint, so it is safe on an environment that
//              never had 1791800000 applied.
// ─────────────────────────────────────────────────────────────────────────────
const CLASSROOM_COLLECTIONS = [
    'classroom_rooms',
    'classroom_members',
    'classroom_messages',
    'classroom_presence',
    'classroom_receipts',
];
const RULES = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];

migrate((app) => {
    for (const name of CLASSROOM_COLLECTIONS) {
        let collection;
        try {
            collection = app.findCollectionByNameOrId(name);
        } catch (error) {
            // An environment that never installed the classroom plane has nothing to close. Say so
            // and carry on rather than refusing to start the whole service over an absent table.
            if (!String(error.message).includes('no rows in result set')) throw error;
            app.logger().warn(`1791900000: ${name} absent; nothing to close`);
            continue;
        }
        for (const rule of RULES) collection[rule] = null;
        app.save(collection);
    }
}, (app) => {
    // Down restores nothing. The previous state was the one that took classrooms off the air, and
    // a rollback that reinstates a 503 is not a rollback anyone wants. Re-applying
    // 1791800000_classroom_access_rules.js by hand is the way back, if it is ever actually wanted.
    app.logger().warn('1791900000: down is a no-op; see 1791800000_classroom_access_rules.js');
});
