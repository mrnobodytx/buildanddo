// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/classroom-telemetry.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/classroomTelemetry.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/classroomTelemetry.js
// Intent:      Verify bounded personless media observations and independent sink failure handling without devices, SDKs or network access.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import { createClassroomTelemetry } from '../../apps/web/src/lib/classroomTelemetry.js';

function fixture(sinks = {}) {
    const actions = [], events = [], failures = [];
    let current = true, time = 100;
    const observer = createClassroomTelemetry({
        isCurrent: () => current,
        role: sinks.role,
        now: () => sinks.now ? sinks.now() : time,
        reportAction: (name, context) => { actions.push([name, { ...context }]); return sinks.action?.(name, context); },
        trackEvent: (name, context) => { events.push([name, { ...context }]); return sinks.event?.(name, context); },
        readFailed: (...args) => { failures.push(args); return sinks.failure?.(...args); },
    });
    return { observer, actions, events, failures, at: (value) => { time = value; }, invalidate: () => { current = false; },
        named: (event) => actions.filter(([name]) => name === `classroom.media.${event}`).map(([, context]) => context) };
}

test('a join has one signalling-only result, never optimistic connected, receipt or success', () => {
    const f = fixture();
    assert.equal(f.named('join.started').length, 1);
    f.at(125); f.observer.accepted(); f.observer.accepted();
    assert.deepEqual(f.named('join.result'), [{ section: '/app/classrooms/:room', source: 'classroom_media', operation: 'join',
        connection_state: 'unknown', outcome: 'accepted', reason: 'signalling_only', duration_ms: 25 }]);
    assert.equal(f.named('connected').length, 0);
    assert.equal(f.named('received').length, 0);
    assert.ok(f.actions.every(([, context]) => context.outcome !== 'success'));
    assert.deepEqual(f.actions, f.events);
});

test('broadcast start and listener join use closed operation labels, never supplied roles', () => {
    for (const role of ['teach', 'watch', 'private-role']) {
        const f = fixture({ role }); f.observer.accepted();
        assert.equal(f.named('join.started')[0].operation, role === 'teach' ? 'start' : 'join');
        assert.equal(f.named('join.result')[0].operation, role === 'teach' ? 'start' : 'join');
        assert.doesNotMatch(JSON.stringify(f.actions), /private-role/);
    }
});

test('disconnect and recovery are bounded observations, not terminal failures', () => {
    const f = fixture(); f.observer.accepted();
    for (const state of ['new', 'connecting', 'connected', 'disconnected', 'connected', 'disconnected', 'connecting', 'connected']) {
        f.observer.connection(state);
    }
    assert.deepEqual(f.named('connected').map((value) => value.reason), ['peer_connected', 'peer_recovered']);
    assert.deepEqual(f.named('connection').map((value) => value.connection_state), ['new', 'connecting', 'disconnected']);
    assert.equal(f.named('failure').length, 0); assert.equal(f.failures.length, 0);
    assert.equal(f.named('leave').length, 0); assert.equal(f.named('join.result').length, 1);
    f.observer.connection('failed'); f.observer.connection('closed');
    f.observer.connection('failed'); f.observer.connection('closed');
    assert.deepEqual(f.named('failure').map((value) => value.reason), ['peer_failed', 'peer_closed']);
    assert.equal(f.named('join.result').length, 1);
});

test('a peer failure before acceptance settles the join once and cannot turn into accepted', () => {
    const f = fixture();
    f.observer.connection('failed'); f.observer.accepted(); f.observer.failure('join_failed', new Error('private provider prose'));
    f.observer.leave(); f.observer.leave('left');
    assert.equal(f.named('join.result').length, 1);
    assert.equal(f.named('join.result')[0].outcome, 'failure');
    assert.equal(f.named('join.result')[0].reason, 'peer_failed');
    assert.equal(f.named('failure').length, 1); assert.equal(f.named('leave').length, 0);
});

for (const [name, reason] of [['NotAllowedError', 'microphone_camera_denied'], ['PermissionDeniedError', 'microphone_camera_denied'],
    ['SecurityError', 'microphone_camera_denied'], ['NotFoundError', 'microphone_camera_unavailable'],
    ['NotReadableError', 'microphone_camera_unavailable'], ['private-device-name', 'microphone_camera_failed']]) {
    test(`combined capture ${name} records only the bounded device reason`, () => {
        const f = fixture(), error = Object.assign(new Error('private device and room content'), { name, deviceId: 'private-device-id' });
        f.observer.deviceError(error); f.observer.failure('join_failed', error); f.observer.leave();
        assert.equal(f.named('failure').length, 1); assert.equal(f.named('failure')[0].reason, reason);
        assert.equal(f.named('join.result').length, 1); assert.equal(f.named('join.result')[0].outcome, 'failure');
        assert.doesNotMatch(JSON.stringify([f.actions, f.events, f.failures]), /private/);
    });
}

