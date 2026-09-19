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
            body: JSON.stringify(payload || {}),
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

module.exports = { realtimeConfig, mayPublish, callRealtime, callerSeat };
