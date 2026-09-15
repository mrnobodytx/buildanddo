// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789900000_secure_workspace_rbac.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/1789800000_restore_workspace_evidence_access.js, apps/pocketbase/pb_hooks/workspace-record-policy.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1789800000_restore_workspace_evidence_access.js; DEPENDS_ON apps/pocketbase/pb_hooks/workspace-record-policy.js
// DAG Node:    none
// Intent:      Remove record-owner membership bypasses and close native administration writes while preserving all existing records.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const owner = "@request.auth.id != '' && @request.auth.id = owner";
    const create = "@request.auth.id != '' && @request.auth.id = @request.body.owner";
    const read = "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)";
    const oldRead = "@request.auth.id = owner || (@collection.workspace_members.workspace ?= workspace && @collection.workspace_members.user ?= @request.auth.id)";
    const oldWrite = "@request.auth.id = owner || (@collection.workspace_members.workspace ?= workspace && @collection.workspace_members.user ?= @request.auth.id && @collection.workspace_members.role ?!= 'viewer')";
    const rbac = ['services', 'missions', 'signals', 'workflows', 'roadmap_items', 'erp_contacts', 'erp_objectives', 'erp_tasks',
        'social_channels', 'social_content', 'specialist_desks', 'support_sources', 'corrections', 'daily_editions', 'challenge_submissions'];
    const plan = rbac.map((name) => ({ name,
        before: { listRule: oldRead, viewRule: oldRead, createRule: oldWrite, updateRule: oldWrite, deleteRule: '@request.auth.id = owner' },
        after: { listRule: read, viewRule: read, createRule: `${read} && @request.body.owner = @request.auth.id`,
            updateRule: read, deleteRule: `${read} && owner = @request.auth.id` } }));
    for (const name of ['operations', 'operation_runs', 'seat_events', 'evidence']) plan.push({ name,
        before: { listRule: name === 'evidence' ? read : owner, viewRule: name === 'evidence' ? read : owner,
            createRule: create, updateRule: owner, deleteRule: owner },
        after: { listRule: read, viewRule: read, createRule: `${read} && @request.body.owner = @request.auth.id`,
            updateRule: name === 'seat_events' ? null : read, deleteRule: name === 'seat_events' ? null : `${read} && owner = @request.auth.id` } });
    plan.push({ name: 'workspaces', before: { updateRule: owner, deleteRule: owner }, after: { updateRule: null, deleteRule: null } });
    plan.push({ name: 'workspace_members', before: { createRule: 'workspace.owner = @request.auth.id', updateRule: 'workspace.owner = @request.auth.id',
        deleteRule: 'workspace.owner = @request.auth.id || @request.auth.id = user' }, after: { createRule: null, updateRule: null, deleteRule: null } });
    // Preflight the complete set before the first save; unknown private policy
    // is never overwritten. Membership role checks run in request hooks on
    // the same membership row; read rules need only the bound user relation.
    for (const item of plan) {
        item.collection = app.findCollectionByNameOrId(item.name);
        for (const field of Object.keys(item.before)) {
            if (![item.before[field], item.after[field]].includes(item.collection[field]))
                throw new Error(`Review custom ${item.name} ${field} before applying workspace RBAC.`);
        }
    }
    for (const item of plan) {
        if (Object.keys(item.after).every((field) => item.collection[field] === item.after[field])) continue;
        Object.assign(item.collection, item.after);
        app.save(item.collection);
    }
}, (app) => {
    const owner = "@request.auth.id != '' && @request.auth.id = owner";
    const create = "@request.auth.id != '' && @request.auth.id = @request.body.owner";
    const read = "@request.auth.id != '' && (workspace.owner = @request.auth.id || workspace.workspace_members_via_workspace.user ?= @request.auth.id)";
    const oldRead = "@request.auth.id = owner || (@collection.workspace_members.workspace ?= workspace && @collection.workspace_members.user ?= @request.auth.id)";
    const oldWrite = "@request.auth.id = owner || (@collection.workspace_members.workspace ?= workspace && @collection.workspace_members.user ?= @request.auth.id && @collection.workspace_members.role ?!= 'viewer')";
    const rbac = ['services', 'missions', 'signals', 'workflows', 'roadmap_items', 'erp_contacts', 'erp_objectives', 'erp_tasks',
        'social_channels', 'social_content', 'specialist_desks', 'support_sources', 'corrections', 'daily_editions', 'challenge_submissions'];
    const plan = rbac.map((name) => ({ name,
        before: { listRule: oldRead, viewRule: oldRead, createRule: oldWrite, updateRule: oldWrite, deleteRule: '@request.auth.id = owner' },
        after: { listRule: read, viewRule: read, createRule: `${read} && @request.body.owner = @request.auth.id`,
            updateRule: read, deleteRule: `${read} && owner = @request.auth.id` } }));
    for (const name of ['operations', 'operation_runs', 'seat_events', 'evidence']) plan.push({ name,
        before: { listRule: name === 'evidence' ? read : owner, viewRule: name === 'evidence' ? read : owner,
            createRule: create, updateRule: owner, deleteRule: owner },
        after: { listRule: read, viewRule: read, createRule: `${read} && @request.body.owner = @request.auth.id`,
            updateRule: name === 'seat_events' ? null : read, deleteRule: name === 'seat_events' ? null : `${read} && owner = @request.auth.id` } });
    plan.push({ name: 'workspaces', before: { updateRule: owner, deleteRule: owner }, after: { updateRule: null, deleteRule: null } });
    plan.push({ name: 'workspace_members', before: { createRule: 'workspace.owner = @request.auth.id', updateRule: 'workspace.owner = @request.auth.id',
        deleteRule: 'workspace.owner = @request.auth.id || @request.auth.id = user' }, after: { createRule: null, updateRule: null, deleteRule: null } });
    for (const item of plan) {
        item.collection = app.findCollectionByNameOrId(item.name);
        for (const field of Object.keys(item.before)) {
            if (![item.before[field], item.after[field]].includes(item.collection[field]))
                throw new Error(`Review custom ${item.name} ${field} before restoring prior rules.`);
        }
    }
    for (const item of plan) {
        if (Object.keys(item.before).every((field) => item.collection[field] === item.before[field])) continue;
        Object.assign(item.collection, item.before);
        app.save(item.collection);
    }
});
