// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/guild-classes.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     tests/upgrade/classroom-fixture.mjs, tests/upgrade/admin-fixture.mjs, apps/pocketbase/pb_hooks/guild-classes.js, apps/pocketbase/pb_hooks/guild-classes.pb.js, apps/pocketbase/pb_hooks/guild-rota.js, apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/guild-lessons.js, apps/pocketbase/pb_migrations/1792500000_guild_class_schedule.js, apps/pocketbase/pb_migrations/1792400002_guild_lessons.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/classroom-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/guild-classes.js; VALIDATES apps/pocketbase/pb_hooks/guild-classes.pb.js; VALIDATES apps/pocketbase/pb_migrations/1792500000_guild_class_schedule.js; CONSUMES apps/pocketbase/pb_hooks/guild-rota.js; CONSUMES apps/pocketbase/pb_hooks/classrooms.js; CONSUMES apps/pocketbase/pb_hooks/guild-lessons.js
// Intent:      Prove the guild class rota cron writes nothing unless configured, schedules only seated editor hosts once, and that members read the schedule.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vm from 'node:vm';
import { classroomFixture } from './classroom-fixture.mjs';
import { plain, source } from './admin-fixture.mjs';

const denied = (operation, status = 403) => assert.throws(operation, (error) => error.status === status);
const PUBLICATIONS = 'apps/pocketbase/pb_migrations/1792400000_guild_publications.js';
const LESSONS = 'apps/pocketbase/pb_migrations/1792400002_guild_lessons.js';
const SCHEDULE = 'apps/pocketbase/pb_migrations/1792500000_guild_class_schedule.js';
const GLOBAL = 'apps/pocketbase/pb_migrations/1792000000_classroom_global_and_access.js';
const VARIABLE = 'BUILDANDDO_GUILD_CLASS_WORKSPACE';
const ORDER = ['forge', 'scholar', 'oracle', 'alex', 'sterling', 'muse', 'quill', 'director'];
const NAMES = { forge: 'Forge', scholar: 'Scholar', oracle: 'Oracle', alex: 'Alex', sterling: 'Sterling', muse: 'Muse', quill: 'Quill', director: 'Director Nexus' };
// Wednesday of 2026-W45: the coming week is 2026-W46 (rota index 1).
const NOW = new Date('2026-11-04T10:00:00Z');
const COMING = Date.UTC(2026, 10, 9);
const material = { schema_version: 1, sections: [{ heading: 'Build one thing', paragraphs: ['Choose one bounded step and record it.'] }] };
const runtime = (env) => ({ $os: { getenv: (name) => env[name] ?? '' },
    $security: { sha256: (value) => createHash('sha256').update(String(value)).digest('hex') } });

function classFixture({ schedule = true, lessons = true, editors = ['forge', 'oracle', 'director'], env = {} } = {}) {
    const f = classroomFixture({ runtime: runtime(env) });
    f.migration(PUBLICATIONS).up();
    if (lessons) f.migration(LESSONS).up();
    if (schedule) f.migration(SCHEDULE).up();
    // Every guildmaster seat exists, shaped as the seat migrations create it; only `editors` are members of ws1.
    for (const seat of ORDER) f.seed('users', { id: `${seat}seat`, name: `OCN seat: ${seat}`, email: `${seat}@ocn.buildanddo.invalid`, verified: true, ocn_seat: true });
    for (const seat of editors) f.seed('workspace_members', { id: `${seat}seatmember`, workspace: 'ws1', user: `${seat}seat`, role: 'editor' });
    const logs = [];
    f.app.logger = () => ({ info: (...args) => logs.push(['info', ...args]), warn: (...args) => logs.push(['warn', ...args]) });
    f.app.findAuthRecordByEmail = (collection, email) => {
        assert.equal(collection, 'users');
        const row = f.data.users.find((user) => user.email === email);
        if (!row) throw new Error('sql: no rows in result set');
        return f.app.findRecordById('users', row.id);
    };
    const service = f.load('guild-classes.js');
    return Object.assign(f, {
        env, logs, rota: f.load('guild-rota.js'),
        run: (now = NOW) => plain(service.schedule(f.app, now)),
        guildClasses: (actor = 'viewer', query = { week: '2026-W46' }, workspace = 'ws1') => plain(service.list(f.event(actor, {}, { workspace, query }))),
        rows: () => f.data.guild_classes || [],
        rooms: () => f.data.classroom_rooms,
    });
}
const plan = (f) => plain(f.rota.week(COMING));
const notEditor = (f, seats) => plan(f).classes.filter((item) => seats.includes(item.host)).map((item) => ({ seat: item.host, reason: 'not a workspace editor' }));

