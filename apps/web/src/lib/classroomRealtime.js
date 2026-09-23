// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/classroomRealtime.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/classroom-realtime.pb.js, apps/pocketbase/pb_hooks/classroom-presence.pb.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/classroom-realtime.pb.js;
//              CONSUMES apps/pocketbase/pb_hooks/classroom-presence.pb.js
// Intent:      Join, publish to and subscribe from a Cloudflare Realtime classroom, completing the pull's renegotiation leg and discovering what to pull from the presence advertisement.
// ───────────────────────────────────────────────────────────────
//
// BOUNDARY. The browser owns the RTCPeerConnection and nothing else. It never holds
// CLOUDFLARE_REALTIME_APP_SECRET; every Cloudflare call is proxied by the PocketBase
// hook at /api/classroom/*, which decides who may publish. There is deliberately no
// import.meta.env / VITE_ credential read in this file.
//
// AUTHORITY. `may_publish` returned by the session route is ADVISORY for the UI only.
// The server re-checks it on every push, so a tampered client gets a 403 from the
// backend rather than a track on the SFU. Never treat this flag as permission.
//
// THREE DEFECTS THIS FILE FIXES, all measured on 2026-09-18:
//   1. The pull's second leg. When a session pulls a remote track the SFU answers
//      requiresImmediateRenegotiation with its own offer, and the browser's answer
//      must go to PUT /api/classroom/renegotiate. The previous version posted that
//      answer back to /api/classroom/tracks, which is the wrong endpoint entirely;
//      the pull never completed and the subscriber received zero frames.
//   2. The empty tracks array. That same misdirected call carried tracks: [], and
//      /api/classroom/tracks refuses an empty array with a 400 before it ever looks
//      at the sessionDescription. So the leg failed twice over. Nothing in this file
//      may send an empty tracks array; the renegotiate body carries no tracks at all.
//   3. Discovery. A subscriber had no way to learn a (sessionId, trackName) pair.
//      listPresence/publishPresence read and write the advertisement, and
//      createPresenceTracker turns it into "pull each new body exactly once, and
//      forget it when its row expires".
//
// AN HTTP 200 IS NOT EVIDENCE OF AUDIO, AND THIS FILE REFUSES TO PRETEND IT IS.
//   Two failure modes of this estate both present as "an empty, healthy-looking
//   room", and both are named rather than swallowed here:
//     * The SPA fallback. /api/* under the site root is answered by index.html with
//       200 text/html, so `res.json()` yields {} and a list route returns []. Every
//       response is content-type checked; an HTML body raises a named error saying
//       which URL answered with what, instead of rendering as "nobody is here".
//     * The silent track. A pull can return 200 and deliver zero frames - the exact
//       defect this SRS was opened for. inboundAudioStats() reads pc.getStats() for
//       inbound-rtp packetsReceived, so a caller can show "receiving" on measured
//       packets rather than on a resolved promise. Nothing in this module reports
//       audio from an HTTP status.

// The PocketBase backend is mounted at /hcgi/platform, not at the site root: a
// bare fetch('/api/classroom/session') is answered by the SPA's index.html with a
// 200 and text/html, which reads as "no backend deployed" rather than as a 404.
// Same default and same env name as lib/pocketbaseClient.js, deliberately, so the
// hook routes and the PocketBase SDK can never disagree about where the API is.
const BACKEND_BASE = String(
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_POCKETBASE_API_URL) || '/hcgi/platform',
).replace(/\/+$/, '');

export const API = {
    session: `${BACKEND_BASE}/api/classroom/session`,
    tracks: `${BACKEND_BASE}/api/classroom/tracks`,
    renegotiate: `${BACKEND_BASE}/api/classroom/renegotiate`,
    close: `${BACKEND_BASE}/api/classroom/close`,
    presence: `${BACKEND_BASE}/api/classroom/presence`,
    presenceHealth: `${BACKEND_BASE}/api/classroom/presence/health`,
    health: `${BACKEND_BASE}/api/classroom/health`,
};

/** Cloudflare Realtime requires a STUN server for candidate gathering. */
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], bundlePolicy: 'max-bundle' };

