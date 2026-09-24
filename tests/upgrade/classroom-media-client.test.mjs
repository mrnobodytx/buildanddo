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
// Depends:     apps/web/src/lib/classroomRealtime.js, apps/web/src/lib/classroomTelemetry.js, tests/upgrade/classroom-media-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/classroomRealtime.js; CONSUMES tests/upgrade/classroom-media-fixture.mjs;
//              VALIDATES apps/web/src/lib/classroomTelemetry.js
// Intent:      Exercise real browser signalling against registered scoped handlers with explicit WebRTC and provider doubles and cancellation controls.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import { joinClassroom, pullTracks, createPresenceTracker, classroomHealth, presenceHealth,
    publishPresence, listPresence, inboundAudioStats } from '../../apps/web/src/lib/classroomRealtime.js';
import { mediaFixture } from './classroom-media-fixture.mjs';
import { createClassroomTelemetry } from '../../apps/web/src/lib/classroomTelemetry.js';

const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { resolve, reject, promise }; };
function browser(t) {
    const f = mediaFixture(), room = f.start(), calls = [], connections = [];
    const overrides = {
        RTCPeerConnection: class {
            constructor() {
                this.transceivers = []; this.iceGatheringState = 'complete'; this.connectionState = 'new';
                this.listeners = new Map(); this.closeCalls = 0; connections.push(this);
            }
            addEventListener(name, listener) {
                if (!this.listeners.has(name)) this.listeners.set(name, new Set());
                this.listeners.get(name).add(listener);
            }
            removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
            changeState(state) {
                this.connectionState = state;
                for (const listener of this.listeners.get('connectionstatechange') || []) listener();
            }
            addTransceiver() { const value = { mid: null }; this.transceivers.push(value); return value; }
            async createOffer() { return { type: 'offer', sdp: 'synthetic-offer' }; }
            async createAnswer() { return { type: 'answer', sdp: 'synthetic-answer' }; }
            async setLocalDescription(value) { this.localDescription = value; this.transceivers.forEach((value, i) => { value.mid = String(i); }); }
            async setRemoteDescription() {}
            close() { this.closeCalls++; this.changeState('closed'); }
        },
        RTCSessionDescription: class { constructor(value) { Object.assign(this, value); } },
        MediaStream: class { constructor() { this.tracks = []; } addTrack(track) { this.tracks.push(track); } getTracks() { return this.tracks; } },
        navigator: { mediaDevices: { getUserMedia: async () => { throw new Error('Unexpected device access in a stubbed source test.'); } } },
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

test('real peer-state listeners observe recovery and failure without closing media or claiming receipt', async (t) => {
    const f = browser(t), events = [];
    const observer = createClassroomTelemetry({ isCurrent: () => true, reportAction: (name, context) => events.push([name, context]) });
    const handle = await joinClassroom({ room: f.room, authToken: 'owner', onConnectionState: observer.connection });
    observer.accepted();
    const pc = handle.pc, listener = [...pc.listeners.get('connectionstatechange')][0];
    assert.equal(events.filter(([name]) => name === 'classroom.media.connected').length, 0);
    pc.changeState('connected'); pc.changeState('disconnected');
    assert.equal(handle.isCurrent(), true); assert.equal(pc.closeCalls, 0);
    assert.equal(events.filter(([, value]) => value.outcome === 'failure').length, 0);
    pc.changeState('connected'); pc.changeState('failed'); pc.changeState('closed');
    assert.equal(pc.closeCalls, 0, 'Telemetry does not own the media lifetime.');
    assert.deepEqual(events.filter(([name]) => name === 'classroom.media.connected').map(([, value]) => value.reason), ['peer_connected', 'peer_recovered']);
    assert.deepEqual(events.filter(([name]) => name === 'classroom.media.failure').map(([, value]) => value.reason), ['peer_failed', 'peer_closed']);
    assert.equal(events.filter(([name]) => name === 'classroom.media.join.result').length, 1);
    assert.equal(events.filter(([name]) => name === 'classroom.media.received').length, 0);
    assert.ok(events.every(([, value]) => value.outcome !== 'success'));
    observer.leave('left'); handle.close();
    assert.equal(pc.listeners.get('connectionstatechange').size, 0);
    const ended = events.length;
    pc.changeState('connected'); listener();
    assert.equal(events.length, ended);
});

test('failed joins remove the peer-state listener before closing the connection', async (t) => {
    const f = browser(t), states = [];
    await assert.rejects(joinClassroom({ room: f.room, authToken: 'outsider', onConnectionState: (state) => states.push(state) }), /membership/);
    assert.deepEqual(states, ['new']);
    assert.equal(f.connections[0].connectionState, 'closed');
    assert.equal(f.connections[0].listeners.get('connectionstatechange').size, 0);
});

test('connection observers that throw or reject do not alter successful signalling', async (t) => {
    const f = browser(t);
    for (const reject of [false, true]) {
        const handle = await joinClassroom({ room: f.room, authToken: 'owner', onConnectionState: () => {
            if (reject) return Promise.reject(new Error('observer unavailable'));
            throw new Error('observer unavailable');
        } });
        assert.ok(handle.sessionId); handle.pc.changeState('connected'); handle.close();
    }
    await new Promise((resolve) => setImmediate(resolve));
});

test('a stubbed device denial reports once and preserves the original rejection despite observer failure', async (t) => {
    const f = browser(t), error = Object.assign(new Error('private device message'), { name: 'NotAllowedError' });
    const events = [], observer = createClassroomTelemetry({ isCurrent: () => true, role: 'teach', trackEvent: (name, context) => events.push([name, context]) });
    navigator.mediaDevices.getUserMedia = async (constraints) => { assert.deepEqual(constraints, { audio: true, video: true }); throw error; };
    await assert.rejects(joinClassroom({ room: f.room, role: 'teach', authToken: 'owner', onDeviceError: (err) => {
        observer.deviceError(err); throw new Error('observer failure');
    } }), (err) => err === error);
    observer.failure('join_failed', error); observer.leave();
    assert.deepEqual(events.filter(([name]) => name === 'classroom.media.failure').map(([, value]) => value.reason), ['microphone_camera_denied']);
    assert.equal(events.filter(([name]) => name === 'classroom.media.join.result').length, 1);
    assert.doesNotMatch(JSON.stringify(events), /private/);
    assert.equal(f.calls.length, 0);
    assert.equal(f.connections[0].listeners.get('connectionstatechange').size, 0);
});

test('superseding a pending device prompt fences late rejection and retained peer callbacks', async (t) => {
    const f = browser(t), pending = deferred(), states = [], errors = [];
    navigator.mediaDevices.getUserMedia = () => pending.promise;
    let current = true, cancel;
    const joining = joinClassroom({ room: f.room, role: 'teach', authToken: 'owner', isCurrent: () => current,
        onCleanup: (close) => { cancel = close; }, onConnectionState: (state) => states.push(state), onDeviceError: (err) => errors.push(err) });
    const pc = f.connections[0], listener = [...pc.listeners.get('connectionstatechange')][0];
    current = false;
    pc.changeState('connected'); listener();
    cancel(); pending.reject(Object.assign(new Error('late denial'), { name: 'NotAllowedError' }));
    await assert.rejects(joining, /late denial/);
    assert.deepEqual(states, ['new']); assert.deepEqual(errors, []);
    assert.equal(pc.listeners.get('connectionstatechange').size, 0);
    assert.equal(f.calls.length, 0);
});

test('the browser stats producer reaches telemetry only as aggregate inbound counters', async () => {
    const records = [
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: 3, bytesReceived: 40, id: 'private-track', trackIdentifier: 'private-device' },
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: 4, bytesReceived: 60, remoteId: 'private-remote' },
        { type: 'outbound-rtp', kind: 'audio', packetsSent: 100 },
        { type: 'inbound-rtp', kind: 'video', packetsReceived: 50, bytesReceived: 500 },
        { type: 'remote-candidate', address: '192.0.2.1' },
    ];
    const stats = await inboundAudioStats({ getStats: async () => new Map(records.map((row, i) => [i, row])) });
    const events = [], observer = createClassroomTelemetry({ isCurrent: () => true, now: () => 0,
        trackEvent: (name, context) => events.push([name, context]) });
    observer.stats(stats);
    const received = events.find(([name]) => name === 'classroom.media.received')[1];
    assert.deepEqual(received, { section: '/app/classrooms/:room', source: 'classroom_media', operation: 'join', connection_state: 'unknown',
        outcome: 'observed', reason: 'browser_stats', received_packets: 7, received_bytes: 100, inbound_streams: 2, duration_ms: 0 });
    assert.doesNotMatch(JSON.stringify(events), /private|192\.0\.2\.1|"success"/);
});
