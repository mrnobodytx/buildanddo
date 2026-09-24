// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useClassroomMedia.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/classroomRealtime.js, apps/web/src/lib/pocketbaseClient.js, apps/web/src/hooks/classroomMediaLifetime.js, apps/web/src/contexts/AuthContext.jsx, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Hook
// EnumEdges:   CONSUMES apps/web/src/lib/classroomRealtime.js; CONSUMES apps/web/src/hooks/classroomMediaLifetime.js; CONSUMES apps/web/src/contexts/AuthContext.jsx; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx
// DAG Node:    none
// Intent:      Carry the live-classroom media behaviour of the retired ClassroomPage into the routed room.
// ───────────────────────────────────────────────────────────────
//
// Behaviour kept from the C-ONE page this replaces (SRS-CN-PERSONA-RUNTIME-001):
//   * Nothing connects on mount. Joining is an explicit action and the default
//     state is 'idle', never an optimistic "live".
//   * The browser holds no credential; every SFU call goes through /api/classroom/*.
//   * `mayPublish` is advisory. The backend re-checks every track push.
//   * "Receiving" comes from measured inbound packets (pc.getStats), never from
//     an HTTP status or a resolved promise.
//   * A refused autoplay is surfaced so the page can offer a button.
// The room id is the routed classroom's record id, so there is no free-text room
// field and no per-keystroke advertisement to guard against.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import pocketbaseClient from '@/lib/pocketbaseClient';
import { createMediaLifetime } from './classroomMediaLifetime.js';
import {
    joinClassroom,
    classroomHealth,
    createPresenceTracker,
    startPresenceHeartbeat,
    inboundAudioStats,
    PRESENCE_POLL_MS,
} from '@/lib/classroomRealtime';

const AUDIO_STATS_MS = 2000;
const NO_AUDIO = Object.freeze({ supported: false, packets: 0, bytes: 0, streams: 0 });
const IDLE = {
    health: null, status: 'idle', detail: '', error: '', handle: null,
    presence: [], unreadable: [], pulled: [], presenceError: '', audio: NO_AUDIO,
    audioBlocked: false, local: { mic: true, camera: true },
};

/**
 * Derives the receive state shown to a member from measured audio stats.
 * @param {{supported:boolean, packets:number, streams:number}} audio
 * @returns {'unmeasured'|'receiving'|'silent'|'measuring'}
 */
export function receiveState(audio) {
    if (!audio?.supported) return 'unmeasured';
    if (audio.packets > 0) return 'receiving';
    if (audio.streams > 0) return 'silent';
    return 'measuring';
}

/**
 * @param {string} roomId Routed classroom record id; '' disables the hook.
 * @param {{enabled?: boolean}} [options] enabled=false keeps the hook idle (room not live, or not a member).
 */