/** A presence row is refreshed on this cadence and lives this long. The hook caps
 *  the TTL at 120 s, so a heartbeat that misses three beats lets the row lapse. */
export const PRESENCE_TTL_MS = 30000;
export const PRESENCE_HEARTBEAT_MS = 10000;
export const PRESENCE_POLL_MS = 5000;

function apiError(status, json) {
    const why = (json && (json.reason || json.message)) || `HTTP ${status}`;
    const err = new Error(why);
    err.status = status;
    return err;
}

/**
 * Reads a response as JSON, or fails with a name.
 *
 * The estate's known failure mode is the SPA fallback: /api/* answered by
 * index.html with 200 text/html. `res.json().catch(() => ({}))` turns that into an
 * empty object, which every caller then renders as "nothing here". This refuses
 * instead, and says which URL answered with which content type.
 *
 * @param {Response} res
 * @returns {Promise<object>}
 */
async function readJson(res) {
    const type = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
    if (type && !type.includes('json')) {
        const err = new Error(
            `backend did not answer with JSON (${type.split(';')[0]} from ${res.url || 'the classroom API'}) — `
            + 'the request was probably served by the SPA fallback rather than by PocketBase',
        );
        err.status = res.status;
        err.code = 'NOT_JSON';
        throw err;
    }
    let json = null;
    try { json = await res.json(); } catch (parseError) {
        const err = new Error(`backend returned an unreadable body (HTTP ${res.status})`);
        err.status = res.status;
        err.code = 'UNREADABLE_BODY';
        throw err;
    }
    return json && typeof json === 'object' ? json : {};
}

async function send(method, path, body, authToken) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authToken) headers.Authorization = authToken;
    const init = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(path, init);
    if (!res.ok) {
        // An error body may legitimately not be JSON; the STATUS is the finding.
        let json = {};
        try { json = await readJson(res); } catch (bodyError) { json = {}; }
        throw apiError(res.status, json);
    }
    return readJson(res);
}

async function post(path, body, authToken) {
    return send('POST', path, body, authToken);
}

/**
 * Waits for ICE gathering so the offer we send is complete.
 *
 * Resolves `true` when gathering finished and `false` when the timeout fired and
 * the offer is going out partially gathered. The previous version resolved with
 * nothing either way, so a truncated gather - a real cause of "connected but no
 * media" - was indistinguishable from a clean one. The timer is cleared on the
 * success path rather than left to fire into a resolved promise.
 *
 * @param {RTCPeerConnection} pc
 * @param {number} timeoutMs
 * @returns {Promise<boolean>} true if gathering completed
 */
function whenIceComplete(pc, timeoutMs = 5000) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve(true);
    return new Promise((resolve) => {
        let timer = null;
        const done = (complete) => {
            if (timer) clearTimeout(timer);
            timer = null;
            pc.removeEventListener('icegatheringstatechange', check);
            resolve(complete);
        };
        const check = () => { if (pc.iceGatheringState === 'complete') done(true); };
        pc.addEventListener('icegatheringstatechange', check);
        timer = setTimeout(() => done(false), timeoutMs);   // never hang the UI on a stalled gather
    });
}

/**
 * A deterministic track name.
 *
 * Cloudflare lets the publisher choose the name, and an earlier version used
 * `track.id`, a fresh random UUID on every join. Nothing downstream could then
 * name a track before it had already seen it advertised. A name derived from the
 * seat survives a reconnect, so a subscriber that already pulled `seat:x/mic`
 * pulls the same name again after the publisher comes back.
 *
 * An anonymous publisher gets `seat:anon/...`, which is NOT a collision: a track
 * name is scoped to its SFU session, and the advertisement is keyed on
 * (room, session_id). The fallback used to be `track.id`, which silently restored
 * the random naming this function exists to remove whenever the auth record was
 * missing - so there is no fallback any more.
 *
 * @param {string} seatId
 * @param {'mic'|'cam'|string} kind
 * @returns {string}
 */
export function trackNameFor(seatId, kind) {
    const seat = String(seatId || 'anon').trim().replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 64) || 'anon';
    return `seat:${seat}/${kind}`;
}

