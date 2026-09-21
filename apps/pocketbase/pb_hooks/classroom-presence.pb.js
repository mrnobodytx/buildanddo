/// <reference path="../pb_data/types.d.ts" />
//
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/pocketbase/pb_hooks/classroom-presence.pb.js
// Stage:       07_BUILD
// SRS:         SRS-CN-PERSONA-RUNTIME-001
// CAPS:        pending
// CK:          pending
// Dispatch:    C-ONE-20260918-PERSONA-RUNTIME-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/pocketbase/pb_hooks/classroom-realtime-lib.js, apps/pocketbase/pb_migrations/1790600000_classroom_presence.js
// EnumType:    Route
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/classroom-realtime-lib.js;
//              DEPENDS_ON apps/pocketbase/pb_migrations/1790600000_classroom_presence.js
// DAG Node:    none
// Intent:      Advertise which SFU session and track names a classroom may pull, bounded by a TTL and by the same publish authority that governs a push.
// ───────────────────────────────────────────────────────────────
//
// THE ADVERTISEMENT
//   /api/classroom/session and /api/classroom/tracks let a seat publish and let a
//   seat pull, but nothing told a subscriber WHAT to pull. Without that, a student
//   browser knows a room is live and still cannot name a single (sessionId,
//   trackName) pair. This route is that missing half, and it is the only way a
//   manifested guildmaster becomes discoverable to a classroom rather than
//   something an operator has to paste in by hand.
//
// WRITE AUTHORITY
//   A row may be written only by a seat that BUILDANDDO_CLASSROOM_PUBLISHERS
//   authorises to publish - the same allowlist /api/classroom/tracks checks before
//   an action:"push" - and only for its own row. An empty allowlist means nobody
//   may advertise, deliberately, exactly as an empty allowlist means nobody may
//   publish.
//
//   The publish allowlist is ALSO the room-access grant for a write. A manifested
//   guildmaster is provisioned as an allowlisted publisher, not enrolled as a
//   classroom member, so requiring a classroom_members row on the write path would
//   have made the persona's very first advertisement a 403 not_a_member. The basis
//   on which the write was accepted is returned AND stored as access_basis, one of
//   host, member or publisher_grant, so the widening is visible in the response and
//   in the row rather than inferred. READING still requires host-or-member: the
//   allowlist is a grant to speak into a room, never a grant to enumerate one.
//
//   HONEST LIMIT, and it is the plan's stated contract that this route does NOT
//   meet: "refuses a row whose seat did not just publish" is NOT enforced. This
//   route never asks Cloudflare whether the claimed session really carries the
//   claimed tracks. It checks publish authority, that the row is the caller's own
//   (the unique (room, session_id) index plus the publisher check mean no seat can
//   rewrite another seat's advertisement and redirect the class), and that the row
//   is bounded by a short TTL. An authorised publisher can still advertise a track
//   name it never pushed; the subscriber's pull then fails at the SFU rather than
//   being served silence. Because the check is missing rather than merely weak,
//   every row this route returns carries verified:false and
//   verification:"NOT_ECHOED_BY_SFU", so no consumer can read an advertisement as
//   evidence that a track exists. Closing the gap needs a GET
//   /apps/{app}/sessions/{id} echo, which is a change to classroom-realtime-lib.js
//   and belongs to that file's owner.
//
// READ AUTHORITY
//   Any authenticated member of the room (the host, or a classroom_members row) may
//   read the room's live rows.
//
// NO SEAT LABEL IS EVER STORED OR LOGGED
//   callerSeat resolves to auth.get('seat_id') || auth.get('email') || auth.id, and
//   the users collection has NO seat_id field on this estate - so the seat label IS
//   the caller's email address. An earlier revision of this file echoed it in the
//   403 body, wrote it to the application log and persisted it in a `seat` column of
//   a collection nothing ever prunes; that turned an advertisement into an unbounded
//   who-published-into-which-room-and-when ledger keyed by email. The seat label is
//   now used for exactly one thing - the allowlist comparison - and is never
//   returned, never logged and never stored. The durable identity of a row is its
//   `publisher` relation, an opaque PocketBase account id, which is audit trail
//   enough. (apps/pocketbase/pb_hooks/classroom-realtime.pb.js:95 still logs the
//   seat on a denied push; that file belongs to another owner and is named here
//   rather than edited.)
//
// THE ROWS ARE COLLECTED
//   Expiry used to be evaluated only at read time, so a collection the migration
//   calls "ephemeral by construction" grew without bound. Every accepted write
//   sweeps the rows of ITS OWN room whose expires_at is more than GRACE_MS past,
//   bounded to SWEEP_MAX rows per write. A room nobody writes into holds at most
//   the rows it already had; a room in use collects itself. A delete that fails is
//   swallowed on purpose - garbage collection must never turn a good advertisement
//   into a 500 - but the count actually deleted is returned as swept so an operator
//   can see whether the sweep is working, and a sweep that threw returns -1 rather
//   than 0.
//
// THE PYTHON RUNTIME'S SPELLING IS ACCEPTED
//   services/persona_runtime/presence.py (LANE-D) emits ALLOWED_KEYS, which carries
//   `context` ("classroom:<room id>") and not `room`, sends `tracks` as a list of
//   bare track-name strings, and spells the persona `gm:forge` where the migration
//   and every fixture here spell it `gm-forge`. Rather than leave a translation
//   nobody had written down, this route accepts all three spellings: room||context
//   with a leading "classroom:" stripped, a track entry that is a string as well as
//   one that is {trackName, kind}, and a persona_id slugified to one canonical form.
//   `role` is optional and defaults to guildmaster for a persona row and teacher
//   otherwise, so a caller that sends no role - as presence.py does not - is fine.
//
// POCKETBASE 0.39.8
//   Every handler runs in its OWN VM, so file-scope helpers are invisible inside a
//   handler (measured on staging 2026-09-18: "ReferenceError: realtimeConfig is not
//   defined"). The shared lib is require()d INSIDE each handler, and the helpers
//   specific to this route are declared inside each handler body rather than at
//   file scope. That duplication is the cost of the VM boundary and is preferable
//   to a hook that loads and then throws on the first request.
//
//   The App methods used here are findRecordById, findRecordsByFilter,
//   findCollectionByNameOrId, save and delete. An earlier revision called
//   app.findRecordByFilter, which is NOT a PocketBase JSVM method (the real names
//   are findFirstRecordByFilter and findRecordsByFilter); every POST and GET raised
//   TypeError before doing anything, and the surrounding catch does not absorb it
//   because it only swallows "no rows in result set". `node --check` passes on that
//   file, which is why the server half is now covered by
//   tests/upgrade/classroom-presence.test.mjs against the App double in
//   tests/upgrade/admin-fixture.mjs - a double that implements exactly the real
//   method set and would have thrown on the first call.