test('unset, the cron is disabled, writes nothing and logs nothing', () => {
    const f = classFixture();
    const before = plain(f.data);
    assert.deepEqual(f.run(), { state: 'disabled', workspace: '', week: '2026-W46', created: 0, existing: 0, skipped: [] });
    assert.deepEqual(f.data, before);
    assert.deepEqual(f.logs, []);
});

test('set to ws1, it schedules the coming week only for seats that are already editors, and records why the others were skipped', () => {
    const f = classFixture({ env: { [VARIABLE]: 'ws1' } });
    const members = plain(f.data.workspace_members);
    const result = f.run();
    assert.deepEqual(result, { state: 'scheduled', workspace: 'ws1', week: '2026-W46', created: 3, existing: 0,
        skipped: notEditor(f, ['scholar', 'alex', 'sterling', 'muse', 'quill']) });
    const expected = plan(f).classes.filter((item) => ['forge', 'oracle', 'director'].includes(item.host));
    assert.equal(f.rows().length, 3);
    assert.equal(f.rooms().length, 3);
    for (const item of expected) {
        const row = f.rows().find((candidate) => candidate.slot === item.slot);
        assert.deepEqual({ workspace: row.workspace, week: row.week, slot: row.slot, host: row.host, host_seat: row.host_seat,
            auditor: row.auditor, auditor_seat: row.auditor_seat, starts_at: row.starts_at }, {
            workspace: 'ws1', week: '2026-W46', slot: item.slot, host: `${item.host}seat`, host_seat: item.host,
            auditor: `${item.auditor}seat`, auditor_seat: item.auditor, starts_at: item.starts_at });
        const room = f.rooms().find((candidate) => candidate.id === row.room);
        assert.deepEqual({ ...room, id: undefined, created: undefined, updated: undefined }, {
            id: undefined, created: undefined, updated: undefined,
            workspace: 'ws1', host: `${item.host}seat`, host_name: NAMES[item.host],
            title: `${NAMES[item.host]} hosts the ${item.guild} guild class`,
            description: `Weekly guild class for 2026-W46. ${NAMES[item.auditor]} audits; the other guildmasters attend.`,
            tutorial: '', section: 0, status: 'scheduled', kind: 'class', starts_at: item.starts_at, revision: 1, protocol_version: 1, material: '' });
    }
    // Director Nexus hosts as its own seat; its starts_at comes from the rota, not from now.
    assert.ok(f.rows().some((row) => row.host_seat === 'director' && row.starts_at.startsWith('2026-11-1')));
    assert.deepEqual(f.logs, [['info', 'guild class rota scheduled', 'workspace', 'ws1', 'week', '2026-W46', 'created', 3, 'existing', 0, 'skipped', 5]]);
    // The cron never grants membership and never touches the other classroom records.
    assert.deepEqual(f.data.workspace_members, members);
    for (const name of ['classroom_members', 'classroom_messages', 'classroom_receipts']) assert.deepEqual(f.data[name] || [], []);
    assert.doesNotMatch(JSON.stringify([result, f.logs, f.rows(), f.rooms()]), /@|buildanddo\.invalid/);
});

test('reruns create nothing; granting one more seat editor role makes the next run create exactly its class', () => {
    const f = classFixture({ env: { [VARIABLE]: 'ws1' } });
    f.run();
    const before = plain(f.data);
    const again = f.run(new Date('2026-11-06T23:17:00Z'));
    assert.deepEqual([again.created, again.existing, again.skipped.length], [0, 3, 5]);
    assert.deepEqual(f.data, before);
    f.seed('workspace_members', { id: 'quillseatmember', workspace: 'ws1', user: 'quillseat', role: 'editor' });
    const granted = f.run();
    assert.deepEqual([granted.created, granted.existing], [1, 3]);
    assert.deepEqual(granted.skipped, notEditor(f, ['scholar', 'alex', 'sterling', 'muse']));
    assert.equal(f.rows().length, 4); assert.equal(f.rooms().length, 4);
    assert.equal(f.rows().filter((row) => row.host_seat === 'quill').length, 1);
    assert.equal(f.run().created, 0);
    // The following Monday the coming week moves on and is scheduled fresh, once.
    const next = f.run(new Date('2026-11-09T00:00:00Z'));
    assert.deepEqual([next.week, next.created, next.existing], ['2026-W47', 4, 0]);
    assert.deepEqual(new Set(f.rows().map((row) => row.week)), new Set(['2026-W46', '2026-W47']));
    assert.equal(f.rooms().length, 8);
});

