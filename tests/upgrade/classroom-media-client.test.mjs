// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/classroom-media-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/classroomRealtime.js, tests/upgrade/classroom-media-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/classroomRealtime.js; CONSUMES tests/upgrade/classroom-media-fixture.mjs
// Intent:      Exercise real browser signalling against registered scoped handlers with explicit WebRTC and provider doubles and cancellation controls.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import { joinClassroom, pullTracks, createPresenceTracker, classroomHealth, presenceHealth,
    publishPresence, listPresence } from '../../apps/web/src/lib/classroomRealtime.js';
import { mediaFixture } from './classroom-media-fixture.mjs';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { resolve, promise }; };
function browser(t) {
    const f = mediaFixture(), room = f.start(), calls = [], connections = [];
    const overrides = {
        RTCPeerConnection: class {
            constructor() { this.transceivers = []; this.iceGatheringState = 'complete'; connections.push(this); }
            addEventListener() {} removeEventListener() {}
            addTransceiver() { const value = { mid: null }; this.transceivers.push(value); return value; }
            async createOffer() { return { type: 'offer', sdp: 'synthetic-offer' }; }
            async createAnswer() { return { type: 'answer', sdp: 'synthetic-answer' }; }
            async setLocalDescription(value) { this.localDescription = value; this.transceivers.forEach((value, i) => { value.mid = String(i); }); }
            async setRemoteDescription() {}
            close() { this.connectionState = 'closed'; }
        },
        RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } },
        MediaStream: class { constructor() { this.tracks = []; } addTrack(track) { this.tracks.push(track); } getTracks() { return this.tracks; } },
        fetch: async (url, init) => {
            const target = new URL(url, 'https://fixture.invalid');
            const path = target.pathname.replace('/hcgi/platform', '');
            const body = init.body ? JSON.parse(init.body) : {};
            calls.push({ path, body });
            const result = f.request(init.method || 'GET', path, { actor: init.headers.Authorization || null, body,
                query: Object.fromEntries(target.searchParams) });
            return { ok: result.status < 400, status: result.status, headers: { get: () => 'application/json' }, json: async () => result.body };
        },
    };
    for (const [key, value] of Object.entries(overrides)) {
        const original = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
        t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
    }
    return { ...f, room, calls, connections };
}

test('client joins, publishes, pulls and renegotiates through the exact room contract', async (t) => {
    const f = browser(t);
    const track = { kind: 'audio', stop() { this.stopped = true; } };
    const host = await joinClassroom({ room: f.room, role: 'teach', authToken: 'owner', seatId: 'owner', localStream: { getTracks: () => [track] } });
    assert.deepEqual(host.published, [{ trackName: 'seat:owner/mic', kind: 'audio' }]);
    assert.equal(f.calls[1].body.tracks[0].mid, '0', 'Read the transceiver mid after SDP negotiation, not before.');
    f.command('room.join', { id: f.room }, { actor: 'viewer' });
    const viewer = await joinClassroom({ room: f.room, role: 'watch', authToken: 'viewer' });
    const send = f.provider.send;
    f.provider.send = (options) => {
        const result = send(options);
        if (JSON.parse(options.body).tracks?.[0]?.location === 'remote') {
            result.json.requiresImmediateRenegotiation = true;
            result.json.sessionDescription = { type: 'offer', sdp: 'synthetic-remote-offer' };
        }
        return result;
    };
    await pullTracks(viewer, [{ sessionId: host.sessionId, trackName: 'seat:owner/mic' }], 'viewer');
    assert.equal(f.calls.at(-1).path, '/api/classroom/renegotiate');
    assert.ok(f.calls.every((call) => call.body.room === f.room));
    host.close(); viewer.close();
    await Promise.resolve();
    assert.ok(f.data.classroom_media_sessions.every((session) => session.active === false));
    assert.equal(track.stopped, true);
});

test('a room is required before accessing the camera or provider', async (t) => {
    const f = browser(t);
    await assert.rejects(joinClassroom({ role: 'watch', authToken: 'owner' }), /room required/);
    assert.equal(f.connections.length, 0);
    assert.equal(f.calls.length, 0);
});

test('cancelling a camera prompt stops its late stream before any signalling', async (t) => {
    const f = browser(t), camera = deferred();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => camera.promise } } });
    t.after(() => { if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator; });
    let current = true, cancel;
    const track = { kind: 'audio', stop() { this.stopped = true; } };
    const joining = joinClassroom({ room: f.room, role: 'teach', authToken: 'owner', isCurrent: () => current,
        onCleanup: (callback) => { cancel = callback; } });
    current = false; cancel?.();
    camera.resolve({ getTracks: () => [track] });
    await assert.rejects(joining, /cancelled/);
    assert.equal(track.stopped, true);
    assert.equal(f.calls.length, 0);
    assert.equal(f.connections[0].connectionState, 'closed');
});

