// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/classroom-presence.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     tests/upgrade/admin-fixture.mjs, tests/upgrade/classroom-media-fixture.mjs, apps/pocketbase/pb_hooks/classroom-presence.pb.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/classroom-media-fixture.mjs;
//              VALIDATES apps/pocketbase/pb_hooks/classroom-presence.pb.js;
//              VALIDATES apps/pocketbase/pb_migrations/1790600000_classroom_presence.js
// DAG Node:    none
// Intent:      Exercise presence through bound session and publication sources while rejecting stale or foreign authority and retaining expiry, privacy and migration regressions.
// ----------------------------------------------------------------
// The shared fixture executes the registered routes and native command sources.
// Storage, configuration and HTTP are explicit local doubles, not live providers
// or evidence of native PocketBase/SFU acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import { plain, root, source } from './admin-fixture.mjs';
import { mediaFixture, MEDIA_MIGRATION } from './classroom-media-fixture.mjs';

const MIGRATION = 'apps/pocketbase/pb_migrations/1790600000_classroom_presence.js';
const HOOK = 'apps/pocketbase/pb_hooks/classroom-presence.pb.js';
const LIB = 'apps/pocketbase/pb_hooks/classroom-realtime-lib.js';

const future = (ms = 30000) => new Date(Date.now() + ms).toISOString();
const advertise = (f, body, actor = 'owner') => f.request('POST', '/api/classroom/presence', { actor, body });
const read = (f, room, actor = 'owner') => f.request('GET', '/api/classroom/presence', { actor, query: { room } });

/** Obtain every successful advertisement's session and tracks through the real routes. */
function published(f, room, actor = 'owner', trackName = 'seat:owner/mic') {
    const session = f.session(room, actor);
    assert.equal(session.status, 200, JSON.stringify(session));
    assert.equal(session.body.may_publish, true);
    const pushed = f.publish(room, session.body.sessionId, actor, trackName);
    assert.equal(pushed.status, 200, JSON.stringify(pushed));
    const tracks = [{ trackName, kind: 'audio' }];
    const saved = f.data.classroom_media_sessions.find((row) => row.session_id === session.body.sessionId);
    assert.equal(saved.owner, actor);
    assert.equal(saved.room, room);
    assert.deepEqual(saved.tracks, tracks);
    return { room, session_id: session.body.sessionId, tracks, expires_at: future() };
}

test('both handlers use App methods that actually exist on the PocketBase JSVM', () => {
    // Keep the historical JSVM-method regression, but actually execute both handlers.
    const text = source(HOOK).split(/\r?\n/).filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.equal(/\bfindRecordByFilter\b/.test(text), false,
        'findRecordByFilter is not a PocketBase JSVM method; use findRecordById or findFirstRecordByFilter');
    assert.equal(/\bonServe\b/.test(text), false, 'PocketBase 0.39.8 has no onServe');

    const f = mediaFixture(), room = f.start(), body = published(f, room);
    const wrote = advertise(f, body);
    assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    const result = read(f, room);
    assert.equal(result.status, 200);
    assert.equal(result.body.items.length, 1);
    assert.equal(result.body.items[0].session_id, body.session_id);
    assert.deepEqual(result.body.items[0].tracks, body.tracks);
});

test('an empty allowlist refuses even an attending host with confirmed tracks', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    f.env.BUILDANDDO_CLASSROOM_PUBLISHERS = '';
    const before = f.requests.length;
    const denied = advertise(f, body);
    assert.equal(denied.status, 403);
    assert.equal(f.data.classroom_presence.length, 0);
    assert.equal(f.requests.length, before);
});

test('no seat label is returned, logged or stored - it is the caller email on this estate', () => {
    const f = mediaFixture({ publishers: '' }), room = f.start();
    f.seed('users', { id: 'teacher', email: 'teacher@example.com', name: 'Ada' });
    f.seed('workspace_members', { workspace: 'ws1', user: 'teacher', role: 'admin' });
    f.command('room.join', { id: room }, { actor: 'teacher' });
    const session = f.session(room, 'teacher');
    assert.equal(session.status, 200);
    assert.equal(session.body.may_publish, false);
    const body = { room, session_id: session.body.sessionId, tracks: ['teacher/mic'], expires_at: future() };
    const denied = advertise(f, body, 'teacher');
    assert.equal(denied.status, 403);

    f.env.BUILDANDDO_CLASSROOM_PUBLISHERS = 'teacher@example.com';
    assert.equal(f.publish(room, session.body.sessionId, 'teacher', 'teacher/mic').status, 200);
    const wrote = advertise(f, body, 'teacher');
    assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    const listed = read(f, room);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.items[0].display_name, 'Ada');
    for (const value of [denied, wrote, listed, f.logs, f.data.classroom_presence, f.data.classroom_media_sessions]) {
        assert.equal(JSON.stringify(value).includes('teacher@example.com'), false, 'no derived email may escape');
        assert.equal(JSON.stringify(value).includes(f.env.CLOUDFLARE_REALTIME_APP_SECRET), false);
    }
    assert.equal(f.data.classroom_presence[0].publisher, 'teacher');
    assert.equal(Object.prototype.hasOwnProperty.call(f.data.classroom_presence[0], 'seat'), false);
});