/**
 * PocketBase writes a date as "YYYY-MM-DD HH:MM:SS.sssZ"; the runtime and this
 * module speak ISO-8601 with a T. Parsing both spellings here means no caller has
 * to care which side produced the stamp.
 *
 * @param {string} value
 * @returns {number} epoch ms, or NaN
 */
export function parseWhen(value) {
    if (typeof value !== 'string' || !value.trim()) return NaN;
    return Date.parse(value.trim().replace(' ', 'T'));
}

/**
 * @param {object} row a presence row
 * @param {number} nowMs
 * @returns {boolean} true while the advertisement is still valid
 */
export function isLivePresence(row, nowMs) {
    if (!row || row.state === 'ENDED') return false;
    if (!row.session_id || !Array.isArray(row.tracks) || !row.tracks.length) return false;
    const expires = parseWhen(row.expires_at);
    return Number.isFinite(expires) && expires > nowMs;
}

/**
 * A row the backend could not read the tracks of. It is unpullable AND it is a
 * defect worth showing, which is different from a row that has simply expired.
 *
 * @param {object} row
 * @param {number} nowMs
 * @returns {boolean}
 */
export function isUnreadablePresence(row, nowMs) {
    if (!row || !row.tracks_error) return false;
    const expires = parseWhen(row.expires_at);
    return Number.isFinite(expires) && expires > nowMs;
}

/** Reports signalling-backend configuration without exposing any secret. */
export async function classroomHealth() {
    const res = await fetch(API.health, { headers: { Accept: 'application/json' } });
    return readJson(res);
}

/**
 * Reports whether the presence collection is installed on this environment.
 *
 * This is the difference between "nobody is publishing" and "the migration was
 * never applied here", which otherwise look identical to a student.
 *
 * @returns {Promise<object>} { ok, collection_installed, publishers_configured, reason }
 */
export async function presenceHealth() {
    const res = await fetch(API.presenceHealth, { headers: { Accept: 'application/json' } });
    return readJson(res);
}

/**
 * Counts inbound audio the peer connection has actually received.
 *
 * The UI must not call a track "listening" because an HTTP request returned 200.
 * This reads the only evidence a browser has: inbound-rtp packetsReceived.
 *
 * @param {RTCPeerConnection} pc
 * @returns {Promise<{supported: boolean, packets: number, bytes: number, streams: number}>}
 */
export async function inboundAudioStats(pc) {
    const empty = { supported: false, packets: 0, bytes: 0, streams: 0 };
    if (!pc || typeof pc.getStats !== 'function') return empty;
    let report = null;
    try { report = await pc.getStats(); } catch (statsError) { return empty; }
    if (!report || typeof report.forEach !== 'function') return empty;
    let packets = 0;
    let bytes = 0;
    let streams = 0;
    report.forEach((entry) => {
        if (!entry || entry.type !== 'inbound-rtp') return;
        if (entry.kind && entry.kind !== 'audio') return;
        streams += 1;
        packets += Number(entry.packetsReceived) || 0;
        bytes += Number(entry.bytesReceived) || 0;
    });
    return { supported: true, packets, bytes, streams };
}

/**
 * Joins a classroom.
 *
 * @param {object} opts
 * @param {string} opts.room          Current native classroom identifier.
 * @param {'teach'|'watch'} opts.role   teach publishes camera/mic; watch subscribes.
 * @param {string} [opts.authToken]     PocketBase auth token.
 * @param {string} [opts.seatId]        seat the deterministic track names derive from.
 * @param {(s:string)=>void} [opts.onState] progress callback for the UI.
 * @param {MediaStream} [opts.localStream] existing stream, else getUserMedia is used.
 * @param {() => boolean} [opts.isCurrent] Captured account/room lifetime.
 * @param {(close: () => void) => void} [opts.onCleanup] Register immediate local cancellation.
 * @returns {Promise<object>} handle with { sessionId, pc, tracks, remoteStream, mayPublish, iceComplete, close() }
 */
