// --- CGRF Header ------------------------------------------------
// File:        apps/pocketbase/pb_hooks/classroom-media.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/classrooms.js, apps/pocketbase/pb_hooks/workspace-access.js, apps/pocketbase/pb_hooks/classroom-realtime-lib.js, apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js
// EnumType:    Service
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/classrooms.js; CONSUMES apps/pocketbase/pb_hooks/workspace-access.js; CONSUMES apps/pocketbase/pb_hooks/classroom-realtime-lib.js; DEPENDS_ON apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js
// Intent:      Authorize each signalling operation against live native attendance and exact owned provider sessions before any external effect.
// ----------------------------------------------------------------

const access = require(`${__hooks}/workspace-access.js`);
const classrooms = require(`${__hooks}/classrooms.js`);
const provider = require(`${__hooks}/classroom-realtime-lib.js`);
const COLLECTION = 'classroom_media_sessions';
const SESSION_MS = 4 * 60 * 60 * 1000;
const FIELDS = ['workspace', 'room', 'owner', 'membership', 'member_revision', 'provider_app',
    'session_id', 'tracks', 'expires_at', 'active', 'busy', 'protocol_version'];
const denied = () => { throw new ForbiddenError('This media session or track is unavailable for the current classroom.'); };
const stamp = (value) => Date.parse(String(value || '').replace(' ', 'T'));
const assign = (record, values) => { Object.entries(values).forEach(([key, value]) => record.set(key, value)); return record; };

/** Fail closed when the locked native session contract is absent or altered. */
function schema(app) {
    const collection = access.schema(app, COLLECTION, FIELDS);
    if (['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'].some((key) => collection[key] !== null))
        throw new ApiError(503, 'The media session store requires operator review.');
    return collection;
}
function configuration() {
    const config = provider.realtimeConfig();
    if (config.reason) throw new ApiError(503, 'Classroom media is not configured.');
    return config;
}
function scopeFor(app, auth, room) {
    const scope = classrooms.mediaAccess(app, auth, room);
    schema(app);
    return { ...scope, can_publish: scope.can_manage && provider.mayPublish(provider.callerSeat({ auth: scope.auth })) };
}
function sessionRecord(app, id, appId) {
    if (!access.text(id, 200) || /[\x00-\x20]/.test(id)) access.invalid('Supply a bounded media session identifier.');
    const rows = app.findRecordsByFilter(COLLECTION, 'session_id = {:id} && provider_app = {:appId}', '', 2, 0, { id, appId });
    if (rows.length !== 1) denied();
    return rows[0];
}
function ownedSession(app, scope, id, appId, publishing = false, allowBusy = false) {
    const record = sessionRecord(app, id, appId);
    if (record.getString('owner') !== scope.auth.id || record.getString('room') !== scope.room.id ||
        record.getString('workspace') !== scope.workspace || record.getString('membership') !== scope.member.id ||
        Number(record.get('member_revision')) !== Number(scope.member.get('revision')) ||
        Number(record.get('protocol_version')) !== 1 || !record.getBool('active') ||
        !(stamp(record.getString('expires_at')) > Date.now()) || (publishing && !scope.can_publish)) denied();
    if (record.getBool('busy') && !allowBusy) throw new ApiError(409, 'A media operation is pending. Rejoin after an uncertain result.');
    return record;
}
function description(value, types) {
    access.exact(value, ['type', 'sdp']);
    if (!types.includes(value.type) || !access.text(value.sdp, 65536)) access.invalid('Supply a bounded session description.');
    return { type: value.type, sdp: value.sdp };
}
function trackList(value, publishing) {
    if (!Array.isArray(value) || !value.length || value.length > 8) access.invalid('Supply one to eight media tracks.');
    const names = new Set(), mids = new Set();
    return value.map((track) => {
        const keys = publishing ? ['location', 'mid', 'trackName', 'kind'] : ['location', 'sessionId', 'trackName'];
        access.exact(track, keys);
        if (track.location !== (publishing ? 'local' : 'remote') || !access.text(track.trackName, 200) ||
            /[\x00-\x1f]/.test(track.trackName)) access.invalid('Use exact local or remote track names.');
        const key = JSON.stringify([publishing ? '' : track.sessionId, track.trackName]);
        if (names.has(key)) access.invalid('Track names must be distinct.');
        names.add(key);
        if (publishing) {
            if (!access.text(track.mid, 64) || mids.has(track.mid) || !['audio', 'video'].includes(track.kind))
                access.invalid('Each local track needs a distinct media id and audio/video kind.');
            mids.add(track.mid);
        } else if (!access.text(track.sessionId, 200)) access.invalid('Remote tracks need their original session.');
        return track;
    });
}
function published(record) {
    const tracks = access.json(record, 'tracks', []);
    if (!Array.isArray(tracks) || tracks.length > 8 || tracks.some((track) =>
        !track || !access.text(track.trackName, 200) || !['audio', 'video'].includes(track.kind)))
        throw new ApiError(503, 'Recorded media tracks need operator review.');
    return tracks;
}
function remoteTracks(app, scope, tracks, config) {
    for (const track of tracks) {
        const record = sessionRecord(app, track.sessionId, config.appId);
        if (record.getString('room') !== scope.room.id || record.getString('workspace') !== scope.workspace) denied();
        const auth = access.find(app, 'users', record.getString('owner'));
        const publisher = scopeFor(app, auth, scope.room.id);
        const source = ownedSession(app, publisher, track.sessionId, config.appId, true);
        if (!published(source).some((item) => item.trackName === track.trackName)) denied();
    }
}
function providerResult(out) {
    if (![200, 201].includes(out.status) || !out.body || typeof out.body !== 'object' || out.body.errorCode)
        throw new ApiError(502, 'The media provider did not confirm the operation. Rejoin rather than replaying an uncertain operation.');
    return out.body;
}

