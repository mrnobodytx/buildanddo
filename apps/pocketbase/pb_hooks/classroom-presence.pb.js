// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/classroom-presence.pb.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/classroom-media.js, apps/pocketbase/pb_migrations/1790600000_classroom_presence.js
// EnumType:    Route
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/classroom-media.js; DEPENDS_ON apps/pocketbase/pb_migrations/1790600000_classroom_presence.js
// Intent:      Advertise only owned published tracks to current classroom participants without granting room access from a global publisher allowlist.
// ----------------------------------------------------------------

// The receiving persona adapter may retain context, string tracks and gm:slug
// spelling, but it must now join the room and obtain a bound media session too.
routerAdd('POST', '/api/classroom/presence', (e) => {
    const media = require(`${__hooks}/classroom-media.js`);
    const access = require(`${__hooks}/workspace-access.js`);
    const body = e.requestInfo().body || {};
    const str = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
    const roomId = str(body.room || body.context, 96).replace(/^classroom:/i, '').trim();
    access.id(roomId);
    const bad = (reason) => { throw new BadRequestError(reason); };
    if (!Array.isArray(body.tracks) || !body.tracks.length || body.tracks.length > 8) bad('Supply one to eight advertised tracks.');
    const tracks = body.tracks.map((item) => {
        const trackName = typeof item === 'string' ? item : item?.trackName;
        const kind = typeof item === 'string' ? 'audio' : item?.kind || 'audio';
        if (!access.text(trackName, 200) || !['audio', 'video'].includes(kind)) bad('Each track needs a name and audio/video kind.');
        return { trackName, kind };
    });
    const now = Date.now(), expires = Date.parse(str(body.expires_at, 40).replace(' ', 'T'));
    if (!Number.isFinite(expires) || expires <= now || expires > now + 120000) bad('Use a future expiry within 120 seconds.');
    const persona = str(body.persona_id, 120).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '');
    const role = body.role || (persona ? 'guildmaster' : 'teacher'), state = body.state || 'LIVE';
    if (!['teacher', 'guildmaster', 'assistant'].includes(role) || (persona && role !== 'guildmaster') ||
        !['LIVE', 'DEGRADED', 'ENDED'].includes(state)) bad('Use the listed advertisement role and state.');
    let saved, basis;
    e.app.runInTransaction((app) => {
        const scope = media.scopeFor(app, e.auth, roomId);
        media.advertisement(app, scope, body.session_id, tracks);
        const rows = app.findRecordsByFilter('classroom_presence', 'room = {:room} && session_id = {:session}',
            '', 2, 0, { room: roomId, session: body.session_id });
        if (rows.length > 1) throw new ApiError(503, 'Classroom advertisements need operator review.');
        if (rows[0] && rows[0].getString('publisher') !== scope.auth.id) throw new ForbiddenError('This advertisement belongs to another account.');
        const record = rows[0] || new Record(app.findCollectionByNameOrId('classroom_presence'));
        const values = { workspace: scope.workspace, room: roomId, publisher: scope.auth.id,
            display_name: (scope.auth.getString('name').trim() || persona || 'Classroom publisher').slice(0, 120),
            persona_id: persona, role, state, access_basis: scope.basis, session_id: body.session_id, tracks,
            app_name: str(body.app_name, 120), manifest_id: str(body.manifest_id, 80), capsule_digest: str(body.capsule_digest, 64),
            expires_at: new Date(expires).toISOString() };
        Object.entries(values).forEach(([key, value]) => record.set(key, value));
        try { app.save(record); }
        catch (_) { throw new ApiError(503, 'The classroom advertisement could not be stored.'); }
        saved = record.id; basis = scope.basis;
    });
    // Only collect expired rows from this room; collection failure is not write failure.
    let swept = 0;
    try {
        const rows = e.app.findRecordsByFilter('classroom_presence', 'room = {:room}', 'expires_at', 50, 0, { room: roomId });
        for (const row of rows) {
            const at = Date.parse(row.getString('expires_at').replace(' ', 'T'));
            if (row.id === saved || !Number.isFinite(at) || at > now - 300000) continue;
            try { e.app.delete(row); swept++; } catch (_) { /* Retain a row that could not be collected. */ }
        }
    } catch (_) { swept = -1; }
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, { id: saved, room: roomId, session_id: body.session_id, state, access_basis: basis,
        verified: false, verification: 'NOT_ECHOED_BY_SFU', swept, expires_at: new Date(expires).toISOString(), ttl_ms: expires - now });
}, $apis.requireAuth('users'), $apis.bodyLimit(8000));

