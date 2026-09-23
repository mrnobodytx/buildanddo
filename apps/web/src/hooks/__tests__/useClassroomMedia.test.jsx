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
// Depends:     apps/web/src/hooks/useClassroomMedia.js, apps/web/src/contexts/AuthContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useClassroomMedia.js; CONSUMES apps/web/src/contexts/AuthContext.jsx
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

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { token: 'synthetic', record: { id: 'seat1' }, isValid: true } } }));
vi.mock('@/lib/classroomRealtime', () => ({
    PRESENCE_POLL_MS: 5000, classroomHealth: vi.fn(), joinClassroom: vi.fn(),
    createPresenceTracker: vi.fn(), startPresenceHeartbeat: vi.fn(), inboundAudioStats: vi.fn(),
}));

let auth, workspace, trackers, beats, intervals;
const noAudio = { supported: true, packets: 0, bytes: 0, streams: 0 };
const received = { supported: true, packets: 10, bytes: 100, streams: 1 };
const row = { id: 'publisher', session_id: 'other-session', tracks: [] };
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('classroom media lifetime', () => {
    it('defaults to idle and refuses joins without enabled room, account and workspace scope', async () => {
        const view = mount();
        expect(view.result.current.status).toBe('idle');
        expect(realtime.joinClassroom).not.toHaveBeenCalled();
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
        expect(realtime.joinClassroom).toHaveBeenCalledWith(expect.objectContaining({ room: 'room1', role: 'watch', seatId: 'seat1' }));
        expect(view.result.current.status).toBe('connecting');
        await act(async () => { pending.resolve(handle); await joining; });
        expect(view.result.current.handle).toBe(handle);
        expect(view.result.current.receive).toBe('measuring');
        await act(async () => { await view.result.current.join('watch'); });
        expect(realtime.joinClassroom).toHaveBeenCalledTimes(1);
        realtime.inboundAudioStats.mockResolvedValue(received);
        await act(async () => { await [...intervals.values()].find((item) => item.delay === 2000).fn(); });
        expect(view.result.current.receive).toBe('receiving');
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
            const late = session();
            await act(async () => {
                options.onState('Stale progress'); options.onRemoteTrackError(new Error('Stale track error'));
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
        await act(async () => {
            tracker.options.onChange({ live: [row], pulled: [row], unreadable: [row] });
            tracker.options.onError(new Error('Retired tracker')); beat.options.onError(new Error('Retired heartbeat'));
            stats.resolve(received);
        });
        expect(tracker.stop).toHaveBeenCalledTimes(1);
        expect(beat.stop).toHaveBeenCalledTimes(1);
        expect(handle.close).toHaveBeenCalledTimes(1);
        expect(handle.mic.stop).toHaveBeenCalledTimes(1);
        expect(handle.remote.stop).toHaveBeenCalledTimes(1);
        expect(audio.pause).toHaveBeenCalled();
        expect(audio.srcObject).toBeNull();
        expect(intervals.size).toBe(0);
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
    });
});
