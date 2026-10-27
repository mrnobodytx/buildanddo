// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/classroom-realtime-lib.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-REALTIME-TURN-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/telemetry.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/telemetry.js
// Intent:      Retain classroom provider and echo behavior while diagnosing only bounded failure categories.
// ----------------------------------------------------------------

// CommonJS; required inside handlers.
const RTC_BASE = "https://rtc.live.cloudflare.com/v1/apps";

function diagnose(operation, category, status) {
    try { require(`${__hooks}/telemetry.js`).diagnostic(operation, category, status); }
    catch (_) { /* Provider results do not depend on logging. */ }
}

/** Returns {appId, secret, reason}. Never logs the secret. */
function realtimeConfig() {
    const appId = $os.getenv("CLOUDFLARE_REALTIME_APP_ID") || "";
    const secret = $os.getenv("CLOUDFLARE_REALTIME_APP_SECRET") || "";
    if (!appId || !secret) diagnose('classroom.realtime', 'config');
    if (!appId) return { reason: "CLOUDFLARE_REALTIME_APP_ID absent" };
    if (!secret) return { reason: "CLOUDFLARE_REALTIME_APP_SECRET absent" };
    return { appId: appId, secret: secret, reason: "" };
}

/** STUN only: what every peer used before TURN existed, and the answer whenever TURN cannot be had. */
const STUN_ONLY = Object.freeze([{ urls: ["stun:stun.cloudflare.com:3478"] }]);
const TURN_BASE = "https://rtc.live.cloudflare.com/v1/turn/keys/";
/** Credentials outlive the longest lesson; the client asks again on the next join. */
const TURN_TTL_SECONDS = 4 * 60 * 60;

function stunOnly(reason) {
    return { iceServers: STUN_ONLY.map((s) => ({ urls: s.urls.slice() })), turn: false, ttl: 0, reason: reason };
}

/**
 * Short-lived ICE servers for one classroom join (SRS-BUILDANDDO-REALTIME-TURN-001).
 * With CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_KEY_API_TOKEN set, mints Cloudflare TURN
 * credentials so a viewer behind symmetric NAT or a UDP-blocking firewall can still reach the
 * SFU (relay over UDP/TCP/TLS 443). Without them, or when Cloudflare refuses, it answers the
 * STUN-only set with a named reason: a join is never blocked on TURN. Port 53 URLs are removed
 * because browsers block that port and this client gathers ICE without trickle, so a :53
 * candidate would only stall the offer. The API token never leaves this function.
 * @returns {{iceServers: Array<{urls: string[], username?: string, credential?: string}>, turn: boolean, ttl: number, reason: string}}
 */
function iceServers() {
    const keyId = $os.getenv("CLOUDFLARE_TURN_KEY_ID") || "";
    const token = $os.getenv("CLOUDFLARE_TURN_KEY_API_TOKEN") || "";
    if (!keyId) return stunOnly("CLOUDFLARE_TURN_KEY_ID absent");
    if (!token) return stunOnly("CLOUDFLARE_TURN_KEY_API_TOKEN absent");
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(keyId)) return stunOnly("CLOUDFLARE_TURN_KEY_ID malformed");
    let res;
    try {
        res = $http.send({
            url: TURN_BASE + keyId + "/credentials/generate-ice-servers",
            method: "POST",
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
            timeout: 10,
        });
    } catch (_) {
        diagnose('classroom.turn', 'transport');
        return stunOnly("turn_unreachable");
    }
    const status = res && res.statusCode;
    if (!Number.isInteger(status) || status < 200 || status >= 300) {
        diagnose('classroom.turn', 'upstream_status', Number.isInteger(status) ? status : 0);
        return stunOnly("turn_http_" + (Number.isInteger(status) ? status : 0));
    }
    const listed = res.json && Array.isArray(res.json.iceServers) ? res.json.iceServers : null;
    if (!listed) { diagnose('classroom.turn', 'parse', status); return stunOnly("turn_unreadable"); }
    const servers = [];
    let relay = false;
    for (const entry of listed) {
        if (!entry || typeof entry !== "object") continue;
        const urls = (Array.isArray(entry.urls) ? entry.urls : [entry.urls])
            .filter((u) => typeof u === "string" && /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u));
        if (!urls.length) continue;
        const out = { urls: urls };
        if (typeof entry.username === "string" && typeof entry.credential === "string") {
            out.username = entry.username; out.credential = entry.credential;
        }
        if (out.credential && urls.some((u) => /^turns?:/.test(u))) relay = true;
        servers.push(out);
    }
    if (!relay) { diagnose('classroom.turn', 'schema', status); return stunOnly("turn_no_relay"); }
    return { iceServers: servers, turn: true, ttl: TURN_TTL_SECONDS, reason: "" };
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
    let category = 'transport', status = 0, reported = false;
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
        category = 'schema';
        status = res.statusCode;
        if (!Number.isInteger(status) || status < 100 || status > 599) {
            diagnose('classroom.realtime', 'schema'); reported = true;
        } else if (status < 200 || status >= 300) {
            diagnose('classroom.realtime', 'upstream_status', status); reported = true;
        }
        category = 'parse';
        const body = res.json;
        if (!reported && (!body || typeof body !== 'object' || Array.isArray(body)))
            diagnose('classroom.realtime', 'parse', status);
        return { status, body: body || {} };
    } catch (_) {
        if (!reported) diagnose('classroom.realtime', category, status);
        return { status: 0, body: { errorDescription: 'Classroom provider unavailable.' } };
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
    if (!Array.isArray(answer.body && answer.body.tracks)) diagnose('classroom.realtime.echo', 'schema', 200);
    const held = Array.isArray(answer.body && answer.body.tracks) ? answer.body.tracks : [];
    const names = [];
    for (const track of held) {
        // A track the SFU is no longer serving must not count as present.
        if (track && track.trackName && track.status !== "inactive") names.push(String(track.trackName));
    }
    return { ok: true, tracks: names, reason: "", status: 200 };
}

module.exports = { realtimeConfig, mayPublish, callRealtime, callerSeat, echoSession, iceServers };