export async function joinClassroom(opts = {}) {
    if (typeof opts.room !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(opts.room)) throw new Error('room required');
    const role = opts.role === 'teach' ? 'teach' : 'watch';
    const say = opts.onState || (() => {});

    if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC unavailable in this browser');
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const localTracks = [];
    let stream = opts.localStream || null;
    // Inbound tracks land here so the page has one object to hand an <audio>/<video>
    // element. Without it a pulled track arrives and is never rendered.
    const remoteStream = typeof MediaStream === 'undefined' ? null : new MediaStream();
    let closed = false, sessionId = '', closeSent = false;
    const isCurrent = () => !closed && (!opts.isCurrent || opts.isCurrent());
    const close = () => {
        closed = true;
        for (const media of [stream, remoteStream]) {
            try { for (const track of media?.getTracks() || []) track.stop(); } catch { /* Continue closing the peer. */ }
        }
        try { pc.close(); } catch { /* Local teardown is best effort. */ }
        if (sessionId && !closeSent) {
            closeSent = true;
            // The server invalidates only this account's bound session. Failure
            // does not undo local teardown or authorize an automatic retry.
            void post(API.close, { room: opts.room, sessionId }, opts.authToken).catch(() => {});
        }
    };
    const requireCurrent = () => {
        if (!isCurrent()) { close(); throw new Error('Media join was cancelled.'); }
    };
    opts.onCleanup?.(close);
    if (remoteStream) {
        pc.addEventListener('track', (event) => {
            if (!isCurrent()) { event.track?.stop(); return; }
            // A duplicate addTrack is harmless and expected; anything else is an
            // inbound track that will never be heard, so it is reported rather than
            // swallowed under a comment about duplicates.
            try {
                remoteStream.addTrack(event.track);
            } catch (addError) {
                const already = remoteStream.getTracks().some((t) => t.id === event.track.id);
                if (!already && opts.onRemoteTrackError) opts.onRemoteTrackError(addError, event);
            }
            if (opts.onRemoteTrack) opts.onRemoteTrack(event);
        });
    }

    try {
        requireCurrent();
        if (role === 'teach') {
            say('requesting camera and microphone');
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            }
            requireCurrent();
            for (const track of stream.getTracks()) {
                const tx = pc.addTransceiver(track, { direction: 'sendonly' });
                const kind = track.kind === 'video' ? 'cam' : 'mic';
                localTracks.push({
                    location: 'local',
                    transceiver: tx,
                    // Unconditional: see trackNameFor. A falsy seatId yields
                    // seat:anon/<kind>, never a random UUID.
                    trackName: trackNameFor(opts.seatId, kind),
                    // Carried from the real track, not re-derived from the name.
                    mediaKind: track.kind === 'video' ? 'video' : 'audio',
                });
            }
        } else {
            // A subscriber still needs a transceiver so the SDP has media to answer.
            pc.addTransceiver('audio', { direction: 'recvonly' });
            pc.addTransceiver('video', { direction: 'recvonly' });
        }

        say('creating offer');
        const offer = await pc.createOffer();
        requireCurrent();
        await pc.setLocalDescription(offer);
        requireCurrent();
        const iceComplete = await whenIceComplete(pc);
        requireCurrent();
        if (!iceComplete) say('ICE gathering timed out; sending a partially gathered offer');

        say('opening SFU session');
        const session = await post(API.session, {
            room: opts.room,
            sessionDescription: { type: 'offer', sdp: pc.localDescription.sdp },
        }, opts.authToken);
        sessionId = session.sessionId || '';
        requireCurrent();

        if (session.room !== opts.room || !sessionId) throw new Error('The backend did not bind this media session to the classroom. Install the matching backend before joining.');
        if (!session.sessionDescription) throw new Error('SFU returned no answer');
        await pc.setRemoteDescription(new RTCSessionDescription(session.sessionDescription));
        requireCurrent();
        say(`session ${String(session.sessionId).slice(0, 8)}… established`);

        // Advisory only — the server re-checks on every push.
        const mayPublish = session.may_publish === true;
        if (role === 'teach' && !mayPublish) {
            say('this seat is not authorised to publish');
        }

        let tracks = null;
        if (role === 'teach' && mayPublish && localTracks.length) {
            say('publishing tracks');
            tracks = await post(API.tracks, {
                room: opts.room,
                sessionId: session.sessionId,
                action: 'push',
                tracks: localTracks.map((t) => ({ location: t.location, mid: t.transceiver.mid, trackName: t.trackName, kind: t.mediaKind })),
                sessionDescription: { type: 'offer', sdp: pc.localDescription.sdp },
            }, opts.authToken);
            requireCurrent();
        }

        return {
            room: opts.room,
            sessionId: session.sessionId,
            pc,
            stream,
            remoteStream,
            tracks,
            iceComplete,
            published: tracks ? localTracks.map((t) => ({ trackName: t.trackName, kind: t.mediaKind })) : [],
            mayPublish,
            role,
            close,
            isCurrent,
        };
    } catch (err) {
        close();
        throw err;
    }
}

