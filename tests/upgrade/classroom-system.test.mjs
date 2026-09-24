// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/classroom-system.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     tests/upgrade/classroom-fixture.mjs, apps/pocketbase/pb_hooks/classrooms.pb.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/classroom-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/classrooms.js; VALIDATES apps/pocketbase/pb_hooks/classrooms.pb.js; VALIDATES apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js
// DAG Node:    none
// Intent:      Exercise classroom lifecycle and isolation through production commands including retries, stale presence and schema rollback.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { classroomFixture, MIGRATION } from './classroom-fixture.mjs';
import { source, plain } from './admin-fixture.mjs';

test('host and learner share the selected lesson, discussion and terminal session history', () => {
    const f = classroomFixture();
    const room = f.create({ actor: 'editor' });
    assert.equal(f.list('viewer').items[0].status, 'scheduled');
    assert.equal(f.list('viewer').can_host, false);
    assert.throws(() => f.command('room.join', { id: room.id }, { actor: 'viewer' }), /host starts/);
    f.command('room.start', { id: room.id }, { actor: 'editor' });
    f.command('room.join', { id: room.id }, { actor: 'viewer' });
    const before = f.detail(room.id, 'viewer');
    assert.equal(before.membership.active, true);
    assert.equal(before.participants.length, 2);
    assert.equal(before.media.available, false);
    assert.equal(before.lesson.id, f.lessons[0].id);
    assert.equal(before.room.can_manage, false);
    f.heartbeat(room.id, before.membership, 'viewer');
    f.command('room.message', { id: room.id, body: 'Which observation supports this claim?' }, { actor: 'editor' });
    f.command('room.lesson', { id: room.id, tutorial: f.lessons[1].id, section: 1 }, { actor: 'editor' });
    const next = f.detail(room.id, 'viewer');
    assert.equal(next.lesson.title, f.lessons[1].title);
    assert.equal(next.room.section, 1);
    assert.equal(next.messages.items[0].body, 'Which observation supports this claim?');
    assert.equal(next.messages.items[0].own, false);
    f.command('room.end', { id: room.id }, { actor: 'editor' });
    const ended = f.detail(room.id, 'viewer');
    assert.equal(ended.room.status, 'ended');
    assert.equal(ended.membership.active, false);
    assert.equal(ended.participants.length, 0);
    assert.equal(ended.messages.items.length, 1);
    assert.throws(() => f.command('room.start', { id: room.id }, { actor: 'editor' }), /has ended/);
    assert.throws(() => f.heartbeat(room.id, before.membership, 'viewer'), /connection ended/);
});

test('current membership and host ownership govern reads, writes and saved receipt recovery', () => {
    const f = classroomFixture();
    const room = f.create({ actor: 'editor', key: 'create_room_retry_key' });
    f.command('room.start', { id: room.id }, { actor: 'editor' });
    for (const actor of ['', 'outsider', 'otherowner']) {
        assert.throws(() => f.list(actor));
        assert.throws(() => f.detail(room.id, actor));
        assert.throws(() => f.command('room.join', { id: room.id }, { actor }));
    }
    assert.throws(() => f.detail(room.id, 'otherowner', 'ws2'), /unavailable/);
    assert.throws(() => f.command('room.end', { id: room.id }, { actor: 'otherowner', workspace: 'ws2' }), /unavailable/);
    assert.throws(() => f.create({ actor: 'viewer' }), /editor or host/);
    assert.throws(() => f.command('room.message', { id: room.id, body: 'Not permitted' }, { actor: 'viewer' }), /editor or host/);
    f.seed('workspace_members', { id: 'new_member', workspace: 'ws1', user: 'newuser', role: 'editor' });
    assert.throws(() => f.command('room.end', { id: room.id }, { actor: 'newuser' }), /host or a workspace/);
    assert.equal(f.list('admin').items[0].can_manage, true);
    f.app.delete(f.app.findRecordById('workspace_members', 'editormember'));
    assert.throws(() => f.detail(room.id, 'editor'), /membership/);
    assert.throws(() => f.create({ actor: 'editor', key: 'create_room_retry_key' }), /membership/);
    f.command('room.end', { id: room.id }, { actor: 'admin' });
    assert.equal(f.detail(room.id).room.status, 'ended');
    f.app.delete(f.app.findRecordById('users', 'owner'));
    assert.throws(() => f.detail(room.id), /no rows/);
});

