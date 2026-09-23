// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/classroom-presence.test.mjs
// Stage:       08_TEST
// SRS:         SRS-CN-PERSONA-RUNTIME-001, SRS-BUILDANDDO-PRESENCE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    C-ONE-20260918-PERSONA-RUNTIME-001, VCC-BUILDANDDO-PRESENCE-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     tests/upgrade/admin-fixture.mjs, tests/upgrade/classroom-fixture.mjs, apps/pocketbase/pb_hooks/classroom-presence.pb.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/classroom-fixture.mjs;
//              VALIDATES apps/pocketbase/pb_hooks/classroom-presence.pb.js;
//              VALIDATES apps/pocketbase/pb_migrations/1790600000_classroom_presence.js
// DAG Node:    none
// Intent:      Run both presence handlers against the repository's PocketBase App double so an App method that does not exist fails here rather than on staging.
// ───────────────────────────────────────────────────────────────
//
// WHY THIS FILE EXISTS
//   The server half of the classroom advertisement shipped with `node --check` and
//   `grep -L onServe` as its only verification. Both pass on a file that parses,
//   and the file that parsed called app.findRecordByFilter - not a PocketBase JSVM
//   method - so every POST and GET raised TypeError on the first request while the
//   lane reported green. The App double in admin-fixture.mjs implements exactly the
//   real method set (findCollectionByNameOrId, findRecordById, findRecordsByFilter,
//   save, delete) and would have thrown on the first call, so the handlers are run
//   against it here.
//
// OFFLINE
//   Nothing in this file opens a socket. The write path never calls the SFU. Since
//   d91a5f9 the read path asks the SFU, through the shared lib, which tracks each
//   session really holds. By default no realtime app is configured and $http is not
//   provided at all, so every echo answers SFU_UNREACHABLE, and a call that tried
//   the network would fail with ReferenceError rather than silently reaching it.
//   The echo tests pass obviously fake credentials and an in-memory $http.send that
//   answers the SFU's session read from a table (SRS-BUILDANDDO-PRESENCE-001). The
//   publish allowlist and those credentials are read from an injected $os.getenv,
//   never from the real environment, and no credential NAME is read from the process.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { plain, root, source } from './admin-fixture.mjs';
import { classroomFixture } from './classroom-fixture.mjs';

const MIGRATION = 'apps/pocketbase/pb_migrations/1790600000_classroom_presence.js';
const HOOK = 'apps/pocketbase/pb_hooks/classroom-presence.pb.js';
const LIB = 'apps/pocketbase/pb_hooks/classroom-realtime-lib.js';

/** Builds a fixture with the presence collection migrated and both handlers loaded. */
function presenceFixture({ publishers = 'owner,viewer', migrated = true, http } = {}) {
    const f = classroomFixture();
    const logs = [];
    f.app.logger = () => ({
        info: (...args) => logs.push(['info', ...args.map(String)]),
        warn: (...args) => logs.push(['warn', ...args.map(String)]),
        error: (...args) => logs.push(['error', ...args.map(String)]),
    });
    if (migrated) f.migration(MIGRATION).up();

    const env = { BUILDANDDO_CLASSROOM_PUBLISHERS: publishers };
    const routes = new Map();
    const modules = new Map();
    const globals = {
        __hooks: '/hooks',
        Date, JSON, Object, Number, String, Array, Set, Map, RegExp, Error, console,
        Record: f.record ? undefined : undefined,
        $os: { getenv: (name) => env[name] || '' },
        $apis: { requireAuth: (name) => ({ auth: name }), bodyLimit: (max) => ({ max }) },
        routerAdd: (method, path, callback, auth, limit) => routes.set(`${method} ${path}`, { callback, auth, limit }),
    };
    // Only the echo tests pass a stand-in; by default a handler that reached for the network would throw.
    if (http) globals.$http = http;
    // The double's Record class, reached through the fixture, so `new Record(...)`
    // inside the handler produces a record the double's save() understands.
    globals.Record = function RecordShim(collection, values) { return f.record(collection.name, values || {}); };
    const load = (name) => {
        if (modules.has(name)) return modules.get(name);
        const module = { exports: {} };
        vm.runInNewContext(source(`apps/pocketbase/pb_hooks/${name}`),
            { ...globals, module, require: (target) => load(target.split('/').at(-1)) },
            { filename: name });
        modules.set(name, module.exports);
        return module.exports;
    };
    globals.require = (target) => load(target.split('/').at(-1));
    vm.runInNewContext(source(HOOK), globals, { filename: HOOK });

    const headers = new Map();
    const request = (method, path, { actor = 'owner', body = {}, query = {} } = {}) => {
        const entry = routes.get(`${method} ${path}`);
        assert.ok(entry, `route ${method} ${path} is not registered`);
        const auth = actor ? f.app.findRecordById('users', actor) : null;
        const event = {
            app: f.app,
            auth,
            requestInfo: () => ({ body: plain(body), query, auth }),
            response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
            json: (status, value) => ({ status, body: plain(value) }),
        };
        return entry.callback(event);
    };
    return { ...f, routes, request, headers, logs, env, setPublishers: (value) => { env.BUILDANDDO_CLASSROOM_PUBLISHERS = value; } };
}