test('a row must carry a bounded, future expires_at', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    for (const expires_at of [undefined, '', 123, 'not a date', future(-1000), future(121000), future(600000)]) {
        const result = advertise(f, { ...body, expires_at });
        assert.equal(result.status, 400, String(expires_at));
        assert.match(result.body.message, /future expiry within 120 seconds/);
    }
    assert.equal(f.data.classroom_presence.length, 0);
    const wrote = advertise(f, { ...body, expires_at: future(119000) });
    assert.equal(wrote.status, 200);
    assert.ok(wrote.body.ttl_ms > 0 && wrote.body.ttl_ms <= 120000);
    assert.equal(advertise(f, { ...body, expires_at: future() }).status, 200);
    assert.equal(f.data.classroom_presence.length, 1);
});

test('empty, oversized or malformed advertised tracks are refused rather than stored', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    for (const tracks of [undefined, [], 'nope', [null], [false], [{}], [''], ['x'.repeat(201)],
        new Array(9).fill(body.tracks[0]), [{ trackName: 't', kind: 'hologram' }]]) {
        const result = advertise(f, { ...body, tracks });
        assert.equal(result.status, 400, JSON.stringify(tracks));
    }
    assert.equal(f.data.classroom_presence.length, 0);
});

test('context, bare track strings and gm:forge work for an authorized attending host', () => {
    const f = mediaFixture({ publishers: 'forge@citadel-nexus.com' });
    f.seed('users', { id: 'forge', email: 'forge@citadel-nexus.com', name: 'Forge' });
    f.seed('workspace_members', { workspace: 'ws1', user: 'forge', role: 'editor' });
    const room = f.start({ actor: 'forge' }), body = published(f, room, 'forge', 'gm:forge/voice');
    const wrote = advertise(f, { context: `CLASSROOM:${room}`, session_id: body.session_id,
        tracks: ['gm:forge/voice'], persona_id: 'gm:forge', expires_at: future(),
        app_name: 'classroom-runtime', manifest_id: 'fixture-manifest', capsule_digest: 'a'.repeat(64) }, 'forge');
    assert.equal(wrote.status, 200, JSON.stringify(wrote.body));
    const row = f.data.classroom_presence[0];
    assert.equal(row.room, room);
    assert.equal(row.persona_id, 'gm-forge', 'gm:forge and gm-forge must store as one spelling');
    assert.equal(row.role, 'guildmaster', 'a persona row defaults to guildmaster with no role in the body');
    assert.deepEqual(row.tracks, [{ trackName: 'gm:forge/voice', kind: 'audio' }]);
    assert.equal(row.access_basis, 'host');
    const listed = read(f, `classroom:${room}`, 'forge');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.items[0].manifest_id, 'fixture-manifest');
    assert.equal(listed.body.items[0].capsule_digest, 'a'.repeat(64));
});

test('allowlisting alone grants neither attendance nor classroom management', () => {
    const f = mediaFixture({ publishers: 'owner,admin,editor,viewer,forge@citadel-nexus.com' }), room = f.start();
    f.seed('users', { id: 'forge', email: 'forge@citadel-nexus.com', name: 'Forge' });
    const unbound = { room, session_id: 'legacy-forge', tracks: ['gm:forge/voice'], persona_id: 'gm:forge', expires_at: future() };
    assert.equal(advertise(f, unbound, 'forge').status, 403);
    assert.equal(f.session(room, 'forge').status, 403);
    f.seed('workspace_members', { workspace: 'ws1', user: 'forge', role: 'admin' });
    assert.equal(advertise(f, unbound, 'forge').status, 403, 'a workspace grant is not classroom attendance');
    assert.equal(f.requests.length, 0);

    for (const actor of ['viewer', 'editor']) {
        f.command('room.join', { id: room }, { actor });
        const session = f.session(room, actor);
        assert.equal(session.status, 200);
        assert.equal(session.body.may_publish, false, 'a non-host editor cannot manage this classroom');
        const before = f.requests.length;
        assert.equal(f.publish(room, session.body.sessionId, actor, 'not-authorized').status, 403);
        assert.equal(advertise(f, { ...unbound, session_id: session.body.sessionId }, actor).status, 403);
        assert.equal(f.requests.length, before);
    }
    assert.equal(f.data.classroom_presence.length, 0);

    const byHost = advertise(f, published(f, room));
    assert.equal(byHost.status, 200);
    assert.equal(byHost.body.access_basis, 'host');
    f.command('room.join', { id: room }, { actor: 'admin' });
    const byAdmin = advertise(f, published(f, room, 'admin', 'seat:admin/mic'), 'admin');
    assert.equal(byAdmin.status, 200);
    assert.equal(byAdmin.body.access_basis, 'member');
    assert.deepEqual(f.data.classroom_presence.map((row) => row.access_basis), ['host', 'member']);
});