/**
 * Subscribes to a remote participant's published tracks.
 *
 * The SFU answers a pull with `requiresImmediateRenegotiation` and its own offer.
 * The browser sets that offer, creates an answer, and PUTs it to
 * /api/classroom/renegotiate — a different route from the pull itself, carrying no
 * tracks at all. Posting the answer back to /api/classroom/tracks (what this
 * function used to do) both hits the wrong endpoint and trips the hook's
 * "tracks required" 400, and the subscriber then receives zero frames forever.
 *
 * A 200 from this function means the SIGNALLING completed. It does not mean audio
 * is flowing; ask inboundAudioStats(handle.pc) for that.
 *
 * @param {object} handle   the value returned by joinClassroom
 * @param {Array}  remote   [{ trackName, sessionId }] as advertised by the publisher
 * @param {string} [authToken]
 * @returns {Promise<object>} the SFU's pull response
 */
export async function pullTracks(handle, remote, authToken) {
    if (!handle || !handle.sessionId) throw new Error('no session');
    if (!handle.room) throw new Error('room required');
    const requireCurrent = () => { if (handle.isCurrent && !handle.isCurrent()) throw new Error('Media session was cancelled.'); };
    requireCurrent();
    const wanted = (Array.isArray(remote) ? remote : [])
        .filter((t) => t && t.trackName && t.sessionId)
        .map((t) => ({ location: 'remote', trackName: String(t.trackName), sessionId: String(t.sessionId) }));
    // An empty tracks array is a guaranteed 400 from the hook, so it is never sent.
    if (!wanted.length) throw new Error('no tracks requested');

    const res = await post(API.tracks, {
        room: handle.room,
        sessionId: handle.sessionId,
        action: 'pull',
        tracks: wanted,
    }, authToken);
    requireCurrent();

    if (res.requiresImmediateRenegotiation && res.sessionDescription) {
        await handle.pc.setRemoteDescription(new RTCSessionDescription(res.sessionDescription));
        requireCurrent();
        const answer = await handle.pc.createAnswer();
        requireCurrent();
        await handle.pc.setLocalDescription(answer);
        requireCurrent();
        await send('PUT', API.renegotiate, {
            room: handle.room,
            sessionId: handle.sessionId,
            sessionDescription: { type: 'answer', sdp: handle.pc.localDescription.sdp },
        }, authToken);
        requireCurrent();
    }
    return res;
}

/**
 * Reads the room's live advertisements.
 *
 * Never returns [] for a backend that did not answer: an HTML body or an
 * unreadable one raises, so a missing backend cannot render as an empty room.
 *
 * @param {string} room
 * @param {string} [authToken]
 * @returns {Promise<Array<object>>} rows, each with { session_id, tracks, persona_id, expires_at, ... }
 */
export async function listPresence(room, authToken) {
    if (!room) throw new Error('room required');
    const headers = { Accept: 'application/json' };
    if (authToken) headers.Authorization = authToken;
    const res = await fetch(`${API.presence}?room=${encodeURIComponent(room)}`, {
        method: 'GET', headers, credentials: 'same-origin',
    });
    if (!res.ok) {
        let json = {};
        try { json = await readJson(res); } catch (bodyError) { json = {}; }
        throw apiError(res.status, json);
    }
    const json = await readJson(res);
    if (!Array.isArray(json.items)) {
        const err = new Error('presence route answered without an items list');
        err.code = 'NO_ITEMS';
        throw err;
    }
    return json.items;
}