test('lost create, start and message responses replay once without reviving ended rooms', () => {
    const f = classroomFixture();
    const room = f.create({ key: 'room_create_duplicate' });
    assert.equal(f.create({ key: 'room_create_duplicate' }).id, room.id);
    assert.equal(f.create({ key: 'room_create_duplicate' }).replayed, true);
    assert.equal(f.data.classroom_rooms.length, 1);
    assert.throws(() => f.create({ key: 'room_create_duplicate' }, { title: 'Changed' }), /different classroom command/);
    const start = { key: 'room_start_duplicate', revision: 1 };
    f.command('room.start', { id: room.id }, start);
    f.command('room.start', { id: room.id }, start);
    assert.equal(f.data.classroom_members.length, 1);
    assert.equal(f.data.classroom_members[0].revision, 1);
    const message = { key: 'room_message_duplicate', revision: 2 };
    f.command('room.message', { id: room.id, body: 'One question.' }, message);
    assert.equal(f.command('room.message', { id: room.id, body: 'One question.' }, message).replayed, true);
    assert.equal(f.data.classroom_messages.length, 1);
    f.command('room.end', { id: room.id });
    assert.equal(f.command('room.start', { id: room.id }, start).replayed, true);
    assert.equal(f.command('room.message', { id: room.id, body: 'One question.' }, message).replayed, true);
    assert.equal(f.detail(room.id).room.status, 'ended');
});

test('receipt failure rolls room, attendance and discussion writes back together', () => {
    const f = classroomFixture();
    const save = f.app.save;
    f.app.save = function (record) {
        if (record.collection?.().name === 'classroom_receipts') throw new Error('receipt unavailable');
        return save.call(this, record);
    };
    assert.throws(() => f.create(), /receipt unavailable/);
    assert.equal(f.data.classroom_rooms.length, 0);
    f.app.save = save;
    const room = f.create();
    f.command('room.start', { id: room.id });
    const prior = plain(f.data);
    f.app.save = function (record) {
        if (record.collection?.().name === 'classroom_receipts') throw new Error('receipt unavailable');
        return save.call(this, record);
    };
    assert.throws(() => f.command('room.message', { id: room.id, body: 'No partial save' }), /receipt unavailable/);
    assert.throws(() => f.command('room.join', { id: room.id }, { actor: 'viewer' }), /receipt unavailable/);
    assert.deepEqual(plain(f.data), prior);
});

test('attendance expires and stale heartbeat or leave cannot overwrite a later join', () => {
    const f = classroomFixture();
    const room = f.create();
    f.command('room.start', { id: room.id });
    f.command('room.join', { id: room.id }, { actor: 'viewer', key: 'first_viewer_join_key' });
    const first = f.detail(room.id, 'viewer').membership;
    f.command('room.leave', { id: room.id, membership_revision: first.revision }, { actor: 'viewer' });
    assert.equal(f.detail(room.id, 'viewer').membership.active, false);
    assert.throws(() => f.heartbeat(room.id, first, 'viewer'), /connection ended/);
    f.command('room.join', { id: room.id }, { actor: 'viewer' });
    const second = f.detail(room.id, 'viewer').membership;
    assert.ok(second.revision > first.revision);
    assert.throws(() => f.heartbeat(room.id, first, 'viewer'), /connection ended/);
    assert.throws(() => f.command('room.leave', { id: room.id, membership_revision: first.revision }, { actor: 'viewer' }), /attendance changed/);
    const row = f.app.findRecordById('classroom_members', second.id);
    row.set('last_seen', new Date(Date.now() - 76000).toISOString()); f.app.save(row);
    assert.equal(f.detail(room.id, 'viewer').membership.active, false);
    assert.throws(() => f.heartbeat(room.id, second, 'viewer'), /connection ended/);
    f.command('room.join', { id: room.id }, { actor: 'viewer' });
    const latest = f.detail(room.id, 'viewer').membership;
    const nativeDate = f.app.findRecordById('classroom_members', latest.id);
    nativeDate.set('last_seen', nativeDate.getString('last_seen').replace('T', ' ')); f.app.save(nativeDate);
    assert.equal(f.detail(room.id, 'viewer').membership.active, true);
    f.heartbeat(room.id, latest, 'viewer');
    f.app.delete(f.app.findRecordById('workspace_members', 'viewermember'));
    assert.throws(() => f.heartbeat(room.id, latest, 'viewer'), /membership/);
});

