// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/classroom-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/lib/classrooms.js, apps/web/src/lib/navigationIntent.js, tests/upgrade/classroom-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/classrooms.js; VALIDATES apps/web/src/lib/navigationIntent.js; CONSUMES tests/upgrade/classroom-fixture.mjs
// DAG Node:    none
// Intent:      Exercise the actual browser and classroom policy contract across complete sessions, uncertain writes and identity changes.
// ───────────────────────────────────────────────────────────────

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomClient, classroomHref } from '../../apps/web/src/lib/classrooms.js';
import { workspaceDestination, classroomTelemetryLocation, scrubClassroomProperties } from '../../apps/web/src/lib/navigationIntent.js';
import { classroomFixture } from './classroom-fixture.mjs';
import { plain } from './admin-fixture.mjs';

function connected(options = {}, backend = classroomFixture()) {
    let current = true, sequence = 0; const requests = [], observations = [];
    const actor = options.accountId || 'owner';
    const client = { authStore: { record: { id: actor } }, async send(path, options) {
        requests.push({ path, options }); const parts = path.split('/');
        const event = backend.event(client.authStore.record.id, options.body || {}, { workspace: parts[4], id: parts[6], query: options.query || {} });
        try {
            return plain(options.method === 'POST' ? path.endsWith('/presence') ? backend.service.heartbeat(event) : backend.service.command(event) :
                path.endsWith('/record') ? backend.service.record(event) : parts[6] ? backend.service.detail(event) : backend.service.list(event));
        } catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
    } };
    const api = createClassroomClient({ client, workspaceId: 'ws1', accountId: actor, isCurrent: () => current,
        keyFactory: () => `classroom_browser_${actor}_${++sequence}`, observe: async (name, verb, operation) => {
            const result = await operation(); observations.push([name, verb]); return result;
        }, ...options });
    const input = () => ({ title: 'Shared evidence class', description: 'One worked example.', tutorial: backend.lessons[0].id, starts_at: '' });
    return { backend, client, api, input, requests, observations, stale: () => { current = false; } };
}

test('actual browser and backend sources agree on scheduling, attendance, lessons, discussion and ended history', async () => {
    const { backend, api, input, requests, observations } = connected();
    const created = await api.command('room.create', input(), 0); assert.equal(created.ok, true);
    const id = created.result.id;
    const listed = await api.read(); assert.equal(listed.ok, true); assert.equal(listed.data.items[0].status, 'scheduled');
    assert.equal((await api.read(id)).data.membership.active, false);
    assert.equal((await api.command('room.start', { id }, 1)).ok, true);
    const learner = connected({ accountId: 'editor' }, backend);
    assert.equal((await learner.api.command('room.join', { id }, 2)).ok, true);
    let view = await learner.api.read(id); assert.equal(view.ok, true); assert.equal(view.data.participants.length, 2);
    assert.equal(view.data.media.available, false); assert.equal((await learner.api.heartbeat(id, view.data.membership)).ok, true);
    assert.equal((await api.command('room.lesson', { id, tutorial: backend.lessons[0].id, section: 1 }, 2)).ok, true);
    view = await learner.api.read(id); assert.equal(view.data.room.section, 1);
    assert.equal((await learner.api.command('room.message', { id, body: 'How was this measured?' }, 3)).ok, true);
    assert.equal((await api.read(id)).data.messages.items[0].body, 'How was this measured?');
    assert.equal((await learner.api.command('room.leave', { id, membership_revision: view.data.membership.revision }, 3)).ok, true);
    assert.equal((await learner.api.read(id)).data.membership.active, false);
    assert.equal((await api.command('room.end', { id }, 3)).ok, true);
    view = await learner.api.read(id); assert.equal(view.data.room.status, 'ended'); assert.deepEqual(view.data.participants, []);
    assert.equal(view.data.messages.items.length, 1);
    for (const { path, options } of [...requests, ...learner.requests]) {
        assert.ok(!path.includes('?')); assert.equal(options.requestKey, null); assert.equal(options.cache, 'no-store');
    }
    assert.ok(observations.every(([name, verb]) => ['classroom_rooms', 'classroom_messages'].includes(name) && ['create', 'update'].includes(verb)));
});

