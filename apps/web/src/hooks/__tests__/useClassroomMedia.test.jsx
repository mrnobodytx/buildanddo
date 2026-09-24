// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/hooks/__tests__/useClassroomMedia.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/hooks/useClassroomMedia.js, apps/web/src/lib/classroomTelemetry.js, apps/web/src/contexts/AuthContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useClassroomMedia.js; CONSUMES apps/web/src/contexts/AuthContext.jsx;
//              VALIDATES apps/web/src/lib/classroomTelemetry.js
// DAG Node:    none
// Intent:      Exercise real React media lifetimes against deferred transport doubles without contacting a media provider.
// ----------------------------------------------------------------

import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { useClassroomMedia } from '@/hooks/useClassroomMedia';
import pb from '@/lib/pocketbaseClient';
import * as realtime from '@/lib/classroomRealtime';
import { reportAction, readFailed } from '@/lib/observability/runtime';
import { trackEvent } from '@/lib/telemetry';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { token: 'synthetic', record: { id: 'seat1' }, isValid: true } } }));
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), readFailed: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/classroomRealtime', () => ({
    PRESENCE_POLL_MS: 5000, classroomHealth: vi.fn(), joinClassroom: vi.fn(),
    createPresenceTracker: vi.fn(), startPresenceHeartbeat: vi.fn(), inboundAudioStats: vi.fn(),
}));

let auth, workspace, trackers, beats, intervals;
const noAudio = { supported: true, packets: 0, bytes: 0, streams: 0 };
const received = { supported: true, packets: 10, bytes: 100, streams: 1 };
const row = { id: 'publisher', session_id: 'other-session', tracks: [] };
const mediaEvents = (event) => reportAction.mock.calls.filter(([name]) => name === `classroom.media.${event}`).map(([, context]) => context);
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function session(overrides = {}) {
    const track = () => ({ enabled: true, readyState: 'live', stop: vi.fn(function () { this.readyState = 'ended'; }) });
    const mic = track(), camera = track(), remote = track();
    return {
        sessionId: 'self', role: 'watch', mayPublish: false, published: [], iceComplete: true,
        pc: { close: vi.fn() }, close: vi.fn(), mic, camera, remote,
        stream: { getTracks: () => [mic, camera], getAudioTracks: () => [mic], getVideoTracks: () => [camera] },
        remoteStream: { getTracks: () => [remote] }, ...overrides,
    };
}
function Wrapper({ children }) {
    return <AuthContext.Provider value={auth}><WorkspaceContext.Provider value={{ active: workspace }}>{children}</WorkspaceContext.Provider></AuthContext.Provider>;
}
function mount(props = {}) {
    let current = { roomId: 'room1', enabled: true, ...props };
    const view = renderHook(({ roomId, enabled }) => useClassroomMedia(roomId, { enabled }), { wrapper: Wrapper, initialProps: current });
    return { ...view, rerender(next = current) { current = next; view.rerender(current); } };
}
function invalidate(view, boundary) {
    if (boundary === 'unmount') { view.unmount(); return; }
    let props = { roomId: 'room1', enabled: true };
    if (boundary === 'disabled') props.enabled = false;
    if (boundary === 'room') props.roomId = 'room2';
    if (boundary === 'account') { auth = { ...auth, user: { id: 'seat2' } }; pb.authStore.record = auth.user; }
    if (boundary === 'workspace') workspace = { id: 'ws2' };
    if (boundary === 'session') auth = { ...auth, sessionEpoch: auth.sessionEpoch + 1 };
    view.rerender(props);
}