/** A room owned by `owner`, with `viewer` enrolled as a member. */
function seedRoom(f) {
    const room = f.create();
    const id = room.room ? room.room.id : room.id;
    f.seed('classroom_members', { id: 'member-viewer', workspace: 'ws1', room: id, owner: 'viewer', name: 'Vi', active: true });
    return id;
}

const future = (ms = 30000) => new Date(Date.now() + ms).toISOString();

test('both handlers use App methods that actually exist on the PocketBase JSVM', () => {
    // The regression this file was written for. The double implements the real
    // method set and nothing else; a call to findRecordByFilter is a TypeError
    // here exactly as it is on staging.
    // Comments are stripped first: the header names the defect on purpose, and a
    // grep that cannot tell a warning from a call is the kind of check that let
    // this ship.
    const text = source(HOOK).split(/\r?\n/).filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.equal(/\bfindRecordByFilter\b/.test(text), false,
        'findRecordByFilter is not a PocketBase JSVM method; use findRecordById or findFirstRecordByFilter');
    assert.equal(/\bonServe\b/.test(text), false, 'PocketBase 0.39.8 has no onServe');

    const f = presenceFixture();
    const room = seedRoom(f);
    // A call on each handler, which is what a parse check could never do.
    const wrote = f.request('POST', '/api/classroom/presence', {
        actor: 'owner',
        body: { room, session_id: 'sess-1', tracks: [{ trackName: 'seat:o/mic', kind: 'audio' }], expires_at: future() },
    });
    assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    const read = f.request('GET', '/api/classroom/presence', { actor: 'owner', query: { room } });
    assert.equal(read.status, 200);
    assert.equal(read.body.items.length, 1);
});

