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
// Depends:     apps/web/src/lib/classroomRealtime.js, apps/web/src/lib/pocketbaseClient.js
// EnumType:    Hook
// EnumEdges:   CONSUMES apps/web/src/lib/classroomRealtime.js
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
import { useCallback, useEffect, useRef, useState } from 'react';
import pocketbaseClient from '@/lib/pocketbaseClient';
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
    const [health, setHealth] = useState(null);
    const [status, setStatus] = useState('idle');
    const [detail, setDetail] = useState('');
    const [error, setError] = useState('');
    const [handle, setHandle] = useState(null);
    const [presence, setPresence] = useState([]);
    const [unreadable, setUnreadable] = useState([]);
    const [pulled, setPulled] = useState([]);
    const [presenceError, setPresenceError] = useState('');
    const [audio, setAudio] = useState(NO_AUDIO);
    const [audioBlocked, setAudioBlocked] = useState(false);
    const [local, setLocal] = useState({ mic: true, camera: true });
    const trackerRef = useRef(null);
    const audioRef = useRef(null);
    const handleRef = useRef(null);
    handleRef.current = handle;

    // Configuration metadata only: no secret, nothing started.
    useEffect(() => {
        if (!enabled || !roomId) return undefined;
        let alive = true;
        classroomHealth()
            .then((result) => { if (alive) setHealth(result); })
            .catch((err) => { if (alive) setHealth({ ok: false, reason: err?.message || 'health route unreachable' }); });
        return () => { alive = false; };
    }, [enabled, roomId]);

    const reset = useCallback(() => {
        setHandle(null); setStatus('idle'); setDetail(''); setPresence([]); setUnreadable([]);
        setPulled([]); setAudio(NO_AUDIO); setAudioBlocked(false); setLocal({ mic: true, camera: true });
    }, []);

    const leave = useCallback(() => {
        handleRef.current?.close();
        reset();
    }, [reset]);

    // Leaving the room, the room ending or losing membership closes the session.
    useEffect(() => {
        if (!enabled && handleRef.current) leave();
    }, [enabled, leave]);
    useEffect(() => () => { handleRef.current?.close(); }, [roomId]);

    useEffect(() => {
        if (!handle || !roomId) return undefined;
        const tracker = createPresenceTracker({
            handle,
            room: roomId,
            authToken: pocketbaseClient.authStore.token,
            onChange: ({ live, pulled: fresh, unreadable: broken }) => {
                setPresence(live);
                setUnreadable(broken || []);
                if (fresh.length) setPulled((current) => Array.from(new Set(current.concat(fresh.map((row) => row.id)))));
                setPresenceError('');
            },
            onError: (err) => setPresenceError(err?.message || String(err)),
        });
        trackerRef.current = tracker;
        tracker.start(PRESENCE_POLL_MS);
        return () => { tracker.stop(); trackerRef.current = null; };
    }, [handle, roomId]);

    // Only a publishing host advertises; the backend refuses anyone else's write.
    useEffect(() => {
        if (!handle || !roomId) return undefined;
        if (handle.role !== 'teach' || !handle.mayPublish || !handle.published?.length) return undefined;
        const beat = startPresenceHeartbeat({
            room: roomId,
            sessionId: handle.sessionId,
            tracks: handle.published,
            authToken: pocketbaseClient.authStore.token,
            onError: (err) => setPresenceError(err?.message || String(err)),
        });
        return () => beat.stop();
    }, [handle, roomId]);

    useEffect(() => {
        if (!handle?.pc) return undefined;
        let alive = true;
        const read = () => { inboundAudioStats(handle.pc).then((stats) => { if (alive) setAudio(stats); }).catch(() => {}); };
        read();
        const timer = setInterval(read, AUDIO_STATS_MS);
        return () => { alive = false; clearInterval(timer); };
    }, [handle]);

    const playAudio = useCallback(() => {
        const element = audioRef.current;
        if (!element) return;
        const started = element.play();
        if (started && typeof started.then === 'function') started.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
        else setAudioBlocked(false);
    }, []);

    // One inbound stream carries every pulled track; bind it once per session.
    useEffect(() => {
        if (!handle?.remoteStream || !audioRef.current) return;
        audioRef.current.srcObject = handle.remoteStream;
        playAudio();
    }, [handle, playAudio]);

    const join = useCallback(async (role) => {
        if (!roomId || status === 'connecting' || handleRef.current) return;
        setError(''); setStatus('connecting');
        try {
            const next = await joinClassroom({
                role: role === 'teach' ? 'teach' : 'watch',
                onState: setDetail,
                authToken: pocketbaseClient.authStore.token,
                seatId: pocketbaseClient.authStore.record?.id || '',
                onRemoteTrackError: (err) => setPresenceError(`An incoming track was rejected: ${err?.message || err}`),
            });
            setHandle(next); setStatus('connected');
        } catch (err) {
            setStatus('failed'); setError(err?.message || String(err));
        }
    }, [roomId, status]);

    const listen = useCallback(async (row) => {
        setPresenceError('');
        try {
            await trackerRef.current?.pull(row);
            setPulled((current) => Array.from(new Set(current.concat([row.id]))));
            playAudio();
        } catch (err) {
            setPresenceError(err?.message || String(err));
        }
    }, [playAudio]);

    // Local track switches act on the real MediaStreamTracks, so "muted" is true on the wire.
    const toggle = useCallback((kind) => {
        const stream = handleRef.current?.stream;
        if (!stream) return;
        const tracks = kind === 'camera' ? stream.getVideoTracks() : stream.getAudioTracks();
        if (!tracks.length) return;
        const next = !tracks[0].enabled;
        tracks.forEach((track) => { track.enabled = next; });
        setLocal((current) => ({ ...current, [kind]: next }));
    }, []);

    return {
        health, configured: Boolean(health?.ok), publishersConfigured: health ? health.publishers_configured : null,
        status, detail, error, handle, presence, unreadable, pulled, presenceError,
        audio, receive: receiveState(audio), audioBlocked, audioRef, local,
        join, leave, listen, playAudio, toggle,
    };
}
