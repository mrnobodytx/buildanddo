// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/classroom-media.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     tests/upgrade/classroom-media-fixture.mjs, apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/classroom-media-fixture.mjs; VALIDATES apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js; VALIDATES apps/pocketbase/pb_hooks/classroom-media.js
// Intent:      Reject foreign, revoked and stale classroom signalling before provider effects and retain exact successful session ownership.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import { plain } from './admin-fixture.mjs';
import { mediaFixture, MEDIA_MIGRATION } from './classroom-media-fixture.mjs';

test('room, current workspace membership and fresh attendance precede session creation', () => {
    const f = mediaFixture(), room = f.start();
    for (const [id, actor] of [[room, 'outsider'], [room, 'viewer'], ['missing', 'owner'], ['', 'owner']]) {
        const result = f.session(id, actor);
        assert.ok([400, 403, 404].includes(result.status), JSON.stringify(result));
    }
    assert.equal(f.requests.length, 0);
    f.command('room.join', { id: room }, { actor: 'viewer' });
    assert.equal(f.session(room, 'viewer').status, 200);
});

test('owned room sessions are required for tracks and renegotiation', () => {
    const f = mediaFixture(), room = f.start();
    const created = f.session(room);
    assert.equal(created.status, 200);
    const id = created.body.sessionId;
    assert.equal(f.data.classroom_media_sessions.length, 1);
    f.command('room.join', { id: room }, { actor: 'viewer' });
    const before = f.requests.length;
    for (const sessionId of [id, 'unknown']) {
        assert.equal(f.request('POST', '/api/classroom/tracks', { actor: 'viewer', body: {
            room, sessionId, action: 'pull', tracks: [{ location: 'remote', sessionId: 'source', trackName: 'mic' }],
        } }).status, 403);
        assert.equal(f.request('PUT', '/api/classroom/renegotiate', { actor: 'viewer', body: {
            room, sessionId, sessionDescription: { type: 'answer', sdp: 'fixture-answer' },
        } }).status, 403);
    }
    assert.equal(f.requests.length, before);
});

test('allowlisting alone cannot grant publishing into another classroom', () => {
    const f = mediaFixture({ publishers: 'owner,viewer,outsider' }), room = f.start();
    f.command('room.join', { id: room }, { actor: 'viewer' });
    const session = f.session(room, 'viewer').body;
    assert.equal(session.may_publish, false);
    const before = f.requests.length;
    assert.equal(f.publish(room, session.sessionId, 'viewer').status, 403);
    assert.equal(f.session(room, 'outsider').status, 403);
    assert.equal(f.requests.length, before);
});

test('ended, expired, revoked and rejoined attendance cannot reuse a media session', () => {
    for (const revoke of ['ended', 'stale', 'left', 'rejoined', 'workspace', 'publisher']) {
        const f = mediaFixture(), room = f.start({ actor: 'editor' });
        const sessionId = f.session(room, 'editor').body.sessionId;
        const member = f.data.classroom_members.find((row) => row.owner === 'editor');
        if (revoke === 'ended') f.command('room.end', { id: room }, { actor: 'editor' });
        if (revoke === 'stale') member.last_seen = '2020-01-01T00:00:00Z';
        if (revoke === 'left' || revoke === 'rejoined') f.command('room.leave', { id: room, membership_revision: member.revision }, { actor: 'editor' });
        if (revoke === 'rejoined') f.command('room.join', { id: room }, { actor: 'editor' });
        if (revoke === 'workspace') f.data.workspace_members.splice(f.data.workspace_members.findIndex((row) => row.user === 'editor'), 1);
        if (revoke === 'publisher') f.env.BUILDANDDO_CLASSROOM_PUBLISHERS = 'owner';
        const before = f.requests.length;
        assert.equal(f.publish(room, sessionId, 'editor').status, 403, revoke);
        assert.equal(f.requests.length, before, revoke);
    }
});

test('pulls require exact server-confirmed tracks and a current publisher in the same room', () => {
    const f = mediaFixture(), room = f.start(), source = f.session(room).body.sessionId;
    assert.equal(f.publish(room, source).status, 200);
    f.command('room.join', { id: room }, { actor: 'viewer' });
    const target = f.session(room, 'viewer').body.sessionId;
    const pull = (sessionId, trackName, location = 'remote') => f.request('POST', '/api/classroom/tracks', {
        actor: 'viewer', body: { room, sessionId: target, action: 'pull', tracks: [{ location, sessionId, trackName }] } });
    const before = f.requests.length;
    assert.equal(pull(source, 'not-published').status, 403);
    assert.equal(pull('unknown-source', 'seat:owner/mic').status, 403);
    assert.equal(pull(source, 'seat:owner/mic', 'local').status, 400);
    assert.equal(f.requests.length, before);
    assert.equal(pull(source, 'seat:owner/mic').status, 200);
    f.command('room.leave', { id: room, membership_revision: f.detail(room).membership.revision });
    const last = f.requests.length;
    assert.equal(pull(source, 'seat:owner/mic').status, 403);
    assert.equal(f.requests.length, last);
});

