// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/classroom-ice.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-REALTIME-TURN-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-REALTIME-TURN-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     tests/upgrade/classroom-media-fixture.mjs, apps/pocketbase/pb_hooks/classroom-realtime.pb.js, apps/web/src/lib/classroomRealtime.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/classroom-realtime-lib.js; VALIDATES apps/pocketbase/pb_hooks/classroom-realtime.pb.js; VALIDATES apps/web/src/lib/classroomRealtime.js
// Intent:      Prove TURN reaches the peer when configured and that every failure degrades to the pre-TURN STUN join.
// ----------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaFixture } from './classroom-media-fixture.mjs';
import { classroomIceServers, joinClassroom } from '../../apps/web/src/lib/classroomRealtime.js';

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478'] }];
const TURN_ANSWER = { iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
    { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp',
        'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:5349?transport=tcp',
        'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'fixture-user', credential: 'fixture-credential' },
] };

function withTurn(f, answer = { statusCode: 201, json: TURN_ANSWER }) {
    f.env.CLOUDFLARE_TURN_KEY_ID = 'fixturekey0001';
    f.env.CLOUDFLARE_TURN_KEY_API_TOKEN = 'fixture-only-not-a-token';
    const turnCalls = [], realtime = f.provider.send;
    f.provider.send = (options) => {
        if (!String(options.url).includes('/v1/turn/')) return realtime(options);
        turnCalls.push(options);
        if (answer instanceof Error) throw answer;
        return typeof answer === 'function' ? answer(options) : answer;
    };
    return turnCalls;
}

test('the ICE route is for signed-in callers only and never caches', () => {
    const f = mediaFixture();
    const route = f.routes.get('GET /api/classroom/ice');
    assert.ok(route, 'GET /api/classroom/ice is registered');
    assert.deepEqual(route.auth, { auth: 'users' });
    assert.equal(f.request('GET', '/api/classroom/ice', { actor: null }).status, 401);
});

test('without a TURN key the route answers STUN only, named, and never calls Cloudflare', () => {
    const f = mediaFixture();
    const before = f.requests.length;
    const result = f.request('GET', '/api/classroom/ice');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { iceServers: STUN, turn: false, ttl: 0, reason: 'CLOUDFLARE_TURN_KEY_ID absent' });
    assert.equal(f.requests.length, before, 'no provider call without configuration');
    f.env.CLOUDFLARE_TURN_KEY_ID = 'fixturekey0001';
    assert.equal(f.request('GET', '/api/classroom/ice').body.reason, 'CLOUDFLARE_TURN_KEY_API_TOKEN absent');
    f.env.CLOUDFLARE_TURN_KEY_API_TOKEN = 'x'; f.env.CLOUDFLARE_TURN_KEY_ID = 'bad/key';
    assert.equal(f.request('GET', '/api/classroom/ice').body.reason, 'CLOUDFLARE_TURN_KEY_ID malformed');
});

test('configured TURN mints short-lived credentials and drops port 53 for a non-trickle client', () => {
    const f = mediaFixture();
    const calls = withTurn(f);
    const result = f.request('GET', '/api/classroom/ice');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].url, 'https://rtc.live.cloudflare.com/v1/turn/keys/fixturekey0001/credentials/generate-ice-servers');
    assert.equal(calls[0].headers.Authorization, 'Bearer fixture-only-not-a-token');
    assert.deepEqual(JSON.parse(calls[0].body), { ttl: 14400 });
    assert.equal(result.status, 200);
    assert.equal(result.body.turn, true);
    assert.equal(result.body.reason, '');
    const urls = result.body.iceServers.flatMap((s) => s.urls);
    assert.ok(urls.includes('turns:turn.cloudflare.com:443?transport=tcp'), 'TLS on 443 survives for strict firewalls');
    assert.ok(urls.includes('turns:turn.cloudflare.com:5349?transport=tcp'), ':5349 is not :53');
    assert.ok(!urls.some((u) => /:53(\?|$)/.test(u)), 'no port 53 URL reaches the browser');
    const relay = result.body.iceServers.find((s) => s.credential);
    assert.deepEqual([relay.username, relay.credential], ['fixture-user', 'fixture-credential']);
    assert.ok(!JSON.stringify(result.body).includes('fixture-only-not-a-token'), 'the API token never leaves the server');
});

