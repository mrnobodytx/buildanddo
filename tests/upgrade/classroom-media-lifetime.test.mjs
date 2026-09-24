// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/classroom-media-lifetime.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/hooks/classroomMediaLifetime.js, apps/web/src/lib/authSession.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/classroomMediaLifetime.js; CONSUMES apps/web/src/lib/authSession.js
// DAG Node:    none
// Intent:      Exercise production media ownership with explicit transport doubles, not an emulated React runtime or live media.
// ----------------------------------------------------------------

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaLifetime } from '../../apps/web/src/hooks/classroomMediaLifetime.js';
import { createAuthSession } from '../../apps/web/src/lib/authSession.js';

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function media() {
    const track = () => ({ readyState: 'live', stopped: 0, stop() { this.stopped++; this.readyState = 'ended'; } });
    const local = track(), remote = track();
    return {
        local, remote, closed: 0,
        stream: { getTracks: () => [local] }, remoteStream: { getTracks: () => [remote] },
        pc: { connectionState: 'connected', closed: 0, close() { this.closed++; this.connectionState = 'closed'; } },
        close() { this.closed++; },
    };
}

test('the lifetime is idle until an explicit claim and refuses same-tick duplicate joins', () => {
    const lifetime = createMediaLifetime();
    assert.equal(lifetime.active, null);
    assert.equal(lifetime.begin(() => false), null);
    const attempt = lifetime.begin(() => true);
    assert.ok(attempt.current());
    assert.equal(lifetime.begin(() => true), null);
    const handle = media();
    assert.equal(attempt.accept(handle), true);
    assert.equal(attempt.handle, handle);
    assert.equal(lifetime.begin(() => true), null);
    lifetime.cancel();
});

test('leave during connection closes a late handle and the actual local and remote tracks', async () => {
    const lifetime = createMediaLifetime(), pending = deferred();
    const attempt = lifetime.begin(() => true);
    const joining = pending.promise.then((handle) => attempt.accept(handle));
    lifetime.cancel();
    const late = media(); pending.resolve(late);
    assert.equal(await joining, false);
    assert.equal(lifetime.active, null);
    assert.equal(late.closed, 1);
    assert.equal(late.local.stopped, 1);
    assert.equal(late.remote.stopped, 1);
    assert.equal(late.pc.closed, 1);
});

test('returning to the same room cannot revive an old attempt or cancel its replacement', async () => {
    const lifetime = createMediaLifetime(), pending = deferred();
    const old = lifetime.begin(() => true);
    const joining = pending.promise.then((handle) => old.accept(handle));
    lifetime.cancel();
    const current = lifetime.begin(() => true), handle = media();
    current.accept(handle);
    const late = media(); pending.resolve(late);
    assert.equal(await joining, false);
    old.cancel();
    assert.equal(lifetime.active, current);
    assert.ok(current.current());
    assert.equal(handle.closed, 0);
    assert.equal(late.closed, 1);
    lifetime.cancel();
});

test('scope invalidation rejects a late handle before effect cleanup and cannot be reversed', async () => {
    let current = true;
    const lifetime = createMediaLifetime(), pending = deferred();
    const attempt = lifetime.begin(() => current);
    const joining = pending.promise.then((handle) => attempt.accept(handle));
    current = false;
    assert.equal(attempt.current(), false);
    const late = media(); pending.resolve(late);
    assert.equal(await joining, false);
    assert.equal(late.local.readyState, 'ended');
    assert.equal(late.remote.readyState, 'ended');
    assert.equal(lifetime.active, null);
    current = true;
    assert.equal(attempt.current(), false);
});

test('cancellation fences callbacks before disposing and cleans each resource once', () => {
    const lifetime = createMediaLifetime(), attempt = lifetime.begin(() => true), handle = media();
    let trackerStops = 0, heartbeatStops = 0, staleUpdates = 0;
    attempt.accept(handle);
    const stopTracker = attempt.addCleanup(() => { trackerStops++; if (attempt.current()) staleUpdates++; });
    attempt.addCleanup(() => { heartbeatStops++; if (attempt.current()) staleUpdates++; });
    lifetime.cancel(); lifetime.cancel(); stopTracker(); attempt.cancel();
    assert.equal(staleUpdates, 0);
    assert.equal(trackerStops, 1);
    assert.equal(heartbeatStops, 1);
    assert.equal(handle.closed, 1);
    assert.equal(handle.pc.closed, 1);
    assert.equal(handle.local.stopped, 1);
    assert.equal(handle.remote.stopped, 1);
});