export function useClassroomMedia(roomId, { enabled = true } = {}) {
    const { user, isAuthed, sessionEpoch, isSessionCurrent } = useAuth();
    const { active } = useWorkspace();
    const accountId = isAuthed ? user?.id || '' : '', workspaceId = active?.id || '';
    const key = JSON.stringify([roomId, enabled, accountId, workspaceId, sessionEpoch]);
    const scopeRef = useRef(null);
    if (scopeRef.current?.key !== key) scopeRef.current = { key };
    const scope = scopeRef.current;
    const sessionCurrent = useRef(isSessionCurrent); sessionCurrent.current = isSessionCurrent;
    const mounted = useRef(false), healthGeneration = useRef(0), playbackGeneration = useRef(0);
    const lifetimeRef = useRef(null);
    if (!lifetimeRef.current) lifetimeRef.current = createMediaLifetime();
    const lifetime = lifetimeRef.current;
    const [snapshot, setSnapshot] = useState(() => ({ ...IDLE, scope }));
    const trackerRef = useRef(null);
    const audioRef = useRef(null);

    // The native epoch distinguishes replacement from refresh; token equality does not.
    const currentScope = useCallback(() => Boolean(mounted.current && scopeRef.current === scope &&
        enabled && roomId && accountId && workspaceId && pocketbaseClient.authStore.record?.id === accountId &&
        sessionCurrent.current?.(sessionEpoch)), [scope, enabled, roomId, accountId, workspaceId, sessionEpoch]);
    const update = useCallback((patch, current = currentScope) => {
        if (!current()) return;
        setSnapshot((old) => {
            if (!current()) return old;
            const previous = old.scope === scope ? old : { ...IDLE, scope };
            return { ...previous, ...(typeof patch === 'function' ? patch(previous) : patch) };
        });
    }, [scope, currentScope]);

    useLayoutEffect(() => {
        mounted.current = true;
        setSnapshot({ ...IDLE, scope });
        return () => {
            mounted.current = false;
            healthGeneration.current++;
            lifetime.cancel();
        };
    }, [scope, lifetime]);

    // Hide old scope data during render, before resource cleanup runs.
    const media = snapshot.scope === scope && currentScope() ? snapshot : IDLE;
    const { handle } = media;

    // Configuration metadata only: no secret, nothing started.
    useEffect(() => {
        if (!currentScope()) return undefined;
        const generation = ++healthGeneration.current;
        const current = () => currentScope() && generation === healthGeneration.current;
        classroomHealth()
            .then((result) => update({ health: result }, current))
            .catch((err) => update({ health: { ok: false, reason: err?.message || 'health route unreachable' } }, current));
        return () => { if (generation === healthGeneration.current) healthGeneration.current++; };
    }, [currentScope, update]);

    const leave = useCallback(() => {
        if (!mounted.current || scopeRef.current !== scope) return;
        healthGeneration.current++;
        lifetime.cancel();
        setSnapshot((old) => ({ ...IDLE, scope, health: old.scope === scope ? old.health : null }));
    }, [scope, lifetime]);

    useEffect(() => {
        const attempt = lifetime.active;
        if (!handle || attempt?.handle !== handle || !attempt.current()) return undefined;
        let alive = true;
        const current = () => alive && attempt.current();
        const tracker = createPresenceTracker({
            handle, room: roomId, getAuthToken: () => pocketbaseClient.authStore.token,
            onChange: ({ live, pulled: fresh, unreadable: broken }) => update((previous) => ({
                presence: live, unreadable: broken || [], presenceError: '',
                pulled: Array.from(new Set(previous.pulled.concat(fresh.map((row) => row.id)))),
            }), current),
            onError: (err) => update({ presenceError: err?.message || String(err) }, current),
        });
        const entry = { tracker, current }; trackerRef.current = entry;
        const stop = attempt.addCleanup(() => {
            alive = false;
            if (trackerRef.current === entry) trackerRef.current = null;
            tracker.stop();
        });
        tracker.start(PRESENCE_POLL_MS);
        return stop;
    }, [handle, roomId, lifetime, update]);

    // Only a publishing host advertises; the backend refuses anyone else's write.
    useEffect(() => {
        const attempt = lifetime.active;
        if (!handle || attempt?.handle !== handle || !attempt.current()) return undefined;
        if (handle.role !== 'teach' || !handle.mayPublish || !handle.published?.length) return undefined;
        let alive = true;
        const current = () => alive && attempt.current();
        const beat = startPresenceHeartbeat({
            room: roomId, sessionId: handle.sessionId, tracks: handle.published, getAuthToken: () => pocketbaseClient.authStore.token,
            onError: (err) => update({ presenceError: err?.message || String(err) }, current),
        });
        return attempt.addCleanup(() => { alive = false; beat.stop(); });
    }, [handle, roomId, lifetime, update]);

    useEffect(() => {
        const attempt = lifetime.active;
        if (!handle?.pc || attempt?.handle !== handle || !attempt.current()) return undefined;
        let alive = true, busy = false;
        const current = () => alive && attempt.current();
        const read = async () => {
            if (busy || !current()) return;
            busy = true;
            try { update({ audio: await inboundAudioStats(handle.pc) }, current); } catch { /* No new measurement. */ }
            finally { busy = false; }
        };
        read();
        const timer = setInterval(read, AUDIO_STATS_MS);
        return attempt.addCleanup(() => { alive = false; clearInterval(timer); });
    }, [handle, lifetime, update]);

    const playAudio = useCallback(() => {
        const attempt = lifetime.active, element = audioRef.current;
        if (!currentScope() || !attempt?.current() || !element || !attempt.handle?.remoteStream) return;
        const stream = attempt.handle.remoteStream;
        const generation = ++playbackGeneration.current;
        const current = () => attempt.current() && generation === playbackGeneration.current &&
            audioRef.current === element && element.srcObject === stream;
        if (!current()) return;
        try {
            const started = element.play();
            if (started && typeof started.then === 'function') return started.then(
                () => update({ audioBlocked: false }, current), () => update({ audioBlocked: true }, current),
            );
            update({ audioBlocked: false }, current);
        } catch { update({ audioBlocked: true }, current); }
    }, [lifetime, currentScope, update]);

    // One inbound stream carries every pulled track; bind it once per session.
    useEffect(() => {
        const attempt = lifetime.active, element = audioRef.current;
        if (!handle?.remoteStream || !element || attempt?.handle !== handle || !attempt.current()) return undefined;
        const stop = attempt.addCleanup(() => {
            if (element.srcObject !== handle.remoteStream) return;
            try { element.pause(); } finally { element.srcObject = null; }
        });
        element.srcObject = handle.remoteStream;
        playAudio();
        return stop;
    }, [handle, playAudio, lifetime]);

    const join = useCallback(async (role) => {
        const attempt = lifetime.begin(currentScope);
        if (!attempt) return;
        update((previous) => ({ ...IDLE, health: previous.health, status: 'connecting' }), attempt.current);
        try {
            const next = await joinClassroom({
                room: roomId,
                isCurrent: attempt.current,
                onCleanup: attempt.addCleanup,
                role: role === 'teach' ? 'teach' : 'watch',
                onState: (detail) => update({ detail }, attempt.current),
                authToken: pocketbaseClient.authStore.token,
                seatId: accountId,
                onRemoteTrack: (event) => {
                    if (!attempt.current()) {
                        try { event.track?.stop(); } catch { /* A late track belongs to the cancelled join. */ }
                    }
                },
                onRemoteTrackError: (err) => update({ presenceError: `An incoming track was rejected: ${err?.message || err}` }, attempt.current),
            });
            if (attempt.accept(next)) update({ handle: next, status: 'connected' }, attempt.current);
        } catch (err) {
            const current = attempt.current();
            attempt.cancel();
            if (current) update({ status: 'failed', detail: '', error: err?.message || String(err) });
        }
    }, [roomId, accountId, lifetime, currentScope, update]);

    const listen = useCallback(async (row) => {
        const entry = trackerRef.current;
        if (!currentScope() || !entry?.current()) return;
        const current = () => trackerRef.current === entry && entry.current();
        update({ presenceError: '' }, current);
        try {
            await entry.tracker.pull(row);
            if (!current()) return;
            update((previous) => ({ pulled: Array.from(new Set(previous.pulled.concat([row.id]))) }), current);
            playAudio();
        } catch (err) {
            update({ presenceError: err?.message || String(err) }, current);
        }
    }, [currentScope, playAudio, update]);

    // Local track switches act on the real MediaStreamTracks, so "muted" is true on the wire.
    const toggle = useCallback((kind) => {
        const attempt = lifetime.active, stream = attempt?.handle?.stream;
        if (!currentScope() || !attempt?.current() || !stream) return;
        const tracks = kind === 'camera' ? stream.getVideoTracks() : stream.getAudioTracks();
        if (!tracks.length) return;
        const next = !tracks[0].enabled;
        tracks.forEach((track) => { track.enabled = next; });
        update((previous) => ({ local: { ...previous.local, [kind]: next } }), attempt.current);
    }, [lifetime, currentScope, update]);

    return {
        health: media.health, configured: Boolean(media.health?.ok), publishersConfigured: media.health ? media.health.publishers_configured : null,
        status: media.status, detail: media.detail, error: media.error, handle,
        presence: media.presence, unreadable: media.unreadable, pulled: media.pulled, presenceError: media.presenceError,
        audio: media.audio, receive: receiveState(media.audio), audioBlocked: media.audioBlocked, audioRef, local: media.local,
        join, leave, listen, playAudio, toggle,
    };
}
