// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/pocketbase/pb_migrations/1789500000_add_mission_learning.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-15
// Depends:      apps/pocketbase/pb_migrations/1789000000_extend_workspace_operations.js
// EnumType:     Migration
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_migrations/1789000000_extend_workspace_operations.js
// DAG Node:     none
// Intent:       Persist bounded mission plans, learning answers and review receipts without changing collection access rules or existing rows.
// ───────────────────────────────────────────────────────────────

migrate(
    (app) => {
        const missions = app.findCollectionByNameOrId('missions');
        const users = app.findCollectionByNameOrId('users');
        const fields = [
            { name: 'mission_plan', type: 'json', maxSize: 65536 },
            { name: 'mission_learning', type: 'json', maxSize: 2000 },
            { name: 'mission_review', type: 'json', maxSize: 24000 },
            { name: 'mission_approved_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
            { name: 'mission_approved_at', type: 'date' },
            { name: 'mission_reviewed_by', type: 'relation', collectionId: users.id, maxSelect: 1 },
            { name: 'mission_reviewed_at', type: 'date' },
        ];
        let changed = false;
        for (const definition of fields) {
            if (missions.fields.getByName(definition.name)) continue;
            missions.fields.add(new Field(definition));
            changed = true;
        }
        if (changed) app.save(missions);
    },
    (app) => {
        const missions = app.findCollectionByNameOrId('missions');
        let changed = false;
        for (const name of [
            'mission_plan',
            'mission_learning',
            'mission_review',
            'mission_approved_by',
            'mission_approved_at',
            'mission_reviewed_by',
            'mission_reviewed_at',
        ]) {
            const field = missions.fields.getByName(name);
            if (!field) continue;
            missions.fields.removeById(field.id);
            changed = true;
        }
        if (changed) app.save(missions);
    },
);