beforeEach(() => {
    vi.resetAllMocks();
    const unexpected = () => { throw new Error('Unexpected browser transport or device access in a stubbed hook test.'); };
    vi.stubGlobal('fetch', vi.fn(unexpected));
    vi.stubGlobal('RTCPeerConnection', vi.fn(unexpected));
    vi.stubGlobal('RTCSessionDescription', vi.fn(unexpected));
    vi.stubGlobal('MediaStream', vi.fn(unexpected));
    vi.stubGlobal('navigator', { userAgent: 'stubbed-media-test', mediaDevices: { getUserMedia: vi.fn(unexpected) } });
    auth = { user: { id: 'seat1' }, isAuthed: true, sessionEpoch: 1,
        isSessionCurrent: (epoch) => auth.isAuthed && epoch === auth.sessionEpoch };
    workspace = { id: 'ws1' }; pb.authStore.record = auth.user; pb.authStore.token = 'synthetic';
    trackers = []; beats = []; intervals = new Map(); let next = 0;
    vi.spyOn(globalThis, 'setInterval').mockImplementation((fn, delay) => { const id = ++next; intervals.set(id, { fn, delay }); return id; });
    vi.spyOn(globalThis, 'clearInterval').mockImplementation((id) => intervals.delete(id));
    realtime.classroomHealth.mockResolvedValue({ ok: true, publishers_configured: 1 });
    realtime.inboundAudioStats.mockResolvedValue(noAudio);
    realtime.createPresenceTracker.mockImplementation((options) => {
        const tracker = { options, start: vi.fn(), stop: vi.fn(), pull: vi.fn(async () => ({})) };
        trackers.push(tracker); return tracker;
    });
    realtime.startPresenceHeartbeat.mockImplementation((options) => {
        const beat = { options, stop: vi.fn() }; beats.push(beat); return beat;
    });
});
afterEach(() => {
    try {
        cleanup();
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(globalThis.RTCPeerConnection).not.toHaveBeenCalled();
        expect(globalThis.RTCSessionDescription).not.toHaveBeenCalled();
        expect(globalThis.MediaStream).not.toHaveBeenCalled();
        expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

describe('classroom media lifetime', () => {
    it('defaults to idle and refuses joins without enabled room, account and workspace scope', async () => {
        const view = mount();
        expect(view.result.current.status).toBe('idle');
        expect(realtime.joinClassroom).not.toHaveBeenCalled();
        expect(reportAction).not.toHaveBeenCalled();
        expect(trackEvent).not.toHaveBeenCalled();
        view.rerender({ roomId: 'room1', enabled: false });
        await act(async () => { await view.result.current.join('teach'); });
        view.rerender({ roomId: '', enabled: true });
        await act(async () => { await view.result.current.join('teach'); });
        auth = { ...auth, isAuthed: false };
        view.rerender({ roomId: 'room1', enabled: true });
        await act(async () => { await view.result.current.join('teach'); });
        auth = { ...auth, isAuthed: true }; workspace = null; view.rerender();
        await act(async () => { await view.result.current.join('teach'); });
        expect(realtime.joinClassroom).not.toHaveBeenCalled();
    });

    it('claims a join synchronously, passes the room and does not infer receiving from a resolved promise', async () => {
        const pending = deferred(), handle = session(); realtime.joinClassroom.mockReturnValue(pending.promise);
        const view = mount(); let joining;
        act(() => { joining = view.result.current.join('watch'); void view.result.current.join('watch'); });
        expect(realtime.joinClassroom).toHaveBeenCalledTimes(1);
        expect(mediaEvents('join.started')).toHaveLength(1);
        expect(realtime.joinClassroom).toHaveBeenCalledWith(expect.objectContaining({ room: 'room1', role: 'watch', seatId: 'seat1' }));
        expect(view.result.current.status).toBe('connecting');
        await act(async () => { pending.resolve(handle); await joining; });
        expect(view.result.current.handle).toBe(handle);
        expect(view.result.current.receive).toBe('measuring');
        expect(mediaEvents('join.result')).toEqual([expect.objectContaining({ operation: 'join', outcome: 'accepted', reason: 'signalling_only' })]);
        expect(mediaEvents('connected')).toHaveLength(0);
        expect(mediaEvents('received')).toHaveLength(0);
        await act(async () => { await view.result.current.join('watch'); });
        expect(realtime.joinClassroom).toHaveBeenCalledTimes(1);
        realtime.inboundAudioStats.mockResolvedValue(received);
        await act(async () => { await [...intervals.values()].find((item) => item.delay === 2000).fn(); });
        expect(view.result.current.receive).toBe('receiving');
        expect(mediaEvents('received')).toEqual([expect.objectContaining({ outcome: 'observed', received_packets: 10, received_bytes: 100 })]);
        expect(reportAction.mock.calls).toEqual(trackEvent.mock.calls);
    });

    it('leaves while connecting, rejoins the same room, and closes only the late old handle', async () => {
        const first = deferred(), second = deferred();
        realtime.joinClassroom.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const view = mount(); let oldJoin, nextJoin;
        act(() => { oldJoin = view.result.current.join('teach'); });
        const old = realtime.joinClassroom.mock.calls[0][0];
        act(() => { view.result.current.leave(); });
        expect(view.result.current.status).toBe('idle');
        act(() => { nextJoin = view.result.current.join('watch'); });
        act(() => { realtime.joinClassroom.mock.calls[1][0].onState('Current connection'); old.onState('Old connection'); old.onRemoteTrackError(new Error('Old error')); });
        const late = session();
        await act(async () => { first.resolve(late); await oldJoin; });
        expect(late.close).toHaveBeenCalledTimes(1);
        expect(late.mic.stop).toHaveBeenCalledTimes(1);
        expect(late.remote.stop).toHaveBeenCalledTimes(1);
        expect(view.result.current.status).toBe('connecting');
        expect(view.result.current.detail).toBe('Current connection');
        expect(view.result.current.presenceError).toBe('');
        expect(realtime.createPresenceTracker).not.toHaveBeenCalled();
        const current = session({ sessionId: 'new' });
        await act(async () => { second.resolve(current); await nextJoin; });
        expect(view.result.current.handle).toBe(current);
        expect(current.close).not.toHaveBeenCalled();
    });

    for (const boundary of ['disabled', 'room', 'account', 'workspace', 'session', 'unmount']) {
        it.each(['resolve', 'reject'])(`fences all pending join callbacks after ${boundary}, including %s`, async (outcome) => {
            const pending = deferred(); realtime.joinClassroom.mockReturnValue(pending.promise);
            const view = mount(); let joining;
            act(() => { joining = view.result.current.join('teach'); });
            const options = realtime.joinClassroom.mock.calls[0][0];
            invalidate(view, boundary);
            const eventCount = reportAction.mock.calls.length, failureCount = readFailed.mock.calls.length;
            const late = session();
            await act(async () => {
                options.onState('Stale progress'); options.onRemoteTrackError(new Error('Stale track error'));
                options.onConnectionState('failed'); options.onDeviceError({ name: 'NotAllowedError' });
                options.onRemoteTrack({ track: late.remote });
                if (outcome === 'resolve') pending.resolve(late); else pending.reject(new Error('Stale join failure'));
                await joining;
            });
            expect(late.remote.stop).toHaveBeenCalled();
            if (outcome === 'resolve') {
                expect(late.close).toHaveBeenCalledTimes(1);
                expect(late.mic.stop).toHaveBeenCalledTimes(1);
                expect(late.camera.stop).toHaveBeenCalledTimes(1);
            }
            if (boundary !== 'unmount') {
                expect(view.result.current.status).toBe('idle');
                expect(view.result.current.handle).toBeNull();
                expect(view.result.current.detail).toBe('');
                expect(view.result.current.error).toBe('');
                expect(view.result.current.presenceError).toBe('');
            }
            expect(realtime.createPresenceTracker).not.toHaveBeenCalled();
            expect(realtime.startPresenceHeartbeat).not.toHaveBeenCalled();
            expect(reportAction).toHaveBeenCalledTimes(eventCount);
            expect(readFailed).toHaveBeenCalledTimes(failureCount);
            expect(mediaEvents('join.result')).toEqual([expect.objectContaining({ outcome: 'cancelled' })]);
        });
    }

    it('does not revive an old join after navigating away and returning to the same room', async () => {
        const pending = deferred(); realtime.joinClassroom.mockReturnValue(pending.promise);
        const view = mount(); let joining;
        act(() => { joining = view.result.current.join('watch'); });
        view.rerender({ roomId: 'room2', enabled: true });
        view.rerender({ roomId: 'room1', enabled: true });
        const late = session();
        await act(async () => { pending.resolve(late); await joining; });
        expect(late.close).toHaveBeenCalledTimes(1);
        expect(view.result.current.status).toBe('idle');
        expect(realtime.joinClassroom).toHaveBeenCalledTimes(1);
    });

    it('does not let a cancelled join rejection close or fail a replacement connection', async () => {
        const pending = deferred(), handle = session({ sessionId: 'replacement' });
        realtime.joinClassroom.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(handle);
        const view = mount(); let joining;
        act(() => { joining = view.result.current.join('watch'); });
        act(() => { view.result.current.leave(); });
        await act(async () => { await view.result.current.join('watch'); });
        await act(async () => { pending.reject(new Error('Old connection failed')); await joining; });
        expect(view.result.current.handle).toBe(handle);
        expect(view.result.current.status).toBe('connected');
        expect(view.result.current.error).toBe('');
        expect(handle.close).not.toHaveBeenCalled();
    });

    it('preserves pending and connected joins through same-session token refreshes', async () => {
        const pending = deferred(); realtime.joinClassroom.mockReturnValue(pending.promise);
        const view = mount(); let joining;
        act(() => { joining = view.result.current.join('watch'); });
        pb.authStore.token = 'synthetic-refreshed'; auth = { ...auth, user: { ...auth.user } }; view.rerender();
        await act(async () => { void view.result.current.join('watch'); });
        const handle = session();
        await act(async () => { pending.resolve(handle); await joining; });
        pb.authStore.token = 'synthetic-refreshed-again'; auth = { ...auth, user: { ...auth.user } }; view.rerender();
        expect(view.result.current.handle).toBe(handle);
        expect(handle.close).not.toHaveBeenCalled();
        expect(realtime.joinClassroom).toHaveBeenCalledTimes(1);
        expect(trackers).toHaveLength(1);
        expect(trackers[0].stop).not.toHaveBeenCalled();
        expect(trackers[0].options.getAuthToken()).toBe('synthetic-refreshed-again');
        act(() => { trackers[0].options.onChange({ live: [row], pulled: [row], unreadable: [] }); });
        expect(view.result.current.presence).toEqual([row]);
        expect(view.result.current.presenceError).toBe('');
    });

    it('checks the native session predicate even before React renders a replacement epoch', async () => {
        const pending = deferred(); realtime.joinClassroom.mockReturnValue(pending.promise);
        const view = mount(); let joining;
        act(() => { joining = view.result.current.join('watch'); });
        auth.sessionEpoch++;
        const late = session();
        await act(async () => { pending.resolve(late); await joining; });
        expect(late.close).toHaveBeenCalledTimes(1);
        expect(realtime.createPresenceTracker).not.toHaveBeenCalled();
        view.rerender();
        expect(view.result.current.status).toBe('idle');
    });

    it.each(['leave', 'disabled', 'room', 'account', 'workspace', 'session', 'unmount'])('stops connected resources and ignores stale callbacks after %s', async (boundary) => {
        const stats = deferred(), handle = session({ role: 'teach', mayPublish: true, published: [{ trackName: 'mic' }] });
        realtime.inboundAudioStats.mockReturnValue(stats.promise); realtime.joinClassroom.mockResolvedValue(handle);
        const view = mount();
        const audio = { srcObject: null, play: vi.fn(async () => {}), pause: vi.fn() }; view.result.current.audioRef.current = audio;
        await act(async () => { await view.result.current.join('teach'); });
        const tracker = trackers[0], beat = beats[0];
        expect(audio.srcObject).toBe(handle.remoteStream);
        if (boundary === 'leave') act(() => { view.result.current.leave(); }); else invalidate(view, boundary);
        const eventCount = reportAction.mock.calls.length, failureCount = readFailed.mock.calls.length;
        await act(async () => {
            tracker.options.onChange({ live: [row], pulled: [row], unreadable: [row] });
            tracker.options.onError(new Error('Retired tracker')); beat.options.onError(new Error('Retired heartbeat'));
            stats.resolve(received);
            realtime.joinClassroom.mock.calls[0][0].onConnectionState('closed');
        });
        expect(tracker.stop).toHaveBeenCalledTimes(1);
        expect(beat.stop).toHaveBeenCalledTimes(1);
        expect(handle.close).toHaveBeenCalledTimes(1);
        expect(handle.mic.stop).toHaveBeenCalledTimes(1);
        expect(handle.remote.stop).toHaveBeenCalledTimes(1);
        expect(audio.pause).toHaveBeenCalled();
        expect(audio.srcObject).toBeNull();
        expect(intervals.size).toBe(0);
        expect(reportAction).toHaveBeenCalledTimes(eventCount);
        expect(readFailed).toHaveBeenCalledTimes(failureCount);
        expect(mediaEvents('join.result')).toHaveLength(1);
        expect(mediaEvents('leave')).toHaveLength(1);
        if (boundary !== 'unmount') {
            expect(view.result.current.presence).toEqual([]);
            expect(view.result.current.pulled).toEqual([]);
            expect(view.result.current.unreadable).toEqual([]);
            expect(view.result.current.presenceError).toBe('');
            expect(view.result.current.receive).toBe('unmeasured');
        }
    });

    it.each(['resolve', 'reject'])('ignores a stale listen, audio measurement and autoplay %s after rejoining', async (outcome) => {
        const pull = deferred(), play = deferred(), stats = deferred();
        realtime.joinClassroom.mockResolvedValueOnce(session()).mockResolvedValueOnce(session({ sessionId: 'new' }));
        realtime.inboundAudioStats.mockReturnValueOnce(stats.promise).mockResolvedValue(noAudio);
        const view = mount();
        const audio = { srcObject: null, play: vi.fn().mockReturnValueOnce(play.promise).mockResolvedValue(undefined), pause: vi.fn() };
        view.result.current.audioRef.current = audio;
        await act(async () => { await view.result.current.join('watch'); });
        trackers[0].pull.mockReturnValue(pull.promise); let listening;
        act(() => { listening = view.result.current.listen(row); });
        act(() => { view.result.current.leave(); });
        await act(async () => { await view.result.current.join('watch'); });
        await act(async () => {
            if (outcome === 'resolve') { pull.resolve({}); play.resolve(); } else { pull.reject(new Error('Old pull')); play.reject(new Error('Old autoplay')); }
            stats.resolve(received); await listening;
        });
        expect(view.result.current.handle.sessionId).toBe('new');
        expect(view.result.current.pulled).toEqual([]);
        expect(view.result.current.audioBlocked).toBe(false);
        expect(view.result.current.presenceError).toBe('');
        expect(view.result.current.receive).toBe('measuring');
        expect(audio.play).toHaveBeenCalledTimes(2);
        expect(mediaEvents('failure')).toHaveLength(0);
        expect(mediaEvents('received')).toHaveLength(0);
        expect(mediaEvents('join.result')).toHaveLength(2);
    });

    it('does not mark a row as pulled or try audio when there is no current tracker', async () => {
        const view = mount();
        await act(async () => { await view.result.current.listen(row); });
        expect(view.result.current.pulled).toEqual([]);
        expect(realtime.createPresenceTracker).not.toHaveBeenCalled();
    });

    it('retains known configuration across explicit leave without starting a media connection', async () => {
        const view = mount();
        await act(async () => {});
        expect(view.result.current.configured).toBe(true);
        act(() => { view.result.current.leave(); });
        expect(view.result.current.configured).toBe(true);
        expect(view.result.current.status).toBe('idle');
        expect(realtime.joinClassroom).not.toHaveBeenCalled();
    });

    it('does not overwrite a successful explicit play with an earlier autoplay rejection', async () => {
        const autoplay = deferred(), handle = session(); realtime.joinClassroom.mockResolvedValue(handle);
        const view = mount();
        view.result.current.audioRef.current = { srcObject: null, play: vi.fn().mockReturnValueOnce(autoplay.promise).mockResolvedValue(undefined), pause: vi.fn() };
        await act(async () => { await view.result.current.join('watch'); });
        await act(async () => { await view.result.current.playAudio(); });
        await act(async () => { autoplay.reject(new Error('Old autoplay refusal')); });
        expect(view.result.current.audioBlocked).toBe(false);
        expect(mediaEvents('failure')).toHaveLength(0);
    });

    it('clears failed join state on leave and ignores late health responses', async () => {
        const health = deferred(); realtime.classroomHealth.mockReturnValue(health.promise);
        realtime.joinClassroom.mockRejectedValue(new Error('Current join failure'));
        const view = mount();
        await act(async () => { await view.result.current.join('watch'); });
        expect(view.result.current.status).toBe('failed');
        expect(view.result.current.error).toBe('Current join failure');
        act(() => { view.result.current.leave(); });
        await act(async () => { health.resolve({ ok: false, reason: 'Old health response' }); });
        expect(view.result.current.health).toBeNull();
        expect(view.result.current.status).toBe('idle');
        expect(view.result.current.error).toBe('');
    });

    it('remains usable through StrictMode effect cleanup without an automatic join', async () => {
        const strict = ({ children }) => <React.StrictMode><Wrapper>{children}</Wrapper></React.StrictMode>;
        const view = renderHook(() => useClassroomMedia('room1'), { wrapper: strict });
        expect(realtime.joinClassroom).not.toHaveBeenCalled();
        const handle = session(); realtime.joinClassroom.mockResolvedValue(handle);
        await act(async () => { await view.result.current.join('watch'); });
        expect(view.result.current.handle).toBe(handle);
        expect(handle.close).not.toHaveBeenCalled();
        view.unmount();
        expect(handle.close).toHaveBeenCalledTimes(1);
        expect(mediaEvents('join.started')).toHaveLength(1);
        expect(mediaEvents('join.result')).toHaveLength(1);
        expect(mediaEvents('leave')).toHaveLength(1);
    });
});

describe('classroom media telemetry', () => {
    it('observes real connection callbacks without ending a recoverable session or claiming media', async () => {
        const handle = session(); realtime.joinClassroom.mockResolvedValue(handle);
        const view = mount();
        await act(async () => { await view.result.current.join('watch'); });
        const options = realtime.joinClassroom.mock.calls[0][0];
        act(() => { options.onConnectionState('connected'); options.onConnectionState('disconnected'); });
        expect(handle.close).not.toHaveBeenCalled();
        expect(mediaEvents('failure')).toHaveLength(0);
        act(() => { options.onConnectionState('connected'); options.onConnectionState('failed'); options.onConnectionState('closed'); });
        expect(view.result.current.handle).toBe(handle);
        expect(handle.close).not.toHaveBeenCalled();
        expect(mediaEvents('connected').map((value) => value.reason)).toEqual(['peer_connected', 'peer_recovered']);
        expect(mediaEvents('failure').map((value) => value.reason)).toEqual(['peer_failed', 'peer_closed']);
        expect(mediaEvents('received')).toHaveLength(0);
        expect(mediaEvents('join.result')).toHaveLength(1);
        act(() => { view.result.current.leave(); });
        const count = reportAction.mock.calls.length;
        act(() => { options.onConnectionState('connected'); options.onConnectionState('failed'); });
        expect(reportAction).toHaveBeenCalledTimes(count);
        expect(reportAction.mock.calls).toEqual(trackEvent.mock.calls);
    });

    it('reports a combined capture denial and failed join once without exception content', async () => {
        const error = Object.assign(new Error('private device failure'), { name: 'NotAllowedError' });
        realtime.joinClassroom.mockImplementation(async ({ onDeviceError }) => { onDeviceError(error); throw error; });
        const view = mount();
        await act(async () => { await view.result.current.join('teach'); });
        expect(view.result.current.error).toBe(error.message);
        expect(mediaEvents('failure')).toEqual([expect.objectContaining({ reason: 'microphone_camera_denied' })]);
        expect(mediaEvents('join.result')).toEqual([expect.objectContaining({ operation: 'start', outcome: 'failure', reason: 'microphone_camera_denied' })]);
        expect(JSON.stringify(reportAction.mock.calls)).not.toMatch(/private|seat1|room1|ws1/);
        expect(reportAction.mock.calls).toEqual(trackEvent.mock.calls);
    });

    it('deduplicates autoplay and polling failures without blocking explicit playback recovery', async () => {
        const handle = session({ role: 'teach', mayPublish: true, published: [{ trackName: 'private-track' }] });
        realtime.joinClassroom.mockResolvedValue(handle);
        const view = mount();
        const audio = { srcObject: null, play: vi.fn().mockRejectedValue(new Error('private autoplay prose')), pause: vi.fn() };
        view.result.current.audioRef.current = audio;
        await act(async () => { await view.result.current.join('teach'); });
        expect(view.result.current.audioBlocked).toBe(true);
        await act(async () => { await view.result.current.playAudio(); });
        act(() => {
            for (let i = 0; i < 3; i++) {
                trackers[0].options.onError(Object.assign(new Error('private presence'), { code: 'NOT_JSON', status: 200 }));
                beats[0].options.onError(Object.assign(new Error('private heartbeat'), { status: 403 }));
            }
        });
        expect(mediaEvents('failure').map((value) => value.reason)).toEqual(['autoplay_blocked', 'presence_failed', 'heartbeat_failed']);
        audio.play.mockResolvedValue(undefined);
        await act(async () => { await view.result.current.playAudio(); });
        expect(view.result.current.audioBlocked).toBe(false);
        expect(handle.close).not.toHaveBeenCalled();
        expect(readFailed).toHaveBeenCalledWith('/app/classrooms/:room', 'classroom_media', 'invalid_response', 200);
        expect(JSON.stringify([reportAction.mock.calls, trackEvent.mock.calls, readFailed.mock.calls])).not.toMatch(/private|seat1|room1|ws1/);
    });

    it('retains failed health and listen behavior with bounded failure summaries', async () => {
        realtime.classroomHealth.mockRejectedValue(Object.assign(new Error('private health response'), { code: 'NOT_JSON', status: 200 }));
        realtime.joinClassroom.mockResolvedValue(session());
        const view = mount();
        await act(async () => { await view.result.current.join('watch'); });
        trackers[0].pull.mockRejectedValue(Object.assign(new Error('private pull failure'), { status: 403 }));
        await act(async () => { await view.result.current.listen(row); });
        expect(view.result.current.configured).toBe(false);
        expect(view.result.current.presenceError).toBe('private pull failure');
        expect(view.result.current.pulled).toEqual([]);
        expect(readFailed).toHaveBeenCalledWith('/app/classrooms/:room', 'classroom_media', 'invalid_response', 200);
        expect(readFailed).toHaveBeenCalledWith('/app/classrooms/:room', 'classroom_media', 'unavailable', 403);
        expect(mediaEvents('failure')).toEqual([expect.objectContaining({ reason: 'listen_failed' })]);
    });

    it.each(['throw', 'reject'])('preserves media outcomes if telemetry sinks %s', async (failure) => {
        const unavailable = () => { if (failure === 'reject') return Promise.reject(new Error('unavailable')); throw new Error('unavailable'); };
        reportAction.mockImplementation(unavailable); trackEvent.mockImplementation(unavailable); readFailed.mockImplementation(unavailable);
        realtime.classroomHealth.mockResolvedValue({ ok: false, reason: 'unavailable' });
        const handle = session(); realtime.joinClassroom.mockResolvedValue(handle);
        const view = mount();
        await act(async () => { await view.result.current.join('watch'); });
        expect(view.result.current.handle).toBe(handle);
        act(() => { realtime.joinClassroom.mock.calls[0][0].onRemoteTrackError(new Error('incoming track failed')); });
        expect(view.result.current.presenceError).toMatch(/incoming track failed/);
        act(() => { view.result.current.leave(); });
        expect(handle.close).toHaveBeenCalledTimes(1);
        expect(view.result.current.status).toBe('idle');
        expect(reportAction.mock.calls).toEqual(trackEvent.mock.calls);
    });
});