test('reading requires live attendance and a native workspace grant, not an allowlist entry', () => {
    const f = mediaFixture({ publishers: 'owner,forge@citadel-nexus.com' }), room = f.start();
    f.seed('users', { id: 'forge', email: 'forge@citadel-nexus.com', name: 'Forge' });
    assert.equal(advertise(f, published(f, room)).status, 200);
    for (const actor of ['forge', 'outsider', 'viewer', 'admin']) assert.equal(read(f, room, actor).status, 403, actor);
    f.command('room.join', { id: room }, { actor: 'viewer' });
    assert.equal(read(f, room, 'viewer').body.items.length, 1);
    assert.equal(read(f, room).status, 200);
    assert.equal(read(f, 'nope').status, 404);
    assert.equal(f.request('GET', '/api/classroom/presence', { actor: 'owner', query: {} }).status, 400);
    // Historical attendance alone cannot replace a current workspace membership.
    f.data.workspace_members = f.data.workspace_members.filter((row) => row.user !== 'viewer');
    assert.equal(read(f, room, 'viewer').status, 403);
});

test('one publisher cannot rewrite another publisher row and redirect the class', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    f.command('room.join', { id: room }, { actor: 'admin' });
    const adminBody = published(f, room, 'admin', body.tracks[0].trackName);
    assert.equal(advertise(f, body).status, 200);
    const stored = plain(f.data.classroom_presence), before = f.requests.length;
    assert.equal(advertise(f, { ...adminBody, session_id: body.session_id }, 'admin').status, 403);
    assert.deepEqual(f.data.classroom_presence, stored, 'matching track names do not transfer session ownership');
    assert.equal(f.requests.length, before);
});

test('unbound and never-published sessions cannot become advertisements', () => {
    const f = mediaFixture(), room = f.start();
    const body = { room, session_id: 'guessed-session', tracks: ['seat:owner/mic'], expires_at: future() };
    assert.equal(advertise(f, body).status, 403);
    assert.equal(f.requests.length, 0);
    assert.equal(f.data.classroom_media_sessions.length, 0, 'presence cannot infer a provider-session owner');
    const session = f.session(room);
    assert.equal(session.status, 200);
    const bound = { ...body, session_id: session.body.sessionId };
    const before = f.requests.length;
    assert.equal(advertise(f, bound).status, 403);
    assert.equal(f.requests.length, before);
    assert.deepEqual(f.data.classroom_media_sessions[0].tracks, []);
    assert.equal(f.data.classroom_presence.length, 0);
    assert.equal(f.publish(room, session.body.sessionId).status, 200);
    assert.equal(advertise(f, bound).status, 200);
});

test('legacy publisher_grant rows neither grant access nor grandfather guessed sessions', () => {
    const f = mediaFixture(), room = f.start();
    f.command('room.join', { id: room }, { actor: 'viewer' });
    f.seed('classroom_presence', { id: 'legacy-advertisement', workspace: 'ws1', room, publisher: 'owner',
        display_name: 'Legacy', role: 'teacher', access_basis: 'publisher_grant', session_id: 'legacy-unbound',
        tracks: [{ trackName: 'legacy/mic', kind: 'audio' }], state: 'LIVE', expires_at: future() });
    const before = plain(f.data.classroom_presence);
    const listed = read(f, room, 'viewer');
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.items, []);
    assert.equal(advertise(f, { room, session_id: 'legacy-unbound', tracks: ['legacy/mic'], expires_at: future() }).status, 403);
    assert.deepEqual(f.data.classroom_presence, before);
    assert.equal(f.data.classroom_media_sessions.length, 0);
    assert.equal(f.requests.length, 0);
});

