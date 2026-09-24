// Shared helpers for classroom-realtime.pb.js (CommonJS; required inside handlers).
const RTC_BASE = "https://rtc.live.cloudflare.com/v1/apps";

/** Returns {appId, secret, reason}. Never logs the secret. */
function realtimeConfig() {
    const appId = $os.getenv("CLOUDFLARE_REALTIME_APP_ID") || "";
    const secret = $os.getenv("CLOUDFLARE_REALTIME_APP_SECRET") || "";
    if (!appId) return { reason: "CLOUDFLARE_REALTIME_APP_ID absent" };
    if (!secret) return { reason: "CLOUDFLARE_REALTIME_APP_SECRET absent" };
    return { appId: appId, secret: secret, reason: "" };
}

/** True when this seat is explicitly allowed to publish. Empty allowlist => false. */
function mayPublish(seat) {
    const raw = $os.getenv("BUILDANDDO_CLASSROOM_PUBLISHERS") || "";
    if (!raw.trim()) return false;
    const allowed = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    return allowed.indexOf(String(seat || "").toLowerCase()) !== -1;
}

/** One authenticated Cloudflare call. Returns {status, body} and never throws.
 *  method defaults to POST; the SFU's renegotiate endpoint is a PUT. */
function callRealtime(path, secret, payload, method) {
    try {
        const res = $http.send({
            url: RTC_BASE + path,
            method: method || "POST",
            headers: {
                Authorization: "Bearer " + secret,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            // A GET carries no body; Cloudflare rejects one on the session read.
            body: (method || "POST") === "GET" ? undefined : JSON.stringify(payload || {}),
            timeout: 15,
        });
        return { status: res.statusCode, body: res.json || {} };
    } catch (err) {
        // The error string may contain the URL but never the Authorization header.
        return { status: 0, body: { errorDescription: String(err).slice(0, 160) } };
    }
}

/** Resolves the calling seat, or null when unauthenticated. */
function callerSeat(e) {
    const auth = e.auth;
    if (!auth) return null;
    return auth.get("seat_id") || auth.get("email") || auth.id;
}


/**
 * Ask the SFU which tracks it is actually holding for one session.
 *
 * Before this check existed, every presence row carried verification:"NOT_ECHOED_BY_SFU". Now the
 * presence write path answers "NOT_YET_ECHOED", because it does not wait on the SFU, and the read
 * path uses this to answer "ECHOED_BY_SFU" (the only verified state), "NOT_HELD_BY_SFU:<names>"
 * or "SFU_UNREACHABLE:<why>" (SRS-BUILDANDDO-PRESENCE-001). classroom-media.js binds an
 * advertisement to tracks the provider confirmed when they were pushed; this says whether the SFU
 * is still holding them. Returns the SFU's own list, or a named reason - never an empty list that
 * could be mistaken for "no tracks".
 *
 * @param {string} sessionId The SFU session to read.
 * @returns {{ok: boolean, tracks: string[], reason: string, status: number}}
 */
function echoSession(sessionId) {
    const config = realtimeConfig();
    if (config.reason) return { ok: false, tracks: [], reason: config.reason, status: 0 };
    if (!sessionId) return { ok: false, tracks: [], reason: "no_session_id", status: 0 };
    const answer = callRealtime("/" + config.appId + "/sessions/" + encodeURIComponent(sessionId),
                                config.secret, null, "GET");
    if (answer.status !== 200)
        return { ok: false, tracks: [], reason: "sfu_http_" + answer.status, status: answer.status };
    const held = Array.isArray(answer.body && answer.body.tracks) ? answer.body.tracks : [];
    const names = [];
    for (const track of held) {
        // A track the SFU is no longer serving must not count as present.
        if (track && track.trackName && track.status !== "inactive") names.push(String(track.trackName));
    }
    return { ok: true, tracks: names, reason: "", status: 200 };
}

module.exports = { realtimeConfig, mayPublish, callRealtime, callerSeat, echoSession };