// There is deliberately NO file-scope constant in this file. The numbers that
// govern the route are declared inside each handler, because a handler VM cannot
// see this scope. A shared constant here would read as configuration and behave as
// a ReferenceError.

// ---------------------------------------------------------------------------
// POST /api/classroom/presence - upsert this seat's advertisement for one room.
// Body: { room|context, session_id, tracks:[{trackName, kind}|"trackName"],
//         expires_at, persona_id?, role?, state?, app_name?, manifest_id?,
//         capsule_digest? }
// ---------------------------------------------------------------------------
routerAdd('POST', '/api/classroom/presence', (e) => {
    const L = require(`${__hooks}/classroom-realtime-lib.js`);
    const MAX_TTL_MS = 120000;
    const GRACE_MS = 300000;
    const SWEEP_MAX = 50;
    const KINDS = ['audio', 'video'];
    const ROLES = ['teacher', 'guildmaster', 'assistant'];
    const STATES = ['LIVE', 'DEGRADED', 'ENDED'];

    const bad = (reason) => e.json(400, { message: 'presence_rejected', reason });
    const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
    const parseWhen = (value) => {
        if (typeof value !== 'string' || !value.trim()) return NaN;
        return Date.parse(value.trim().replace(' ', 'T'));
    };
    // "classroom:abc123" and "abc123" name the same room. presence.py speaks the
    // first spelling; the browser speaks the second.
    const roomIdOf = (value, fallback) => {
        const raw = str(value, 96) || str(fallback, 96);
        return raw.replace(/^classroom:/i, '').trim().slice(0, 64);
    };
    // gm:forge and gm-forge are one persona. Storing both spellings would make the
    // browser's persona test depend on which client wrote the row.
    const slugPersona = (value) => str(value, 120).toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 120);
    // Room access, duplicated in the GET handler because file scope is not shared
    // between handler VMs on PocketBase 0.39.8.
    const roomFor = (app, id, accountId) => {
        let room = null;
        try { room = app.findRecordById('classroom_rooms', id); }
        catch (error) {
            if (String(error.message).includes('no rows in result set')) return { reason: 'room_unknown' };
            throw error;
        }
        if (!room) return { reason: 'room_unknown' };
        if (room.getString('host') === accountId) return { room: room, basis: 'host' };
        const mine = app.findRecordsByFilter('classroom_members', 'room = {:room} && owner = {:owner}',
            '', 1, 0, { room: room.id, owner: accountId });
        if (!mine.length) return { reason: 'not_a_member', room: room };
        return { room: room, basis: 'member' };
    };

    const seat = L.callerSeat(e);
    if (!seat) return e.json(401, { message: 'authentication required' });

    let body = {};
    try { body = e.requestInfo().body || {}; } catch (parseError) { body = {}; }

    const roomId = roomIdOf(body.room, body.context);
    if (!roomId) return bad('room required');

    const sessionId = str(body.session_id, 200);
    if (!sessionId) return bad('session_id required');

    // A row with no tracks advertises nothing, so it is refused rather than stored.
    if (!Array.isArray(body.tracks) || body.tracks.length === 0 || body.tracks.length > 8)
        return bad('tracks must be a non-empty list of at most 8 entries');
    const tracks = [];
    for (const entry of body.tracks) {
        const isText = typeof entry === 'string';
        const trackName = isText ? str(entry, 200) : (entry ? str(entry.trackName, 200) : '');
        const kind = isText ? 'audio' : (entry ? (str(entry.kind, 16) || 'audio') : '');
        if (!trackName || KINDS.indexOf(kind) === -1) return bad('each track needs a trackName and kind audio|video');
        tracks.push({ trackName: trackName, kind: kind });
    }

    // The TTL is the whole point: no expires_at, no row.
    const expiresAt = parseWhen(body.expires_at);
    if (!Number.isFinite(expiresAt)) return bad('expires_at required');
    const now = Date.now();
    if (expiresAt <= now) return bad('expires_at is already past');
    if (expiresAt - now > MAX_TTL_MS) return bad('expires_at exceeds the bounded TTL');

    const personaId = slugPersona(body.persona_id);
    const role = str(body.role, 32) || (personaId ? 'guildmaster' : 'teacher');
    if (ROLES.indexOf(role) === -1) return bad('role must be teacher, guildmaster or assistant');
    if (personaId && role !== 'guildmaster') return bad('a persona row must take the guildmaster role');
    const state = str(body.state, 16) || 'LIVE';
    if (STATES.indexOf(state) === -1) return bad('state must be LIVE, DEGRADED or ENDED');

    // The authority decision, and it is the publish decision - advertising a track
    // is claiming to have published one. The seat label is compared and discarded;
    // the log line names the account id and the room, never the caller's email.
    if (!L.mayPublish(seat)) {
        e.app.logger().info('classroom: presence write denied', 'account', String(e.auth.id), 'room', roomId);
        return e.json(403, { message: 'presence_publish_not_authorized' });
    }

    const scope = roomFor(e.app, roomId, e.auth.id);
    if (scope.reason === 'room_unknown' || !scope.room) return e.json(404, { message: 'room_unknown' });
    // An allowlisted publisher may write into a room it is not enrolled in; see
    // WRITE AUTHORITY. Nothing else about the row changes with the basis.
    const basis = scope.basis || 'publisher_grant';
    const room = scope.room;

    const existing = e.app.findRecordsByFilter('classroom_presence', 'room = {:room} && session_id = {:session}',
        '', 2, 0, { room: room.id, session: sessionId });
    if (existing.length > 1) return e.json(503, { message: 'presence_needs_operator_review', room: room.id });
    let record = existing[0] || null;
    // A publisher may refresh only its OWN advertisement. Without this an
    // authorised seat could rewrite another seat's row and redirect the class.
    if (record && record.getString('publisher') !== e.auth.id)
        return e.json(403, { message: 'presence_row_not_yours' });
    if (!record) record = new Record(e.app.findCollectionByNameOrId('classroom_presence'));

    record.set('workspace', room.getString('workspace'));
    record.set('room', room.id);
    record.set('publisher', e.auth.id);
    record.set('persona_id', personaId);
    record.set('display_name', (e.auth.getString('name').trim() || personaId || 'Classroom publisher').slice(0, 120));
    record.set('role', role);
    record.set('access_basis', basis);
    record.set('session_id', sessionId);
    record.set('tracks', tracks);
    record.set('app_name', str(body.app_name, 120));
    record.set('manifest_id', str(body.manifest_id, 80));
    record.set('capsule_digest', str(body.capsule_digest, 64));
    record.set('state', state);
    record.set('expires_at', new Date(expiresAt).toISOString());
    // Every other failure in this handler is a named refusal; a save that throws -
    // a required relation the room could not supply, storage unavailable - used to
    // escape as an unnamed 500. It is named now.
    try { e.app.save(record); }
    catch (saveError) {
        e.app.logger().warn('classroom: presence save failed', 'room', room.id,
            'error', String(saveError.message).slice(0, 200));
        return e.json(503, { message: 'presence_not_stored', reason: String(saveError.message).slice(0, 160) });
    }

    // Opportunistic garbage collection for THIS room only; see THE ROWS ARE
    // COLLECTED. Never allowed to fail the write that triggered it.
    let swept = 0;
    try {
        const stale = e.app.findRecordsByFilter('classroom_presence', 'room = {:room}',
            'expires_at', SWEEP_MAX, 0, { room: room.id });
        for (const row of stale) {
            if (row.id === record.id) continue;
            const when = parseWhen(row.getString('expires_at'));
            if (!Number.isFinite(when) || when > now - GRACE_MS) continue;
            try { e.app.delete(row); swept += 1; } catch (deleteError) { /* a row that will not delete is left */ }
        }
    } catch (sweepError) { swept = -1; }

    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, {
        id: record.id,
        room: room.id,
        session_id: sessionId,
        state: state,
        access_basis: basis,
        // This route did not and cannot confirm the claim; see HONEST LIMIT.
        verified: false,
        verification: 'NOT_ECHOED_BY_SFU',
        swept: swept,
        expires_at: new Date(expiresAt).toISOString(),
        ttl_ms: expiresAt - now,
    });
}, $apis.requireAuth('users'), $apis.bodyLimit(8000));