/** Create a provider session and bind it only while the same attendance remains valid. */
function session(e) {
    access.authenticated(e);
    const body = e.requestInfo().body;
    access.exact(body, ['room', 'sessionDescription']);
    const scope = scopeFor(e.app, e.auth, body.room);
    const config = configuration(), offer = description(body.sessionDescription, ['offer']);
    const capacity = (app) => {
        const rows = app.findRecordsByFilter(COLLECTION,
            'room = {:room} && owner = {:owner} && active = {:active} && membership = {:member} && member_revision = {:revision} && protocol_version = {:version}',
            '-created', 100, 0, { room: scope.room.id, owner: scope.auth.id, active: true,
                member: scope.member.id, revision: Number(scope.member.get('revision')), version: 1 });
        if (rows.filter((row) => stamp(row.getString('expires_at')) > Date.now()).length >= 4)
            throw new ApiError(429, 'Close unused media sessions before joining again.');
    };
    capacity(e.app);
    const result = providerResult(provider.callRealtime(`/${config.appId}/sessions/new`, config.secret, { sessionDescription: offer }));
    if (!access.text(result.sessionId, 200) || /[\x00-\x20]/.test(result.sessionId))
        throw new ApiError(502, 'The media provider returned no usable session.');
    const answer = description(result.sessionDescription, ['answer']);
    let canPublish;
    e.app.runInTransaction((app) => {
        const current = scopeFor(app, e.auth, body.room);
        if (current.member.id !== scope.member.id || current.member.get('revision') !== scope.member.get('revision')) denied();
        capacity(app);
        if (app.findRecordsByFilter(COLLECTION, 'provider_app = {:appId} && session_id = {:id}', '', 1, 0,
            { appId: config.appId, id: result.sessionId }).length) throw new ApiError(502, 'The provider reused a media session identifier.');
        app.save(assign(new Record(schema(app)), { workspace: current.workspace, room: current.room.id, owner: current.auth.id,
            membership: current.member.id, member_revision: Number(current.member.get('revision')), provider_app: config.appId,
            session_id: result.sessionId, tracks: [], active: true, busy: false, protocol_version: 1,
            expires_at: new Date(Date.now() + SESSION_MS).toISOString() }));
        canPublish = current.can_publish;
    });
    return { room: scope.room.id, sessionId: result.sessionId, sessionDescription: answer, may_publish: canPublish };
}

