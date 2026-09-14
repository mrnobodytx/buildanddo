/// <reference path="../pb_data/types.d.ts" />
//
// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=VCC
// Dispatch: VCC-20260911-BND-LIVE-001
//
// Cloudflare Realtime (SFU) signalling for BuildAndDo classrooms.
//
// WHY THIS EXISTS
//   A classroom needs a teacher publishing audio/video and students subscribing.
//   Cloudflare Realtime is the tenant-plane SFU; LiveKit stays the Citadel private
//   plane. The browser owns the RTCPeerConnection; the backend owns the app secret
//   and decides who may publish. That is Cloudflare's documented split and it is
//   also the Citadel boundary: the tenant surface requests bounded actions, it does
//   not hold platform credentials.
//
// CREDENTIAL RULE
//   CLOUDFLARE_REALTIME_APP_SECRET is read from the box environment and used only as
//   the Bearer to api. It is NEVER returned, logged, or echoed in an error. A caller
//   receives a sessionId and an SDP answer, nothing else. If the secret is absent the
//   route fails closed with a named reason rather than degrading to an open room.
//
// PUBLISH AUTHORITY
//   Subscribe is the default for any authenticated member. Publishing is opt-in by
//   seat via BUILDANDDO_CLASSROOM_PUBLISHERS (comma-separated). An EMPTY list means
//   nobody may publish — deliberately, so an unconfigured deployment cannot silently
//   let every student broadcast. No role field is invented on the user record.
//
// VM-POOL CONVENTION (why the helpers are repeated inside each handler)
//   ocn-login.pb.js establishes the convention for this repo and states the reason:
//   routerAdd handlers are serialized into a SEPARATE VM POOL, so the file's
//   top-level scope does not exist when a handler runs. This file previously
//   declared RTC_BASE, realtimeConfig, mayPublish, callRealtime and callerSeat at
//   top level and called them from all three handlers, which cannot resolve at
//   request time.
//
//   Measured across this directory: of the two hooks that register routes,
//   ocn-login.pb.js has ZERO top-level declarations and is live on staging, and
//   this file had FIVE and is not. (custom-migrations-cmd.pb.js also has top-level
//   declarations but registers no routes, so handler serialization never applies
//   to it.)
//
//   The duplication below is therefore load-bearing, not an oversight. Do not
//   "clean it up" by hoisting these helpers back to module scope.
//
//   NOTE, so the next reader does not over-credit this fix: this is NOT the reason
//   /api/classroom/health currently answers 404 on staging. A handler that cannot
//   resolve its helpers returns 500, not 404. The route was never REGISTERED, i.e.
//   the file did not load on the box at all. That is a separate, still-open question
//   needing the box filesystem or PocketBase's startup log. This fix is what makes
//   the handlers actually work once the file is loading.
//
//   HOW THAT WAS ESTABLISHED, in the order the evidence actually carries — corrected
//   after a counter-audit by seat citadel-2b, because the first writeup credited the
//   wrong probe and the mistake is reusable:
//
//     1. STRUCTURAL: GET /hcgi/platform/api/ocn/health returns 200 with real
//        PocketBase-generated content. THIS is what proves the edge forwards this
//        prefix to PB and that PB answers on it.
//     2. CONFIRMATORY: only once (1) holds does the classroom 404 being byte-identical
//        to a bogus-path control (53 bytes, same JSON) mean "PB's router has no entry
//        for this path".
//
//   The byte-identical control ALONE proves only that both responses came from the
//   same generator — it does not prove the generator is PocketBase. A CDN or nginx in
//   front of the origin emits byte-identical 404s for two unrouted paths just as
//   faithfully, and then the control compares two responses that never reached the app,
//   ruling out nothing about PB's router because PB's router was never consulted.
//
//   That ambiguity is live here, not theoretical: EVERY response on this host —
//   the 200s, the 404s, and the SPA fallback — carries "Server: cloudflare" and a
//   CF-RAY, so the Server header discriminates nothing. What does discriminate is that
//   a bogus path at SITE ROOT returns 200 text/html (the SPA), while any bogus path
//   under /hcgi/platform returns PocketBase's own data/message/status error envelope.
//
//   If you reuse this pattern on a surface with NO working sibling route, the control
//   alone will give you a confident wrong answer.