// ---------------------------------------------------------------------------
// GET /api/classroom/presence?room=<id> - the live advertisements for one room.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/classroom/presence', (e) => {
    const MAX_ROWS = 50;

    const parseWhen = (value) => {
        if (typeof value !== 'string' || !value.trim()) return NaN;
        return Date.parse(value.trim().replace(' ', 'T'));
    };
    // Same helper as the POST handler; see the header note on the 0.39.8 VM split.
    const roomFor = (app, id, accountId) => {
        let room = null;
        try { room = app.findRecordById('classroom_rooms', id); }
        catch (error) {
            if (String(error.message).includes('no rows in result set')) return { reason: 'room_unknown' };
            throw error;
        }
        if (!room) return { reason: 'room_unknown' };
        if (room.getString('host') === accountId) return { room: room, basis: 'host' };
        const mine = app.findRecordsByFilter('classroom_members', 'room = {:room} && owner = {:owner}',
            '', 1, 0, { room: room.id, owner: accountId });
        if (!mine.length) return { reason: 'not_a_member' };
        return { room: room, basis: 'member' };
    };
    // A row whose tracks JSON will not read is a DEFECT, not an empty row. It is
    // returned with tracks:[] and tracks_error set, so the page can say "this
    // advertisement is unreadable" instead of the row silently disappearing.
    const tracksOf = (record) => {
        let raw = null;
        try { raw = record.get('tracks'); } catch (readError) { return { tracks: [], error: 'unreadable' }; }
        if (typeof raw === 'string') {
            try { raw = JSON.parse(raw); } catch (jsonError) { return { tracks: [], error: 'unparseable' }; }
        }
        if (raw === null || raw === undefined) return { tracks: [], error: 'absent' };
        if (!Array.isArray(raw)) return { tracks: [], error: 'not_a_list' };
        const out = raw.filter((t) => t && typeof t.trackName === 'string')
            .map((t) => ({ trackName: String(t.trackName), kind: String(t.kind || 'audio') }));
        return { tracks: out, error: out.length === raw.length ? '' : 'partial' };
    };

    let query = {};
    try { query = e.requestInfo().query || {}; } catch (queryError) { query = {}; }
    const roomId = typeof query.room === 'string'
        ? query.room.trim().replace(/^classroom:/i, '').trim().slice(0, 64) : '';
    if (!roomId) return e.json(400, { message: 'room required' });

    const scope = roomFor(e.app, roomId, e.auth.id);
    if (scope.reason) return e.json(scope.reason === 'room_unknown' ? 404 : 403, { message: scope.reason });
    const room = scope.room;

    // Expiry is evaluated in JavaScript rather than in the filter because
    // PocketBase stores a date as "YYYY-MM-DD HH:MM:SS.sssZ" while the runtime
    // hands out ISO-8601 with a T; a string comparison across those two spellings
    // silently orders wrong. Reading at most 50 rows for one room is cheap.
    const rows = e.app.findRecordsByFilter('classroom_presence', 'room = {:room}',
        '-updated', MAX_ROWS, 0, { room: room.id });
    const now = Date.now();
    const items = [];
    for (const row of rows) {
        const expires = parseWhen(row.getString('expires_at'));
        if (!Number.isFinite(expires) || expires <= now) continue;
        if (row.getString('state') === 'ENDED') continue;
        const read = tracksOf(row);
        items.push({
            id: row.id,
            room: room.id,
            persona_id: row.getString('persona_id'),
            display_name: row.getString('display_name'),
            role: row.getString('role'),
            access_basis: row.getString('access_basis'),
            session_id: row.getString('session_id'),
            tracks: read.tracks,
            tracks_error: read.error,
            app_name: row.getString('app_name'),
            manifest_id: row.getString('manifest_id'),
            capsule_digest: row.getString('capsule_digest'),
            state: row.getString('state'),
            // Nothing here was confirmed against the SFU; see HONEST LIMIT.
            verified: false,
            verification: 'NOT_ECHOED_BY_SFU',
            expires_at: new Date(expires).toISOString(),
        });
    }

    e.response.header().set('Cache-Control', 'no-store');
    return e.json(200, {
        room: room.id,
        route: 'classroom-presence/v1',
        access_basis: scope.basis,
        server_time: new Date(now).toISOString(),
        items: items,
    });
}, $apis.requireAuth('users'));

