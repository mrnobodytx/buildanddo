// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/ClassroomPage.jsx
// Stage:       07_BUILD
// SRS:         SRS-CN-PERSONA-RUNTIME-001, SRS-BUILDANDDO-COMMUNITY-WEB-001
// CAPS:        pending
// CK:          pending
// Dispatch:    C-ONE-20260918-PERSONA-RUNTIME-001, VCC-BUILDANDDO-COMMUNITY-WEB-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/classroomRealtime.js, apps/pocketbase/pb_hooks/classroom-presence.pb.js
// EnumType:    Page
// EnumEdges:   CONSUMES apps/web/src/lib/classroomRealtime.js;
//              CONSUMES apps/pocketbase/pb_hooks/classroom-presence.pb.js
// Intent:      Join a live classroom, advertise the teacher's tracks, and list who else is publishing so a member can pull them.
// ───────────────────────────────────────────────────────────────
//
// NOT ROUTED YET. apps/web/src/App.jsx points both `classrooms` and
// `classrooms/:roomId` at ClassroomsPage, and nothing imports this file, so it is
// not in the module graph and `npm build succeeds` says nothing about it. App.jsx
// is outside this lane's file ownership; routing or merging this page is a named
// follow-up for its owner, not something done silently from here.
//
// Live classroom over Cloudflare Realtime. The page holds no credential: every SFU
// call is proxied by /api/classroom/*, which owns the app secret and decides who may
// publish. Joining is an explicit operator action — nothing connects on mount, and
// the default rendered state is UNCONNECTED rather than an optimistic "live".
//
// THE ADVERTISEMENT. A session id and a track name are not discoverable from the
// SFU, so a room that only signals is a room where nobody can find anybody. Once
// connected, this page reads GET /api/classroom/presence?room=<id> every five
// seconds. A manifested guildmaster — any row carrying a persona_id — is pulled
// automatically into the audio element; a human publisher is listed with a Listen
// button, because pulling a person's camera should be a member's decision rather
// than something that happens on poll. A publishing teacher advertises its own
// tracks on a ten-second heartbeat, and simply stops when it leaves: the row lapses
// on its TTL and every reader drops it.
//
// THREE THINGS THIS PAGE REFUSES TO FAKE
//   1. "Listening" is measured, not assumed. A pull that returns HTTP 200 and
//      delivers zero frames is the exact defect this SRS was opened for, so a
//      pulled row reads PULLED and the room reports inbound audio from
//      pc.getStats() packetsReceived. Green here means packets arrived.
//   2. The room field does not write. The room id used to be bound straight to the
//      two presence effects, so typing a fifteen-character id while connected
//      issued fifteen durable POSTs and fifteen GETs — one per keystroke. The
//      field now edits a draft and the effects key on a committed value, applied on
//      Enter, on blur, or by the Use room button.
//   3. Autoplay is handled, not asserted. The audio element is not muted, so a
//      browser may refuse to start it without a gesture. A refused play() is
//      surfaced with a button rather than left as a silent element above a green
//      badge.
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/workspace/workspaceHelpers';
import { Card } from '@/components/site/ui';
import { personaForPresence, personaPath } from '@/data/personas';
import pocketbaseClient from '@/lib/pocketbaseClient';
import {
    joinClassroom,
    classroomHealth,
    presenceHealth,
    createPresenceTracker,
    startPresenceHeartbeat,
    inboundAudioStats,
    PRESENCE_POLL_MS,
} from '@/lib/classroomRealtime';

const AUDIO_STATS_MS = 2000;

function shortId(value) {
    return String(value || '').slice(0, 12);
}

// A guildmaster row names its persona by presence id (gm-forge, gm:forge, gm-builder-forge). The
// reader gets the persona's name and its public profile rather than the raw id; an id the canon
// does not know is still shown, unlinked, so an unexpected publisher is never hidden.
function PresencePersona({ id }) {
    const persona = personaForPresence(id);
    if (!persona) return <>{`${id} (guildmaster)`}</>;
    return (
        <>
            <Link to={personaPath(persona)} className="underline underline-offset-4">{persona.name}</Link>
            {' (guildmaster)'}
        </>
    );
}

