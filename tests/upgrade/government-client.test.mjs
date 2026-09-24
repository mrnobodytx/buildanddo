// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/government-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/lib/workspaceControl.js, tests/upgrade/government-fixture.mjs, tests/upgrade/tutorial-learning-fixture.mjs, tests/upgrade/admin-fixture.mjs, tests/upgrade/classroom-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workspaceControl.js; CONSUMES tests/upgrade/government-fixture.mjs; CONSUMES tests/upgrade/tutorial-learning-fixture.mjs; CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/classroom-fixture.mjs
// Intent:      Reject stale government responses and keep saved premium checkpoints behind current membership.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceControlClient } from '../../apps/web/src/lib/workspaceControl.js';
import { fixture, plain, source } from './admin-fixture.mjs';
import { installGovernment } from './government-fixture.mjs';
import { learningFixture } from './tutorial-learning-fixture.mjs';
import { classroomFixture } from './classroom-fixture.mjs';

function clientFixture() {
    const f = installGovernment(fixture({ runtime: { toString: String, $os: { readFile: (path) => source('apps/pocketbase'+path) } } }), ['editor']);
    const current = { value: true };
    const client = { authStore: { record: { id: 'editor' } }, send: async () => plain(f.load('government-desk.js').read(f.event('editor'))) };
    const api = createWorkspaceControlClient({ client, accountId: 'editor', workspaceId: 'ws1', isCurrent: () => current.value });
    return { f, client, api, current };
}

test('government client accepts only its own native scoped response', async () => {
    const { api, client } = clientFixture(); const correct = await client.send();
    assert.equal((await api.read('government')).ok, true);
    for (const change of [{ account_id: 'otherowner' }, { workspace: 'ws2' }, { government: { allowed: false } }, { lessons: [{ id: 'foreign', category: 'General' }] }]) {
        client.send = async () => ({ ...correct, ...change });
        assert.equal((await api.read('government')).ok, false);
    }
});

test('government responses arriving after account or workspace changes are discarded', async () => {
    const { api, client, current } = clientFixture(); const response = await client.send(); let resolve;
    client.send = () => new Promise((yes) => { resolve = yes; });
    const result = api.read('government'); current.value = false; resolve(response);
    assert.equal((await result).reason, 'scope_changed');
    assert.equal((await api.read('government')).ok, false);
});

test('network denial never falls back to a bundled premium catalogue', async () => {
    const { api, client } = clientFixture(); client.send = async () => { throw { status: 403, response: { message: 'Membership required' } }; };
    const result = await api.read('government'); assert.equal(result.ok, false); assert.equal(result.data, undefined);
    for (const path of ['apps/web/src/components/workspace/TutorialCatalog.jsx', 'apps/web/src/components/workspace/missions/MissionBuilder.jsx']) {
        assert.doesNotMatch(source(path), /^import .*government-submissions\.json/m);
    }
});

test('saved premium lesson snapshots cannot be read or advanced after revocation', () => {
    const f = installGovernment(learningFixture(), ['owner']);
    const row = f.data.tutorials.find((row) => row.id === f.lessons[0].id); row.category = 'Government submissions';
    const started = f.command('start');
    f.data.government_memberships[0].status = 'revoked';
    assert.throws(() => f.detail(), { status: 403 });
    assert.throws(() => f.service.states(f.event('owner')), { status: 403 });
    assert.throws(() => f.command('section', { index: 0 }, { digest: started.tutorial.content_digest }), { status: 403 });
    // A saved restricted snapshot remains restricted even if today's category changes.
    row.category = 'General';
    assert.throws(() => f.detail(), { status: 403 });
    assert.throws(() => f.service.states(f.event('owner')), { status: 403 });
});

test('premium certificates retain their exact bytes but current learning reads fail closed after revocation', () => {
    const f = installGovernment(learningFixture(), ['owner']);
    f.data.tutorials.find((row) => row.id === f.lessons[0].id).category = 'Government submissions';
    f.finish(); const saved = plain(f.data.tutorial_learning);
    const growth = f.list(); assert.equal(growth.points, 100); assert.equal(growth.certificates.items.length, 1);
    assert.doesNotMatch(JSON.stringify(growth), /"sections"|"checklist"|"lesson":/);
    f.data.government_memberships[0].status = 'revoked';
    assert.throws(() => f.list(), { status: 403 });
    assert.throws(() => f.service.states(f.event('owner')), { status: 403 });
    assert.deepEqual(f.data.tutorial_learning, saved);
    assert.equal(f.list('otherowner').points, 0);
});

test('government classrooms hide lessons and discussion from unpaid participants and cached joins', () => {
    const f = installGovernment(classroomFixture(), ['owner', 'editor']);
    const lesson = f.data.tutorials.find((row) => row.id === f.lessons[0].id); lesson.category = 'Government submissions';
    const created = f.command('room.create', { title: 'Premium class', description: '', tutorial: lesson.id, starts_at: '' });
    f.command('room.start', { id: created.id }, { revision: created.revision });
    assert.throws(() => f.service.detail(f.event('viewer', {}, { id: created.id })), { status: 403 });
    f.data.government_memberships.find((row) => row.user === 'editor').status = 'revoked';
    assert.throws(() => f.command('room.join', { id: created.id }, { actor: 'editor', revision: 2 }), { status: 403 });
});