/** Serialize signalling changes and recheck current authority after provider completion. */
function change(e, renegotiating) {
    access.authenticated(e);
    const body = e.requestInfo().body;
    const keys = renegotiating ? ['room', 'sessionId', 'sessionDescription'] : ['room', 'sessionId', 'action', 'tracks', 'sessionDescription'];
    if (!access.fields(body, keys)) access.invalid('Use the listed signalling fields.');
    const config = configuration();
    const publishing = !renegotiating && body.action === 'push';
    if (!renegotiating && !['push', 'pull'].includes(body.action)) access.invalid('Choose push or pull.');
    const tracks = renegotiating ? [] : trackList(body.tracks, publishing);
    const payload = {};
    if (renegotiating || body.sessionDescription) payload.sessionDescription = description(body.sessionDescription,
        renegotiating ? ['answer'] : ['offer']);
    if (!renegotiating) payload.tracks = tracks.map(({ kind, ...track }) => track);
    let recordId;
    const authorize = (app, allowBusy = false) => {
        const scope = scopeFor(app, e.auth, body.room);
        const record = ownedSession(app, scope, body.sessionId, config.appId, publishing, allowBusy);
        if (publishing && published(record).length) throw new ApiError(409, 'Start a new media session to republish tracks.');
        if (!renegotiating && !publishing) remoteTracks(app, scope, tracks, config);
        return record;
    };
    e.app.runInTransaction((app) => {
        const record = authorize(app);
        recordId = record.id; record.set('busy', true); app.save(record);
    });
    try {
        const suffix = renegotiating ? 'renegotiate' : 'tracks/new';
        const result = providerResult(provider.callRealtime(`/${config.appId}/sessions/${encodeURIComponent(body.sessionId)}/${suffix}`,
            config.secret, payload, renegotiating ? 'PUT' : 'POST'));
        if (!renegotiating && (!Array.isArray(result.tracks) || result.tracks.length !== tracks.length ||
            tracks.some((track) => !result.tracks.some((echo) => !echo.errorCode && echo.trackName === track.trackName &&
                (publishing ? echo.mid === track.mid : echo.sessionId === track.sessionId)))))
            throw new ApiError(502, 'The media provider did not confirm every requested track. Rejoin before retrying.');
        e.app.runInTransaction((app) => {
            const record = authorize(app, true);
            if (record.id !== recordId) denied();
            if (publishing) record.set('tracks', tracks.map(({ trackName, kind }) => ({ trackName, kind })));
            record.set('busy', false); app.save(record);
        });
        return { ...(result.tracks ? { tracks: result.tracks } : {}),
            ...(result.sessionDescription ? { sessionDescription: result.sessionDescription } : {}),
            requiresImmediateRenegotiation: result.requiresImmediateRenegotiation === true };
    } catch (error) {
        // Ambiguous effects never become retry permission or a published-track claim.
        e.app.runInTransaction((app) => {
            const record = access.find(app, COLLECTION, recordId);
            record.set('active', false); record.set('busy', false); app.save(record);
        });
        throw error;
    }
}

/** Invalidate only the caller's exact room session, including after attendance ends. */
function close(e) {
    access.authenticated(e);
    const body = e.requestInfo().body;
    access.exact(body, ['room', 'sessionId']); access.id(body.room);
    const config = configuration();
    e.app.runInTransaction((app) => {
        schema(app);
        const record = sessionRecord(app, body.sessionId, config.appId);
        if (record.getString('owner') !== e.auth.id || record.getString('room') !== body.room) denied();
        record.set('active', false); app.save(record);
    });
    return { closed: true };
}

/** Validate an advertisement against the publisher's currently bound, confirmed tracks. */
function advertisement(app, scope, sessionId, tracks) {
    const record = ownedSession(app, scope, sessionId, configuration().appId, true);
    const confirmed = published(record);
    if (!Array.isArray(tracks) || !tracks.length || tracks.length > 8 || tracks.some((track) =>
        !track || typeof track !== 'object' || Array.isArray(track) || !access.text(track.trackName, 200) ||
        !['audio', 'video'].includes(track.kind) || !confirmed.some((item) => item.trackName === track.trackName && item.kind === track.kind))) denied();
    return record;
}

module.exports = { schema, scopeFor, session, change, close, advertisement };
