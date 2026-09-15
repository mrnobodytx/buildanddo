// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1789600000_create_workflow_runs.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_migrations/1789000000_extend_workspace_operations.js
// EnumType:    Migration
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_migrations/1789000000_extend_workspace_operations.js
// DAG Node:    none
// Intent:      Store immutable workflow snapshots and ordered receipts behind authenticated commands without changing existing collection rules.
// ───────────────────────────────────────────────────────────────

migrate(
    (app) => {
        try {
            app.findCollectionByNameOrId('workflow_runs');
            return;
        } catch (error) {
            if (!String(error.message).includes('no rows in result set')) throw error;
        }
        const relation = (name, target, required = true) => ({
            name,
            type: 'relation',
            collectionId: app.findCollectionByNameOrId(target).id,
            maxSelect: 1,
            required,
            cascadeDelete: name === 'workspace',
        });
        // The back relation binds membership to this workspace in a single
        // relation traversal. Removed members do not retain creator access.
        app.findCollectionByNameOrId('workspace_members');
        const readRule = "@request.auth.id != '' && (workspace.owner = @request.auth.id || " +
            'workspace.workspace_members_via_workspace.user ?= @request.auth.id)';
        app.save(new Collection({
            name: 'workflow_runs',
            type: 'base',
            listRule: readRule,
            viewRule: readRule,
            createRule: null,
            updateRule: null,
            deleteRule: null,
            fields: [
                relation('workspace', 'workspaces'),
                relation('owner', 'users'),
                relation('workflow', 'workflows'),
                relation('mission', 'missions', false),
                { name: 'request_key', type: 'text', required: true, max: 80 },
                { name: 'start_request', type: 'json', maxSize: 2000 },
                { name: 'snapshot', type: 'json', maxSize: 65536 },
                { name: 'events', type: 'json', maxSize: 262144 },
                { name: 'revision', type: 'number', min: 1, onlyInt: true },
                { name: 'next_step', type: 'number', min: 0, max: 20, onlyInt: true },
                { name: 'status', type: 'select', required: true, maxSelect: 1,
                    values: ['running', 'awaiting_approval', 'completed', 'failed', 'cancelled'] },
                { name: 'started_at', type: 'date', required: true },
                { name: 'finished_at', type: 'date' },
                { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
                { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
            ],
            indexes: [
                'create unique index idx_workflow_runs_request on workflow_runs (owner, request_key)',
                'create index idx_workflow_runs_history on workflow_runs (workspace, started_at desc, id desc)',
                'create index idx_workflow_runs_definition on workflow_runs (workspace, workflow, started_at desc, id desc)',
                'create index idx_workflow_runs_pending on workflow_runs (workspace, status, started_at desc, id desc)',
            ],
        }));
    },
    (app) => {
        let collection;
        try {
            collection = app.findCollectionByNameOrId('workflow_runs');
        } catch (error) {
            if (String(error.message).includes('no rows in result set')) return;
            throw error;
        }
        // Explicitly destructive: the deployment owner must retain run
        // history before using this down migration. Evidence rows remain.
        app.delete(collection);
    },
);