test('bad inputs and stale hosts cannot fabricate schedules, sections or participant authority', () => {
    const f = classroomFixture();
    assert.throws(() => f.create({}, { title: '' }));
    assert.throws(() => f.create({}, { starts_at: 'tomorrow' }));
    assert.throws(() => f.create({}, { tutorial: 'missing' }));
    assert.throws(() => f.create({ revision: 8 }));
    f.denied.add(f.lessons[0].id);
    assert.throws(() => f.create(), /not readable/);
    assert.equal(f.list().lessons.items.length, 1);
    f.denied.clear();
    const room = f.create({}, { starts_at: '2026-10-01T15:00:00Z' });
    f.command('room.update', { id: room.id, title: 'Revised workshop', description: '', tutorial: f.lessons[1].id, starts_at: '' });
    assert.equal(f.detail(room.id).room.title, 'Revised workshop');
    assert.throws(() => f.command('room.start', { id: room.id }, { revision: 1 }), /changed/);
    assert.throws(() => f.command('room.lesson', { id: room.id, tutorial: f.lessons[0].id, section: 0 }), /Start the class/);
    assert.throws(() => f.command('room.message', { id: room.id, body: 'early' }), /Join an active/);
    f.command('room.start', { id: room.id });
    assert.throws(() => f.command('room.start', { id: room.id }), /already started/);
    assert.throws(() => f.command('room.update', { id: room.id, title: 'Too late', description: '', tutorial: f.lessons[0].id, starts_at: '' }), /before starting/);
    for (const section of [-1, 99, 1.5, '1']) assert.throws(() => f.command('room.lesson', { id: room.id, tutorial: f.lessons[0].id, section }), /Choose a section/);
    assert.throws(() => f.command('room.message', { id: room.id, body: 'x'.repeat(2001) }));
    assert.throws(() => f.command('room.join', { id: room.id, owner: 'viewer' }));
    assert.throws(() => f.command('room.unsupported', { id: room.id }));
    f.denied.add(f.lessons[1].id);
    assert.equal(f.detail(room.id).lesson, null);
});

test('list and discussion pagination are bounded and filter state without claiming unread pages are empty', () => {
    const f = classroomFixture();
    for (let i = 0; i < 22; i++) f.create({}, { title: `Class ${i}` });
    assert.equal(f.list().items.length, 20);
    assert.equal(f.list().has_more, true);
    assert.equal(f.list('viewer', 'ws1', { page: '2' }).items.length, 2);
    assert.equal(f.list('otherowner', 'ws2').items.length, 0);
    assert.equal(f.list('owner', 'ws1', { status: 'live' }).items.length, 0);
    assert.throws(() => f.list('owner', 'ws1', { status: 'fabricated' }));
    assert.throws(() => f.list('owner', 'ws1', { page: '0' }));
    const room = f.list().items[0];
    f.command('room.start', { id: room.id });
    for (let i = 0; i < 21; i++) f.command('room.message', { id: room.id, body: `Question ${i}` });
    const first = f.detail(room.id);
    assert.equal(first.messages.items.length, 20);
    assert.equal(first.messages.has_more, true);
    assert.equal(f.detail(room.id, 'viewer', 'ws1', { page: '2' }).messages.items.length, 1);
});