/**
 * Advertises this session's tracks. Only a seat the backend allowlists as a
 * publisher may do this; anybody else gets a 403, which is the same answer they
 * would get from a push.
 *
 * @param {object} opts
 * @param {string} opts.room
 * @param {string} opts.sessionId
 * @param {Array}  opts.tracks    [{ trackName, kind }]
 * @param {number} [opts.ttlMs]
 * @param {string} [opts.personaId]
 * @param {string} [opts.authToken]
 * @param {() => string} [opts.getAuthToken] Current token within the same captured lifetime.
 * @param {() => number} [opts.now]
 * @returns {Promise<object>}
 */
export async function publishPresence(opts = {}) {
    const now = opts.now || (() => Date.now());
    const tracks = (Array.isArray(opts.tracks) ? opts.tracks : [])
        .filter((t) => t && t.trackName)
        .map((t) => ({ trackName: String(t.trackName), kind: t.kind === 'video' ? 'video' : 'audio' }));
    if (!opts.room) throw new Error('room required');
    if (!opts.sessionId) throw new Error('sessionId required');
    // The hook refuses an empty list; refusing here too keeps the failure local.
    if (!tracks.length) throw new Error('no tracks to advertise');
    const ttl = Math.min(Math.max(Number(opts.ttlMs) || PRESENCE_TTL_MS, 5000), 120000);
    return post(API.presence, {
        room: opts.room,
        session_id: opts.sessionId,
        tracks,
        persona_id: opts.personaId || '',
        role: opts.role || (opts.personaId ? 'guildmaster' : 'teacher'),
        state: opts.state || 'LIVE',
        app_name: opts.appName || '',
        manifest_id: opts.manifestId || '',
        capsule_digest: opts.capsuleDigest || '',
        expires_at: new Date(now() + ttl).toISOString(),
    }, opts.getAuthToken ? opts.getAuthToken() : opts.authToken);
}

/**
 * Keeps this session's advertisement alive. Stopping the heartbeat is how a
 * publisher leaves: the row lapses on its own TTL and every reader drops it,
 * so nothing has to observe the departure.
 *
 * A beat that is still in flight when the next interval fires is SKIPPED, not
 * queued. Without that guard a backend slower than the 10 s cadence turns one
 * publisher into an unbounded stack of concurrent durable writes. stop() also
 * makes an in-flight beat's result inert, so a late reply cannot report an error
 * against a heartbeat the caller has already ended.
 *
 * @param {object} opts same shape as publishPresence, plus { everyMs, onError }
 * @returns {{ stop: () => void, beat: () => Promise<object>, skipped: () => number, inFlight: () => boolean }}
 */
export function startPresenceHeartbeat(opts = {}) {
    const everyMs = Number(opts.everyMs) || PRESENCE_HEARTBEAT_MS;
    let timer = null;
    let stopped = false;
    let busy = false;
    let skipped = 0;
    const beat = async () => publishPresence(opts);
    const tick = () => {
        if (stopped || busy) {
            if (busy && !stopped) skipped += 1;
            return;
        }
        busy = true;
        beat()
            .catch((err) => { if (!stopped && opts.onError) opts.onError(err); })
            .then(() => { busy = false; }, () => { busy = false; });
    };
    tick();
    timer = setInterval(tick, everyMs);
    return {
        beat,
        skipped: () => skipped,
        inFlight: () => busy,
        stop() {
            if (stopped) return;
            stopped = true;
            if (timer) clearInterval(timer);
            timer = null;
        },
    };
}

/**
 * Turns the advertisement into subscriptions.
 *
 * Exactly one pull per (session_id, trackName): a five-second poll that re-pulled
 * the same track would renegotiate the peer connection twelve times a minute. When
 * a row expires the tracker forgets it, so a body that comes back under the same
 * session is pulled again rather than being remembered as already-handled forever.
 *
 * The same overlap guard as the heartbeat applies, and for a sharper reason: a
 * pull is only recorded in `pulled` AFTER it resolves, so a pull slower than the
 * five-second poll was being issued twice for one (session_id, trackName) - two
 * transceivers and exactly the renegotiation storm the dedup map exists to
 * prevent. A tick that arrives while one is running is skipped and counted.
 *
 * `select` decides which rows are pulled automatically. The default is "any row
 * carrying a persona_id", i.e. a manifested guildmaster — a human teacher's row is
 * listed for the UI and pulled only when a member asks for it.
 *
 * @param {object} opts
 * @returns {{ tick: () => Promise<object>, start: (ms?: number) => void, stop: () => void, pull: (row) => Promise<object>, pulledKeys: () => Array<string>, skipped: () => number }}
 */