// ---------------------------------------------------------------------------
// GET /api/classroom/presence/health - installation state, no room and no secret.
//
// Read by classroomRealtime.presenceHealth() and rendered on the classroom page:
// the failure this answers is "the migration has not been applied on this
// environment yet", which otherwise presents to a student as an empty room. It is
// deliberately unauthenticated and deliberately says nothing about any room, any
// seat or any credential VALUE - only whether the collection exists and HOW MANY
// publishers are configured, never which.
// ---------------------------------------------------------------------------
routerAdd('GET', '/api/classroom/presence/health', (e) => {
    const MAX_TTL_MS = 120000;
    const MAX_ROWS = 50;
    let installed = false;
    let reason = '';
    try { e.app.findCollectionByNameOrId('classroom_presence'); installed = true; }
    catch (error) { reason = String(error.message).slice(0, 120); }
    const publishers = ($os.getenv('BUILDANDDO_CLASSROOM_PUBLISHERS') || '').split(',')
        .map((s) => s.trim()).filter(Boolean);
    return e.json(200, {
        ok: installed,
        route: 'classroom-presence/v1',
        collection_installed: installed,
        publishers_configured: publishers.length,
        max_ttl_ms: MAX_TTL_MS,
        max_rows: MAX_ROWS,
        verification: 'NOT_ECHOED_BY_SFU',
        reason: reason || null,
    });
});