test('capacity counts only recent joined accounts and rejects foreign presence claims', () => {
    const f = classroomFixture();
    const room = f.create(); f.command('room.start', { id: room.id });
    for (let i = 0; i < 99; i++) f.seed('classroom_members', { id: `member${i}`, workspace: 'ws1', room: room.id,
        owner: `person${i}`, active: true, name: 'Learner', last_seen: new Date().toISOString(), revision: 1 });
    assert.throws(() => f.command('room.join', { id: room.id }, { actor: 'viewer' }), /full/);
    f.app.delete(f.app.findRecordById('classroom_members', 'member0'));
    f.command('room.join', { id: room.id }, { actor: 'viewer' });
    const mine = f.detail(room.id, 'viewer').membership;
    assert.throws(() => f.heartbeat(room.id, mine, 'editor'), /connection ended/);
    const own = f.detail(room.id).membership;
    assert.throws(() => f.heartbeat(room.id, { ...own, revision: -1 }));
});

test('migration replays and down retains history while disabling every classroom route', () => {
    const f = classroomFixture();
    const room = f.create(); f.command('room.start', { id: room.id });
    const prior = plain(f.data);
    f.migration(MIGRATION).up();
    assert.deepEqual(plain(f.data), prior);
    f.migration(MIGRATION).down();
    assert.deepEqual(plain(f.data), prior);
    assert.throws(() => f.list(), /operator review/);
    assert.throws(() => f.command('room.end', { id: room.id }), /operator review/);
    f.migration(MIGRATION).up();
    assert.equal(f.detail(room.id).room.status, 'live');
    f.collections.classroom_members.viewRule = '';
    assert.throws(() => f.list(), /operator review/);
    assert.throws(() => f.migration(MIGRATION).up(), /custom/);
    assert.throws(() => f.migration(MIGRATION).down(), /custom/);
    f.collections.classroom_members.viewRule = null;
    f.collections.classroom_rooms.fields.getByName('tutorial').collectionId = 'wrong';
    assert.throws(() => f.migration(MIGRATION).up(), /custom/);
    f.collections.classroom_rooms.fields.getByName('tutorial').collectionId = f.collections.tutorials.id;
    f.collections.classroom_members.indexes = [];
    assert.throws(() => f.migration(MIGRATION).up(), /indexes/);
    f.app.delete(f.collections.classroom_rooms);
    assert.throws(() => f.list(), /not installed/);
});

test('classroom migrations accept native-normalized indexes and retain history through down/up', () => {
    for (const quote of [['`', '`'], ['"', '"'], ['[', ']']]) {
        const f = classroomFixture(), room = f.create();
        f.command('room.start', { id: room.id });
        const before = plain(f.data);
        for (const name of ['classroom_rooms', 'classroom_members', 'classroom_messages', 'classroom_receipts']) {
            f.collections[name].indexes = f.collections[name].indexes.map((index) => index.replace(/\b[a-z_]+\b/g,
                (word) => ['create', 'unique', 'index', 'on', 'desc'].includes(word) ? word.toUpperCase() : quote[0] + word + quote[1])
                .replace(/\s+/g, '\n  ').replace(/,/g, ' , '));
        }
        f.migration(MIGRATION).up();
        f.migration(MIGRATION).down();
        f.migration(MIGRATION).up();
        assert.deepEqual(plain(f.data), before);
        assert.equal(f.detail(room.id).room.status, 'live');
    }
});

test('classroom index normalization cannot admit changed uniqueness, identity, keys or predicates', () => {
    for (const change of [
        (index) => index.replace('unique ', ''),
        (index) => index.replace('idx_classroom_member', 'idx_other_member'),
        (index) => index.replace('on classroom_members', 'on classroom_rooms'),
        (index) => index.replace('(room, owner)', '(owner, room)'),
        (index) => index.replace('(room, owner)', '(room, workspace)'),
        (index) => index.replace('(room, owner)', '(room, owner desc)'),
        (index) => index + ' where active = true',
    ]) {
        const f = classroomFixture();
        f.collections.classroom_members.indexes[0] = change(f.collections.classroom_members.indexes[0]);
        const before = plain(f.data);
        assert.throws(() => f.migration(MIGRATION).up(), /indexes/);
        assert.deepEqual(plain(f.data), before);
    }
});