test('lost replies keep immutable intent and recover a single create, start and message', async () => {
    const { backend, api, input, client } = connected(); const send = client.send;
    for (const action of ['room.create', 'room.start', 'room.message']) {
        let lost = true;
        client.send = async (...args) => { const result = await send(...args); if (lost) { lost = false; throw new Error('Response interrupted'); } return result; };
        const room = backend.data.classroom_rooms[0];
        const payload = action === 'room.create' ? input() : action === 'room.message' ? { id: room.id, body: 'Keep this question.' } : { id: room.id };
        const revision = room?.revision || 0;
        assert.equal((await api.command(action, payload, revision)).reason, 'uncertain');
        payload.title = 'This was not part of the save';
        assert.equal((await api.command(action, payload, revision)).reason, 'uncertain');
        const recovered = await api.retry(); assert.equal(recovered.ok, true); assert.equal(recovered.result.replayed, true);
        assert.equal((await api.retry()).reason, 'invalid');
    }
    assert.equal(backend.data.classroom_rooms.length, 1); assert.equal(backend.data.classroom_members.length, 1);
    assert.equal(backend.data.classroom_messages.length, 1); assert.equal(backend.data.classroom_receipts.length, 3);
    assert.equal(backend.data.classroom_rooms[0].title, 'Shared evidence class');
});

test('a malformed or foreign receipt remains uncertain and a valid replay resolves it', async () => {
    for (const corrupt of [(value) => ({ ...value, workspace: 'ws2' }), (value) => ({ ...value, action: 'room.end' }),
        (value) => ({ ...value, revision: 0 }), (value) => ({ ...value, replayed: 'true' }), () => null]) {
        const { api, input, client, backend } = connected(); const send = client.send;
        client.send = async (...args) => corrupt(await send(...args));
        assert.equal((await api.command('room.create', input(), 0)).reason, 'uncertain');
        client.send = send; assert.equal((await api.retry()).result.replayed, true); assert.equal(backend.data.classroom_rooms.length, 1);
    }
    const next = connected(); const saved = await next.api.command('room.create', next.input(), 0); const send = next.client.send;
    next.client.send = async (...args) => ({ ...await send(...args), id: 'anotherroom' });
    assert.equal((await next.api.command('room.start', { id: saved.result.id }, 1)).reason, 'uncertain');
    next.client.send = send; assert.equal((await next.api.retry()).ok, true);
});

test('current revisions and revoked permissions reject a save without trapping later corrected work', async () => {
    const { api, input, backend } = connected(); const saved = await api.command('room.create', input(), 0); const id = saved.result.id;
    backend.command('room.update', { id, ...input(), title: 'New title' });
    assert.equal((await api.command('room.start', { id }, 1)).reason, 'conflict'); assert.equal((await api.retry()).reason, 'invalid');
    assert.equal((await api.command('room.start', { id }, 2)).ok, true);
    const viewer = connected({ accountId: 'viewer' }, backend);
    assert.equal((await viewer.api.command('room.join', { id }, 3)).ok, true);
    assert.equal((await viewer.api.command('room.message', { id, body: 'Not permitted' }, 3)).reason, 'forbidden');
    backend.data.workspace_members = backend.data.workspace_members.filter((row) => row.user !== 'viewer');
    assert.equal((await viewer.api.read(id)).reason, 'forbidden');
});

test('account, workspace and unmount changes discard late reads, writes and failures', async () => {
    for (const operation of ['read', 'command', 'heartbeat']) for (const fail of [false, true]) for (const change of ['account', 'scope', 'dispose']) {
        const next = connected(); const room = next.backend.create(); next.backend.command('room.start', { id: room.id });
        const membership = next.backend.detail(room.id).membership; const send = next.client.send;
        next.client.send = async (...args) => {
            const result = await send(...args);
            if (change === 'account') next.client.authStore.record = { id: 'editor' };
            else if (change === 'scope') next.stale(); else next.api.dispose();
            if (fail) throw new Error('Old connection failure'); return result;
        };
        const value = operation === 'read' ? await next.api.read(room.id) : operation === 'command' ? await next.api.command('room.message', { id: room.id, body: 'Old room question' }, 2) : await next.api.heartbeat(room.id, membership);
        assert.deepEqual(value, { ok: false, reason: 'scope_changed', error: '' });
        const count = next.requests.length; await next.api.read(); await next.api.command('room.create', next.input(), 0);
        assert.equal(next.requests.length, count);
    }
});

