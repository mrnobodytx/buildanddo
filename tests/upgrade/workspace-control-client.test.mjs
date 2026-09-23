// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workspace-control-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/workspaceControl.js, tests/upgrade/admin-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workspaceControl.js; DEPENDS_ON tests/upgrade/admin-fixture.mjs
// DAG Node:    none
// Intent:      Exercise the browser-to-command connection with stale scopes, lost responses, duplicate submissions and safe retry reconciliation.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import * as controls from '../../apps/web/src/lib/workspaceControl.js';
import { fixture, plain } from './admin-fixture.mjs';
const { createWorkspaceControlClient } = controls;
const read = { workspace: 'ws1', role: 'owner', settings: { revision: 0, description: '', wiki_enabled: false, forum_enabled: false, forum_moderation: true },
    can_admin: true, can_write: true, can_grant_admin: true };
const result = (body) => ({ workspace: 'ws1', id: 'record1', action: body.action, revision: 1, replayed: false });
function clientFixture(extra = {}) {
    const calls = []; let current = true; let count = 0;
    const client = { authStore: { record: { id: 'owner' } }, send: async (path, options) => { calls.push({ path, options }); return options.method === 'GET' ? read : result(options.body); } };
    const api = createWorkspaceControlClient({ client, workspaceId: 'ws1', accountId: 'owner', isCurrent: () => current,
        keyFactory: () => `client_request_${String(++count).padStart(5, '0')}`, ...extra });
    return { api, client, calls, changeScope: () => { current = false; } };
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('overlapping access polls retain a denial before the same grant can be observed again', async () => {
    const loader = controls.createWorkspaceAccessLoader();
    const f = clientFixture({ accountId: 'editor' }), denied = deferred(), granted = deferred(), received = deferred(), publish = deferred();
    f.client.authStore.record = { id: 'editor' };
    const grant = { ...read, role: 'editor', can_admin: false, can_grant_admin: false };
    const observed = [], calls = [];
    f.client.send = () => { const reply = calls.length ? granted : denied; calls.push(reply); return reply.promise; };
    const older = loader.load('editor:ws1:access', async () => {
        const result = await f.api.read('access');
        received.resolve(); await publish.promise;
        observed.push(result); return result;
    });
    const overlap = loader.load('editor:ws1:access', () => { throw new Error('Duplicate access request'); });
    assert.equal(overlap, older); assert.equal(calls.length, 1);
    denied.reject({ status: 403, response: { message: 'Membership revoked' } });
    await received.promise;
    assert.equal(loader.load('editor:ws1:access', () => f.api.read('access')), older);
    assert.equal(calls.length, 1); assert.equal(observed.length, 0);
    publish.resolve();
    assert.equal((await older).reason, 'forbidden');
    assert.equal((await overlap).reason, 'forbidden');
    assert.equal(observed.length, 1);
    const newer = loader.load('editor:ws1:access', async () => {
        const result = await f.api.read('access'); observed.push(result); return result;
    });
    assert.equal(calls.length, 2); granted.resolve(grant);
    assert.equal((await newer).ok, true);
    assert.deepEqual(observed.map((result) => result.reason || result.data.role), ['forbidden', 'editor']);
});

test('an obsolete access flight cannot release another scope or an invalidated mount', async () => {
    const loader = controls.createWorkspaceAccessLoader(), old = deferred(), next = deferred(), remounted = deferred();
    const first = loader.load('owner:ws1:access', () => old.promise);
    const second = loader.load('owner:ws2:access', () => next.promise);
    old.resolve(false); await first;
    assert.equal(loader.load('owner:ws2:access', () => { throw new Error('Duplicate new scope'); }), second);
    loader.invalidate();
    const third = loader.load('owner:ws2:access', () => remounted.promise);
    assert.notEqual(third, second);
    next.resolve(false); await second;
    assert.equal(loader.load('owner:ws2:access', () => { throw new Error('Duplicate remount'); }), third);
    remounted.resolve(true); assert.equal(await third, true);
});

test('failed access flights release their slot without an automatic retry', async () => {
    const loader = controls.createWorkspaceAccessLoader(); let calls = 0;
    await assert.rejects(loader.load('owner:ws1:access', () => { calls++; throw new Error('Synchronous read failure'); }), /Synchronous/);
    assert.equal(calls, 1);
    assert.equal(await loader.load('owner:ws1:access', async () => { calls++; return true; }), true);
    assert.equal(calls, 2);
});

test('demo, anonymous and changed scopes make no private control requests', async () => {
    for (const options of [{ demo: true }, { accountId: '' }, { workspaceId: '' }]) {
        const f = clientFixture(options); assert.equal((await f.api.read('access')).ok, false);
        assert.equal((await f.api.command('member.remove', { user: 'viewer' }, 0)).ok, false); assert.equal(f.calls.length, 0);
    }
    const f = clientFixture(); f.changeScope(); await f.api.read('admin'); assert.equal(f.calls.length, 0);
});

test('independent readers have no shared cancellation key and reject mismatched backend data', async () => {
    const f = clientFixture(); assert.equal((await f.api.read('access')).ok, true);
    assert.equal(f.calls[0].options.requestKey, null); assert.equal(f.calls[0].options.cache, 'no-store');
    f.client.send = async () => ({ ...read, workspace: 'ws2' }); assert.equal((await f.api.read('access')).ok, false);
    f.client.send = async () => ({ ...read, settings: { revision: -1 } }); assert.equal((await f.api.read('access')).ok, false);
    f.client.send = async () => '<html>Old frontend fallback</html>'; assert.equal((await f.api.read('access')).ok, false);
    assert.equal((await f.api.read('../users')).reason, 'invalid'); assert.equal((await f.api.read('forums/../../users')).reason, 'invalid');
});

test('late reads and writes disappear after account or workspace changes', async () => {
    for (const kind of ['read', 'command']) {
        const f = clientFixture(); const waiting = deferred(); f.client.send = () => waiting.promise;
        const response = kind === 'read' ? f.api.read('access') : f.api.command('member.remove', { user: 'viewer' }, 0);
        f.client.authStore.record = { id: 'otheraccount' }; waiting.resolve(kind === 'read' ? read : result({ action: 'member.remove' }));
        assert.equal((await response).reason, 'scope_changed');
    }
    const f = clientFixture(); const waiting = deferred(); f.client.send = () => waiting.promise;
    const response = f.api.read('access'); f.changeScope(); waiting.reject(new Error('old workspace failed'));
    assert.equal((await response).error, '');
});

test('partial admin, community and integration responses fail explicitly before controls render', async () => {
    const f = fixture(); f.enable(); const local = clientFixture(); const admin = f.load('workspace-administration.js');
    const access = f.load('workspace-access.js').access(f.event());
    const broken = [
        ['access', { ...access, can_admin: false }],
        ['admin', { ...plain(admin.snapshot(f.event())), role: 'viewer' }],
        ['admin', { ...plain(admin.snapshot(f.event())), audit: { items: [] } }],
        ['wiki', { ...access, enabled: true, page: 1, has_more: false, items: [{ id: 'w1', workspace: 'ws1' }] }],
        ['forums/topic1', { ...access, page: 1, has_more: false, topic: { workspace: 'ws2' }, items: [] }],
        ['integrations', { ...plain(admin.integrations(f.event())), items: [] }],
    ];
    const integration = plain(admin.integrations(f.event())); delete integration.items[0].fields; broken.push(['integrations', integration]);
    for (const [section, data] of broken) {
        local.client.send = async () => data;
        const response = await local.api.read(section); assert.equal(response.reason, 'unavailable'); assert.equal(response.data, undefined);
    }
    local.client.send = async () => plain(admin.integrations(f.event())); assert.equal((await local.api.read('integrations')).ok, true);
});

test('failure to create a secure retry identifier sends no mutation and leaves no pending request', async () => {
    for (const keyFactory of [() => 'short', () => { throw new Error('secure context unavailable'); }]) {
        const f = clientFixture({ keyFactory });
        assert.equal((await f.api.command('member.remove', { user: 'viewer' }, 0)).reason, 'unavailable');
        assert.equal(f.calls.length, 0); assert.equal((await f.api.retry()).reason, 'invalid');
    }
});

test('unconfirmed saves freeze command identity until their original response is recovered', async () => {
    const f = clientFixture(); const bodies = []; let failing = true;
    f.client.send = async (_path, options) => { bodies.push(plain(options.body)); if (failing) throw new Error('lost response'); return result(options.body); };
    const payload = { provider: 'discord', enabled: true, configuration: { mode: 'read', guild_id: '12345678901234567', channel_id: '23456789012345678' } };
    assert.equal((await f.api.command('integration.save', payload, 0)).reason, 'uncertain');
    payload.configuration.channel_id = '33456789012345678';
    assert.equal((await f.api.command('integration.save', payload, 0)).reason, 'uncertain'); assert.equal(bodies.length, 1);
    failing = false; assert.equal((await f.api.retry()).ok, true); assert.deepEqual(bodies[1], bodies[0]);
    assert.equal(bodies[1].configuration, undefined); assert.equal(bodies[1].payload.configuration.channel_id, '23456789012345678');
    assert.equal((await f.api.retry()).reason, 'invalid');
});

test('concurrent submission is bounded and malformed success remains an uncertain save', async () => {
    const f = clientFixture(); const waiting = deferred(); f.client.send = () => waiting.promise;
    const first = f.api.command('member.remove', { user: 'viewer' }, 0);
    assert.equal((await f.api.command('member.remove', { user: 'viewer' }, 0)).reason, 'busy');
    waiting.resolve({}); assert.equal((await first).reason, 'uncertain');
    f.client.send = async (_path, options) => result(options.body); assert.equal((await f.api.retry()).ok, true);
    assert.equal((await f.api.command('unknown', {}, 0)).reason, 'invalid');
    assert.equal((await f.api.command('member.remove', null, 0)).reason, 'invalid');
});

test('explicit permission and revision rejections allow corrected commands without claiming a save', async () => {
    const f = clientFixture();
    f.client.send = async () => { throw { status: 409, response: { message: 'Reload current revision.' } }; };
    assert.equal((await f.api.command('member.remove', { user: 'viewer' }, 0)).reason, 'conflict');
    f.client.send = async () => { throw { status: 403, response: { message: 'Role removed.' } }; };
    assert.equal((await f.api.command('member.remove', { user: 'editor' }, 2)).reason, 'forbidden');
    f.client.send = async (_path, options) => result(options.body);
    assert.equal((await f.api.command('member.remove', { user: 'editor' }, 3)).ok, true);
});

test('the real browser adapter recovers one member grant, wiki page and topic after server persistence loses each response', async () => {
    const f = fixture(); f.enable(); const dropped = new Set(); const observed = [];
    const client = { authStore: { record: { id: 'owner' } },
        async send(path, options) {
            const section = path.split('/').at(-1);
            if (options.method === 'GET') return plain(section === 'access' ? f.load('workspace-access.js').access(f.event()) :
                section === 'admin' ? f.load('workspace-administration.js').snapshot(f.event()) : f.load('workspace-community.js')[section](f.event()));
            const service = f.load(section === 'admin' ? 'workspace-administration.js' : 'workspace-community.js');
            const response = plain(service.command(f.event('owner', options.body)));
            if (!dropped.has(options.body.request_key)) { dropped.add(options.body.request_key); throw new Error('lost after persistence'); }
            return response;
        } };
    let count = 0;
    const api = createWorkspaceControlClient({ client, workspaceId: 'ws1', accountId: 'owner', isCurrent: () => true,
        keyFactory: () => `connected_retry_${String(++count).padStart(5, '0')}`,
        observe: async (collection, verb, operation) => { try { const r = await operation(); observed.push([collection, verb, 'success']); return r; }
            catch (error) { observed.push([collection, verb, 'failure']); throw error; } } });
    assert.equal((await api.command('member.set', { user: 'newuser', role: 'editor' }, 1)).reason, 'uncertain');
    assert.equal((await api.retry()).result.replayed, true);
    assert.equal(f.data.workspace_members.filter((m) => m.user === 'newuser').length, 1);
    assert.equal((await api.read('admin')).ok, true);
    assert.equal((await api.command('wiki.save', { id: '', title: 'Shared guide', slug: 'shared-guide', body: 'Useful guidance.' }, 0)).reason, 'uncertain');
    assert.equal((await api.retry()).result.replayed, true); assert.equal((await api.read('wiki')).data.items.length, 1);
    assert.equal((await api.command('forum.create', { title: 'Review the guide', body: 'What is missing?' }, 0)).reason, 'uncertain');
    assert.equal((await api.retry()).result.replayed, true); assert.equal((await api.read('forums')).data.items.length, 1);
    assert.equal(f.data.workspace_admin_events.length, 4);
    assert.ok(observed.every((entry) => !JSON.stringify(entry).includes('Shared guide')));
    assert.equal(observed.filter((entry) => entry[2] === 'success').length, 3);
});
