// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/operator-system.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     tests/upgrade/operator-fixture.mjs, apps/pocketbase/pb_hooks/operator.pb.js, apps/pocketbase/pb_hooks/workspace-operator.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/operator-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/operator.pb.js; VALIDATES apps/pocketbase/pb_hooks/workspace-operator.js
// DAG Node:    none
// Intent:      Verify current authority, bounded visibility and missing-source behavior of the read-only operator snapshot.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { operatorFixture } from './operator-fixture.mjs';
import { source } from './admin-fixture.mjs';

test('snapshot reads existing stores without writes or private bodies and preserves state', () => {
    const f = operatorFixture(); const before = JSON.stringify(f.data);
    const view = f.read();
    assert.equal(view.schema_version, 'buildanddo.operator-snapshot/v1');
    assert.equal(view.workspace, 'ws1'); assert.equal(view.role, 'editor');
    assert.equal(view.sources.missions.items.length, 3);
    assert.equal(view.sources.missions.items.find((row) => row.id === 'planned').plan_complete, true);
    assert.equal(view.sources.missions.items.find((row) => row.id === 'draft').plan_complete, false);
    assert.equal(view.sources.research.items[0].id, f.submission.id);
    assert.equal(view.sources.suite_runs.items[0].status, 'queued');
    assert.equal(view.sources.integrations.items.find((row) => row.provider === 'firecrawl').observation.state, 'unknown');
    assert.ok(!JSON.stringify(view).includes('Private '));
    assert.ok(!JSON.stringify(view).includes('configuration'));
    assert.equal(JSON.stringify(f.data), before);
});

test('current members can inspect but anonymous, foreign and revoked accounts cannot', () => {
    const f = operatorFixture();
    for (const actor of ['owner', 'admin', 'editor', 'viewer']) assert.equal(f.read(actor).workspace, 'ws1');
    for (const actor of ['', 'outsider', 'otherowner']) assert.throws(() => f.read(actor), { status: 403 });
    assert.throws(() => f.read('editor', { workspace: 'ws2' }), { status: 403 });
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    assert.throws(() => f.read(), { status: 403 });
    f.config.foreignMember = true;
    assert.throws(() => f.read('outsider'), { status: 403 });
});

test('native record denial also hides linked research, evidence, suite and seat work', () => {
    const f = operatorFixture(); f.denied.add('mission1');
    const result = f.read();
    for (const key of ['evidence', 'workflow_runs', 'research', 'suite_runs', 'seat_events']) {
        assert.equal(result.sources[key].state, 'available', key);
        assert.deepEqual(result.sources[key].items, [], key);
    }
    assert.ok(result.sources.missions.items.every((row) => row.id !== 'mission1'));
    f.denied.add('signal1');
    assert.deepEqual(f.read().sources.signals.items, []);
});

test('foreign linked records never enter a workspace snapshot', () => {
    const f = operatorFixture();
    f.seed('suite_runs', { id: 'foreignlink', workspace: 'ws1', mission: 'mission2', status: 'ready', attempt: 1, revision: 2 });
    f.seed('seat_events', { id: 'foreignseat', workspace: 'ws1', subject_type: 'mission', subject: 'mission2', event: 'completed' });
    assert.ok(f.read().sources.suite_runs.items.every((row) => row.id !== 'foreignlink'));
    assert.ok(f.read().sources.seat_events.items.every((row) => row.id !== 'foreignseat'));
});

test('standalone and mission-linked workflow approvals remain visible together', () => {
    const f = operatorFixture();
    f.seed('workflow_runs', { id: 'standalone', workspace: 'ws1', owner: 'editor', mission: '', workflow: 'workflow2',
        status: 'awaiting_approval', snapshot: { name: 'Standalone review' } });
    const result = f.read().sources.workflow_runs;
    assert.equal(result.state, 'available');
    assert.deepEqual(result.items.map((row) => row.id).sort(), ['approval', 'standalone']);
    f.denied.add('mission1');
    assert.deepEqual(f.read().sources.workflow_runs.items.map((row) => row.id), ['standalone']);
    f.denied.add('standalone'); assert.deepEqual(f.read().sources.workflow_runs.items, []);
});