test('incomplete, foreign and inconsistent room reads never become successful empty views', async () => {
    const { api, backend, client } = connected(); const room = backend.create(); backend.command('room.start', { id: room.id });
    const send = client.send;
    for (const corrupt of [
        (value) => { value.workspace = 'ws2'; }, (value) => { value.role = 'superuser'; }, (value) => { value.room.id = 'other'; },
        (value) => { value.room.can_manage = false; }, (value) => { value.membership.revision = 0; }, (value) => { value.room.section = 20; },
        (value) => { value.media.available = 'yes'; }, (value) => { value.media.token = 'leaked'; }, (value) => { value.lesson.lesson.sections = []; }, (value) => { value.lessons.items = null; },
        (value) => { delete value.messages.has_more; }, (value) => { value.messages.items = [{ id: 'msg1', room: 'foreign' }]; },
        (value) => { value.participants.push(value.participants[0]); },
    ]) {
        client.send = async (...args) => { const value = await send(...args); corrupt(value); return value; };
        assert.equal((await api.read(room.id)).reason, 'unavailable');
    }
    for (const corrupt of [(value) => { value.items.push(value.items[0]); }, (value) => { value.can_host = false; }, (value) => { value.page = 2; }]) {
        client.send = async (...args) => { const value = await send(...args); corrupt(value); return value; };
        assert.equal((await api.read()).ok, false);
    }
    client.send = async () => { throw new Error('Network offline'); }; assert.equal((await api.read()).reason, 'connection');
    client.send = async () => { throw { status: 404 }; }; assert.equal((await api.read()).reason, 'unavailable');
});

test('overlapping commands and heartbeats are bounded and cannot duplicate accepted work', async () => {
    const { backend, api, client, input } = connected(); const send = client.send; let release;
    client.send = async (...args) => { const value = await send(...args); await new Promise((resolve) => { release = resolve; }); return value; };
    const pending = api.command('room.create', input(), 0); await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await api.command('room.create', input(), 0)).reason, 'busy');
    assert.equal((await api.retry()).reason, 'busy'); release(); const created = await pending; client.send = send;
    const id = created.result.id; backend.command('room.start', { id }); const membership = backend.detail(id).membership;
    client.send = async (...args) => { const value = await send(...args); await new Promise((resolve) => { release = resolve; }); return value; };
    const beat = api.heartbeat(id, membership); await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await api.heartbeat(id, membership)).reason, 'busy'); release(); assert.equal((await beat).ok, true);
    client.send = send; backend.command('room.leave', { id, membership_revision: membership.revision });
    assert.equal((await api.heartbeat(id, membership)).reason, 'conflict');
    client.send = async () => ({ workspace: 'ws2' }); assert.equal((await api.heartbeat(id, membership)).ok, false);
});

test('invalid actions, missing secure retry IDs and demo mode make no requests', async () => {
    const next = connected();
    for (const [action, payload, revision] of [['room.delete', {}, 0], ['room.create', [], 0], ['room.create', null, 0],
        ['room.create', {}, -1], ['room.create', { nested: {} }, 0]])
        assert.equal((await next.api.command(action, payload, revision)).reason, 'invalid');
    for (const args of [['../room'], ['', 0], ['', 10000], ['', 1, 'unknown']]) assert.equal((await next.api.read(...args)).reason, 'invalid');
    assert.equal((await next.api.heartbeat('room', { id: 'member', revision: 0 })).reason, 'invalid');
    assert.equal(next.requests.length, 0);
    for (const keyFactory of [() => 'bad', () => { throw new Error(); }]) {
        const instance = connected({ keyFactory }); assert.equal((await instance.api.command('room.create', instance.input(), 0)).reason, 'unavailable');
        assert.equal(instance.requests.length, 0);
    }
    for (const options of [{ demo: true }, { workspaceId: '' }]) {
        const instance = connected(options); await instance.api.read(); await instance.api.command('room.create', instance.input(), 0);
        await instance.api.heartbeat('room', { id: 'member', revision: 1 }); assert.equal(instance.requests.length, 0);
    }
    const instance = connected(); instance.client.authStore.record = null;
    assert.equal((await instance.api.read()).reason, 'scope_changed'); assert.equal(instance.requests.length, 0);
});