test('tracks must match the successful push in the same session, including media kind', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    const other = published(f, room, 'owner', 'another-session/mic');
    const before = f.requests.length;
    for (const tracks of [[{ ...body.tracks[0], kind: 'video' }], other.tracks,
        [...body.tracks, ...other.tracks], ['unpublished']]) {
        assert.equal(advertise(f, { ...body, tracks }).status, 403, JSON.stringify(tracks));
    }
    assert.equal(f.data.classroom_presence.length, 0);
    assert.equal(f.requests.length, before);
    assert.equal(advertise(f, body).status, 200);
});

for (const failure of ['provider refusal', 'missing track confirmation']) {
    test(`a ${failure} cannot supply a recorded track for presence`, (t) => {
        const f = mediaFixture(), room = f.start(), session = f.session(room);
        assert.equal(session.status, 200);
        const send = f.provider.send.bind(f.provider);
        t.mock.method(f.provider, 'send', (options) => {
            send(options);
            return { statusCode: failure === 'provider refusal' ? 503 : 200, json: { tracks: [] } };
        });
        assert.equal(f.publish(room, session.body.sessionId).status, 502);
        assert.deepEqual(f.data.classroom_media_sessions[0].tracks, []);
        assert.equal(f.data.classroom_media_sessions[0].active, false);
        const before = f.requests.length;
        assert.equal(advertise(f, { room, session_id: session.body.sessionId,
            tracks: ['seat:owner/mic'], expires_at: future() }).status, 403);
        assert.equal(f.data.classroom_presence.length, 0);
        assert.equal(f.requests.length, before);
    });
}

test('a valid publisher cannot move a session to another room or workspace', () => {
    const f = mediaFixture({ publishers: 'owner,otherowner' }), room = f.start(), body = published(f, room);
    assert.equal(advertise(f, body).status, 200);
    const second = f.start();
    const foreign = f.start({ actor: 'otherowner', workspace: 'ws2' });
    const before = f.requests.length, stored = plain(f.data.classroom_presence);
    assert.equal(advertise(f, { ...body, room: second }).status, 403, 'even the same owner needs a new room-bound session');
    assert.equal(advertise(f, { ...body, room: foreign }, 'otherowner').status, 403);
    assert.deepEqual(read(f, second).body.items, []);
    assert.deepEqual(read(f, foreign, 'otherowner').body.items, []);
    assert.deepEqual(f.data.classroom_presence, stored);
    assert.equal(f.requests.length, before);
});

test('a conflicting or duplicate stored row is never overwritten as the current publisher', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    f.command('room.join', { id: room }, { actor: 'admin' });
    assert.equal(advertise(f, body).status, 200);
    f.data.classroom_presence[0].publisher = 'admin';
    const stored = plain(f.data.classroom_presence);
    assert.equal(advertise(f, body).status, 403);
    assert.deepEqual(read(f, room).body.items, []);
    assert.deepEqual(f.data.classroom_presence, stored);
    f.data.classroom_presence[0].publisher = 'owner';
    f.seed('classroom_presence', { ...f.data.classroom_presence[0], id: 'duplicate-advertisement' });
    const duplicated = plain(f.data.classroom_presence);
    assert.equal(advertise(f, body).status, 503);
    assert.deepEqual(f.data.classroom_presence, duplicated);
});

for (const change of ['workspace revoked', 'role downgraded', 'host changed', 'allowlist revoked',
    'stale attendance', 'left classroom', 'rejoined attendance', 'expired session', 'closed session', 'foreign session workspace']) {
    test(`publisher refresh and read-only visibility both fail closed: ${change}`, () => {
        const f = mediaFixture(), room = f.start({ actor: 'editor' });
        f.command('room.join', { id: room }, { actor: 'viewer' });
        const body = published(f, room, 'editor', 'seat:editor/mic');
        assert.equal(advertise(f, body, 'editor').status, 200);
        assert.equal(f.detail(room, 'viewer').room.can_manage, false);
        assert.equal(read(f, room, 'viewer').body.items.length, 1);
        const member = f.data.classroom_members.find((row) => row.owner === 'editor' && row.room === room);
        if (change === 'workspace revoked')
            f.data.workspace_members = f.data.workspace_members.filter((row) => row.user !== 'editor');
        if (change === 'role downgraded') f.data.workspace_members.find((row) => row.user === 'editor').role = 'viewer';
        if (change === 'host changed') f.data.classroom_rooms.find((row) => row.id === room).host = 'owner';
        if (change === 'allowlist revoked') f.env.BUILDANDDO_CLASSROOM_PUBLISHERS = 'owner,admin';
        if (change === 'stale attendance') member.last_seen = future(-76000);
        if (change === 'left classroom' || change === 'rejoined attendance')
            f.command('room.leave', { id: room, membership_revision: member.revision }, { actor: 'editor' });
        if (change === 'rejoined attendance') f.command('room.join', { id: room }, { actor: 'editor' });
        if (change === 'expired session') f.data.classroom_media_sessions[0].expires_at = future(-1000);
        if (change === 'closed session') assert.equal(f.request('POST', '/api/classroom/close', {
            actor: 'editor', body: { room, sessionId: body.session_id } }).status, 200);
        if (change === 'foreign session workspace') f.data.classroom_media_sessions[0].workspace = 'ws2';

        const stored = plain(f.data), before = f.requests.length;
        assert.equal(advertise(f, body, 'editor').status, 403);
        const listed = read(f, room, 'viewer');
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.items, []);
        assert.deepEqual(f.data, stored, 'reads and refused refreshes must not repair stale authority');
        assert.equal(f.requests.length, before);
    });
}

