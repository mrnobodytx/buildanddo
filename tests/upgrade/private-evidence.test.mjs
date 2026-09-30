// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/private-evidence.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_migrations/1792200000_private_operational_evidence.js, apps/web/tools/public-delivery.mjs
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; VALIDATES apps/pocketbase/pb_migrations/1792200000_private_operational_evidence.js; VALIDATES apps/web/tools/public-delivery.mjs
// Intent:      Retain operational records and stronger read policies across migration retries and rollback, and exclude stale static copies from delivered assets.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture, plain } from './admin-fixture.mjs';
import { copyPublicAssets, assertPublicDelivery } from '../../apps/web/tools/public-delivery.mjs';

const migration = 'apps/pocketbase/pb_migrations/1792200000_private_operational_evidence.js';
const names = ['knowledge_sources', 'knowledge_claims', 'knowledge_logic', 'knowledge_beliefs',
    'praxis_methods', 'praxis_materials', 'praxis_tools', 'praxis_pricing', 'praxis_timing',
    'experience_attempts', 'experience_outcomes', 'experience_failures',
    'governance_audits', 'governance_disputes', 'governance_research_quests', 'evidence_epochs', 'anchor_manifests'];
function installed() {
    const f = fixture();
    for (const name of ['1788800000_create_praxis_evidence_fabric', '1788940000_create_evidence_witness', '1789200000_add_users_cnwb_seat_level'])
        f.migration(`apps/pocketbase/pb_migrations/${name}.js`).up();
    f.seed('evidence_epochs', { id: 'retainedepoch', display_id: 'PRIVATE-EPOCH', notes: 'Retain the evidence.' });
    return f;
}
test('every global operational collection requires native master authority without altering rows or writes', () => {
    const f = installed(), before = plain(f.data);
    const writes = names.map((name) => ['createRule', 'updateRule', 'deleteRule'].map((key) => f.collections[name][key]));
    f.migration(migration).up();
    for (const name of names) {
        for (const key of ['listRule', 'viewRule']) assert.match(f.collections[name][key], /@request\.auth\.cnwb_seat_level = "master"/);
    }
    assert.deepEqual(plain(f.data), before);
    assert.deepEqual(names.map((name) => ['createRule', 'updateRule', 'deleteRule'].map((key) => f.collections[name][key])), writes);
    const once = names.map((name) => [f.collections[name].listRule, f.collections[name].viewRule]);
    f.migration(migration).up();
    assert.deepEqual(names.map((name) => [f.collections[name].listRule, f.collections[name].viewRule]), once);
});
test('preexisting superuser-only and record restrictions are never broadened', () => {
    const f = installed();
    f.collections.knowledge_sources.listRule = null;
    f.collections.knowledge_sources.viewRule = '@request.auth.id = owner';
    f.migration(migration).up();
    assert.equal(f.collections.knowledge_sources.listRule, null);
    assert.ok(f.collections.knowledge_sources.viewRule.endsWith('&& (@request.auth.id = owner)'));
    const once = f.collections.knowledge_sources.viewRule;
    f.migration(migration).up(); assert.equal(f.collections.knowledge_sources.viewRule, once);
});
test('rollback retains all data and closes reads instead of restoring competition disclosure', () => {
    const f = installed(), before = plain(f.data);
    f.migration(migration).up(); f.migration(migration).down();
    for (const name of names) assert.equal(f.collections[name].listRule, null);
    f.migration(migration).down(); f.migration(migration).up();
    for (const name of names) assert.equal(f.collections[name].viewRule, null);
    assert.deepEqual(plain(f.data), before);
});
test('partial installations do not invent authority or ignore unexpected database errors', () => {
    const f = installed();
    delete f.collections.anchor_manifests;
    assert.doesNotThrow(() => f.migration(migration).up());
    f.collections.users.fields.removeByName('cnwb_seat_level');
    assert.throws(() => f.migration(migration).up(), /Native estate authority/);
});
test('the actual public copy keeps lessons and community links while excluding stale operational files', () => {
    const root = mkdtempSync(join(tmpdir(), 'buildanddo-public-delivery-test-'));
    try {
        const source = join(root, 'source'), output = join(root, 'output');
        mkdirSync(join(source, 'lessons'), { recursive: true });
        const files = ['platform-health.json', 'fleet-status.json', 'roadmap-status.json', 'capabilities.json', 'activity-status.json', 'fleet-status.json.gz'];
        for (const file of files) writeFileSync(join(source, file), 'PRIVATE-SENTINEL');
        writeFileSync(join(source, 'community-status.json'), 'public community');
        writeFileSync(join(source, 'lessons', 'public-lesson.json'), 'authored lesson');
        copyPublicAssets(source, output);
        for (const file of files) {
            assert.equal(existsSync(join(output, file)), false, file);
            assert.equal(readFileSync(join(source, file), 'utf8'), 'PRIVATE-SENTINEL');
        }
        assert.equal(readFileSync(join(output, 'community-status.json'), 'utf8'), 'public community');
        assert.equal(readFileSync(join(output, 'lessons', 'public-lesson.json'), 'utf8'), 'authored lesson');
        assert.doesNotThrow(() => assertPublicDelivery(output));
        writeFileSync(join(output, 'platform-health.json'), 'late generator output');
        assert.throws(() => assertPublicDelivery(output), /Retired operational publications/);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