test('late session responses are locally invalidated without publishing or reviving the join', async (t) => {
    const f = browser(t), response = deferred();
    const fetch = globalThis.fetch;
    let current = true, cancel;
    globalThis.fetch = async (url, init) => {
        const result = await fetch(url, init);
        if (String(url).endsWith('/session')) { current = false; cancel?.(); await response.promise; }
        return result;
    };
    const joining = joinClassroom({ room: f.room, role: 'watch', authToken: 'owner', isCurrent: () => current,
        onCleanup: (callback) => { cancel = callback; } });
    response.resolve();
    await assert.rejects(joining, /cancelled/);
    await Promise.resolve();
    assert.deepEqual(f.calls.map((call) => call.path), ['/api/classroom/session', '/api/classroom/close']);
    assert.equal(f.data.classroom_media_sessions[0].active, false);
});

test('stopping discovery fences a deferred list before automatic pulls', async () => {
    const listing = deferred(); let pulls = 0, changes = 0;
    const tracker = createPresenceTracker({ handle: { sessionId: 'mine' }, room: 'room', list: () => listing.promise,
        pull: async () => { pulls++; }, onChange: () => { changes++; } });
    const tick = tracker.tick(); tracker.stop();
    listing.resolve([{ id: 'row', persona_id: 'gm', session_id: 'source', state: 'LIVE', tracks: [{ trackName: 'mic' }],
        expires_at: new Date(Date.now() + 30000).toISOString() }]);
    await tick;
    assert.equal(pulls, 0); assert.equal(changes, 0);
});

test('token rotation preserves completed and pending subscriptions while future reads use the current token', async () => {
    let token = 'first', pulls = 0;
    const tokens = [], inFlight = deferred();
    const row = { id: 'row', persona_id: 'gm', session_id: 'source', state: 'LIVE', tracks: [{ trackName: 'mic' }],
        expires_at: new Date(Date.now() + 30000).toISOString() };
    const tracker = createPresenceTracker({ handle: { room: 'room', sessionId: 'mine' }, room: 'room', getAuthToken: () => token,
        list: async (_room, auth) => { tokens.push(auth); return [row]; }, pull: async () => { pulls++; await inFlight.promise; } });
    const first = tracker.tick();
    await Promise.resolve();
    token = 'refreshed';
    await tracker.tick();
    assert.equal(pulls, 1);
    inFlight.resolve(); await first;
    await tracker.tick();
    assert.equal(pulls, 1);
    assert.deepEqual(tokens, ['first', 'refreshed', 'refreshed']);
    tracker.stop();
});

test('health and presence clients use the installed bound-session contract, not a client advertisement assertion', async (t) => {
    const f = browser(t);
    assert.equal((await classroomHealth()).sessions_installed, true);
    assert.equal((await presenceHealth()).collection_installed, true);
    const host = await joinClassroom({ room: f.room, role: 'teach', seatId: 'owner', authToken: 'owner',
        localStream: { getTracks: () => [{ kind: 'audio', stop() {} }] } });
    const receipt = await publishPresence({ room: f.room, sessionId: host.sessionId, tracks: host.published,
        getAuthToken: () => 'owner' });
    assert.equal(receipt.verified, false);
    const rows = await listPresence(f.room, 'owner');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].session_id, host.sessionId);
    await assert.rejects(listPresence(f.room, 'outsider'), /membership/);
    await assert.rejects(publishPresence({ room: f.room, sessionId: host.sessionId, tracks: [], authToken: 'owner' }), /no tracks/);
    host.close();
    assert.deepEqual(await listPresence(f.room, 'owner'), []);
});

test('a legacy or mismatched backend session response cannot authorize a join', async (t) => {
    const f = browser(t), fetch = globalThis.fetch;
    for (const room of [undefined, 'other-room']) {
        const stream = { getTracks: () => [track] }, track = { kind: 'audio', stop() { this.stopped = true; } };
        globalThis.fetch = async (url, init) => {
            const response = await fetch(url, init);
            if (String(url).endsWith('/session')) {
                const body = await response.json();
                response.json = async () => ({ ...body, room });
            }
            return response;
        };
        await assert.rejects(joinClassroom({ room: f.room, role: 'teach', authToken: 'owner', localStream: stream }), /did not bind/);
        assert.equal(track.stopped, true);
        assert.equal(f.connections.at(-1).connectionState, 'closed');
    }
    assert.ok(f.calls.every((call) => call.path !== '/api/classroom/tracks'));
});