test('stats expose only measured safe aggregate counters and emit receipt only once', () => {
    const f = fixture(); f.observer.accepted();
    f.observer.stats({ supported: false, packets: 5, bytes: 10 });
    f.observer.stats({ supported: true, packets: 0, bytes: 0, streams: 1 });
    f.observer.stats({ supported: true, packets: 'private-track-id', bytes: Infinity, streams: -1 });
    f.observer.stats({ supported: true, packets: NaN, bytes: -1, streams: 1.5 });
    assert.equal(f.named('received').length, 0);
    const input = { supported: true, packets: 3, bytes: 45, streams: 1, sdp: 'private-sdp',
        tracks: ['private-track'], room: 'private-room', workspace: 'private-workspace', user: 'private-user',
        deviceId: 'private-device', address: '192.0.2.1' };
    f.at(150); f.observer.stats(input);
    f.observer.stats({ supported: true, packets: 30, bytes: 450, streams: 2 });
    f.at(200); f.observer.leave('left'); f.observer.leave();
    assert.deepEqual(f.named('received'), [{ section: '/app/classrooms/:room', source: 'classroom_media', operation: 'join',
        connection_state: 'unknown', outcome: 'observed', reason: 'browser_stats', duration_ms: 50,
        received_bytes: 45, received_packets: 3, inbound_streams: 1 }]);
    assert.deepEqual(f.named('leave'), [{ section: '/app/classrooms/:room', source: 'classroom_media', operation: 'join',
        connection_state: 'unknown', outcome: 'observed', reason: 'left', duration_ms: 100,
        received_bytes: 450, received_packets: 30, inbound_streams: 2 }]);
    assert.equal(input.sdp, 'private-sdp');
    assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /private|192\.0\.2\.1|"success"|delivery/);
});

test('invalid counters and hostile enum values cannot widen the payload', () => {
    const f = fixture();
    f.observer.connection('private-state'); f.observer.connection({ ip: '192.0.2.1' });
    f.observer.failure('private-reason', { status: 'private-status' });
    f.observer.stats({ supported: true, packets: Number.MAX_SAFE_INTEGER + 1, bytes: -3, streams: '4' });
    f.observer.leave('private-reason');
    assert.equal(f.named('connection').length, 1); assert.equal(f.named('connection')[0].connection_state, 'unknown');
    assert.equal(f.named('failure').length, 0); assert.equal(f.named('received').length, 0);
    assert.equal(f.named('leave')[0].reason, 'scope_ended');
    assert.ok(!Object.hasOwn(f.named('leave')[0], 'received_packets'));
    assert.doesNotMatch(JSON.stringify([f.actions, f.events, f.failures]), /private|192\.0\.2\.1/);
});

test('current nonterminal failures are deduplicated and readFailed receives no error prose', () => {
    const f = fixture(); f.observer.accepted();
    const err = Object.assign(new Error('private backend body'), { status: 200, code: 'NOT_JSON', url: 'https://private.invalid/?room=private' });
    f.observer.failure('presence_failed', err); f.observer.failure('presence_failed', err);
    f.observer.connection('connected'); f.observer.failure('presence_failed', err);
    f.observer.failure('listen_failed', { status: 403 });
    f.observer.failure('heartbeat_failed', { status: 0 });
    f.observer.failure('autoplay_blocked', { status: 'private' });
    f.observer.failure('publish_forbidden');
    assert.deepEqual(f.failures, [
        ['/app/classrooms/:room', 'classroom_media', 'invalid_response', 200],
        ['/app/classrooms/:room', 'classroom_media', 'unavailable', 403],
        ['/app/classrooms/:room', 'classroom_media', 'unavailable', 0],
        ['/app/classrooms/:room', 'classroom_media', 'unavailable', undefined],
        ['/app/classrooms/:room', 'classroom_media', 'forbidden', undefined],
    ]);
    assert.deepEqual(f.named('failure').map((value) => value.status_class), ['2xx', '4xx', 'network', 'unknown', 'unknown']);
    assert.equal(f.named('join.result').length, 1);
    assert.doesNotMatch(JSON.stringify([f.actions, f.events, f.failures]), /private/);
});

test('teardown settles pending cancellation once and makes all late observations inert', () => {
    const f = fixture(); f.invalidate();
    f.observer.accepted(); f.observer.connection('connected'); f.observer.deviceError({ name: 'NotAllowedError' });
    f.observer.stats({ supported: true, bytes: 4 }); f.observer.failure('join_failed');
    assert.equal(f.actions.length, 1);
    f.observer.leave();
    const end = f.actions.length;
    f.observer.leave('left'); f.observer.accepted(); f.observer.connection('failed');
    f.observer.stats({ supported: true, packets: 1 }); f.observer.failure('autoplay_blocked');
    assert.equal(f.actions.length, end);
    assert.deepEqual(f.named('join.result').map((value) => value.outcome), ['cancelled']);
    assert.equal(f.named('leave').length, 1); assert.equal(f.failures.length, 0);
});

test('synchronous and asynchronous sink failures remain independent and cannot throw into media', async () => {
    for (const rejects of [false, true]) {
        const fail = () => { if (rejects) return Promise.reject(new Error('sink unavailable')); throw new Error('sink unavailable'); };
        const f = fixture({ action: fail, event: fail, failure: fail });
        assert.doesNotThrow(() => {
            f.observer.accepted(); f.observer.connection('connected'); f.observer.failure('autoplay_blocked');
            f.observer.stats({ supported: true, bytes: 1 }); f.observer.leave('left');
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(f.actions, f.events);
        assert.equal(f.actions.length, 6); assert.equal(f.failures.length, 1);
    }
});

test('optional timing and opaque errors cannot suppress safe telemetry', () => {
    const f = fixture({ now: () => { throw new Error('clock unavailable'); } });
    const error = Object.defineProperties({}, {
        name: { get() { throw new Error('private'); } }, status: { get() { throw new Error('private'); } },
    });
    assert.doesNotThrow(() => { f.observer.deviceError(error); f.observer.leave(); });
    assert.equal(f.named('failure')[0].reason, 'microphone_camera_failed');
    assert.ok(f.actions.every(([, context]) => !Object.hasOwn(context, 'duration_ms')));
    assert.deepEqual(f.actions, f.events);
});

test('a misbehaving first sink cannot mutate the second sink context', () => {
    const f = fixture({ action: (_name, context) => { context.reason = 'private sink mutation'; context.user = 'private'; } });
    f.observer.failure('join_failed');
    assert.deepEqual(f.actions, f.events);
    assert.doesNotMatch(JSON.stringify(f.events), /private/);
});
