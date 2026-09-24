// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/classroomRealtime.presence.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/classroomRealtime.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/classroomRealtime.js
// Intent:      Pin the pull's renegotiation leg, the refusal to send an empty tracks array, the once-per-session presence subscription, the overlap guards and the refusal to read an HTML fallback as an empty room.
// ───────────────────────────────────────────────────────────────
//
// OFFLINE. Every test drives an injected fetch or an injected list/pull pair; the
// real network is never reached and no credential name is read. A test that needed
// a live SFU would have to skip with a named reason, so none of these do.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    pullTracks,
    publishPresence,
    listPresence,
    startPresenceHeartbeat,
    createPresenceTracker,
    joinClassroom,
    inboundAudioStats,
    isLivePresence,
    isUnreadablePresence,
    trackNameFor,
    API,
} from '@/lib/classroomRealtime';

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        url: 'http://test/api',
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null) },
        json: async () => body,
    };
}

/** The estate's real failure mode: /api/* answered by the SPA's index.html. */
function htmlResponse(status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        url: 'http://test/hcgi/platform/api/classroom/presence',
        headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null) },
        json: async () => { throw new Error('Unexpected token <'); },
    };
}

/** A peer connection with just the surface pullTracks touches. */
function fakePc() {
    const pc = {
        localDescription: null,
        setRemoteDescription: vi.fn(async () => {}),
        createAnswer: vi.fn(async () => ({ type: 'answer', sdp: 'v=0\r\na=answer' })),
    };
    pc.setLocalDescription = vi.fn(async (desc) => { pc.localDescription = desc; });
    return pc;
}

/** Deferred promise, for testing that a slow call is not issued twice. */
function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

describe('pullTracks', () => {
    let calls;
    let originalRtc;

    beforeEach(() => {
        calls = [];
        originalRtc = globalThis.RTCSessionDescription;
        globalThis.RTCSessionDescription = function RTCSessionDescriptionStub(init) { Object.assign(this, init); };
        globalThis.fetch = vi.fn(async (url, init = {}) => {
            calls.push({
                url: String(url),
                method: init.method,
                body: init.body ? JSON.parse(init.body) : null,
            });
            if (String(url).includes('/api/classroom/renegotiate')) return jsonResponse({ ok: true });
            if (String(url).includes('/api/classroom/tracks')) {
                return jsonResponse({
                    requiresImmediateRenegotiation: true,
                    sessionDescription: { type: 'offer', sdp: 'v=0\r\na=sfu-offer' },
                });
            }
            throw new Error(`unexpected request to ${url}`);
        });
    });

    afterEach(() => {
        globalThis.RTCSessionDescription = originalRtc;
    });

    it('posts the pull and then PUTs the answer to the renegotiate route', async () => {
        const pc = fakePc();
        await pullTracks(
            { room: 'room-1', sessionId: 'sess-mine', pc },
            [{ sessionId: 'sess-forge', trackName: 'seat:forge/mic' }],
            'token-abc',
        );

        expect(calls).toHaveLength(2);

        expect(calls[0].method).toBe('POST');
        expect(calls[0].url).toContain('/api/classroom/tracks');
        expect(calls[0].body.action).toBe('pull');
        expect(calls[0].body.room).toBe('room-1');
        expect(calls[0].body.tracks).toEqual([
            { location: 'remote', trackName: 'seat:forge/mic', sessionId: 'sess-forge' },
        ]);

        // The defect this pins: the answer used to go back to /api/classroom/tracks,
        // which is neither the renegotiate endpoint nor a legal tracks call.
        expect(calls[1].method).toBe('PUT');
        expect(calls[1].url).toContain('/api/classroom/renegotiate');
        expect(calls[1].url).toBe(API.renegotiate);
        expect(calls[1].body.sessionId).toBe('sess-mine');
        expect(calls[1].body.room).toBe('room-1');
        expect(calls[1].body.sessionDescription).toEqual({ type: 'answer', sdp: 'v=0\r\na=answer' });
        expect(pc.setRemoteDescription).toHaveBeenCalledTimes(1);
    });

    it('never sends an empty tracks array', async () => {
        const pc = fakePc();
        await pullTracks({ room: 'room-1', sessionId: 'sess-mine', pc }, [{ sessionId: 's', trackName: 't' }], 'token-abc');
        // Guard against a vacuous loop: at least one call MUST carry tracks, or the
        // assertions below would pass on a module that sent nothing at all.
        const withTracks = calls.filter((call) => call.body && 'tracks' in call.body);
        expect(withTracks).toHaveLength(1);
        for (const call of withTracks) {
            expect(Array.isArray(call.body.tracks)).toBe(true);
            expect(call.body.tracks.length).toBeGreaterThan(0);
        }
        // The renegotiate leg carries no tracks key at all.
        expect(calls[1].body.tracks).toBeUndefined();
    });

    it('refuses to call the backend at all when nothing was requested', async () => {
        const pc = fakePc();
        await expect(pullTracks({ room: 'room-1', sessionId: 'sess-mine', pc }, [], 'token-abc'))
            .rejects.toThrow('no tracks requested');
        await expect(pullTracks({ room: 'room-1', sessionId: 'sess-mine', pc }, [{ trackName: 'orphan' }], 'token-abc'))
            .rejects.toThrow('no tracks requested');
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('skips the renegotiation when the SFU did not ask for one', async () => {
        globalThis.fetch = vi.fn(async (url, init = {}) => {
            calls.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null });
            return jsonResponse({ requiresImmediateRenegotiation: false });
        });
        const pc = fakePc();
        await pullTracks({ room: 'room-1', sessionId: 'sess-mine', pc }, [{ sessionId: 's', trackName: 't' }], 'token');
        expect(calls).toHaveLength(1);
        expect(pc.setRemoteDescription).not.toHaveBeenCalled();
    });
});