// ---------------------------------------------------------------------------
// POST /api/classroom/session — create an SFU session from the browser's offer.
// Body: { sessionDescription: { type: "offer", sdp: "..." } }
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/classroom/session", (e) => {
    const RTC_BASE = "https://rtc.live.cloudflare.com/v1/apps";

    /** Returns {appId, secret, reason}. Never logs the secret. */
    const realtimeConfig = () => {
        const appId = $os.getenv("CLOUDFLARE_REALTIME_APP_ID") || "";
        const secret = $os.getenv("CLOUDFLARE_REALTIME_APP_SECRET") || "";
        if (!appId) return { reason: "CLOUDFLARE_REALTIME_APP_ID absent" };
        if (!secret) return { reason: "CLOUDFLARE_REALTIME_APP_SECRET absent" };
        return { appId: appId, secret: secret, reason: "" };
    };

    /** True when this seat is explicitly allowed to publish. Empty allowlist => false. */
    const mayPublish = (seat) => {
        const raw = $os.getenv("BUILDANDDO_CLASSROOM_PUBLISHERS") || "";
        if (!raw.trim()) return false;
        const allowed = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        return allowed.indexOf(String(seat || "").toLowerCase()) !== -1;
    };

    /** One authenticated Cloudflare call. Returns {status, body} and never throws. */
    const callRealtime = (path, secret, payload) => {
        try {
            const res = $http.send({
                url: RTC_BASE + path,
                method: "POST",
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
    };

    /** Resolves the calling seat, or null when unauthenticated. */
    const callerSeat = (ev) => {
        const auth = ev.auth;
        if (!auth) return null;
        return auth.get("seat_id") || auth.get("email") || auth.id;
    };

    const seat = callerSeat(e);
    if (!seat) return e.json(401, { message: "authentication required" });

    const cfg = realtimeConfig();
    if (cfg.reason) {
        $app.logger().warn("classroom: realtime not configured", "reason", cfg.reason);
        return e.json(503, { message: "realtime_not_configured", reason: cfg.reason });
    }

    let body = {};
    try { body = e.requestInfo().body || {}; } catch (_) { body = {}; }
    const offer = body.sessionDescription;
    if (!offer || offer.type !== "offer" || !offer.sdp) {
        return e.json(400, { message: "sessionDescription offer required" });
    }

    const out = callRealtime("/" + cfg.appId + "/sessions/new", cfg.secret, {
        sessionDescription: { type: "offer", sdp: String(offer.sdp) },
    });
    if (out.status !== 200 && out.status !== 201) {
        $app.logger().warn("classroom: session create failed", "status", out.status,
            "seat", String(seat));
        return e.json(502, {
            message: "realtime_session_failed",
            status: out.status,
            reason: String(out.body.errorDescription || out.body.errorCode || "").slice(0, 160),
        });
    }
    // Only the session id and the SDP answer cross the boundary.
    return e.json(200, {
        sessionId: out.body.sessionId,
        sessionDescription: out.body.sessionDescription,
        may_publish: mayPublish(seat),
    });
});

// ---------------------------------------------------------------------------
// POST /api/classroom/tracks — push (teacher) or pull (student) tracks.
// Body: { sessionId, action: "push"|"pull", tracks: [...], sessionDescription? }
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/classroom/tracks", (e) => {
    const RTC_BASE = "https://rtc.live.cloudflare.com/v1/apps";

    const realtimeConfig = () => {
        const appId = $os.getenv("CLOUDFLARE_REALTIME_APP_ID") || "";
        const secret = $os.getenv("CLOUDFLARE_REALTIME_APP_SECRET") || "";
        if (!appId) return { reason: "CLOUDFLARE_REALTIME_APP_ID absent" };
        if (!secret) return { reason: "CLOUDFLARE_REALTIME_APP_SECRET absent" };
        return { appId: appId, secret: secret, reason: "" };
    };

    const mayPublish = (seat) => {
        const raw = $os.getenv("BUILDANDDO_CLASSROOM_PUBLISHERS") || "";
        if (!raw.trim()) return false;
        const allowed = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        return allowed.indexOf(String(seat || "").toLowerCase()) !== -1;
    };

    const callRealtime = (path, secret, payload) => {
        try {
            const res = $http.send({
                url: RTC_BASE + path,
                method: "POST",
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
            return { status: 0, body: { errorDescription: String(err).slice(0, 160) } };
        }
    };

    const callerSeat = (ev) => {
        const auth = ev.auth;
        if (!auth) return null;
        return auth.get("seat_id") || auth.get("email") || auth.id;
    };

    const seat = callerSeat(e);
    if (!seat) return e.json(401, { message: "authentication required" });

    const cfg = realtimeConfig();
    if (cfg.reason) return e.json(503, { message: "realtime_not_configured", reason: cfg.reason });

    let body = {};
    try { body = e.requestInfo().body || {}; } catch (_) { body = {}; }
    const sessionId = String(body.sessionId || "");
    const action = String(body.action || "");
    if (!sessionId) return e.json(400, { message: "sessionId required" });
    if (action !== "push" && action !== "pull") {
        return e.json(400, { message: "action must be push or pull" });
    }
    // The authority decision. A student may only ever pull.
    if (action === "push" && !mayPublish(seat)) {
        $app.logger().info("classroom: publish denied", "seat", String(seat));
        return e.json(403, { message: "publish_not_authorized", seat: String(seat) });
    }
    if (!Array.isArray(body.tracks) || body.tracks.length === 0) {
        return e.json(400, { message: "tracks required" });
    }

    const payload = { tracks: body.tracks };
    if (body.sessionDescription) payload.sessionDescription = body.sessionDescription;

    const out = callRealtime(
        "/" + cfg.appId + "/sessions/" + encodeURIComponent(sessionId) + "/tracks/new",
        cfg.secret, payload);
    if (out.status !== 200 && out.status !== 201) {
        return e.json(502, {
            message: "realtime_tracks_failed",
            status: out.status,
            reason: String(out.body.errorDescription || out.body.errorCode || "").slice(0, 160),
        });
    }
    return e.json(200, out.body);
});

// ---------------------------------------------------------------------------
// GET /api/classroom/health — configuration state by NAME only, no secrets.
// ---------------------------------------------------------------------------
routerAdd("GET", "/api/classroom/health", (e) => {
    const realtimeConfig = () => {
        const appId = $os.getenv("CLOUDFLARE_REALTIME_APP_ID") || "";
        const secret = $os.getenv("CLOUDFLARE_REALTIME_APP_SECRET") || "";
        if (!appId) return { reason: "CLOUDFLARE_REALTIME_APP_ID absent" };
        if (!secret) return { reason: "CLOUDFLARE_REALTIME_APP_SECRET absent" };
        return { appId: appId, secret: secret, reason: "" };
    };

    const cfg = realtimeConfig();
    const publishers = ($os.getenv("BUILDANDDO_CLASSROOM_PUBLISHERS") || "").split(",")
        .map((s) => s.trim()).filter(Boolean);
    return e.json(200, {
        ok: !cfg.reason,
        route: "classroom-realtime/v1",
        app_id_configured: !!$os.getenv("CLOUDFLARE_REALTIME_APP_ID"),
        app_secret_configured: !!$os.getenv("CLOUDFLARE_REALTIME_APP_SECRET"),
        publishers_configured: publishers.length,
        reason: cfg.reason || null,
    });
});