export default function ClassroomPage() {
    const params = useParams();
    const initialRoom = params.id || params.roomId || '';
    const [health, setHealth] = React.useState(null);
    const [advert, setAdvert] = React.useState(null);
    const [state, setState] = React.useState('UNCONNECTED');
    const [detail, setDetail] = React.useState('');
    const [error, setError] = React.useState('');
    const [handle, setHandle] = React.useState(null);
    // draft is what the field shows; room is what the network uses. They are
    // separate on purpose: see THREE THINGS THIS PAGE REFUSES TO FAKE, item 2.
    const [draftRoom, setDraftRoom] = React.useState(initialRoom);
    const [room, setRoom] = React.useState(initialRoom);
    const [presence, setPresence] = React.useState([]);
    const [unreadable, setUnreadable] = React.useState([]);
    const [presenceError, setPresenceError] = React.useState('');
    const [pulledRows, setPulledRows] = React.useState([]);
    const [audio, setAudio] = React.useState({ supported: false, packets: 0, bytes: 0, streams: 0 });
    const [audioBlocked, setAudioBlocked] = React.useState(false);
    const localVideo = React.useRef(null);
    const remoteAudio = React.useRef(null);
    const trackerRef = React.useRef(null);

    // Health is configuration metadata only; it exposes no secret and starts nothing.
    React.useEffect(() => {
        let alive = true;
        classroomHealth()
            .then((h) => { if (alive) setHealth(h); })
            .catch((err) => { if (alive) setHealth({ ok: false, reason: err?.message || 'health route unreachable' }); });
        // The presence route has its own health, and it answers a question the
        // signalling health cannot: whether the classroom_presence collection was
        // ever migrated onto THIS environment. Without it a missing migration is
        // indistinguishable from an empty room.
        presenceHealth()
            .then((h) => { if (alive) setAdvert(h); })
            .catch((err) => { if (alive) setAdvert({ ok: false, reason: err?.message || 'presence health unreachable' }); });
        return () => { alive = false; };
    }, []);

    React.useEffect(() => () => { if (handle) handle.close(); }, [handle]);

    // The presence poll. It only runs while connected and only for a COMMITTED
    // room: there is nothing to advertise into, and nothing to read, without both.
    React.useEffect(() => {
        if (!handle || !room) return undefined;
        const tracker = createPresenceTracker({
            handle,
            room,
            authToken: pocketbaseClient.authStore.token,
            onChange: ({ live, pulled, unreadable: broken }) => {
                setPresence(live);
                setUnreadable(broken || []);
                if (pulled.length) {
                    setPulledRows((current) => Array.from(new Set(current.concat(pulled.map((row) => row.id)))));
                }
                setPresenceError('');
            },
            onError: (err) => setPresenceError(err?.message || String(err)),
        });
        trackerRef.current = tracker;
        tracker.start(PRESENCE_POLL_MS);
        return () => {
            tracker.stop();
            trackerRef.current = null;
            setPresence([]);
            setUnreadable([]);
            setPulledRows([]);
        };
    }, [handle, room]);

    // A publishing teacher advertises. A watcher never does, and an unauthorised
    // seat's write is refused by the backend rather than by this condition.
    React.useEffect(() => {
        if (!handle || !room) return undefined;
        if (handle.role !== 'teach' || !handle.mayPublish || !handle.published?.length) return undefined;
        const beat = startPresenceHeartbeat({
            room,
            sessionId: handle.sessionId,
            tracks: handle.published,
            authToken: pocketbaseClient.authStore.token,
            onError: (err) => setPresenceError(err?.message || String(err)),
        });
        return () => beat.stop();
    }, [handle, room]);

    // The only evidence a browser has that a pull produced audio. Polled rather
    // than inferred: an HTTP 200 from the pull says the signalling completed and
    // says nothing at all about frames.
    React.useEffect(() => {
        if (!handle?.pc) return undefined;
        let alive = true;
        const read = () => {
            inboundAudioStats(handle.pc)
                .then((stats) => { if (alive) setAudio(stats); })
                .catch(() => {});
        };
        read();
        const timer = setInterval(read, AUDIO_STATS_MS);
        return () => { alive = false; clearInterval(timer); };
    }, [handle]);

    // One inbound stream carries every pulled track, so the element is bound once.
    // The element is NOT muted, so play() can be refused by autoplay policy; that
    // refusal is recorded and offered as a button instead of disappearing.
    React.useEffect(() => {
        if (!handle?.remoteStream || !remoteAudio.current) return;
        const element = remoteAudio.current;
        element.srcObject = handle.remoteStream;
        const started = element.play();
        if (started && typeof started.catch === 'function') {
            started.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
        }
    }, [handle]);

    function enableAudio() {
        const element = remoteAudio.current;
        if (!element) return;
        const started = element.play();
        if (started && typeof started.catch === 'function') {
            started.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
        } else {
            setAudioBlocked(false);
        }
    }

    function commitRoom() {
        const next = draftRoom.trim();
        if (next !== room) setRoom(next);
    }

    async function join(role) {
        setError('');
        setState('CONNECTING');
        commitRoom();
        try {
            const h = await joinClassroom({
                role,
                onState: setDetail,
                authToken: pocketbaseClient.authStore.token,
                seatId: pocketbaseClient.authStore.record?.id || '',
                onRemoteTrackError: (err) => setPresenceError(`inbound track rejected: ${err?.message || err}`),
            });
            setHandle(h);
            setState('CONNECTED');
            if (h.stream && localVideo.current) {
                localVideo.current.srcObject = h.stream;
            }
        } catch (err) {
            setState('FAILED');
            setError(err.message || String(err));
        }
    }

    async function listen(row) {
        setPresenceError('');
        try {
            await trackerRef.current?.pull(row);
            setPulledRows((current) => Array.from(new Set(current.concat([row.id]))));
            enableAudio();
        } catch (err) {
            setPresenceError(err?.message || String(err));
        }
    }

    function leave() {
        if (handle) handle.close();
        setHandle(null);
        setState('UNCONNECTED');
        setDetail('');
        setAudio({ supported: false, packets: 0, bytes: 0, streams: 0 });
        setAudioBlocked(false);
    }

    const configured = health && health.ok;
    const publishers = health ? health.publishers_configured : null;
    const receiving = audio.supported && audio.packets > 0;
    const roomDirty = draftRoom.trim() !== room;

    return <div className="space-y-6">
        <PageHeader
            title="Classroom"
            description="Live teaching over the Cloudflare Realtime SFU. Sessions are brokered server-side; this page never holds a provider credential."
        />

        <Card className="p-6">
            <p className="font-evidence text-sm">CLASSROOM = {state}</p>
            {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
            {error && <p className="mt-2 text-sm text-red-600">Failed: {error}</p>}

            {health && !configured && (
                <p className="mt-3 text-sm text-amber-700">
                    Backend not configured{health.reason ? `: ${health.reason}` : ''}. The room cannot open
                    until the signalling route reports ok.
                </p>
            )}
            {configured && publishers === 0 && (
                <p className="mt-3 text-sm text-amber-700">
                    No publishers are configured, so nobody may broadcast yet. Watching still works.
                    This is deliberate: an unconfigured room does not let every participant publish.
                </p>
            )}
            {advert && !advert.ok && (
                <p className="mt-3 text-sm text-amber-700">
                    The presence collection is not installed on this environment
                    {advert.reason ? `: ${advert.reason}` : ''}. Nobody can be discovered until the
                    classroom_presence migration has been applied here — an empty list below would
                    otherwise look like an empty room.
                </p>
            )}

            <label className="mt-4 block text-sm" htmlFor="classroom-room">
                Room
                <input
                    id="classroom-room"
                    type="text"
                    value={draftRoom}
                    onChange={(event) => setDraftRoom(event.target.value)}
                    onBlur={commitRoom}
                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitRoom(); } }}
                    placeholder="classroom record id"
                    className="mt-1 block w-full max-w-sm rounded border px-3 py-2 text-sm"
                />
            </label>
            <div className="mt-2 flex items-center gap-3">
                <button
                    type="button"
                    onClick={commitRoom}
                    disabled={!roomDirty}
                    className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                >
                    Use room
                </button>
                <span className="text-xs text-muted-foreground">
                    {room ? `reading room ${room}` : 'no room committed'}
                    {roomDirty ? ' · press Enter to apply the edit' : ''}
                </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
                Typing here changes nothing on the server. The room is applied on Enter, on leaving the
                field, or with the button — so editing an id does not write one advertisement per keystroke.
            </p>

            <div className="mt-4 flex gap-3">
                <button
                    type="button"
                    onClick={() => join('teach')}
                    disabled={!configured || state === 'CONNECTING' || state === 'CONNECTED'}
                    className="rounded border px-4 py-2 text-sm disabled:opacity-50"
                >
                    Start teaching
                </button>
                <button
                    type="button"
                    onClick={() => join('watch')}
                    disabled={!configured || state === 'CONNECTING' || state === 'CONNECTED'}
                    className="rounded border px-4 py-2 text-sm disabled:opacity-50"
                >
                    Join as student
                </button>
                <button
                    type="button"
                    onClick={leave}
                    disabled={state !== 'CONNECTED'}
                    className="rounded border px-4 py-2 text-sm disabled:opacity-50"
                >
                    Leave
                </button>
            </div>
        </Card>

        {state === 'CONNECTED' && handle && (
            <Card className="p-6">
                <p className="font-evidence text-sm">
                    SESSION {shortId(handle.sessionId)}… · ROLE {handle.role.toUpperCase()} ·
                    {handle.mayPublish ? ' PUBLISH ALLOWED' : ' SUBSCRIBE ONLY'}
                </p>
                {handle.iceComplete === false && (
                    <p className="mt-2 text-sm text-amber-700">
                        ICE gathering timed out, so this session negotiated on a partially gathered
                        offer. Media may not flow; reconnecting is the usual fix.
                    </p>
                )}
                {handle.role === 'teach' && (
                    <video
                        ref={localVideo}
                        autoPlay
                        muted
                        playsInline
                        className="mt-4 w-full max-w-xl rounded border"
                    />
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                    Publish authority is enforced by the backend on every track push; the flag shown here
                    is advisory for this interface only.
                </p>
            </Card>
        )}

        {state === 'CONNECTED' && handle && (
            <Card className="p-6">
                <p className="font-evidence text-sm">PUBLISHING NOW = {presence.length}</p>
                <p className="mt-1 font-evidence text-xs">
                    INBOUND AUDIO ={' '}
                    {!audio.supported
                        ? 'UNMEASURED (this browser exposes no getStats)'
                        : receiving
                            ? `RECEIVING · ${audio.packets} packets over ${audio.streams} stream(s)`
                            : `NO FRAMES YET · ${audio.streams} inbound stream(s), 0 packets`}
                </p>
                {presenceError && <p className="mt-2 text-sm text-red-600">Presence: {presenceError}</p>}
                {audioBlocked && (
                    <p className="mt-2 text-sm text-amber-700">
                        The browser refused to start playback without a gesture.{' '}
                        <button type="button" onClick={enableAudio} className="rounded border px-2 py-1 text-xs">
                            Enable audio
                        </button>
                    </p>
                )}
                {!room && (
                    <p className="mt-2 text-sm text-amber-700">
                        Name a room above and apply it to see who is publishing into it.
                    </p>
                )}
                {room && presence.length === 0 && !presenceError && (
                    <p className="mt-2 text-sm text-muted-foreground">
                        Nobody is advertising a track in this room. A publisher that stopped refreshing
                        disappears here within its TTL rather than lingering as a dead entry. If the
                        backend were unreachable this line would be an error instead.
                    </p>
                )}
                {unreadable.length > 0 && (
                    <p className="mt-2 text-sm text-amber-700">
                        {unreadable.length} advertisement(s) in this room could not be read by the backend
                        ({unreadable.map((row) => row.tracks_error).join(', ')}). They are unpullable and
                        are shown rather than dropped.
                    </p>
                )}

                <ul className="mt-3 space-y-2">
                    {presence.map((row) => (
                        <li key={row.id} className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm">
                            <span className="font-evidence">
                                {row.persona_id ? <PresencePersona id={row.persona_id} /> : row.display_name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                session {shortId(row.session_id)}… · {row.tracks.map((t) => t.trackName).join(', ')}
                                {row.state !== 'LIVE' ? ` · ${row.state}` : ''}
                            </span>
                            {row.session_id === handle.sessionId ? (
                                <span className="text-xs text-muted-foreground">this is you</span>
                            ) : pulledRows.includes(row.id) ? (
                                <span className={receiving ? 'text-xs text-emerald-700' : 'text-xs text-amber-700'}>
                                    {receiving ? 'pulled · audio arriving' : 'pulled · no frames yet'}
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => listen(row)}
                                    className="rounded border px-3 py-1 text-xs"
                                >
                                    Listen
                                </button>
                            )}
                        </li>
                    ))}
                </ul>

                {/* One element for every pulled track. It is NOT muted, so a browser
                    may refuse to start it without a gesture; that refusal sets
                    audioBlocked above and offers a button, rather than leaving a
                    silent element under a green badge. */}
                <audio ref={remoteAudio} autoPlay className="mt-4 w-full" controls />
                <p className="mt-2 text-xs text-muted-foreground">
                    A guildmaster row is pulled automatically; a person is pulled only when you ask.
                    Each track is pulled once per session and released when its advertisement expires.
                    &quot;Pulled&quot; means the signalling completed; the inbound-audio line above is the
                    only statement about frames.
                </p>
            </Card>
        )}
    </div>;
}