test('only a recognised seat with editor or higher role hosts; owners and admins count, viewers, impostors and missing seats do not', () => {
    const f = classFixture({ editors: [], env: { [VARIABLE]: 'ws1' } });
    f.seed('workspace_members', { id: 'forgeseatmember', workspace: 'ws1', user: 'forgeseat', role: 'admin' });
    f.seed('workspace_members', { id: 'oracleseatmember', workspace: 'ws1', user: 'oracleseat', role: 'viewer' });
    f.seed('workspace_members', { id: 'alexseatmember', workspace: 'ws2', user: 'alexseat', role: 'editor' });
    f.seed('workspaces', { id: 'ws1', owner: 'directorseat', name: 'Workspace one' });
    f.seed('users', { id: 'museseat', name: 'Muse', email: 'muse@ocn.buildanddo.invalid', verified: false, ocn_seat: true });
    f.seed('users', { id: 'quillseat', name: 'Quill', email: 'quill@ocn.buildanddo.invalid', verified: true, ocn_seat: false });
    for (const seat of ['muse', 'quill']) f.seed('workspace_members', { id: `${seat}seatmember`, workspace: 'ws1', user: `${seat}seat`, role: 'editor' });
    // A person renamed "Scholar" with editor role is not the scholar seat, and the real seat account is gone.
    f.app.delete(f.app.findRecordById('users', 'scholarseat'));
    f.seed('users', { id: 'humanscholar', name: 'Scholar', email: 'scholar@example.test', verified: true });
    f.seed('workspace_members', { id: 'humanscholarmember', workspace: 'ws1', user: 'humanscholar', role: 'editor' });
    const result = f.run();
    const reasons = Object.fromEntries(result.skipped.map((item) => [item.seat, item.reason]));
    assert.deepEqual(reasons, { scholar: 'no seat account', oracle: 'not a workspace editor', alex: 'not a workspace editor',
        sterling: 'not a workspace editor', muse: 'not a guildmaster seat', quill: 'not a guildmaster seat' });
    assert.deepEqual(f.rows().map((row) => row.host_seat).sort(), ['director', 'forge']);
    // The auditor relation is set only for a recognised seat account; its seat is always recorded.
    for (const row of f.rows()) {
        const item = plan(f).classes[row.slot];
        assert.equal(row.auditor_seat, item.auditor);
        assert.equal(row.auditor, ['scholar', 'muse', 'quill'].includes(item.auditor) ? '' : `${item.auditor}seat`);
    }
    assert.equal(f.rooms().find((room) => room.host === 'humanscholar'), undefined);
});

test('a malformed or unknown workspace, or a missing or opened schema, writes nothing and logs a warning', () => {
    for (const value of ['../x', 'a b', ' ws1', 'ws1\n', 'x'.repeat(65), 'ws1;drop']) {
        const f = classFixture({ env: { [VARIABLE]: value } });
        const before = plain(f.data);
        assert.deepEqual(f.run(), { state: 'disabled', workspace: '', week: '2026-W46', created: 0, existing: 0, skipped: [] });
        assert.deepEqual(f.data, before);
        assert.equal(f.logs.length, 1); assert.equal(f.logs[0][0], 'warn');
        assert.match(f.logs[0][1], /not a record id/);
        assert.ok(!JSON.stringify(f.logs).includes(value), 'a malformed value is never echoed');
    }
    const unknown = classFixture({ env: { [VARIABLE]: 'nosuchworkspace' } });
    const before = plain(unknown.data);
    assert.equal(unknown.run().state, 'disabled');
    assert.deepEqual(unknown.data, before);
    assert.deepEqual(unknown.logs.map((line) => [line[0], line[1], line.at(-1)]), [['warn', 'guild class rota not scheduled: the workspace variable names no workspace', 'nosuchworkspace']]);
    const corrupt = [
        (f) => f.app.delete(f.collections.guild_classes),
        (f) => { f.collections.guild_classes.listRule = '@request.auth.id != ""'; },
        (f) => { f.collections.classroom_rooms.createRule = ''; },
        (f) => f.collections.classroom_rooms.fields.removeByName('kind'),
        (f) => f.collections.guild_classes.fields.removeByName('slot'),
    ];
    for (const change of [null, ...corrupt]) {
        const f = classFixture({ schedule: change !== null, env: { [VARIABLE]: 'ws1' } });
        if (change) change(f);
        const unchanged = plain(f.data);
        const result = f.run();
        assert.deepEqual([result.state, result.workspace, result.created, result.skipped], ['unavailable', 'ws1', 0, []]);
        assert.deepEqual(f.data, unchanged);
        assert.deepEqual(f.logs.map((line) => line[0]), ['warn']);
    }
});