test('missing or opened session schema fails closed before provider access', () => {
    const absent = mediaFixture({ migrated: false }), room = absent.start();
    assert.equal(absent.session(room).status, 503);
    assert.equal(absent.requests.length, 0);
    const f = mediaFixture(), present = f.start();
    f.collections.classroom_media_sessions.listRule = '';
    assert.equal(f.session(present).status, 503);
    assert.equal(f.requests.length, 0);
});

test('session migration is idempotent, locked and rollback disables historical bindings', () => {
    const f = mediaFixture();
    const before = plain(f.data);
    f.collections.classroom_media_sessions.indexes = f.collections.classroom_media_sessions.indexes
        .map((item) => item.toUpperCase().replaceAll('CLASSROOM_MEDIA_SESSIONS', '`CLASSROOM_MEDIA_SESSIONS`'));
    f.migration(MEDIA_MIGRATION).up();
    assert.deepEqual(plain(f.data), before);
    f.collections.classroom_media_sessions.listRule = '';
    assert.throws(() => f.migration(MEDIA_MIGRATION).up(), /custom/);
    assert.throws(() => f.migration(MEDIA_MIGRATION).down(), /custom/);
    f.collections.classroom_media_sessions.listRule = null;
    f.migration(MEDIA_MIGRATION).down();
    assert.equal(f.collections.classroom_media_sessions.fields.getByName('protocol_version'), undefined);
    f.migration(MEDIA_MIGRATION).up();
    assert.ok(f.collections.classroom_media_sessions.fields.getByName('protocol_version'));
});

test('presence cannot advertise an unowned or never-published provider session', () => {
    const f = mediaFixture({ publishers: 'owner,viewer,outsider' }), room = f.start();
    const body = { room, session_id: 'invented-session', tracks: ['invented-track'], expires_at: new Date(Date.now() + 30000).toISOString() };
    assert.equal(f.request('POST', '/api/classroom/presence', { body }).status, 403);
    assert.equal(f.request('POST', '/api/classroom/presence', { body, actor: 'outsider' }).status, 403);
    const session = f.session(room).body.sessionId;
    assert.equal(f.request('POST', '/api/classroom/presence', { body: { ...body, session_id: session } }).status, 403);
    assert.equal(f.data.classroom_presence.length, 0);
});

test('presence readers and advertised publishers must still attend the live room', () => {
    const f = mediaFixture(), room = f.start();
    f.command('room.join', { id: room }, { actor: 'viewer' });
    const session = f.session(room).body.sessionId;
    f.publish(room, session);
    assert.equal(f.request('POST', '/api/classroom/presence', { body: { room, session_id: session,
        tracks: ['seat:owner/mic'], expires_at: new Date(Date.now() + 30000).toISOString() } }).status, 200);
    const read = () => f.request('GET', '/api/classroom/presence', { actor: 'viewer', query: { room } });
    assert.equal(read().body.items.length, 1);
    f.env.BUILDANDDO_CLASSROOM_PUBLISHERS = '';
    assert.equal(read().body.items.length, 0);
    f.command('room.leave', { id: room, membership_revision: f.detail(room, 'viewer').membership.revision }, { actor: 'viewer' });
    assert.equal(read().status, 403);
});

test('capacity does not trap a fresh attendance behind unusable historical sessions', () => {
    for (const reason of ['rejoined', 'old-protocol']) {
        const f = mediaFixture(), room = f.start();
        for (let i = 0; i < 4; i++) assert.equal(f.session(room).status, 200);
        assert.equal(f.session(room).status, 429);
        if (reason === 'rejoined') {
            f.command('room.leave', { id: room, membership_revision: f.detail(room).membership.revision });
            f.command('room.join', { id: room });
        } else {
            // Explicit native post-rollback column defaults, not simulated DDL.
            f.data.classroom_media_sessions.forEach((row) => { row.protocol_version = 0; });
        }
        assert.equal(f.session(room).status, 200, reason);
        assert.equal(f.data.classroom_media_sessions.length, 5, 'Retain old bindings rather than guessing new authority for them.');
    }
});

test('malformed retained advertisements are isolated from the rest of the room', () => {
    const f = mediaFixture(), room = f.start(), sessionId = f.session(room).body.sessionId;
    f.publish(room, sessionId);
    f.request('POST', '/api/classroom/presence', { body: { room, session_id: sessionId, tracks: ['seat:owner/mic'],
        expires_at: new Date(Date.now() + 30000).toISOString() } });
    for (const tracks of [[null], [false], [3], ['mic'], [{ trackName: 'seat:owner/mic' }]]) {
        f.data.classroom_presence[0].tracks = tracks;
        const read = f.request('GET', '/api/classroom/presence', { query: { room } });
        assert.equal(read.status, 200);
        assert.deepEqual(read.body.items, []);
    }
});
