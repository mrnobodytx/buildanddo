// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_migrations/1791100000_objective_onboarding.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-22
// Depends:      apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js
// EnumType:     Migration
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_migrations/1790700000_workspace_onboarding.js
// DAG Node:     none
// Intent:       Retain a workspace's chosen intent and first objective without changing native access rules or losing goals on rollback.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const workspace = app.findCollectionByNameOrId('workspaces');
    const receipts = app.findCollectionByNameOrId('workspace_onboarding');
    if (workspace.updateRule !== null || workspace.deleteRule !== null ||
        ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((name) => receipts[name] !== null))
        throw new Error('Review workspace onboarding access before migrating.');
    const fields = [
        [workspace, { name: 'onboarding_intent', type: 'select', maxSelect: 1,
            values: ['learn', 'build', 'project', 'class', 'challenge', 'explore'] }],
        [workspace, { name: 'onboarding_objective', type: 'relation', maxSelect: 1,
            collectionId: app.findCollectionByNameOrId('erp_objectives').id, cascadeDelete: false }],
        [workspace, { name: 'business_context', type: 'text', max: 120 }],
        [receipts, { name: 'objective_protocol', type: 'number', onlyInt: true }],
    ];
    for (const [collection, field] of fields) {
        const previous = collection.fields.getByName(field.name);
        if (previous && (previous.required || Object.entries(field).some(([key, value]) =>
            JSON.stringify(previous[key]) !== JSON.stringify(value))))
            throw new Error('Review custom objective onboarding fields before migrating.');
    }
    for (const [collection, field] of fields)
        if (!collection.fields.getByName(field.name)) collection.fields.add(new Field(field));
    app.save(workspace);
    app.save(receipts);
}, (app) => {
    // Disable new objective setups, retaining goals, workspace links and retry history.
    const receipts = app.findCollectionByNameOrId('workspace_onboarding');
    receipts.fields.removeByName('objective_protocol');
    app.save(receipts);
});