test('native route callbacks load policy in isolation and require bounded authenticated private requests', () => {
    const routes = [], f = classroomFixture();
    const code = source('apps/pocketbase/pb_hooks/classrooms.pb.js');
    vm.runInNewContext(code, { routerAdd: (...args) => routes.push(args), $apis: {
        requireAuth: (...args) => ({ auth: args }), bodyLimit: (max) => ({ max }),
    } });
    assert.equal(routes.length, 5);
    for (const [method, path, callback, auth, bodyLimit] of routes) {
        assert.deepEqual(plain(auth), { auth: ['users'] });
        if (method === 'POST') assert.ok(bodyLimit.max <= 30000);
        const fields = new Map(); let called = 0;
        const expected = method === 'GET' ? path.endsWith('/record') ? 'record' : path.endsWith('{id}') ? 'detail' : 'list' : path.endsWith('/presence') ? 'heartbeat' : 'command';
        const lesson = { lesson: { check: { question: 'Q', choices: ['A', 'B'], answer: 1, explanation: 'B is right.' } } };
        const handler = vm.runInNewContext(`(${callback.toString()})`, { __hooks: '/native/hooks', require: (name) => {
            if (name === '/native/hooks/workflow-policy.js') return f.load('workflow-policy.js');
            assert.equal(name, '/native/hooks/classrooms.js'); return { [expected]: () => { called++; return { accepted: true, ...(expected === 'detail' ? { lesson } : {}) }; } };
        } });
        handler({ response: { header: () => ({ set: (key, value) => fields.set(key, value) }) }, json: (status, body) => {
            assert.equal(status, 200); assert.equal(body.accepted, true);
            if (expected === 'detail') assert.deepEqual(plain(body.lesson), { lesson: { check: { question: 'Q', choices: ['A', 'B'] } } }, 'classroom lessons carry no answer');
        } });
        assert.equal(called, 1); assert.equal(fields.get('Cache-Control'), 'no-store');
    }
});

test('media is offered only while live and only when the realtime service is configured, without exposing its values', () => {
    const configured = { CLOUDFLARE_REALTIME_APP_ID: 'app-id-value', CLOUDFLARE_REALTIME_APP_SECRET: 'secret-value' };
    const f = classroomFixture({ runtime: { $os: { getenv: (key) => configured[key] || '' } } });
    const room = f.create();
    assert.deepEqual(f.detail(room.id).media, { available: false });
    f.command('room.start', { id: room.id });
    assert.equal(f.detail(room.id).media.available, false, 'configuration alone cannot replace the media session store');
    f.migration('apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js').up();
    const live = f.detail(room.id);
    assert.deepEqual(live.media, { available: true });
    assert.equal(JSON.stringify(live).includes('secret-value'), false);
    assert.equal(JSON.stringify(live).includes('app-id-value'), false);
    f.command('room.end', { id: room.id });
    assert.deepEqual(f.detail(room.id).media, { available: false });

    const missing = classroomFixture({ runtime: { $os: { getenv: () => '' } } });
    const other = missing.create(); missing.command('room.start', { id: other.id });
    assert.deepEqual(missing.detail(other.id).media, { available: false, reason: 'not configured on this server' });
});

const ATTENDANCE = 'apps/pocketbase/pb_migrations/1791300000_classroom_attendance.js';
const record = (f, id, actor = 'owner', workspace = 'ws1') => plain(f.service.record(f.event(actor, {}, { id, workspace })));

test('attendance history records each start, join, leave and end once, inside the command, and replays never duplicate it', () => {
    const f = classroomFixture(); f.migration(ATTENDANCE).up();
    const room = f.create({ actor: 'editor' });
    const first = f.command('room.start', { id: room.id }, { actor: 'editor', key: 'attendance_start_once', revision: 1 });
    const again = f.command('room.start', { id: room.id }, { actor: 'editor', key: 'attendance_start_once', revision: 1 });
    assert.equal(first.replayed, false); assert.equal(again.replayed, true);
    f.command('room.join', { id: room.id }, { actor: 'viewer' });
    const viewer = f.detail(room.id, 'viewer').membership;
    f.command('room.leave', { id: room.id, membership_revision: viewer.revision }, { actor: 'viewer' });
    f.command('room.end', { id: room.id }, { actor: 'editor' });
    const events = f.data.classroom_attendance.map((row) => [row.owner, row.event]);
    assert.deepEqual(events.map(([, event]) => event), ['start', 'join', 'join', 'leave', 'end']);
    assert.equal(f.data.classroom_attendance.every((row) => row.room === room.id && row.workspace === 'ws1' && row.at), true);
});