export function createPresenceTracker(opts = {}) {
    const handle = opts.handle;
    const room = opts.room;
    const authToken = () => opts.getAuthToken ? opts.getAuthToken() : opts.authToken;
    const now = opts.now || (() => Date.now());
    const list = opts.list || listPresence;
    const pullImpl = opts.pull || pullTracks;
    const select = opts.select || ((row) => Boolean(row.persona_id));
    const pulled = new Map();   // "<session_id>::<trackName>" -> row id
    const inFlight = new Set(); // keys whose pull has been issued but not resolved
    let timer = null;
    let busy = false;
    let skipped = 0;
    let stopped = false;

    const keysOf = (row) => (Array.isArray(row.tracks) ? row.tracks : [])
        .filter((t) => t && t.trackName)
        .map((t) => `${row.session_id}::${t.trackName}`);

    async function pullRow(row) {
        if (stopped || handle?.isCurrent && !handle.isCurrent()) throw new Error('Media discovery was cancelled.');
        const wanted = (Array.isArray(row.tracks) ? row.tracks : [])
            .filter((t) => t && t.trackName)
            .map((t) => ({ sessionId: row.session_id, trackName: t.trackName }));
        if (!wanted.length) return null;
        const keys = keysOf(row);
        // Claim the keys before awaiting so a concurrent caller - tick() and the
        // page's Listen button can overlap - cannot issue the same pull twice.
        for (const key of keys) inFlight.add(key);
        try {
            const res = await pullImpl(handle, wanted, authToken());
            if (stopped || handle?.isCurrent && !handle.isCurrent()) return null;
            for (const key of keys) pulled.set(key, row.id || row.session_id);
            return res;
        } finally {
            for (const key of keys) inFlight.delete(key);
        }
    }

    async function tick() {
        if (stopped || handle?.isCurrent && !handle.isCurrent()) return null;
        const rows = await list(room, authToken());
        if (stopped || handle?.isCurrent && !handle.isCurrent()) return null;
        const at = now();
        const live = rows.filter((row) => isLivePresence(row, at));
        const unreadable = rows.filter((row) => isUnreadablePresence(row, at));
        // Forget anything no longer advertised so a returning session is pulled
        // again instead of being treated as already subscribed.
        const liveKeys = new Set();
        for (const row of live) for (const key of keysOf(row)) liveKeys.add(key);
        const expired = [];
        for (const key of Array.from(pulled.keys())) {
            if (!liveKeys.has(key)) { pulled.delete(key); expired.push(key); }
        }

        const pulledNow = [];
        for (const row of live) {
            if (stopped || handle?.isCurrent && !handle.isCurrent()) return null;
            if (handle && row.session_id === handle.sessionId) continue;   // never pull our own body
            if (!select(row)) continue;
            const keys = keysOf(row);
            if (keys.every((key) => pulled.has(key))) continue;
            if (keys.some((key) => inFlight.has(key))) continue;
            try {
                await pullRow(row);
                pulledNow.push(row);
            } catch (err) {
                if (!stopped && opts.onError) opts.onError(err, row);
            }
        }
        const result = { live, unreadable, pulled: pulledNow, expired };
        if (!stopped && opts.onChange) opts.onChange(result);
        return result;
    }

    return {
        tick,
        pull: pullRow,
        pulledKeys: () => Array.from(pulled.keys()),
        skipped: () => skipped,
        start(ms) {
            if (timer) return;
            stopped = false;
            const every = Number(ms) || PRESENCE_POLL_MS;
            const run = () => {
                if (stopped || busy) {
                    if (busy && !stopped) skipped += 1;
                    return;
                }
                busy = true;
                tick()
                    .catch((err) => { if (!stopped && opts.onError) opts.onError(err, null); })
                    .then(() => { busy = false; }, () => { busy = false; });
            };
            run();
            timer = setInterval(run, every);
        },
        stop() {
            stopped = true;
            if (timer) clearInterval(timer);
            timer = null;
        },
    };
}
