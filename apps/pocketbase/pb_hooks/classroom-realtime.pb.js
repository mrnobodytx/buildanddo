// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/classroom-realtime.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/classroom-media.js, apps/pocketbase/pb_hooks/classroom-realtime-lib.js, apps/pocketbase/pb_hooks/telemetry.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/classroom-media.js; CONSUMES apps/pocketbase/pb_hooks/classroom-realtime-lib.js; CONSUMES apps/pocketbase/pb_hooks/telemetry.js
// Intent:      Expose room-bound signalling without allowing caller-supplied session identifiers to grant media access.
// ----------------------------------------------------------------

// Helpers are loaded inside callbacks: PocketBase executes each in its own VM.
routerAdd('POST', '/api/classroom/session', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classroom-media.js`).session(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(80000));

routerAdd('POST', '/api/classroom/tracks', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classroom-media.js`).change(e, false));
}, $apis.requireAuth('users'), $apis.bodyLimit(80000));

routerAdd('PUT', '/api/classroom/renegotiate', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classroom-media.js`).change(e, true));
}, $apis.requireAuth('users'), $apis.bodyLimit(80000));

routerAdd('POST', '/api/classroom/close', (e) => {
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, require(`${__hooks}/classroom-media.js`).close(e));
}, $apis.requireAuth('users'), $apis.bodyLimit(2000));

routerAdd('GET', '/api/classroom/health', (e) => {
    const config = require(`${__hooks}/classroom-realtime-lib.js`).realtimeConfig();
    let installed = false;
    try { require(`${__hooks}/classroom-media.js`).schema(e.app); installed = true; }
    catch (_) { /* The media schema guard owns its diagnostic; health only reports availability. */ }
    const publishers = ($os.getenv('BUILDANDDO_CLASSROOM_PUBLISHERS') || '').split(',').filter((item) => item.trim());
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(!config.reason && installed ? 200 : 503, { ok: !config.reason && installed, route: 'classroom-realtime/v2',
        app_id_configured: !!$os.getenv('CLOUDFLARE_REALTIME_APP_ID'),
        app_secret_configured: !!$os.getenv('CLOUDFLARE_REALTIME_APP_SECRET'),
        publishers_configured: publishers.length, sessions_installed: installed,
        reason: !installed ? 'classroom media session migration required' : config.reason || null });
});