test('the class record is aggregate, host-only and honest about a backend without the history', () => {
    const f = classroomFixture();
    const room = f.create({ actor: 'editor' });
    assert.equal(record(f, room.id, 'editor').installed, false);
    f.migration(ATTENDANCE).up();
    assert.deepEqual({ ...record(f, room.id, 'editor'), started_at: '', ended_at: '' },
        { room: room.id, status: 'scheduled', started_at: '', ended_at: '', installed: true, attendees: 0, minutes: 0, hours: [], truncated: false });
    f.command('room.start', { id: room.id }, { actor: 'editor' });
    f.command('room.join', { id: room.id }, { actor: 'viewer' });
    const view = record(f, room.id, 'editor');
    assert.equal(view.installed, true); assert.equal(view.status, 'live');
    assert.equal(view.attendees, 2);
    assert.equal(view.hours.length >= 1, true);
    assert.equal(view.hours.at(-1).people, 2);
    assert.equal(JSON.stringify(view).includes('viewer'), false, 'the record carries counts, never identities');
    assert.equal(record(f, room.id, 'owner').attendees, 2, 'a workspace administrator may read it');
    assert.throws(() => record(f, room.id, 'viewer'), /host or a workspace administrator/);
    assert.throws(() => record(f, room.id, 'editor', 'ws2'));
});

test('the attendance migration is locked, replays cleanly and keeps history on rollback', () => {
    const f = classroomFixture(); const migration = f.migration(ATTENDANCE);
    migration.up(); migration.up();
    const collection = f.collections.classroom_attendance;
    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(collection[rule], null);
    migration.down();
    assert.ok(f.collections.classroom_attendance, 'rollback keeps recorded attendance');
    f.collections.classroom_attendance.listRule = '';
    assert.throws(() => migration.down(), /Review custom classroom_attendance.listRule/);
    assert.throws(() => migration.up(), /Review custom classroom_attendance.listRule/);
});

test('attendance reapply accepts equivalent native index DDL without changing events', () => {
    const f = classroomFixture(), migration = f.migration(ATTENDANCE);
    migration.up();
    const room = f.create(); f.command('room.start', { id: room.id });
    const before = plain(f.data.classroom_attendance);
    f.collections.classroom_attendance.indexes = [
        '  CREATE INDEX `idx_classroom_attendance` ON `classroom_attendance` ( `workspace` , `room` , `at` , `id` )  ',
    ];
    migration.up(); migration.down(); migration.up();
    assert.deepEqual(plain(f.data.classroom_attendance), before);
});

test('attendance index normalization still rejects changed index structure and field contracts', () => {
    for (const change of [
        (index) => index.replace('create index', 'create unique index'),
        (index) => index.replace('idx_classroom_attendance', 'idx_other_attendance'),
        (index) => index.replace('on classroom_attendance', 'on classroom_members'),
        (index) => index.replace('(workspace, room, at, id)', '(room, workspace, at, id)'),
        (index) => index.replace('(workspace, room, at, id)', '(workspace, room, at desc, id)'),
        (index) => index + ' where event = "join"',
    ]) {
        const f = classroomFixture(), migration = f.migration(ATTENDANCE);
        migration.up();
        f.collections.classroom_attendance.indexes[0] = change(f.collections.classroom_attendance.indexes[0]);
        assert.throws(() => migration.up(), /indexes/);
    }
    const f = classroomFixture(), migration = f.migration(ATTENDANCE);
    migration.up();
    f.collections.classroom_attendance.fields.getByName('room').collectionId = 'foreign';
    assert.throws(() => migration.up(), /custom classroom_attendance.room/);
});