test('a lost unique-index race rolls back that class\'s room and counts it as existing; another failure skips one slot and is retried next run', () => {
    const f = classFixture({ env: { [VARIABLE]: 'ws1' } });
    const first = plan(f).classes.find((item) => item.host === 'forge');
    const transact = f.app.runInTransaction, save = f.app.save;
    let mode = 'race';
    f.app.save = function (value) {
        if (mode && value.collection?.().name === 'guild_classes' && value.get('slot') === first.slot)
            throw new Error(mode === 'race' ? 'UNIQUE constraint failed: guild_classes.workspace, guild_classes.week, guild_classes.slot' : 'disk I/O error');
        return save.call(this, value);
    };
    // The concurrent run's row commits while this transaction rolls back.
    f.app.runInTransaction = function (callback) {
        try { return transact.call(this, callback); }
        catch (error) {
            if (mode === 'race') save.call(f.app, f.record('guild_classes', { id: 'otherrunrow001', workspace: 'ws1', week: '2026-W46', slot: first.slot,
                room: 'otherrunroom01', host: 'forgeseat', host_seat: 'forge', auditor: '', auditor_seat: first.auditor, starts_at: first.starts_at }));
            throw error;
        }
    };
    const raced = f.run();
    assert.deepEqual([raced.created, raced.existing, raced.skipped.length], [2, 1, 5]);
    assert.equal(f.rooms().filter((room) => room.host === 'forgeseat').length, 0, 'the losing room was rolled back');
    assert.equal(f.rows().length, 3);
    assert.deepEqual(f.logs.map((line) => line[0]), ['info']);
    // A failure that is not a lost race: the slot is skipped and logged, the others proceed, and the next run fills it.
    const g = classFixture({ env: { [VARIABLE]: 'ws1' } });
    const gSave = g.app.save;
    let failing = true;
    g.app.save = function (value) {
        if (failing && value.collection?.().name === 'guild_classes' && value.get('slot') === first.slot) throw new Error('disk I/O error');
        return gSave.call(this, value);
    };
    const partial = g.run();
    assert.deepEqual([partial.created, partial.existing], [2, 0]);
    assert.deepEqual(partial.skipped.find((item) => item.seat === 'forge'), { seat: 'forge', reason: 'could not be scheduled' });
    assert.equal(g.rooms().filter((room) => room.host === 'forgeseat').length, 0);
    assert.deepEqual(g.logs.map((line) => [line[0], line[1]]), [['warn', 'guild class rota slot failed'], ['info', 'guild class rota scheduled']]);
    assert.ok(g.logs[0].includes('disk I/O error'));
    failing = false;
    assert.deepEqual([g.run().created, g.rows().length, g.rooms().length], [1, 3, 3]);
    mode = null;
    // A storage fault while reading a seat's role is not a refusal: it is reported, never read as "not an editor".
    const h = classFixture({ env: { [VARIABLE]: 'ws1' } });
    const find = h.app.findRecordsByFilter;
    h.app.findRecordsByFilter = function (name, filter, sort, limit, offset, params = {}) {
        if (name === 'workspace_members' && params.user === 'oracleseat') throw new Error('database is locked');
        return find.call(this, name, filter, sort, limit, offset, params);
    };
    const faulted = h.run();
    assert.deepEqual(faulted.skipped.find((item) => item.seat === 'oracle'), { seat: 'oracle', reason: 'could not be scheduled' });
    assert.equal(faulted.created, 2);
    assert.ok(h.logs.some((line) => line[0] === 'warn' && line.includes('database is locked')));
});