describe('the SPA fallback is an error, never an empty room', () => {
    it('refuses an HTML body from the presence route instead of returning []', async () => {
        globalThis.fetch = vi.fn(async () => htmlResponse(200));
        await expect(listPresence('room-1', 'token')).rejects.toThrow(/did not answer with JSON/);
    });

    it('refuses a JSON body with no items list', async () => {
        globalThis.fetch = vi.fn(async () => jsonResponse({ room: 'room-1' }));
        await expect(listPresence('room-1', 'token')).rejects.toThrow('presence route answered without an items list');
    });

    it('returns the rows when the backend really answered', async () => {
        globalThis.fetch = vi.fn(async () => jsonResponse({ items: [{ id: 'a' }] }));
        await expect(listPresence('room-1', 'token')).resolves.toEqual([{ id: 'a' }]);
    });
});

describe('presence rows', () => {
    it('reads a PocketBase stamp and an ISO stamp alike', () => {
        const row = { session_id: 's', tracks: [{ trackName: 't' }], state: 'LIVE' };
        expect(isLivePresence({ ...row, expires_at: '2026-09-18 12:00:00.000Z' }, Date.parse('2026-09-18T11:59:59Z'))).toBe(true);
        expect(isLivePresence({ ...row, expires_at: '2026-09-18T12:00:00.000Z' }, Date.parse('2026-09-18T12:00:01Z'))).toBe(false);
    });

    it('treats a row with no tracks, no session or an ENDED state as dead', () => {
        const future = new Date(Date.now() + 30000).toISOString();
        expect(isLivePresence({ session_id: 's', tracks: [], expires_at: future }, Date.now())).toBe(false);
        expect(isLivePresence({ session_id: '', tracks: [{ trackName: 't' }], expires_at: future }, Date.now())).toBe(false);
        expect(isLivePresence({ session_id: 's', tracks: [{ trackName: 't' }], state: 'ENDED', expires_at: future }, Date.now())).toBe(false);
    });

    it('separates an unreadable advertisement from an absent one', () => {
        const now = Date.now();
        const future = new Date(now + 30000).toISOString();
        const broken = { id: 'b', session_id: 's', tracks: [], tracks_error: 'unparseable', expires_at: future };
        expect(isLivePresence(broken, now)).toBe(false);
        expect(isUnreadablePresence(broken, now)).toBe(true);
        expect(isUnreadablePresence({ ...broken, tracks_error: '' }, now)).toBe(false);
        expect(isUnreadablePresence({ ...broken, expires_at: new Date(now - 1).toISOString() }, now)).toBe(false);
    });

    it('derives a track name that survives a reconnect', () => {
        expect(trackNameFor('abc123', 'mic')).toBe('seat:abc123/mic');
        expect(trackNameFor('a b/c', 'cam')).toBe('seat:a-b-c/cam');
        expect(trackNameFor('', 'mic')).toBe('seat:anon/mic');
    });
});

