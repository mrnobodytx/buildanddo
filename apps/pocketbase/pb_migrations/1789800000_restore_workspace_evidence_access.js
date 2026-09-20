// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789800000_restore_workspace_evidence_access.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/1788900000_create_workspace_members_rbac.js, apps/pocketbase/pb_hooks/evidence.pb.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1788900000_create_workspace_members_rbac.js; DEPENDS_ON apps/pocketbase/pb_hooks/evidence.pb.js
// DAG Node:    none
// Intent:      Let current members discover their workspace and read shared evidence without granting workspace management or evidence authorship to another account.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    // PocketBase 0.39.x binds a collection's rules as *string, which reaches the JSVM as an OBJECT
    // and not a primitive: measured 2026-09-20 on 0.39.8, `typeof collection.listRule === 'object'`
    // while String(...) yields the right text. Array.includes and === compare by identity, so every
    // comparison below against a string literal was false and this preflight threw on ANY database,
    // including one whose rules were already exactly `previous`. It was not detecting a custom rule,
    // it could not read the rule at all. Normalise through String(), keeping null distinct because a
    // null rule means superuser-only and is a real value.
    const ruleOf = (value) => (value === null || value === undefined ? null : String(value));
    const members = app.findCollectionByNameOrId('workspace_members');
    if (!members.fields.getByName('workspace') || !members.fields.getByName('user'))
        throw new Error('Workspace membership must be installed before sharing evidence.');
    const previous = "@request.auth.id != '' && @request.auth.id = owner";
    const rules = {
        workspaces: "@request.auth.id != '' && (owner = @request.auth.id || workspace_members_via_workspace.user ?= @request.auth.id)",
        evidence: "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)",
    };
    const collections = Object.keys(rules).map((name) => app.findCollectionByNameOrId(name));
    // Check all rules before changing any. Custom private rules need their
    // owner's review; a source migration must not silently replace them.
    for (const collection of collections) {
        for (const field of ['listRule', 'viewRule']) {
            const actual = ruleOf(collection[field]);
            if (actual !== ruleOf(previous) && actual !== ruleOf(rules[collection.name]))
                throw new Error(`Review the custom ${collection.name} ${field} before applying shared evidence access.`);
        }
    }
    for (const collection of collections) {
        if (ruleOf(collection.listRule) === ruleOf(rules[collection.name]) && ruleOf(collection.viewRule) === ruleOf(rules[collection.name])) continue;
        collection.listRule = rules[collection.name];
        collection.viewRule = rules[collection.name];
        app.save(collection);
    }
}, (app) => {
    // PocketBase 0.39.x binds a collection's rules as *string, which reaches the JSVM as an OBJECT
    // and not a primitive: measured 2026-09-20 on 0.39.8, `typeof collection.listRule === 'object'`
    // while String(...) yields the right text. Array.includes and === compare by identity, so every
    // comparison below against a string literal was false and this preflight threw on ANY database,
    // including one whose rules were already exactly `previous`. It was not detecting a custom rule,
    // it could not read the rule at all. Normalise through String(), keeping null distinct because a
    // null rule means superuser-only and is a real value.
    const ruleOf = (value) => (value === null || value === undefined ? null : String(value));
    const previous = "@request.auth.id != '' && @request.auth.id = owner";
    const rules = {
        workspaces: "@request.auth.id != '' && (owner = @request.auth.id || workspace_members_via_workspace.user ?= @request.auth.id)",
        evidence: "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)",
    };
    const collections = Object.keys(rules).map((name) => app.findCollectionByNameOrId(name));
    for (const collection of collections) {
        for (const field of ['listRule', 'viewRule']) {
            const actual = ruleOf(collection[field]);
            if (actual !== ruleOf(previous) && actual !== ruleOf(rules[collection.name]))
                throw new Error(`Review the custom ${collection.name} ${field} before restoring owner-only reads.`);
        }
    }
    for (const collection of collections) {
        if (ruleOf(collection.listRule) === ruleOf(previous) && ruleOf(collection.viewRule) === ruleOf(previous)) continue;
        collection.listRule = previous;
        collection.viewRule = previous;
        app.save(collection);
    }
});