test('optional room fields follow the installed schema: scope workspace with 1792000000, no material without guild lessons', () => {
    const f = classFixture({ env: { [VARIABLE]: 'ws1' } });
    f.migration(GLOBAL).up();
    f.run();
    assert.ok(f.rooms().length && f.rooms().every((room) => room.scope === 'workspace' && room.material === '' && room.workspace === 'ws1'));
    // Global classes, access and audits belong to CLASSROOM-GLOBAL-001: the rota writes none of them.
    assert.deepEqual([f.data.classroom_access, f.data.classroom_audit], [[], []]);
    const g = classFixture({ lessons: false, env: { [VARIABLE]: 'ws1' } });
    g.run();
    assert.ok(g.rooms().length === 3 && g.rooms().every((room) => !Object.hasOwn(room, 'material') && !Object.hasOwn(room, 'scope')));
});

test('a scheduled guild class starts only after its host shares material, and only its host or an admin may start it', () => {
    const f = classFixture({ env: { [VARIABLE]: 'ws1' } });
    f.run();
    const room = f.rows().find((row) => row.host_seat === 'forge').room;
    denied(() => f.command('room.start', { id: room }, { actor: 'forgeseat' }), 400);
    const lessons = f.load('guild-lessons.js');
    const saved = plain(lessons.command(f.event('forgeseat', { action: 'lesson.save', revision: 0, request_key: 'guild_class_lesson_save_1',
        payload: { id: '', title: 'Build one thing', summary: 'This week\'s builder class.', lesson: material } })));
    lessons.command(f.event('forgeseat', { action: 'lesson.publish', revision: 1, request_key: 'guild_class_lesson_publish', payload: { id: saved.id } }));
    denied(() => f.command('room.material', { id: room, material: saved.id, section: 0 }, { actor: 'directorseat' }));
    f.command('room.material', { id: room, material: saved.id, section: 0 }, { actor: 'forgeseat' });
    for (const actor of ['editor', 'directorseat', 'viewer']) denied(() => f.command('room.start', { id: room }, { actor }));
    f.command('room.start', { id: room }, { actor: 'forgeseat' });
    f.command('room.join', { id: room }, { actor: 'oracleseat' });
    f.command('room.join', { id: room }, { actor: 'viewer' });
    const view = f.detail(room, 'viewer');
    assert.deepEqual([view.room.status, view.room.host_name, view.room.kind, view.lesson.source], ['live', 'Forge', 'class', 'guild_lesson']);
    assert.deepEqual(view.participants.map((item) => item.is_host).sort(), [false, false, true]);
    assert.equal(f.guildClasses('viewer').scheduled.find((item) => item.room === room).room_status, 'live');
    // Another guildmaster's class: an admin may start it once material is shared.
    const other = f.rows().find((row) => row.host_seat === 'oracle').room;
    f.command('room.material', { id: other, material: saved.id, section: 0 }, { actor: 'admin' });
    f.command('room.start', { id: other }, { actor: 'admin' });
    assert.equal(f.rooms().find((row) => row.id === other).status, 'live');
});