test('the publish allowlist is the write authority and an empty allowlist refuses everyone', () => {
    const f = presenceFixture({ publishers: '' });
    const room = seedRoom(f);
    const denied = f.request('POST', '/api/classroom/presence', {
        actor: 'owner',
        body: { room, session_id: 's1', tracks: [{ trackName: 't', kind: 'audio' }], expires_at: future() },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.message, 'presence_publish_not_authorized');
    assert.equal(f.data.classroom_presence.length, 0);
});

test('no seat label is returned, logged or stored - it is the caller email on this estate', () => {
    const f = presenceFixture({ publishers: '' });
    const room = seedRoom(f);
    f.seed('users', { id: 'teacher', email: 'teacher@example.com', name: 'Ada' });
    const denied = f.request('POST', '/api/classroom/presence', {
        actor: 'teacher',
        body: { room, session_id: 's1', tracks: [{ trackName: 't', kind: 'audio' }], expires_at: future() },
    });
    assert.equal(denied.status, 403);
    assert.equal(JSON.stringify(denied.body).includes('teacher@example.com'), false,
        'the refusal body must not echo the caller seat, which is an email address');
    assert.equal(JSON.stringify(f.logs).includes('teacher@example.com'), false,
        'the log line must not carry the caller seat');

    f.setPublishers('teacher@example.com');
    const wrote = f.request('POST', '/api/classroom/presence', {
        actor: 'teacher',
        body: { room, session_id: 's1', tracks: [{ trackName: 't', kind: 'audio' }], expires_at: future() },
    });
    assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    const stored = JSON.stringify(f.data.classroom_presence);
    assert.equal(stored.includes('teacher@example.com'), false, 'no row may persist the caller seat');
    assert.equal(f.data.classroom_presence[0].publisher, 'teacher');
    assert.equal(Object.prototype.hasOwnProperty.call(f.data.classroom_presence[0], 'seat'), false);
});

test('a row must carry a bounded, future expires_at', () => {
    const f = presenceFixture();
    const room = seedRoom(f);
    const write = (body) => f.request('POST', '/api/classroom/presence', { actor: 'owner', body });
    const base = { room, session_id: 's1', tracks: [{ trackName: 't', kind: 'audio' }] };

    assert.equal(write({ ...base }).body.reason, 'expires_at required');
    assert.equal(write({ ...base, expires_at: 'not a date' }).body.reason, 'expires_at required');
    assert.equal(write({ ...base, expires_at: new Date(Date.now() - 1000).toISOString() }).body.reason,
        'expires_at is already past');
    assert.equal(write({ ...base, expires_at: future(600000) }).body.reason, 'expires_at exceeds the bounded TTL');
    assert.equal(write({ ...base, expires_at: future() }).status, 200);
    assert.equal(f.data.classroom_presence.length, 1);
});

test('an advertisement with no tracks is refused rather than stored', () => {
    const f = presenceFixture();
    const room = seedRoom(f);
    const write = (tracks) => f.request('POST', '/api/classroom/presence',
        { actor: 'owner', body: { room, session_id: 's1', tracks, expires_at: future() } });
    assert.equal(write([]).status, 400);
    assert.equal(write('nope').status, 400);
    assert.equal(write(new Array(9).fill({ trackName: 't', kind: 'audio' })).status, 400);
    assert.equal(write([{ trackName: 't', kind: 'hologram' }]).body.reason,
        'each track needs a trackName and kind audio|video');
    assert.equal(f.data.classroom_presence.length, 0);
});

test('the Python runtime spelling is accepted: context, bare track strings, gm:forge', () => {
    // services/persona_runtime/presence.py emits ALLOWED_KEYS, which carries
    // `context` and not `room`, sends tracks as a list of strings, and spells the
    // persona gm:forge. Without this translation LANE-D's ClassroomSink cannot be
    // written against this route at all.
    const f = presenceFixture({ publishers: 'forge@citadel-nexus.com' });
    const room = seedRoom(f);
    f.seed('users', { id: 'forge', email: 'forge@citadel-nexus.com', name: 'Forge' });
    const wrote = f.request('POST', '/api/classroom/presence', {
        actor: 'forge',
        body: {
            context: `classroom:${room}`,
            session_id: 'sess-forge',
            tracks: ['gm:forge/voice'],
            persona_id: 'gm:forge',
            expires_at: future(),
        },
    });
    assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    const row = f.data.classroom_presence[0];
    assert.equal(row.room, room);
    assert.equal(row.persona_id, 'gm-forge', 'gm:forge and gm-forge must store as one spelling');
    assert.equal(row.role, 'guildmaster', 'a persona row defaults to guildmaster with no role in the body');
    assert.deepEqual(row.tracks, [{ trackName: 'gm:forge/voice', kind: 'audio' }]);
});

test('an allowlisted publisher may write into a room it is not enrolled in, and the basis is recorded', () => {
    // Plan step 7 provisions Forge as an allowlisted publisher and a PocketBase
    // user. It does NOT enrol him as a classroom member, so a membership check on
    // the write path made the persona's first advertisement a 403.
    const f = presenceFixture({ publishers: 'forge@citadel-nexus.com' });
    const room = seedRoom(f);
    f.seed('users', { id: 'forge', email: 'forge@citadel-nexus.com', name: 'Forge' });
    const wrote = f.request('POST', '/api/classroom/presence', {
        actor: 'forge',
        body: { room, session_id: 'sess-forge', tracks: ['gm:forge/voice'], persona_id: 'gm:forge', expires_at: future() },
    });
    assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    assert.equal(wrote.body.access_basis, 'publisher_grant');
    assert.equal(f.data.classroom_presence[0].access_basis, 'publisher_grant');

    // The host writes as the host, and a member writes as a member.
    f.setPublishers('forge@citadel-nexus.com,owner,viewer');
    const byHost = f.request('POST', '/api/classroom/presence', {
        actor: 'owner', body: { room, session_id: 'sess-host', tracks: ['a'], expires_at: future() },
    });
    assert.equal(byHost.body.access_basis, 'host');
    const byMember = f.request('POST', '/api/classroom/presence', {
        actor: 'viewer', body: { room, session_id: 'sess-member', tracks: ['b'], expires_at: future() },
    });
    assert.equal(byMember.body.access_basis, 'member');
});

test('READING a room still requires host or membership; the allowlist does not grant it', () => {
    const f = presenceFixture({ publishers: 'forge@citadel-nexus.com' });
    const room = seedRoom(f);
    f.seed('users', { id: 'forge', email: 'forge@citadel-nexus.com', name: 'Forge' });
    f.request('POST', '/api/classroom/presence', {
        actor: 'forge', body: { room, session_id: 'sess-forge', tracks: ['gm:forge/voice'], persona_id: 'gm:forge', expires_at: future() },
    });
    // Forge may write but may NOT enumerate the room.
    assert.equal(f.request('GET', '/api/classroom/presence', { actor: 'forge', query: { room } }).status, 403);
    assert.equal(f.request('GET', '/api/classroom/presence', { actor: 'outsider', query: { room } }).status, 403);
    assert.equal(f.request('GET', '/api/classroom/presence', { actor: 'viewer', query: { room } }).status, 200);
    assert.equal(f.request('GET', '/api/classroom/presence', { actor: 'owner', query: { room } }).status, 200);
    assert.equal(f.request('GET', '/api/classroom/presence', { actor: 'owner', query: { room: 'nope' } }).status, 404);
    assert.equal(f.request('GET', '/api/classroom/presence', { actor: 'owner', query: {} }).status, 400);
});

test('one publisher cannot rewrite another publisher row and redirect the class', () => {
    const f = presenceFixture({ publishers: 'owner,viewer' });
    const room = seedRoom(f);
    const mine = f.request('POST', '/api/classroom/presence', {
        actor: 'owner', body: { room, session_id: 'shared-session', tracks: ['seat:o/mic'], expires_at: future() },
    });
    assert.equal(mine.status, 200);
    const hijack = f.request('POST', '/api/classroom/presence', {
        actor: 'viewer', body: { room, session_id: 'shared-session', tracks: ['seat:evil/mic'], expires_at: future() },
    });
    assert.equal(hijack.status, 403);
    assert.equal(hijack.body.message, 'presence_row_not_yours');
    assert.deepEqual(f.data.classroom_presence[0].tracks, [{ trackName: 'seat:o/mic', kind: 'audio' }]);
});

test('a refreshed row is an upsert, not a second row', () => {
    const f = presenceFixture();
    const room = seedRoom(f);
    const write = () => f.request('POST', '/api/classroom/presence',
        { actor: 'owner', body: { room, session_id: 's1', tracks: ['seat:o/mic'], expires_at: future() } });
    assert.equal(write().status, 200);
    assert.equal(write().status, 200);
    assert.equal(write().status, 200);
    assert.equal(f.data.classroom_presence.length, 1);
});

test('the route never claims the advertisement was verified against the SFU', () => {
    const f = presenceFixture();
    const room = seedRoom(f);
    const wrote = f.request('POST', '/api/classroom/presence',
        { actor: 'owner', body: { room, session_id: 's1', tracks: ['seat:o/mic'], expires_at: future() } });
    // The write path does not wait on the SFU, so all it can say is that the advertisement is not echoed yet.
    assert.equal(wrote.body.verified, false);
    assert.equal(wrote.body.verification, 'NOT_YET_ECHOED');
    // The read path asks the SFU, and only ECHOED_BY_SFU is verified. With no realtime app configured it
    // cannot ask, and the answer names why.
    const read = f.request('GET', '/api/classroom/presence', { actor: 'owner', query: { room } });
    assert.equal(read.body.items[0].verified, false);
    assert.equal(read.body.items[0].verification, 'SFU_UNREACHABLE:CLOUDFLARE_REALTIME_APP_ID absent');
});

// THE ECHO, AGAINST AN IN-MEMORY STAND-IN FOR THE SFU
// Obviously fake credentials, and a $http.send that answers GET /apps/<app>/sessions/<id> from a table: for each
// session, either the tracks the SFU holds or an HTTP status it answers with instead. It records every request,
// and nothing opens a socket.
const FAKE_REALTIME = { CLOUDFLARE_REALTIME_APP_ID: 'fake-app-id', CLOUDFLARE_REALTIME_APP_SECRET: 'fake-app-key' };

function sfuStandIn(held) {
    const requests = [];
    const send = (request) => {
        requests.push(request);
        const [, , , app, kind, session] = new URL(request.url).pathname.split('/');
        const answer = app === FAKE_REALTIME.CLOUDFLARE_REALTIME_APP_ID && kind === 'sessions'
            ? held[decodeURIComponent(session)] : undefined;
        if (typeof answer === 'number') return { statusCode: answer, json: {} };
        if (!Array.isArray(answer)) return { statusCode: 404, json: {} };
        return { statusCode: 200, json: { tracks: answer } };
    };
    return { requests, send };
}

function echoRoom(held) {
    const sfu = sfuStandIn(held);
    const f = presenceFixture({ http: { send: sfu.send } });
    Object.assign(f.env, FAKE_REALTIME);
    return { f, sfu, room: seedRoom(f) };
}

const advertise = (f, room, session, tracks) => f.request('POST', '/api/classroom/presence',
    { actor: 'owner', body: { room, session_id: session, tracks, expires_at: future() } });

function echoOf(f, room, session) {
    const read = f.request('GET', '/api/classroom/presence', { actor: 'owner', query: { room } });
    assert.equal(read.status, 200, JSON.stringify(read.body));
    const row = read.body.items.find((item) => item.session_id === session);
    assert.ok(row, `no row for ${session}`);
    return [row.verified, row.verification];
}

test('a session whose every advertised track the SFU holds is verified, from one read without a body', () => {
    const { f, sfu, room } = echoRoom({ s1: [{ trackName: 'seat:o/mic', status: 'active' }, { trackName: 'seat:o/cam' }] });
    assert.equal(advertise(f, room, 's1', ['seat:o/mic', 'seat:o/cam']).status, 200);
    assert.deepEqual(echoOf(f, room, 's1'), [true, 'ECHOED_BY_SFU']);
    assert.equal(sfu.requests.length, 1);
    assert.equal(sfu.requests[0].method, 'GET');
    assert.equal(sfu.requests[0].body, undefined);
    assert.ok(sfu.requests[0].url.endsWith('/apps/fake-app-id/sessions/s1'), sfu.requests[0].url);
});

test('a session missing one advertised track is not verified, and the missing track is named', () => {
    const { f, room } = echoRoom({ s1: [{ trackName: 'seat:o/mic' }] });
    assert.equal(advertise(f, room, 's1', ['seat:o/mic', 'seat:o/cam']).status, 200);
    assert.deepEqual(echoOf(f, room, 's1'), [false, 'NOT_HELD_BY_SFU:seat:o/cam']);
});

test('a track the SFU reports inactive does not count as held', () => {
    const { f, room } = echoRoom({ s1: [{ trackName: 'seat:o/mic', status: 'inactive' }] });
    assert.equal(advertise(f, room, 's1', ['seat:o/mic']).status, 200);
    assert.deepEqual(echoOf(f, room, 's1'), [false, 'NOT_HELD_BY_SFU:seat:o/mic']);
});

test('a row that advertises no tracks is not verified', () => {
    // The route refuses an empty advertisement, so the row is written directly, as an older row could be.
    const { f, room } = echoRoom({ s1: [{ trackName: 'seat:o/mic' }] });
    f.seed('classroom_presence', {
        id: 'empty-row', workspace: 'ws1', room, publisher: 'owner', display_name: 'Empty', role: 'teacher',
        access_basis: 'host', session_id: 's1', tracks: [], state: 'LIVE', expires_at: future(),
    });
    assert.deepEqual(echoOf(f, room, 's1'), [false, 'NO_TRACKS_ADVERTISED']);
});

test('an SFU that answers 500 leaves the row unverified, with the status named', () => {
    const { f, room } = echoRoom({ s1: 500 });
    assert.equal(advertise(f, room, 's1', ['seat:o/mic']).status, 200);
    assert.deepEqual(echoOf(f, room, 's1'), [false, 'SFU_UNREACHABLE:sfu_http_500']);
});

test('an expired or ENDED row is not served, and an expired row is eventually collected', () => {
    const f = presenceFixture();
    const room = seedRoom(f);
    f.request('POST', '/api/classroom/presence',
        { actor: 'owner', body: { room, session_id: 'live-1', tracks: ['a'], expires_at: future() } });
    f.request('POST', '/api/classroom/presence',
        { actor: 'owner', body: { room, session_id: 'ended-1', tracks: ['b'], state: 'ENDED', expires_at: future() } });
    // A long-dead row, written directly because the route refuses a past stamp.
    f.seed('classroom_presence', {
        id: 'stale-row', workspace: 'ws1', room, publisher: 'owner', display_name: 'Old', role: 'teacher',
        access_basis: 'host', session_id: 'stale-1', tracks: [{ trackName: 'c', kind: 'audio' }], state: 'LIVE',
        expires_at: new Date(Date.now() - 3600000).toISOString(),
    });
    const read = f.request('GET', '/api/classroom/presence', { actor: 'owner', query: { room } });
    assert.deepEqual(read.body.items.map((row) => row.session_id), ['live-1']);

    // The next accepted write sweeps it: "ephemeral by construction" has to be a
    // claim about storage, not only about how a reader interprets a stamp.
    const swept = f.request('POST', '/api/classroom/presence',
        { actor: 'owner', body: { room, session_id: 'live-2', tracks: ['d'], expires_at: future() } });
    assert.equal(swept.body.swept, 1);
    assert.equal(f.data.classroom_presence.some((row) => row.id === 'stale-row'), false);
});

test('a row whose tracks will not parse is reported, not silently dropped', () => {
    const f = presenceFixture();
    const room = seedRoom(f);
    f.seed('classroom_presence', {
        id: 'broken-row', workspace: 'ws1', room, publisher: 'owner', display_name: 'Broken', role: 'teacher',
        access_basis: 'host', session_id: 'broken-1', tracks: '{not json', state: 'LIVE', expires_at: future(),
    });
    const read = f.request('GET', '/api/classroom/presence', { actor: 'owner', query: { room } });
    assert.equal(read.body.items.length, 1);
    assert.deepEqual(read.body.items[0].tracks, []);
    assert.equal(read.body.items[0].tracks_error, 'unparseable');
});

test('a save that fails is a named refusal, never an unnamed 500', () => {
    const f = presenceFixture();
    const room = seedRoom(f);
    const realSave = f.app.save.bind(f.app);
    f.app.save = (value) => {
        if (value && value.collection && value.collection().name === 'classroom_presence') {
            throw new Error('storage unavailable');
        }
        return realSave(value);
    };
    const out = f.request('POST', '/api/classroom/presence',
        { actor: 'owner', body: { room, session_id: 's1', tracks: ['a'], expires_at: future() } });
    assert.equal(out.status, 503);
    assert.equal(out.body.message, 'presence_not_stored');
    f.app.save = realSave;
});

test('an unknown room is a 404 and never leaks whether rows exist', () => {
    const f = presenceFixture();
    seedRoom(f);
    const out = f.request('POST', '/api/classroom/presence',
        { actor: 'owner', body: { room: 'no-such-room', session_id: 's1', tracks: ['a'], expires_at: future() } });
    assert.equal(out.status, 404);
    assert.equal(out.body.message, 'room_unknown');
});

test('the health route answers without a room, a credential or a publisher name', () => {
    const f = presenceFixture({ publishers: 'teacher@example.com,forge@citadel-nexus.com' });
    const out = f.request('GET', '/api/classroom/presence/health', { actor: null });
    assert.equal(out.status, 200);
    assert.equal(out.body.ok, true);
    assert.equal(out.body.collection_installed, true);
    assert.equal(out.body.publishers_configured, 2);
    assert.equal(JSON.stringify(out.body).includes('@'), false, 'the health route must not name a publisher');

    const missing = presenceFixture({ migrated: false });
    const down = missing.request('GET', '/api/classroom/presence/health', { actor: null });
    assert.equal(down.body.ok, false);
    assert.equal(down.body.collection_installed, false);
});

test('every write route requires authentication and bounds the body', () => {
    const f = presenceFixture();
    const post = f.routes.get('POST /api/classroom/presence');
    assert.deepEqual(plain(post.auth), { auth: 'users' });
    assert.ok(post.limit.max <= 30000);
    assert.deepEqual(plain(f.routes.get('GET /api/classroom/presence').auth), { auth: 'users' });
});

test('the migration is idempotent, refuses a hand-edited collection and rolls back', () => {
    const f = presenceFixture();
    const before = plain(f.data);
    // The index guard compares normalized DDL; PocketBase stores an index
    // backticked and re-spaced, so a raw string compare would throw here.
    f.collections.classroom_presence.indexes = f.collections.classroom_presence.indexes
        .map((index) => index.replace(/\bclassroom_presence\b/g, '`classroom_presence`').toUpperCase());
    f.migration(MIGRATION).up();
    assert.deepEqual(plain(f.data), before);

    f.collections.classroom_presence.indexes = [];
    assert.throws(() => f.migration(MIGRATION).up(), /indexes/);
    f.collections.classroom_presence.indexes = ['create unique index idx_classroom_presence_session on classroom_presence (room, session_id)',
        'create index idx_classroom_presence_live on classroom_presence (workspace, room, expires_at desc, id)'];

    f.collections.classroom_presence.listRule = '';
    assert.throws(() => f.migration(MIGRATION).up(), /custom/);
    assert.throws(() => f.migration(MIGRATION).down(), /custom/);
    f.collections.classroom_presence.listRule = null;
    f.migration(MIGRATION).down();
    assert.equal(f.collections.classroom_presence, undefined);
});

test('the migration does not reuse a taken prefix and keeps its own index names', () => {
    const names = [];
    for (const path of [MIGRATION]) names.push(path.split('/').at(-1).split('_')[0]);
    assert.deepEqual(names, ['1790600000']);
    const rooms = source('apps/pocketbase/pb_migrations/1790400000_classroom_rooms.js');
    // classroom_members already owns an index literally called idx_classroom_presence.
    assert.ok(rooms.includes('idx_classroom_presence '), 'the collision this test guards against must still exist');
    const text = source(MIGRATION);
    assert.ok(text.includes('idx_classroom_presence_session'));
    assert.ok(text.includes('idx_classroom_presence_live'));
    assert.equal(/idx_classroom_presence\s+on/.test(text), false, 'must not reuse classroom_members index name');
});

test('the route file makes no network call and holds no credential of its own', () => {
    // The read path reaches the SFU only through the shared lib's echoSession, required inside the handler.
    const text = source(HOOK);
    for (const forbidden of ['$http', 'fetch(', 'CLOUDFLARE_REALTIME_APP_SECRET', 'callRealtime']) {
        assert.equal(text.includes(forbidden), false, `${forbidden} must not appear in the presence route`);
    }
    // The only environment name it reads is the publish allowlist, by NAME.
    const reads = text.match(/getenv\('([^']+)'\)/g) || [];
    assert.deepEqual(reads, ["getenv('BUILDANDDO_CLASSROOM_PUBLISHERS')"]);
    // The shared lib is required inside handlers, never at file scope (0.39.8 VMs).
    assert.ok(source(LIB).includes('module.exports'));
    const code = text.split(/\r?\n/).filter((line) => !line.trim().startsWith('//')).join('\n');
    const fileScope = code.split('routerAdd(')[0];
    assert.equal(fileScope.includes('require('), false, 'require() must live inside each handler');
});

test('the lane owned files are LF only', () => {
    for (const path of [HOOK, MIGRATION, 'tests/upgrade/classroom-presence.test.mjs',
        'apps/web/src/lib/classroomRealtime.js', 'apps/web/src/hooks/useClassroomMedia.js',
        'apps/web/src/components/broadcast/LiveBroadcast.jsx',
        'apps/web/src/lib/__tests__/classroomRealtime.presence.test.js']) {
        assert.equal(source(path).includes('\r'), false, `${path} must be LF only`);
    }
    assert.ok(String(root).length > 0);
});