test('every TURN failure degrades to the STUN-only join with the reason named', () => {
    const cases = [
        [{ statusCode: 401, json: { error: 'no' } }, 'turn_http_401'],
        [{ statusCode: 500, json: {} }, 'turn_http_500'],
        [{ statusCode: 201, json: { nothing: true } }, 'turn_unreadable'],
        [{ statusCode: 201, json: { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }] } }, 'turn_no_relay'],
        [{ statusCode: 201, json: { iceServers: [{ urls: ['turn:turn.cloudflare.com:53?transport=udp'], username: 'u', credential: 'c' }] } }, 'turn_no_relay'],
        [new Error('socket closed'), 'turn_unreachable'],
    ];
    for (const [answer, reason] of cases) {
        const f = mediaFixture();
        withTurn(f, answer);
        const result = f.request('GET', '/api/classroom/ice');
        assert.equal(result.status, 200, reason);
        assert.deepEqual(result.body, { iceServers: STUN, turn: false, ttl: 0, reason }, reason);
    }
});

test('health reports whether TURN is configured without exposing it', () => {
    const f = mediaFixture();
    assert.equal(f.request('GET', '/api/classroom/health').body.turn_configured, false);
    withTurn(f);
    const body = f.request('GET', '/api/classroom/health').body;
    assert.equal(body.turn_configured, true);
    assert.ok(!JSON.stringify(body).includes('fixture-only-not-a-token'));
});

function stubGlobals(t, overrides) {
    for (const [key, value] of Object.entries(overrides)) {
        const original = Object.getOwnPropertyDescriptor(globalThis, key);
        Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
        t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else delete globalThis[key]; });
    }
}

test('classroomIceServers passes TURN through and never throws', async (t) => {
    let answer;
    stubGlobals(t, { fetch: async (url, init) => {
        assert.match(String(url), /\/api\/classroom\/ice$/);
        assert.equal(init.method, 'GET');
        assert.equal(init.headers.Authorization, 'tok');
        if (answer instanceof Error) throw answer;
        return { ok: answer.status < 400, status: answer.status, headers: { get: () => 'application/json' }, json: async () => answer.body };
    } });
    answer = { status: 200, body: { iceServers: TURN_ANSWER.iceServers, turn: true, reason: '' } };
    const ok = await classroomIceServers('tok');
    assert.equal(ok.turn, true);
    assert.equal(ok.iceServers.length, 2);
    answer = { status: 200, body: { iceServers: [{ urls: ['https://not-ice'] }], turn: true } };
    assert.deepEqual(await classroomIceServers('tok'), { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], turn: false, reason: 'ice_unreadable' });
    answer = { status: 404, body: {} };
    assert.equal((await classroomIceServers('tok')).reason, 'ice_request_failed:404');
    answer = new TypeError('offline');
    const offline = await classroomIceServers('tok');
    assert.equal(offline.turn, false);
    assert.equal(offline.reason, 'ice_request_failed:network');
});

test('joinClassroom hands given ICE servers to the peer, and STUN when they are absent or malformed', async (t) => {
    const configs = [];
    stubGlobals(t, {
        RTCPeerConnection: class {
            constructor(config) { configs.push(config); this.iceGatheringState = 'complete'; this.connectionState = 'new'; }
            addEventListener() {} removeEventListener() {} close() {}
            addTransceiver() { return { mid: '0' }; }
            async createOffer() { return { type: 'offer', sdp: 'o' }; }
            async setLocalDescription(v) { this.localDescription = v; }
            async setRemoteDescription() {}
        },
        RTCSessionDescription: class { constructor(v) { Object.assign(this, v); } },
        MediaStream: class { getTracks() { return []; } addTrack() {} },
        fetch: async () => { throw new Error('stop after the peer is built'); },
    });
    const join = (iceServers) => joinClassroom({ room: 'room1', role: 'watch', authToken: 't', iceServers }).catch(() => null);
    await join(TURN_ANSWER.iceServers);
    await join(undefined);
    await join([{ urls: ['https://not-ice'] }]);
    assert.deepEqual(configs[0].iceServers, TURN_ANSWER.iceServers);
    assert.equal(configs[0].bundlePolicy, 'max-bundle');
    assert.deepEqual(configs[1].iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }]);
    assert.deepEqual(configs[2].iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }]);
});