test('members read the week\'s rota and schedule with personas only; outsiders are refused and bad weeks are 400', () => {
    const f = classFixture({ env: { [VARIABLE]: 'ws1' } });
    f.run();
    const expected = plan(f);
    for (const actor of ['viewer', 'editor', 'admin', 'owner', 'forgeseat']) {
        const result = f.guildClasses(actor);
        assert.deepEqual(Object.keys(result), ['workspace', 'week', 'rota', 'scheduled']);
        assert.deepEqual([result.workspace, result.week, result.rota], ['ws1', '2026-W46', expected.classes]);
        assert.deepEqual(result.scheduled, f.rows().map((row) => ({ slot: row.slot, room: row.room, room_status: 'scheduled',
            host_persona: row.host_seat === 'director' ? 'director-nexus' : row.host_seat, auditor_persona: row.auditor_seat === 'director' ? 'director-nexus' : row.auditor_seat,
            starts_at: row.starts_at })).sort((a, b) => a.slot - b.slot));
        assert.doesNotMatch(JSON.stringify(result), /@|buildanddo\.invalid|seat"/);
    }
    denied(() => f.guildClasses('outsider'));
    denied(() => f.guildClasses('viewer', { week: '2026-W46' }, 'ws2'));
    const earlier = f.guildClasses('viewer', { week: '2026-W45' });
    assert.deepEqual([earlier.week, earlier.scheduled, earlier.rota], ['2026-W45', [], plain(f.rota.week(Date.UTC(2026, 10, 2))).classes]);
    for (const week of ['2026-W54', '2026-w46', 'x', '2026-W46 ']) denied(() => f.guildClasses('viewer', { week }), 400);
    // With no week, the coming week by the server clock.
    const labels = [f.rota.weekLabel(f.rota.mondayOf(Date.now()) + f.rota.WEEK)];
    const fallback = f.guildClasses('viewer', {});
    labels.push(f.rota.weekLabel(f.rota.mondayOf(Date.now()) + f.rota.WEEK));
    assert.ok(labels.includes(fallback.week));
    const missing = classFixture({ schedule: false });
    denied(() => missing.guildClasses('viewer'), 503);
});

test('the guild class migration is locked, idempotent, validates what exists and refuses rollback while rows exist', () => {
    const f = classFixture();
    const collection = plain(f.collections.guild_classes);
    for (const key of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(collection[key], null);
    const field = (name) => plain(f.collections.guild_classes.fields.getByName(name));
    assert.deepEqual(field('slot'), { name: 'slot', type: 'number', onlyInt: true, min: 0, max: 7, required: false });
    assert.deepEqual(field('room'), { name: 'room', type: 'relation', collectionId: f.collections.classroom_rooms.id, required: true, cascadeDelete: true, maxSelect: 1 });
    assert.deepEqual(field('host'), { name: 'host', type: 'relation', collectionId: '_pb_users_auth_', required: true, cascadeDelete: false, maxSelect: 1 });
    assert.deepEqual(field('auditor'), { name: 'auditor', type: 'relation', collectionId: '_pb_users_auth_', required: false, cascadeDelete: false, maxSelect: 1 });
    assert.deepEqual(field('workspace').cascadeDelete, true);
    assert.deepEqual(['week', 'host_seat', 'auditor_seat'].map((name) => [field(name).max, field(name).required]), [[10, true], [32, true], [32, true]]);
    assert.deepEqual(field('starts_at'), { name: 'starts_at', type: 'date', required: true });
    assert.deepEqual(collection.indexes, ['create unique index idx_guild_classes_slot on guild_classes (workspace, week, slot)',
        'create index idx_guild_classes_start on guild_classes (workspace, starts_at)']);
    f.migration(SCHEDULE).up();
    assert.deepEqual(plain(f.collections.guild_classes), collection);
    for (const corrupt of [(g) => { g.collections.guild_classes.createRule = ''; }, (g) => { g.collections.guild_classes.fields.getByName('slot').max = 8; },
        (g) => { g.collections.guild_classes.fields.getByName('room').cascadeDelete = false; }, (g) => { g.collections.guild_classes.indexes = []; },
        (g) => { g.collections.guild_classes.indexes = ['create index idx_guild_classes_slot on guild_classes (workspace, week, slot)', collection.indexes[1]]; },
        (g) => { g.collections.guild_classes.type = 'view'; }, (g) => g.collections.guild_classes.fields.removeByName('auditor_seat')]) {
        const g = classFixture(); corrupt(g);
        const before = plain(g.collections.guild_classes);
        assert.throws(g.migration(SCHEDULE).up, /Review/);
        assert.deepEqual(plain(g.collections.guild_classes), before);
    }
    const used = classFixture({ env: { [VARIABLE]: 'ws1' } });
    used.run();
    assert.throws(used.migration(SCHEDULE).down, /guild_classes before rollback/);
    assert.equal(used.rows().length, 3);
    const opened = classFixture();
    opened.collections.guild_classes.viewRule = '';
    assert.throws(opened.migration(SCHEDULE).down, /guild_classes\.viewRule before rollback/);
    const empty = classFixture();
    empty.migration(SCHEDULE).down(); empty.migration(SCHEDULE).down();
    assert.equal(empty.collections.guild_classes, undefined);
    const bare = classFixture({ schedule: false });
    bare.app.delete(bare.collections.classroom_rooms);
    assert.throws(bare.migration(SCHEDULE).up, /needs classroom_rooms/);
});

test('the cron is registered hourly as guild_class_rota, its callback runs in an isolated VM, and the read route is authenticated and uncached', () => {
    const crons = [], routes = [];
    vm.runInNewContext(source('apps/pocketbase/pb_hooks/guild-classes.pb.js'), {
        __hooks: '/hooks', cronAdd: (id, expression, handler) => crons.push({ id, expression, handler }),
        routerAdd: (method, path, handler, ...middleware) => routes.push({ method, path, handler, middleware }),
        $apis: { requireAuth: (...collections) => ({ auth: collections }) },
        require: () => { throw new Error('a registration must not load the module'); },
    });
    assert.deepEqual(crons.map((cron) => [cron.id, cron.expression]), [['guild_class_rota', '17 * * * *']]);
    assert.equal(crons[0].expression.split(' ').length, 5);
    // Extract the callback and compile it with only the JSVM globals it may use; a closure over
    // registration-time state would fail here.
    const isolated = (globals) => vm.runInNewContext('(' + crons[0].handler.toString() + ')', globals);
    const warnings = [], calls = [];
    const fakeApp = { logger: () => ({ warn: (...args) => warnings.push(args) }) };
    isolated({ __hooks: '/hooks', $app: fakeApp, require: (path) => ({ schedule: (app, now) => calls.push([path, app, Object.prototype.toString.call(now), now.getTime()]) }) })();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].slice(0, 3), ['/hooks/guild-classes.js', fakeApp, '[object Date]']);
    assert.ok(Math.abs(calls[0][3] - Date.now()) < 60000);
    assert.doesNotThrow(isolated({ __hooks: '/hooks', $app: fakeApp, require: () => ({ schedule: () => { throw new Error('y'.repeat(500)); } }) }));
    assert.deepEqual(warnings, [['guild class rota failed', 'error', 'y'.repeat(200)]]);
    // End to end through the real module: unset does nothing, set schedules the coming week by the clock.
    const f = classFixture();
    const real = isolated({ __hooks: '/hooks', $app: f.app, require: (path) => f.load(path.replace('/hooks/', '')) });
    const before = plain(f.data);
    real();
    assert.deepEqual(f.data, before);
    f.env[VARIABLE] = 'ws1';
    real();
    assert.equal(f.rows().length, 3);
    assert.ok(f.rows().every((row) => Date.parse(row.starts_at) > Date.now()));
    real();
    assert.equal(f.rows().length, 3);
    assert.deepEqual(routes.map((route) => `${route.method} ${route.path}`), ['GET /api/buildanddo/workspaces/{workspace}/guild-classes']);
    assert.deepEqual(plain(routes[0].middleware), [{ auth: ['users'] }]);
    const headers = {};
    vm.runInNewContext('(' + routes[0].handler.toString() + ')', { __hooks: '/hooks', require: () => ({ list: () => ({ ok: true }) }) })({
        response: { header: () => ({ set: (name, value) => { headers[name] = value; } }) }, json: (status, body) => ({ status, body }) });
    assert.equal(headers['Cache-Control'], 'no-store');
});