describe('joinClassroom track naming', () => {
    let originalPc;
    let originalRtc;
    let originalStream;

    beforeEach(() => {
        originalPc = globalThis.RTCPeerConnection;
        originalRtc = globalThis.RTCSessionDescription;
        originalStream = globalThis.MediaStream;
        globalThis.RTCSessionDescription = function RTCSessionDescriptionStub(init) { Object.assign(this, init); };
        globalThis.MediaStream = function MediaStreamStub() {
            this.tracks = [];
            this.addTrack = (t) => this.tracks.push(t);
            this.getTracks = () => this.tracks;
        };
        let mid = 0;
        globalThis.RTCPeerConnection = function RTCPeerConnectionStub() {
            this.iceGatheringState = 'complete';
            this.localDescription = { type: 'offer', sdp: 'v=0\r\na=offer' };
            this.addEventListener = () => {};
            this.removeEventListener = () => {};
            this.addTransceiver = () => ({ mid: String(mid++) });
            this.createOffer = async () => ({ type: 'offer', sdp: 'v=0\r\na=offer' });
            this.setLocalDescription = async () => {};
            this.setRemoteDescription = async () => {};
            this.close = () => {};
        };
        globalThis.fetch = vi.fn(async (url, init = {}) => {
            if (String(url).includes('/api/classroom/session')) {
                return jsonResponse({ room: 'room-1', sessionId: 'sess-1', may_publish: true, sessionDescription: { type: 'answer', sdp: 'v=0' } });
            }
            return jsonResponse({ ok: true, echoed: init.body ? JSON.parse(init.body) : null });
        });
    });

    afterEach(() => {
        globalThis.RTCPeerConnection = originalPc;
        globalThis.RTCSessionDescription = originalRtc;
        globalThis.MediaStream = originalStream;
    });

    it('names tracks deterministically even with no seat id, and never falls back to track.id', async () => {
        const localStream = {
            getTracks: () => [
                { kind: 'audio', id: 'random-uuid-audio', stop: () => {} },
                { kind: 'video', id: 'random-uuid-video', stop: () => {} },
            ],
        };
        const handle = await joinClassroom({ room: 'room-1', role: 'teach', seatId: '', localStream });
        expect(handle.published).toEqual([
            { trackName: 'seat:anon/mic', kind: 'audio' },
            { trackName: 'seat:anon/cam', kind: 'video' },
        ]);
        const pushed = globalThis.fetch.mock.calls
            .map(([, init]) => (init && init.body ? JSON.parse(init.body) : null))
            .find((body) => body && body.action === 'push');
        expect(pushed.tracks.map((t) => t.trackName)).toEqual(['seat:anon/mic', 'seat:anon/cam']);
        // The old fallback would have published the two random UUIDs above.
        expect(JSON.stringify(pushed)).not.toContain('random-uuid');
    });

    it('reports each published kind from the real track, not from the name suffix', async () => {
        const localStream = {
            getTracks: () => [{ kind: 'video', id: 'v1', stop: () => {} }],
        };
        const handle = await joinClassroom({ room: 'room-1', role: 'teach', seatId: 'seat9', localStream });
        expect(handle.published).toEqual([{ trackName: 'seat:seat9/cam', kind: 'video' }]);
    });
});

