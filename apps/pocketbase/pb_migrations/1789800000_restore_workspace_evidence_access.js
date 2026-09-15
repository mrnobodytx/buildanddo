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
            if (![previous, rules[collection.name]].includes(collection[field]))
                throw new Error(`Review the custom ${collection.name} ${field} before applying shared evidence access.`);
        }
    }
    for (const collection of collections) {
        if (collection.listRule === rules[collection.name] && collection.viewRule === rules[collection.name]) continue;
        collection.listRule = rules[collection.name];
        collection.viewRule = rules[collection.name];
        app.save(collection);
    }
}, (app) => {
    const previous = "@request.auth.id != '' && @request.auth.id = owner";
    const rules = {
        workspaces: "@request.auth.id != '' && (owner = @request.auth.id || workspace_members_via_workspace.user ?= @request.auth.id)",
        evidence: "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)",
    };
    const collections = Object.keys(rules).map((name) => app.findCollectionByNameOrId(name));
    for (const collection of collections) {
        for (const field of ['listRule', 'viewRule']) {
            if (![previous, rules[collection.name]].includes(collection[field]))
                throw new Error(`Review the custom ${collection.name} ${field} before restoring owner-only reads.`);
        }
    }
    for (const collection of collections) {
        if (collection.listRule === previous && collection.viewRule === previous) continue;
        collection.listRule = previous;
        collection.viewRule = previous;
        app.save(collection);
    }
});
