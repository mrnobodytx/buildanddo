// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_migrations/1792200000_private_operational_evidence.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     apps/pocketbase/pb_migrations/1788800000_create_praxis_evidence_fabric.js, apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js, apps/pocketbase/pb_migrations/1789200000_add_users_cnwb_seat_level.js
// EnumType:    Migration
// EnumEdges:   EXTENDS apps/pocketbase/pb_migrations/1788800000_create_praxis_evidence_fabric.js; EXTENDS apps/pocketbase/pb_migrations/1788940000_create_evidence_witness.js; DEPENDS_ON apps/pocketbase/pb_migrations/1789200000_add_users_cnwb_seat_level.js
// Intent:      Close global operational evidence reads after the competition without changing tenant data, writes or stronger existing restrictions.
// ───────────────────────────────────────────────────────────────

migrate((app) => {
    const users = app.findCollectionByNameOrId('users');
    if (!users.fields.getByName('cnwb_seat_level')) throw new Error('Native estate authority must be installed before operational evidence is restricted.');
    const gate = '@request.auth.id != "" && @request.auth.cnwb_seat_level = "master"';
    const names = ['knowledge_sources', 'knowledge_claims', 'knowledge_logic', 'knowledge_beliefs',
        'praxis_methods', 'praxis_materials', 'praxis_tools', 'praxis_pricing', 'praxis_timing',
        'experience_attempts', 'experience_outcomes', 'experience_failures',
        'governance_audits', 'governance_disputes', 'governance_research_quests', 'evidence_epochs', 'anchor_manifests'];
    for (const name of names) {
        let collection;
        try { collection = app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error).includes('no rows in result set')) continue; throw error; }
        for (const key of ['listRule', 'viewRule']) {
            const before = collection[key];
            // null already means superuser-only. Never widen it or discard a tenant/record restriction.
            if (before === null || before === undefined || before === gate || String(before).startsWith(gate + ' && (')) continue;
            collection[key] = before === '' ? gate : gate + ' && (' + String(before) + ')';
        }
        app.save(collection);
    }
}, (app) => {
    // A source rollback is not permission to republish records. Retain all data and write rules;
    // disable direct reads until an operator reviews a replacement forward migration.
    const names = ['knowledge_sources', 'knowledge_claims', 'knowledge_logic', 'knowledge_beliefs',
        'praxis_methods', 'praxis_materials', 'praxis_tools', 'praxis_pricing', 'praxis_timing',
        'experience_attempts', 'experience_outcomes', 'experience_failures',
        'governance_audits', 'governance_disputes', 'governance_research_quests', 'evidence_epochs', 'anchor_manifests'];
    for (const name of names) {
        let collection;
        try { collection = app.findCollectionByNameOrId(name); }
        catch (error) { if (String(error).includes('no rows in result set')) continue; throw error; }
        collection.listRule = null; collection.viewRule = null; app.save(collection);
    }
});
