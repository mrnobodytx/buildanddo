// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=VCC
// Dispatch: VCC-20260911-BND-LIVE-001
//
// Browser client for BuildAndDo classrooms over Cloudflare Realtime (SFU).
//
// BOUNDARY. The browser owns the RTCPeerConnection and nothing else. It never holds
// CLOUDFLARE_REALTIME_APP_SECRET; every Cloudflare call is proxied by the PocketBase
// hook at /api/classroom/*, which decides who may publish. There is deliberately no
// import.meta.env / VITE_ credential read in this file.
//
// AUTHORITY. `may_publish` returned by the session route is ADVISORY for the UI only.
// The server re-checks it on every push, so a tampered client gets a 403 from the
// backend rather than a track on the SFU. Never treat this flag as permission.

const API = {
    session: '/api/classroom/session',
    tracks: '/api/classroom/tracks',
    health: '/api/classroom/health',
};

/** Cloudflare Realtime requires a STUN server for candidate gathering. */
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], bundlePolicy: 'max-bundle' };

async function post(path, body, authToken) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (authToken) headers.Authorization = authToken;
    const res = await fetch(path, {
        method: 'POST', headers, credentials: 'same-origin', body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        const why = json.reason || json.message || `HTTP ${res.status}`;
        const err = new Error(why);
        err.status = res.status;
        throw err;
    }
    return json;
}

/** Waits for ICE gathering so the offer we send is complete. */
function whenIceComplete(pc, timeoutMs = 5000) {
    if (pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => { pc.removeEventListener('icegatheringstatechange', check); resolve(); };
        const check = () => { if (pc.iceGatheringState === 'complete') done(); };
        pc.addEventListener('icegatheringstatechange', check);
        setTimeout(done, timeoutMs);   // never hang the UI on a stalled gather
    });
}

/** Reports backend configuration without exposing any secret. */
export async function classroomHealth() {
    const res = await fetch(API.health, { headers: { Accept: 'application/json' } });
    return res.json();
}

/**
 * Joins a classroom.
 *
 * @param {object} opts
 * @param {'teach'|'watch'} opts.role   teach publishes camera/mic; watch subscribes.
 * @param {string} [opts.authToken]     PocketBase auth token.
 * @param {(s:string)=>void} [opts.onState] progress callback for the UI.
 * @param {MediaStream} [opts.localStream] existing stream, else getUserMedia is used.
 * @returns {Promise<object>} handle with { sessionId, pc, tracks, mayPublish, close() }
 */
export async function joinClassroom(opts = {}) {
    const role = opts.role === 'teach' ? 'teach' : 'watch';
    const say = opts.onState || (() => {});

    if (typeof RTCPeerConnection === 'undefined') {
        throw new Error('WebRTC unavailable in this browser');
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const localTracks = [];
    let stream = opts.localStream || null;

    try {
        if (role === 'teach') {
            say('requesting camera and microphone');
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            }
            for (const track of stream.getTracks()) {
                const tx = pc.addTransceiver(track, { direction: 'sendonly' });
                localTracks.push({ location: 'local', mid: tx.mid, trackName: track.id });
            }
        } else {
            // A subscriber still needs a transceiver so the SDP has media to answer.
            pc.addTransceiver('audio', { direction: 'recvonly' });
            pc.addTransceiver('video', { direction: 'recvonly' });
        }

        say('creating offer');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await whenIceComplete(pc);

        say('opening SFU session');
        const session = await post(API.session, {
            sessionDescription: { type: 'offer', sdp: pc.localDescription.sdp },
        }, opts.authToken);

        if (!session.sessionDescription) throw new Error('SFU returned no answer');
        await pc.setRemoteDescription(new RTCSessionDescription(session.sessionDescription));
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
                sessionId: session.sessionId,
                action: 'push',
                tracks: localTracks,
                sessionDescription: { type: 'offer', sdp: pc.localDescription.sdp },
            }, opts.authToken);
        }

        return {
            sessionId: session.sessionId,
            pc,
            stream,
            tracks,
            mayPublish,
            role,
            close() {
                try { for (const t of (stream ? stream.getTracks() : [])) t.stop(); } catch { /* best effort */ }
                try { pc.close(); } catch { /* best effort */ }
            },
        };
    } catch (err) {
        try { for (const t of (stream ? stream.getTracks() : [])) t.stop(); } catch { /* best effort */ }
        try { pc.close(); } catch { /* best effort */ }
        throw err;
    }
}

/**
 * Subscribes to a remote participant's published tracks.
 *
 * @param {object} handle   the value returned by joinClassroom
 * @param {Array}  remote   [{ trackName, sessionId }] as advertised by the teacher
 * @param {string} [authToken]
 */
export async function pullTracks(handle, remote, authToken) {
    if (!handle || !handle.sessionId) throw new Error('no session');
    if (!Array.isArray(remote) || !remote.length) throw new Error('no tracks requested');
    const body = {
        sessionId: handle.sessionId,
        action: 'pull',
        tracks: remote.map((t) => ({ location: 'remote', trackName: t.trackName, sessionId: t.sessionId })),
    };
    const res = await post(API.tracks, body, authToken);
    if (res.requiresImmediateRenegotiation && res.sessionDescription) {
        await handle.pc.setRemoteDescription(new RTCSessionDescription(res.sessionDescription));
        const answer = await handle.pc.createAnswer();
        await handle.pc.setLocalDescription(answer);
        await post(API.tracks, {
            sessionId: handle.sessionId,
            action: 'pull',
            tracks: [],
            sessionDescription: { type: 'answer', sdp: handle.pc.localDescription.sdp },
        }, authToken);
    }
    return res;
}