test('leaving, closing and rejoining requires a fresh session, not the closed record', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    f.command('room.join', { id: room }, { actor: 'viewer' });
    assert.equal(advertise(f, body).status, 200);
    const membership = f.detail(room).membership;
    f.command('room.leave', { id: room, membership_revision: membership.revision });
    assert.equal(f.request('POST', '/api/classroom/close', { body: { room, sessionId: body.session_id } }).status, 200);
    f.command('room.join', { id: room });
    assert.equal(f.detail(room).membership.id, membership.id, 'the native attendance row is reused');
    assert.ok(f.detail(room).membership.revision > membership.revision);
    assert.equal(advertise(f, body).status, 403);
    assert.equal(f.publish(room, body.session_id).status, 403);
    assert.deepEqual(read(f, room, 'viewer').body.items, []);
    const replacement = published(f, room);
    assert.notEqual(replacement.session_id, body.session_id);
    assert.equal(advertise(f, replacement).status, 200);
    assert.deepEqual(read(f, room, 'viewer').body.items.map((row) => row.session_id), [replacement.session_id]);
    const closed = f.data.classroom_media_sessions.find((row) => row.session_id === body.session_id);
    assert.equal(closed.active, false);
    assert.equal(closed.member_revision, membership.revision);
});

test('a stale or departed reader cannot enumerate an otherwise current advertisement', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    assert.equal(advertise(f, body).status, 200);
    f.command('room.join', { id: room }, { actor: 'viewer' });
    assert.equal(read(f, room, 'viewer').body.items.length, 1);
    f.data.classroom_members.find((row) => row.owner === 'viewer').last_seen = future(-76000);
    assert.equal(read(f, room, 'viewer').status, 403);
    f.command('room.join', { id: room }, { actor: 'viewer' });
    assert.equal(read(f, room, 'viewer').body.items.length, 1);
    f.command('room.leave', { id: room, membership_revision: f.detail(room, 'viewer').membership.revision }, { actor: 'viewer' });
    assert.equal(read(f, room, 'viewer').status, 403);
});

for (const state of ['ended', 'scheduled', 'unknown', '']) {
    test(`a classroom with ${state || 'missing'} state fails closed for presence reads and writes`, () => {
        const f = mediaFixture(), room = f.start(), body = published(f, room);
        assert.equal(advertise(f, body).status, 200);
        if (state === 'ended') f.command('room.end', { id: room });
        else f.data.classroom_rooms.find((row) => row.id === room).status = state;
        const before = f.requests.length, stored = plain(f.data);
        assert.equal(advertise(f, body).status, 403);
        assert.equal(read(f, room).status, 403);
        assert.deepEqual(f.data, stored);
        assert.equal(f.requests.length, before);
    });
}

test('unreadable classroom state aborts reads and writes instead of assuming it is live', (t) => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    assert.equal(advertise(f, body).status, 200);
    const find = f.app.findRecordById.bind(f.app), before = f.requests.length, stored = plain(f.data);
    t.mock.method(f.app, 'findRecordById', (collection, id) => {
        const record = find(collection, id);
        if (collection === 'classroom_rooms') {
            const getString = record.getString.bind(record);
            record.getString = (key) => {
                if (key === 'status') throw new Error('classroom state unavailable');
                return getString(key);
            };
        }
        return record;
    });
    assert.throws(() => advertise(f, body), /classroom state unavailable/);
    assert.throws(() => read(f, room), /classroom state unavailable/);
    assert.deepEqual(f.data, stored);
    assert.equal(f.requests.length, before);
});

