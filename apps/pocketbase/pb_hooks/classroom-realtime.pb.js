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

// PocketBase >=0.23 runs every handler in its own VM: file-scope helpers are NOT visible inside handlers
// (measured 2026-09-18 on staging 0.39.8: "ReferenceError: realtimeConfig is not defined"). Helpers live in
// the sibling lib and are require()d inside each handler, the same way main's hooks load telemetry.js.
// ---------------------------------------------------------------------------
// POST /api/classroom/session — create an SFU session from the browser's offer.
// Body: { sessionDescription: { type: "offer", sdp: "..." } }
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/classroom/session", (e) => {
    const L = require(`${__hooks}/classroom-realtime-lib.js`);
    const seat = L.callerSeat(e);
    if (!seat) return e.json(401, { message: "authentication required" });

    const cfg = L.realtimeConfig();
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

    const out = L.callRealtime("/" + cfg.appId + "/sessions/new", cfg.secret, {
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
        may_publish: L.mayPublish(seat),
    });
});

// ---------------------------------------------------------------------------
// POST /api/classroom/tracks — push (teacher) or pull (student) tracks.
// Body: { sessionId, action: "push"|"pull", tracks: [...], sessionDescription? }
// ---------------------------------------------------------------------------
routerAdd("POST", "/api/classroom/tracks", (e) => {
    const L = require(`${__hooks}/classroom-realtime-lib.js`);
    const seat = L.callerSeat(e);
    if (!seat) return e.json(401, { message: "authentication required" });

    const cfg = L.realtimeConfig();
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
    if (action === "push" && !L.mayPublish(seat)) {
        $app.logger().info("classroom: publish denied", "seat", String(seat));
        return e.json(403, { message: "publish_not_authorized", seat: String(seat) });
    }
    if (!Array.isArray(body.tracks) || body.tracks.length === 0) {
        return e.json(400, { message: "tracks required" });
    }

    const payload = { tracks: body.tracks };
    if (body.sessionDescription) payload.sessionDescription = body.sessionDescription;

    const out = L.callRealtime(
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
    const L = require(`${__hooks}/classroom-realtime-lib.js`);
    const cfg = L.realtimeConfig();
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
