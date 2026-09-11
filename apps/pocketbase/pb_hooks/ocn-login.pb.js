// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
/// <reference path="../pb_data/types.d.ts" />
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/ocn-login.pb.js
// Stage:       09_RUNTIME
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     services/buildanddo_visual_substrate/server.py (POST /api/rooms/verify),
//              apps/pocketbase/pb_migrations/1789100000_ocn_seat_users.js
// EnumType:    Service
// EnumEdges:   PRODUCES POST /api/ocn/login, GET /api/ocn/health;
//              CONSUMES http://127.0.0.1:8092/api/rooms/verify;
//              VERIFIED_BY tools/citadel_staging_error_corpus.py (LOGIN_OCN_*)
// Intent:      Let a Citadel Nexus seat log into BuildAndDo with its CitadelKey
//              instead of a password: PocketBase never verifies Ed25519 itself,
//              it asks the loopback rooms sidecar and only then mints a token
//              for the seat's pre-provisioned service identity.
// ───────────────────────────────────────────────────────────────
//
// This file establishes the routerAdd convention for this repo. Handlers are
// serialized into a separate VM pool, so every helper is defined INSIDE the
// handler that uses it (no shared top-level state, no require()).
//
// Contract
//   POST /api/ocn/login   header X-Citadel-Key = seat envelope signed for audience
//                         "buildanddo-login" over payload
//                         {"login":"buildanddo","ts_bucket":"<UTC YYYY-MM-DDTHH>"}.
//        200 {token, record:{id,email,name,ocn_seat,seat_id,agent_id,rig}}
//            exactly the shape pb.authStore.save(token, record) expects.
//        401 {message:"X-Citadel-Key header required" | "citadelkey_rejected:<reason>"}
//        403 {message:"seat_not_provisioned"}  key believed, no users record for the seat
//        503 {message:"ocn_verifier_unavailable"}  sidecar unreachable or cannot vouch
//   GET  /api/ocn/health  {route:"ocn-login/v1", sidecar_reachable, verifier}
//
// Seat identities are users records with email <seat_id>@ocn.buildanddo.invalid.
// The domain is reserved-invalid on purpose: no mailbox exists, no password reset
// or verification mail can ever be delivered, and the random password set at
// migration time is discarded, so password login for a seat is impossible.
// Fail-closed: any answer from the sidecar other than a 200 {ok:true} or a
// 401 {ok:false} is treated as "cannot verify", never as "verified".

routerAdd("POST", "/api/ocn/login", (e) => {
    const SIDECAR = $os.getenv("BUILDANDDO_ROOMS_SIDECAR_URL") || "http://127.0.0.1:8092";
    const AUDIENCE = "buildanddo-login";
    const SEAT_DOMAIN = "@ocn.buildanddo.invalid";
    const SEAT_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

    // The signer and this route each compute the bucket independently, so a
    // request signed just before the top of the hour is retried against the
    // previous bucket. The sidecar checks the payload hash BEFORE it burns the
    // nonce, so the retry cannot be refused as a replay.
    const buckets = () => {
        const pad = (n) => String(n).padStart(2, "0");
        const fmt = (d) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" +
            pad(d.getUTCDate()) + "T" + pad(d.getUTCHours());
        const now = new Date();
        return [fmt(now), fmt(new Date(now.getTime() - 3600 * 1000))];
    };

    const header = e.request.header.get("X-Citadel-Key");
    if (!header) {
        return e.json(401, { message: "X-Citadel-Key header required" });
    }

    let verdict = null;
    for (const bucket of buckets()) {
        let res;
        try {
            res = $http.send({
                url: SIDECAR + "/api/rooms/verify",
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({
                    header: header,
                    payload: { login: "buildanddo", ts_bucket: bucket },
                    audience: AUDIENCE,
                }),
                timeout: 5,
            });
        } catch (err) {
            $app.logger().warn("ocn-login: sidecar unreachable", "err", String(err));
            return e.json(503, { message: "ocn_verifier_unavailable" });
        }
        const body = res.json || {};
        if (res.statusCode === 200 && body.ok === true && body.seat_id) {
            verdict = body;
            break;
        }
        if (res.statusCode === 401) {
            const reason = String(body.reason || "rejected");
            if (reason.indexOf("payload hash mismatch") === 0) {
                continue; // try the previous hour bucket
            }
            return e.json(401, { message: "citadelkey_rejected:" + reason.slice(0, 80) });
        }
        // 503 peer_registry_unmeasured, 400, 5xx: the sidecar cannot vouch.
        $app.logger().warn("ocn-login: verifier answered", "status", res.statusCode,
            "reason", String(body.reason || ""));
        return e.json(503, { message: "ocn_verifier_unavailable" });
    }
    if (!verdict) {
        return e.json(401, { message: "citadelkey_rejected:payload hash mismatch (tampered)" });
    }

    const seat = String(verdict.seat_id).toLowerCase();
    if (!SEAT_RE.test(seat)) {
        return e.json(401, { message: "citadelkey_rejected:seat_id not addressable" });
    }

    let record;
    try {
        record = $app.findAuthRecordByEmail("users", seat + SEAT_DOMAIN);
    } catch (_) {
        return e.json(403, { message: "seat_not_provisioned" });
    }
    if (!record.getBool("verified") || !record.getBool("ocn_seat")) {
        // A human account that happened to use the reserved domain is not a seat.
        return e.json(403, { message: "seat_not_provisioned" });
    }

    return e.json(200, {
        token: record.newAuthToken(),
        record: {
            id: record.id,
            email: record.getString("email"),
            name: record.getString("name"),
            ocn_seat: true,
            seat_id: seat,
            agent_id: verdict.agent_id || null,
            rig: verdict.rig || null,
            pubkey_fp: verdict.pubkey_fp || null,
        },
    });
});

routerAdd("GET", "/api/ocn/health", (e) => {
    const SIDECAR = $os.getenv("BUILDANDDO_ROOMS_SIDECAR_URL") || "http://127.0.0.1:8092";
    let reachable = false;
    let verifier = "UNMEASURED";
    let seats = null;
    try {
        const res = $http.send({ url: SIDECAR + "/api/rooms/health", method: "GET", timeout: 3 });
        reachable = res.statusCode === 200;
        const v = (res.json && res.json.verifier) || null;
        if (v) {
            verifier = String(v.state || "UNMEASURED");
            seats = v.registry ? Number(v.registry.seats) : null;
        }
    } catch (_) {
        reachable = false;
    }
    return e.json(200, {
        route: "ocn-login/v1",
        sidecar_reachable: reachable,
        verifier: verifier,
        registry_seats: seats,
        audience: "buildanddo-login",
    });
});