test('advertisement role and state must use the declared values and persona pairing', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    for (const invalid of [{ role: 'admin' }, { role: 'teacher', persona_id: 'gm:forge' }, { state: 'unknown' }])
        assert.equal(advertise(f, { ...body, ...invalid }).status, 400, JSON.stringify(invalid));
    assert.equal(f.data.classroom_presence.length, 0);
    assert.equal(advertise(f, { ...body, role: 'assistant', state: 'DEGRADED' }).status, 200);
    assert.equal(read(f, room).body.items[0].state, 'DEGRADED');
});

test('a refreshed row is an upsert, not a second row', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    const first = advertise(f, body);
    assert.equal(first.status, 200);
    for (const state of ['DEGRADED', 'LIVE']) {
        const updated = advertise(f, { ...body, state, expires_at: future(60000) });
        assert.equal(updated.status, 200);
        assert.equal(updated.body.id, first.body.id);
        assert.equal(f.data.classroom_presence[0].state, state);
    }
    assert.equal(f.data.classroom_presence.length, 1);
});

test('the route never claims the advertisement was verified against the SFU', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    const wrote = advertise(f, body);
    assert.equal(wrote.status, 200);
    assert.equal(wrote.body.verified, false);
    assert.equal(wrote.body.verification, 'NOT_ECHOED_BY_SFU');
    const listed = read(f, room);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.items[0].verified, false);
    assert.equal(listed.body.items[0].verification, 'NOT_ECHOED_BY_SFU');
});

test('an expired or ENDED row is not served, and an expired row is eventually collected', () => {
    const f = mediaFixture(), room = f.start(), live = published(f, room);
    assert.equal(advertise(f, live).status, 200);
    const ended = published(f, room, 'owner', 'ended/mic');
    assert.equal(advertise(f, { ...ended, state: 'ENDED' }).status, 200);
    const expired = published(f, room, 'owner', 'expired/mic');
    const expiring = advertise(f, expired);
    assert.equal(expiring.status, 200);
    f.data.classroom_presence.find((row) => row.id === expiring.body.id).expires_at = future(-1000);
    // A long-dead row, written directly because the route refuses a past stamp.
    f.seed('classroom_presence', {
        id: 'stale-row', workspace: 'ws1', room, publisher: 'owner', display_name: 'Old', role: 'teacher',
        access_basis: 'host', session_id: 'stale-1', tracks: [{ trackName: 'c', kind: 'audio' }], state: 'LIVE',
        expires_at: new Date(Date.now() - 3600000).toISOString(),
    });
    const listed = read(f, room);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.body.items.map((row) => row.session_id), [live.session_id]);

    const swept = advertise(f, live);
    assert.equal(swept.status, 200);
    assert.equal(swept.body.swept, 1);
    assert.equal(f.data.classroom_presence.some((row) => row.id === 'stale-row'), false);
    assert.equal(f.data.classroom_presence.some((row) => row.id === expiring.body.id), true,
        'recently expired rows are hidden before the five-minute GC window');
});

test('garbage collection stays room-scoped and does not turn a saved write into failure', (t) => {
    const f = mediaFixture(), room = f.start(), body = published(f, room), otherRoom = f.start();
    const stale = { workspace: 'ws1', room, publisher: 'owner', display_name: 'Old', role: 'teacher',
        access_basis: 'host', session_id: 'old', tracks: [], state: 'LIVE', expires_at: future(-3600000) };
    f.seed('classroom_presence', { ...stale, id: 'collectable' });
    f.seed('classroom_presence', { ...stale, id: 'foreign', room: otherRoom });
    f.seed('classroom_presence', { ...stale, id: 'unreadable-expiry', session_id: 'invalid-date', expires_at: 'not a date' });
    const remove = t.mock.method(f.app, 'delete', () => { throw new Error('collection unavailable'); });
    const wrote = advertise(f, body);
    assert.equal(wrote.status, 200);
    assert.equal(wrote.body.swept, 0);
    assert.deepEqual(remove.mock.calls.map(({ arguments: args }) => args[0].id), ['collectable']);
    assert.equal(f.data.classroom_presence.some((row) => row.id === 'foreign'), true);
    assert.equal(f.data.classroom_presence.some((row) => row.id === 'unreadable-expiry'), true);
    assert.deepEqual(read(f, room).body.items.map((row) => row.session_id), [body.session_id]);
});