test('classroom links survive local authentication while external, encoded and malformed redirects are rejected', () => {
    const link = classroomHref('roomalpha', 'workspacealpha');
    assert.equal(link, '/app/classrooms/roomalpha?workspace=workspacealpha'); assert.equal(workspaceDestination(link), link);
    assert.equal(workspaceDestination('/app/tutorials?lesson=lessonalpha#reading'), '/app/tutorials?lesson=lessonalpha#reading');
    assert.equal(classroomHref('../room', 'workspace'), '/app/classrooms');
    assert.equal(classroomHref('room', 'workspace?private'), '/app/classrooms');
    for (const value of [null, {}, 'https://example.com/app', '//example.com/app', '/app/../../login', '/app/%2e%2e/login',
        '/app/%2f%2fexample.com', '/app\\example.com', '/application', '/app\n/room', '/app/' + 'r'.repeat(2000)])
        assert.equal(workspaceDestination(value), '/app');
});

test('room, workspace and personal lesson identifiers stay out of classroom telemetry locations', () => {
    for (const [value, expected] of [
        ['/app/classrooms/roomalpha?workspace=workspacealpha#discussion', '/app/classrooms/:room'],
        ['/app/classrooms?workspace=workspacealpha', '/app/classrooms'],
        ['https://buildanddo.com/app/classrooms/roomalpha', 'https://buildanddo.com/app/classrooms/:room'],
        ['/hcgi/platform/api/buildanddo/workspaces/workspacealpha/classrooms/roomalpha/presence', '/hcgi/platform/api/buildanddo/workspaces/:workspace/classrooms/:room/presence'],
        ['/api/buildanddo/workspaces/workspacealpha/classrooms', '/api/buildanddo/workspaces/:workspace/classrooms'],
        ['/api/buildanddo/workspaces/workspacealpha/classrooms/roomalpha', '/api/buildanddo/workspaces/:workspace/classrooms/:room'],
        ['/app/tutorials?lesson=lessonalpha', '/app/tutorials'],
        ['/docs?guide=public', '/docs?guide=public'], [null, null], ['http://[', 'http://['],
    ]) assert.equal(classroomTelemetryLocation(value), expected);
    const event = { event: '$pageview', properties: { $current_url: 'https://buildanddo.com/app/classrooms/roomalpha?workspace=workspacealpha',
        $pathname: '/app/classrooms/roomalpha', $set_once: { $initial_current_url: 'https://buildanddo.com/app/classrooms/roomalpha' },
        $set: { $referrer: 'https://buildanddo.com/app/tutorials?lesson=lessonalpha' }, unrelated: 'retained' } };
    assert.ok(!JSON.stringify(scrubClassroomProperties(event)).includes('alpha'));
    assert.equal(event.properties.unrelated, 'retained'); assert.equal(scrubClassroomProperties(null), null);
});

test('a live room may offer media; a room that is not live may not', async () => {
    const { api, backend, client } = connected(); const room = backend.create();
    const send = client.send;
    client.send = async (...args) => { const value = await send(...args); if (value.media) value.media = { available: true }; return value; };
    assert.equal((await api.read(room.id)).reason, 'unavailable');
    backend.command('room.start', { id: room.id });
    const view = await api.read(room.id);
    assert.equal(view.ok, true); assert.equal(view.data.media.available, true);
});

test('the class record read accepts aggregate counts only and refuses anything carrying an identity', async () => {
    const { api, backend, client } = connected(); const room = backend.create();
    backend.migration('apps/pocketbase/pb_migrations/1791300000_classroom_attendance.js').up();
    backend.command('room.start', { id: room.id });
    const view = await api.record(room.id);
    assert.equal(view.ok, true); assert.equal(view.data.attendees, 1); assert.equal(view.data.installed, true);
    const send = client.send;
    for (const corrupt of [(value) => { value.names = ['owner']; }, (value) => { value.hours[0].owner = 'owner'; },
        (value) => { value.attendees = -1; }, (value) => { value.room = 'other'; }, (value) => { value.hours = Array(49).fill(value.hours[0]); }]) {
        client.send = async (...args) => { const value = await send(...args); corrupt(value); return value; };
        assert.equal((await api.record(room.id)).reason, 'unavailable');
    }
    assert.equal((await api.record('not a room')).reason, 'invalid');
});