routerAdd('GET', '/api/classroom/presence', (e) => {
    const media = require(`${__hooks}/classroom-media.js`);
    const access = require(`${__hooks}/workspace-access.js`);
    const id = e.requestInfo().query?.room;
    const roomId = typeof id === 'string' ? id.trim().replace(/^classroom:/i, '') : '';
    const scope = media.scopeFor(e.app, e.auth, roomId);
    const rows = e.app.findRecordsByFilter('classroom_presence', 'room = {:room}', '-updated', 50, 0, { room: roomId });
    const items = [];
    // One SFU read per SESSION, not per row: several rows can share a session and the echo is a
    // network call. Bounded by MAX_ROWS, and a failure is carried as its own state so an
    // unreachable SFU can never read as a verified track.
    const L = require(`${__hooks}/classroom-realtime-lib.js`);
    const echoed = {};
    const echoFor = (sessionId) => {
        if (!Object.hasOwn(echoed, sessionId)) echoed[sessionId] = L.echoSession(sessionId);
        return echoed[sessionId];
    };
    for (const row of rows) {
        const expires = Date.parse(row.getString('expires_at').replace(' ', 'T'));
        if (row.getString('workspace') !== scope.workspace || !Number.isFinite(expires) || expires <= Date.now() || row.getString('state') === 'ENDED') continue;
        let tracks;
        try {
            const publisher = media.scopeFor(e.app, access.find(e.app, 'users', row.getString('publisher')), roomId);
            tracks = access.json(row, 'tracks');
            media.advertisement(e.app, publisher, row.getString('session_id'), tracks);
        } catch (error) {
            if ([400, 403, 404, 409].includes(error.status)) continue;
            throw error;
        }
        items.push({ id: row.id, room: roomId, session_id: row.getString('session_id'), tracks, tracks_error: '',
            persona_id: row.getString('persona_id'), display_name: row.getString('display_name'), role: row.getString('role'),
            access_basis: row.getString('access_basis'), app_name: row.getString('app_name'), manifest_id: row.getString('manifest_id'),
            capsule_digest: row.getString('capsule_digest'), state: row.getString('state'),
            verified: false, verification: 'NOT_ECHOED_BY_SFU', expires_at: new Date(expires).toISOString() });
    }
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, { room: roomId, route: 'classroom-presence/v1', access_basis: scope.basis,
        server_time: new Date().toISOString(), items });
}, $apis.requireAuth('users'));

routerAdd('GET', '/api/classroom/presence/health', (e) => {
    let installed = false;
    try {
        e.app.findCollectionByNameOrId('classroom_presence');
        require(`${__hooks}/classroom-media.js`).schema(e.app); installed = true;
    } catch (_) { /* Report installation state without credentials or raw database errors. */ }
    const publishers = ($os.getenv('BUILDANDDO_CLASSROOM_PUBLISHERS') || '').split(',').filter((item) => item.trim());
    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, { ok: installed, route: 'classroom-presence/v1', collection_installed: installed,
        publishers_configured: publishers.length, max_ttl_ms: 120000, max_rows: 50,
        verification: 'NOT_ECHOED_BY_SFU', reason: installed ? null : 'Classroom presence/session migrations required.' });
});