test('each collection is paged and never represented as an all-work total', () => {
    const f = operatorFixture();
    for (let index = 0; index < 25; index++) f.seed('missions', { id: `extra${index}`, workspace: 'ws1', owner: 'editor', title: `Mission ${index}`, status: 'running' });
    const first = f.read(); const second = f.read('editor', { query: { page: '2' } });
    assert.equal(first.page_size, 20); assert.equal(first.sources.missions.items.length, 20);
    assert.equal(first.sources.missions.has_more, true); assert.equal(second.sources.missions.items.length, 8);
    assert.equal(second.sources.missions.has_more, false); assert.equal(second.sources.integrations.page, 1);
    assert.equal(new Set([...first.sources.missions.items, ...second.sources.missions.items].map((row) => row.id)).size, 28);
    assert.equal(first.total, undefined);
    for (const page of ['0', '-1', '10000', '1 OR true']) assert.throws(() => f.read('editor', { query: { page } }), { status: 400 });
});

test('missing schema and malformed source fail independently without fabricated zero health', () => {
    const f = operatorFixture();
    f.app.delete(f.collections.suite_runs);
    f.collections.seat_events.fields.removeByName('subject');
    f.seed('missions', { id: 'badplan', workspace: 'ws1', owner: 'editor', status: 'proposed', mission_plan: '{not json}' });
    const result = f.read();
    for (const key of ['suite_runs', 'seat_events', 'missions']) assert.equal(result.sources[key].state, 'unavailable');
    assert.equal(result.sources.signals.state, 'available');
    f.app.delete(f.collections.workspace_integrations);
    assert.equal(f.read().sources.integrations.state, 'unavailable');
});

test('a source query with inconsistent workspace rows fails closed', () => {
    const f = operatorFixture(); const find = f.app.findRecordsByFilter;
    f.app.findRecordsByFilter = function (name, ...args) {
        if (name === 'missions') return [this.findRecordById('missions', 'mission2')];
        return find.call(this, name, ...args);
    };
    const result = f.read();
    assert.equal(result.sources.missions.state, 'unavailable');
    assert.ok(!JSON.stringify(result).includes('Other work'));
});

test('a mid-read membership loss cannot become a partially successful snapshot', () => {
    const f = operatorFixture(); const find = f.app.findRecordsByFilter;
    f.app.findRecordsByFilter = function (name, ...args) {
        if (name === 'signals') this.delete(this.findRecordById('workspace_members', 'editormember'));
        return find.call(this, name, ...args);
    };
    assert.throws(() => f.read(), { status: 403 });
});

test('a mid-read role downgrade returns current viewer authority', () => {
    const f = operatorFixture(); const find = f.app.findRecordsByFilter;
    f.app.findRecordsByFilter = function (name, ...args) {
        if (name === 'signals') {
            const member = this.findRecordById('workspace_members', 'editormember');
            member.set('role', 'viewer'); this.save(member);
        }
        return find.call(this, name, ...args);
    };
    assert.equal(f.read().role, 'viewer');
});

test('the route registers only a no-store authenticated GET', () => {
    const routes = []; const calls = [];
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/operator.pb.js'), {
        __hooks: '/hooks', routerAdd: (...args) => routes.push(args), $apis: { requireAuth: (value) => `auth:${value}` },
        require: (path) => { assert.equal(path, '/hooks/workspace-operator.js'); return { snapshot: () => ({ observed: true }) }; },
    });
    assert.equal(routes.length, 1); assert.equal(routes[0][0], 'GET');
    assert.equal(routes[0][3], 'auth:users');
    const response = routes[0][2]({ response: { header: () => ({ set: (...args) => calls.push(args) }) }, json: (status, value) => ({ status, value }) });
    assert.equal(response.status, 200); assert.equal(response.value.observed, true);
    assert.deepEqual(calls, [['Cache-Control', 'no-store']]);
});