test('malformed saved advertisements are not exposed as subscribable sessions', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    assert.equal(advertise(f, body).status, 200);
    for (const tracks of ['{not json', '[]', '{"trackName":"unconfirmed"}', null,
        [{ trackName: 'unconfirmed', kind: 'audio' }]]) {
        f.data.classroom_presence[0].tracks = tracks;
        const listed = read(f, room);
        assert.equal(listed.status, 200);
        assert.deepEqual(listed.body.items, [], JSON.stringify(tracks));
    }
    assert.equal(f.data.classroom_presence.length, 1, 'reading never repairs or removes malformed storage');
});

test('a save that fails is a named refusal and leaves the stored advertisement unchanged', (t) => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    assert.equal(advertise(f, body).status, 200);
    const before = plain(f.data);
    const realSave = f.app.save.bind(f.app);
    t.mock.method(f.app, 'save', (value) => {
        if (value && value.collection && value.collection().name === 'classroom_presence') {
            throw new Error('storage unavailable');
        }
        return realSave(value);
    });
    const out = advertise(f, { ...body, state: 'DEGRADED' });
    assert.equal(out.status, 503);
    assert.match(out.body.message, /advertisement could not be stored/);
    assert.deepEqual(f.data, before);
});

test('an unknown room is a 404 and never leaks whether rows exist', () => {
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    assert.equal(advertise(f, body).status, 200);
    for (const result of [advertise(f, { ...body, room: 'no-such-room' }), read(f, 'no-such-room')]) {
        assert.equal(result.status, 404);
        assert.equal(JSON.stringify(result).includes(body.session_id), false);
        assert.equal(Object.hasOwn(result.body, 'items'), false);
    }
});

test('the health route answers without a room, a credential or a publisher name', () => {
    const f = mediaFixture({ publishers: 'teacher@example.com,forge@citadel-nexus.com' });
    delete f.env.CLOUDFLARE_REALTIME_APP_ID;
    delete f.env.CLOUDFLARE_REALTIME_APP_SECRET;
    const out = f.request('GET', '/api/classroom/presence/health', { actor: null });
    assert.equal(out.status, 200);
    assert.equal(out.body.ok, true);
    assert.equal(out.body.collection_installed, true);
    assert.equal(out.body.publishers_configured, 2);
    assert.equal(JSON.stringify(out.body).includes('@'), false, 'the health route must not name a publisher');

    for (const migration of [MIGRATION, MEDIA_MIGRATION]) {
        const missing = mediaFixture();
        missing.migration(migration).down();
        const down = missing.request('GET', '/api/classroom/presence/health', { actor: null });
        assert.equal(down.status, 200);
        assert.equal(down.body.ok, false);
        assert.equal(down.body.collection_installed, false);
        assert.equal(missing.requests.length, 0);
    }
});

test('all signalling and presence routes register authentication and bounded write bodies', () => {
    const f = mediaFixture();
    for (const [method, path, max] of [['POST', '/api/classroom/session', 80000],
        ['POST', '/api/classroom/tracks', 80000], ['PUT', '/api/classroom/renegotiate', 80000],
        ['POST', '/api/classroom/close', 2000], ['POST', '/api/classroom/presence', 8000]]) {
        const route = f.routes.get(`${method} ${path}`);
        assert.ok(route, `${method} ${path}`);
        assert.deepEqual(plain(route.auth), { auth: 'users' });
        assert.equal(route.limit.max, max);
        assert.equal(f.request(method, path, { actor: null }).status, 401);
    }
    assert.deepEqual(plain(f.routes.get('GET /api/classroom/presence').auth), { auth: 'users' });
    assert.equal(read(f, '', null).status, 401);
    for (const path of ['/api/classroom/health', '/api/classroom/presence/health']) {
        assert.equal(f.routes.get(`GET ${path}`).auth, undefined);
        assert.equal(f.request('GET', path, { actor: null }).status, 200);
    }
    assert.equal(f.requests.length, 0);
});

test('missing provider configuration refuses current advertisements without contacting HTTP', () => {
    for (const name of ['CLOUDFLARE_REALTIME_APP_ID', 'CLOUDFLARE_REALTIME_APP_SECRET']) {
        const f = mediaFixture(), room = f.start(), body = published(f, room);
        assert.equal(advertise(f, body).status, 200);
        const before = f.requests.length, stored = plain(f.data);
        delete f.env[name];
        assert.equal(advertise(f, body).status, 503, name);
        assert.equal(read(f, room).status, 503, name);
        assert.equal(f.request('GET', '/api/classroom/health', { actor: null }).body.ok, false);
        assert.deepEqual(f.data, stored);
        assert.equal(f.requests.length, before);
    }
});