test('a disposed effect is not retained, and registering cleanup on a cancelled attempt runs it immediately', () => {
    const lifetime = createMediaLifetime(), attempt = lifetime.begin(() => true);
    let stops = 0;
    const stop = attempt.addCleanup(() => { stops++; });
    stop(); stop();
    assert.equal(stops, 1);
    lifetime.cancel();
    assert.equal(stops, 1);
    const late = attempt.addCleanup(() => { stops++; });
    late();
    assert.equal(stops, 2);
});

test('cleanup failures do not retain other resources, tracks or peer connections', () => {
    const lifetime = createMediaLifetime(), attempt = lifetime.begin(() => true), handle = media();
    let otherCleanup = false;
    handle.close = () => { throw new Error('close failed'); };
    handle.stream = { getTracks: () => [{ stop() { throw new Error('track failed'); } }, handle.local] };
    attempt.accept(handle);
    attempt.addCleanup(() => { throw new Error('tracker stop failed'); });
    attempt.addCleanup(() => { otherCleanup = true; });
    assert.doesNotThrow(() => lifetime.cancel());
    assert.ok(otherCleanup);
    assert.equal(handle.local.stopped, 1);
    assert.equal(handle.remote.stopped, 1);
    assert.equal(handle.pc.closed, 1);
});

test('an already-stale claim cannot block an explicit join in the current scope', () => {
    let current = true;
    const lifetime = createMediaLifetime(), old = lifetime.begin(() => current), handle = media();
    old.accept(handle);
    current = false;
    const next = lifetime.begin(() => true);
    assert.ok(next.current());
    assert.equal(old.current(), false);
    assert.equal(handle.closed, 1);
    lifetime.cancel();
});

test('native auth refresh preserves a claim but a same-account session replacement cancels it', async () => {
    const listeners = new Set(), replies = [];
    const store = {
        token: 'synthetic-session', record: { id: 'member' }, isValid: true,
        onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        save(token, record) { this.token = token; this.record = record; for (const fn of listeners) fn(); },
        clear() { this.token = ''; this.record = null; for (const fn of listeners) fn(); },
    };
    const client = { authStore: store, send() { const job = deferred(); replies.push(job); return job.promise; } };
    let auth;
    const controller = createAuthSession(client, (value) => { auth = value; });
    const starting = controller.start();
    replies.shift().resolve({ token: 'synthetic-initial-refresh', record: { id: 'member' } });
    await starting;
    const epoch = auth.sessionEpoch, lifetime = createMediaLifetime();
    const attempt = lifetime.begin(() => controller.isCurrent(epoch));
    const refreshing = controller.refresh();
    replies.shift().resolve({ token: 'synthetic-next-refresh', record: { id: 'member' } });
    await refreshing;
    assert.equal(auth.sessionEpoch, epoch);
    assert.ok(attempt.current());
    assert.equal(lifetime.begin(() => controller.isCurrent(epoch)), null);
    store.save('synthetic-replacement', { id: 'member' });
    assert.equal(attempt.current(), false);
    const late = media();
    assert.equal(attempt.accept(late), false);
    assert.equal(late.local.stopped, 1);
    assert.equal(late.remote.stopped, 1);
    assert.notEqual(auth.sessionEpoch, epoch);
    const replacement = controller.refresh();
    replies.shift().resolve({ token: 'synthetic-validated-replacement', record: { id: 'member' } });
    await replacement;
    assert.equal(attempt.current(), false);
    const next = lifetime.begin(() => controller.isCurrent(auth.sessionEpoch));
    assert.ok(next.current());
    lifetime.cancel(); controller.stop();
});