test('the workspace variable is declared by name with an empty default, and staging is untouched', () => {
    assert.match(source('.env.example'), /^# Workspace id the weekly guild class rota schedules into\. Empty disables it\.\nBUILDANDDO_GUILD_CLASS_WORKSPACE=$/m);
    assert.match(source('docker-compose.yml'), /^ {6}BUILDANDDO_GUILD_CLASS_WORKSPACE: \$\{BUILDANDDO_GUILD_CLASS_WORKSPACE:-\}$/m);
    assert.doesNotMatch(source('docker-compose.staging.yml'), /BUILDANDDO_GUILD_CLASS_WORKSPACE/);
    const module = source('apps/pocketbase/pb_hooks/guild-classes.js');
    assert.equal((module.match(/\$os\.getenv\(/g) || []).length, 1);
    assert.match(module, /const VARIABLE = 'BUILDANDDO_GUILD_CLASS_WORKSPACE';/);
    for (const name of ['guild-classes.js', 'guild-classes.pb.js', 'guild-rota.js'])
        // Membership is only read, through workspace-access; global access and audit rows are another SRS's.
        assert.doesNotMatch(source(`apps/pocketbase/pb_hooks/${name}`), /SEAT_PERSONAS|'workspace_members'|'classroom_access'|'classroom_audit'/);
});