test('missing or reopened media-session storage fails closed for presence', () => {
    const absent = mediaFixture({ migrated: false }), room = absent.start();
    assert.equal(advertise(absent, { room, session_id: 'unbound', tracks: ['mic'], expires_at: future() }).status, 503);
    assert.equal(read(absent, room).status, 503);
    assert.equal(absent.requests.length, 0);
    for (const defect of ['open rule', 'missing field']) {
        const f = mediaFixture(), id = f.start(), body = published(f, id);
        assert.equal(advertise(f, body).status, 200);
        if (defect === 'open rule') f.collections.classroom_media_sessions.listRule = '';
        else f.collections.classroom_media_sessions.fields.removeByName('protocol_version');
        const before = f.requests.length, stored = plain(f.data);
        assert.equal(advertise(f, body).status, 503, defect);
        assert.equal(read(f, id).status, 503, defect);
        assert.deepEqual(f.data, stored);
        assert.equal(f.requests.length, before);
    }
});

test('the migration is idempotent, refuses a hand-edited collection and rolls back', () => {
    const f = mediaFixture(), room = f.start();
    assert.equal(advertise(f, published(f, room)).status, 200);
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

test('presence migration accepts normalized SQL but rejects changed uniqueness and indexed columns', () => {
    const f = mediaFixture(), original = plain(f.collections.classroom_presence.indexes);
    for (const quote of ['`', '"']) {
        f.collections.classroom_presence.indexes = original.map((index) => index.toUpperCase()
            .replace(/\bCLASSROOM_PRESENCE\b/g, `${quote}CLASSROOM_PRESENCE${quote}`)
            .replace(/,/g, ' ,\n ').replace(/\(/g, ' ( ').replace(/\)/g, ' ) '));
        const before = plain(f.collections.classroom_presence);
        f.migration(MIGRATION).up();
        assert.deepEqual(plain(f.collections.classroom_presence), before);
    }
    for (const indexes of [[original[0].replace('unique ', ''), original[1]],
        [original[0].replace('(room, session_id)', '(publisher, session_id)'), original[1]],
        [original[0], original[1].replace('expires_at desc', 'expires_at')],
        [original[0], original[1].replace('workspace, room', 'room, workspace')]]) {
        f.collections.classroom_presence.indexes = indexes;
        assert.throws(() => f.migration(MIGRATION).up(), /indexes/);
        assert.deepEqual(plain(f.collections.classroom_presence.indexes), indexes);
    }
});

test('presence migration refuses changed field contracts and opened rules rather than repairing them', () => {
    for (const [name, property, value] of [['publisher', 'collectionId', 'workspaces'],
        ['session_id', 'max', 400], ['expires_at', 'required', false], ['tracks', 'type', 'text']]) {
        const f = mediaFixture();
        f.collections.classroom_presence.fields.getByName(name)[property] = value;
        const before = plain(f.collections.classroom_presence);
        assert.throws(() => f.migration(MIGRATION).up(), /custom/);
        assert.deepEqual(plain(f.collections.classroom_presence), before);
    }
    for (const rule of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) {
        const f = mediaFixture();
        f.collections.classroom_presence[rule] = '';
        assert.throws(() => f.migration(MIGRATION).up(), /custom/);
        assert.throws(() => f.migration(MIGRATION).down(), /custom/);
        assert.equal(f.collections.classroom_presence[rule], '');
    }
});

test('the presence migration retains its deployed prefix and avoids classroom-member index names', () => {
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

test('presence reads, writes and health never call the provider or expose a credential', (t) => {
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
    const f = mediaFixture(), room = f.start(), body = published(f, room);
    const http = t.mock.method(f.provider, 'send', () => { throw new Error('unexpected provider request'); });
    const before = f.requests.length;
    assert.equal(advertise(f, body).status, 200);
    assert.equal(read(f, room).status, 200);
    assert.equal(f.request('GET', '/api/classroom/presence/health', { actor: null }).status, 200);
    assert.equal(http.mock.callCount(), 0);
    assert.equal(f.requests.length, before);
});

test('the classroom source and regression files remain LF only', () => {
    for (const path of [HOOK, MIGRATION, MEDIA_MIGRATION, 'tests/upgrade/classroom-presence.test.mjs',
        'tests/upgrade/classroom-media-fixture.mjs', 'apps/pocketbase/pb_hooks/classroom-media.js',
        'apps/web/src/lib/classroomRealtime.js', 'apps/web/src/hooks/useClassroomMedia.js',
        'apps/web/src/components/broadcast/LiveBroadcast.jsx',
        'apps/web/src/lib/__tests__/classroomRealtime.presence.test.js']) {
        assert.equal(source(path).includes('\r'), false, `${path} must be LF only`);
    }
    assert.ok(String(root).length > 0);
});