describe('publishPresence', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async () => jsonResponse({ id: 'row1' }));
    });

    it('stamps an expires_at and refuses an empty advertisement', async () => {
        await expect(publishPresence({ room: 'r1', sessionId: 's1', tracks: [] }))
            .rejects.toThrow('no tracks to advertise');
        expect(globalThis.fetch).not.toHaveBeenCalled();

        await publishPresence({
            room: 'r1',
            sessionId: 's1',
            tracks: [{ trackName: 'seat:t/mic', kind: 'audio' }],
            ttlMs: 30000,
            now: () => Date.parse('2026-09-18T12:00:00.000Z'),
        });
        const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
        expect(globalThis.fetch.mock.calls[0][0]).toBe(API.presence);
        expect(body.expires_at).toBe('2026-09-18T12:00:30.000Z');
        expect(body.tracks).toEqual([{ trackName: 'seat:t/mic', kind: 'audio' }]);
        expect(body.role).toBe('teacher');
    });
});

describe('startPresenceHeartbeat', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('beats immediately and then on the cadence', async () => {
        globalThis.fetch = vi.fn(async () => jsonResponse({ id: 'row1' }));
        const beat = startPresenceHeartbeat({
            room: 'r1', sessionId: 's1', tracks: [{ trackName: 'seat:t/mic' }], everyMs: 1000,
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(2000);
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
        beat.stop();
        await vi.advanceTimersByTimeAsync(5000);
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('skips a beat rather than stacking durable writes when the backend is slow', async () => {
        const pending = deferred();
        globalThis.fetch = vi.fn(async () => pending.promise);
        const beat = startPresenceHeartbeat({
            room: 'r1', sessionId: 's1', tracks: [{ trackName: 'seat:t/mic' }], everyMs: 100,
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);

        // Ten cadences pass while the first write is still in flight. Without the
        // guard this is ten more POSTs to staging PocketBase.
        await vi.advanceTimersByTimeAsync(1000);
        expect(globalThis.fetch).toHaveBeenCalledTimes(1);
        expect(beat.skipped()).toBeGreaterThan(0);
        expect(beat.inFlight()).toBe(true);

        pending.resolve(jsonResponse({ id: 'row1' }));
        await vi.advanceTimersByTimeAsync(200);
        expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(1);
        beat.stop();
    });

    it('does not report an error against a heartbeat that was already stopped', async () => {
        const pending = deferred();
        globalThis.fetch = vi.fn(async () => pending.promise);
        const seen = [];
        const beat = startPresenceHeartbeat({
            room: 'r1', sessionId: 's1', tracks: [{ trackName: 'seat:t/mic' }], everyMs: 100,
            onError: (err) => seen.push(err.message),
        });
        await vi.advanceTimersByTimeAsync(0);
        beat.stop();
        pending.resolve(jsonResponse({ message: 'presence_rejected' }, 400));
        await vi.advanceTimersByTimeAsync(50);
        expect(seen).toEqual([]);
    });
});

describe('inboundAudioStats', () => {
    it('reports UNMEASURED rather than zero when the browser has no getStats', async () => {
        await expect(inboundAudioStats(null)).resolves.toEqual({ supported: false, packets: 0, bytes: 0, streams: 0 });
        await expect(inboundAudioStats({})).resolves.toEqual({ supported: false, packets: 0, bytes: 0, streams: 0 });
    });

    it('sums inbound-rtp audio packets and ignores video and outbound entries', async () => {
        const report = [
            { type: 'inbound-rtp', kind: 'audio', packetsReceived: 120, bytesReceived: 4000 },
            { type: 'inbound-rtp', kind: 'audio', packetsReceived: 30, bytesReceived: 900 },
            { type: 'inbound-rtp', kind: 'video', packetsReceived: 9999, bytesReceived: 9999 },
            { type: 'outbound-rtp', kind: 'audio', packetsSent: 500 },
        ];
        const pc = { getStats: async () => ({ forEach: (fn) => report.forEach(fn) }) };
        await expect(inboundAudioStats(pc)).resolves.toEqual({ supported: true, packets: 150, bytes: 4900, streams: 2 });
    });

    it('reads zero packets as zero, so a silent pull cannot render as receiving', async () => {
        const pc = { getStats: async () => ({ forEach: (fn) => [{ type: 'inbound-rtp', kind: 'audio', packetsReceived: 0, bytesReceived: 0 }].forEach(fn) }) };
        const stats = await inboundAudioStats(pc);
        expect(stats.supported).toBe(true);
        expect(stats.packets).toBe(0);
        expect(stats.streams).toBe(1);
    });
});

describe('createPresenceTracker', () => {
    const forgeRow = (expiresAt) => ({
        id: 'row-forge',
        persona_id: 'gm-forge',
        display_name: 'Forge',
        session_id: 'sess-forge',
        tracks: [{ trackName: 'seat:forge/mic', kind: 'audio' }],
        state: 'LIVE',
        expires_at: expiresAt,
    });

    it('pulls each persona row exactly once per session and forgets it when the row expires', async () => {
        let now = Date.parse('2026-09-18T12:00:00.000Z');
        let rows = [forgeRow('2026-09-18T12:00:30.000Z')];
        const list = vi.fn(async () => rows);
        const pull = vi.fn(async () => ({ ok: true }));
        const tracker = createPresenceTracker({
            handle: { sessionId: 'sess-mine' },
            room: 'room-1',
            list,
            pull,
            now: () => now,
        });

        const first = await tracker.tick();
        expect(first.pulled).toHaveLength(1);
        expect(pull).toHaveBeenCalledTimes(1);
        expect(pull.mock.calls[0][1]).toEqual([{ sessionId: 'sess-forge', trackName: 'seat:forge/mic' }]);

        // Three more polls inside the TTL must not renegotiate the peer again.
        await tracker.tick();
        await tracker.tick();
        await tracker.tick();
        expect(pull).toHaveBeenCalledTimes(1);
        expect(tracker.pulledKeys()).toEqual(['sess-forge::seat:forge/mic']);

        // The row lapses. Nothing had to tell us the body died.
        now += 60000;
        const after = await tracker.tick();
        expect(after.live).toHaveLength(0);
        expect(after.pulled).toHaveLength(0);
        expect(after.expired).toEqual(['sess-forge::seat:forge/mic']);
        expect(tracker.pulledKeys()).toEqual([]);
        expect(pull).toHaveBeenCalledTimes(1);

        // A body that comes back is pulled again rather than remembered as done.
        rows = [forgeRow(new Date(now + 30000).toISOString())];
        const revived = await tracker.tick();
        expect(revived.pulled).toHaveLength(1);
        expect(pull).toHaveBeenCalledTimes(2);
    });

    it('issues one pull for a track whose pull is slower than the poll', async () => {
        const now = Date.parse('2026-09-18T12:00:00.000Z');
        const rows = [forgeRow('2026-09-18T12:00:30.000Z')];
        const pending = deferred();
        const pull = vi.fn(() => pending.promise);
        const tracker = createPresenceTracker({
            handle: { sessionId: 'sess-mine' },
            room: 'room-1',
            list: async () => rows,
            pull,
            now: () => now,
        });

        // Two overlapping ticks: `pulled` is only written after the pull resolves,
        // so without the in-flight claim this issues the SAME pull twice - two
        // transceivers for one track and a renegotiation storm.
        const a = tracker.tick();
        const b = tracker.tick();
        pending.resolve({ ok: true });
        await Promise.all([a, b]);
        expect(pull).toHaveBeenCalledTimes(1);
    });

    it('skips an interval tick while one is still running', async () => {
        vi.useFakeTimers();
        try {
            const now = Date.parse('2026-09-18T12:00:00.000Z');
            const pending = deferred();
            const list = vi.fn(() => pending.promise);
            const tracker = createPresenceTracker({
                handle: { sessionId: 'sess-mine' },
                room: 'room-1',
                list,
                pull: async () => ({}),
                now: () => now,
            });
            tracker.start(100);
            await vi.advanceTimersByTimeAsync(0);
            expect(list).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1000);
            expect(list).toHaveBeenCalledTimes(1);
            expect(tracker.skipped()).toBeGreaterThan(0);
            pending.resolve([]);
            await vi.advanceTimersByTimeAsync(200);
            expect(list.mock.calls.length).toBeGreaterThan(1);
            tracker.stop();
        } finally {
            vi.useRealTimers();
        }
    });

    it('lists a human publisher without pulling it, and never pulls its own session', async () => {
        const now = Date.parse('2026-09-18T12:00:00.000Z');
        const expires = '2026-09-18T12:00:30.000Z';
        const rows = [
            { id: 'row-teacher', persona_id: '', display_name: 'Ada', session_id: 'sess-teacher', state: 'LIVE', expires_at: expires, tracks: [{ trackName: 'seat:ada/mic', kind: 'audio' }] },
            { id: 'row-self', persona_id: 'gm-forge', display_name: 'Forge', session_id: 'sess-mine', state: 'LIVE', expires_at: expires, tracks: [{ trackName: 'seat:me/mic', kind: 'audio' }] },
        ];
        const pull = vi.fn(async () => ({}));
        const tracker = createPresenceTracker({
            handle: { sessionId: 'sess-mine' },
            room: 'room-1',
            list: async () => rows,
            pull,
            now: () => now,
        });

        const result = await tracker.tick();
        expect(result.live).toHaveLength(2);
        expect(result.pulled).toHaveLength(0);
        expect(pull).not.toHaveBeenCalled();

        // A member asking for the teacher is an explicit action, and it pulls once.
        await tracker.pull(rows[0]);
        expect(pull).toHaveBeenCalledTimes(1);
        const second = await tracker.tick();
        expect(second.pulled).toHaveLength(0);
        expect(pull).toHaveBeenCalledTimes(1);
    });

    it('surfaces an unreadable advertisement instead of dropping it', async () => {
        const now = Date.parse('2026-09-18T12:00:00.000Z');
        const rows = [{
            id: 'row-broken', persona_id: 'gm-forge', session_id: 'sess-broken', state: 'LIVE',
            expires_at: '2026-09-18T12:00:30.000Z', tracks: [], tracks_error: 'unparseable',
        }];
        const pull = vi.fn(async () => ({}));
        const tracker = createPresenceTracker({
            handle: { sessionId: 'sess-mine' }, room: 'room-1', list: async () => rows, pull, now: () => now,
        });
        const result = await tracker.tick();
        expect(result.live).toHaveLength(0);
        expect(result.unreadable).toHaveLength(1);
        expect(result.unreadable[0].tracks_error).toBe('unparseable');
        expect(pull).not.toHaveBeenCalled();
    });

    it('reports a failing pull instead of marking the row subscribed', async () => {
        const now = Date.parse('2026-09-18T12:00:00.000Z');
        const rows = [forgeRow('2026-09-18T12:00:30.000Z')];
        const pull = vi.fn(async () => { throw new Error('realtime_tracks_failed'); });
        const seen = [];
        const tracker = createPresenceTracker({
            handle: { sessionId: 'sess-mine' },
            room: 'room-1',
            list: async () => rows,
            pull,
            now: () => now,
            onError: (err) => seen.push(err.message),
        });

        const result = await tracker.tick();
        expect(result.pulled).toHaveLength(0);
        expect(seen).toEqual(['realtime_tracks_failed']);
        expect(tracker.pulledKeys()).toEqual([]);

        // Still unsubscribed, so the next poll tries again.
        await tracker.tick();
        expect(pull).toHaveBeenCalledTimes(2);
    });
});
