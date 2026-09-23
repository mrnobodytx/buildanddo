// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/classroom-media-fixture.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     tests/upgrade/classroom-fixture.mjs, apps/pocketbase/pb_hooks/classroom-realtime.pb.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/classroom-fixture.mjs; VALIDATES apps/pocketbase/pb_hooks/classroom-realtime.pb.js; VALIDATES apps/pocketbase/pb_hooks/classroom-presence.pb.js
// Intent:      Execute registered classroom routes and storage with explicit local provider responses and no network access.
// ----------------------------------------------------------------

import vm from 'node:vm';
import { ApiError, plain, source } from './admin-fixture.mjs';
import { classroomFixture } from './classroom-fixture.mjs';

export const MEDIA_MIGRATION = 'apps/pocketbase/pb_migrations/1791400000_classroom_media_sessions.js';
export function mediaFixture({ migrated = true, publishers = 'owner,admin,editor' } = {}) {
    const requests = [], routes = new Map(), logs = [];
    const env = { BUILDANDDO_CLASSROOM_PUBLISHERS: publishers, CLOUDFLARE_REALTIME_APP_ID: 'fixture-app',
        CLOUDFLARE_REALTIME_APP_SECRET: 'fixture-only-not-a-credential' };
    let sequence = 0;
    const provider = { send(options) {
        requests.push(plain(options));
        const body = JSON.parse(options.body);
        if (options.url.endsWith('/sessions/new')) return { statusCode: 201, json: {
            sessionId: `session-${++sequence}`, sessionDescription: { type: 'answer', sdp: 'fixture-answer' } } };
        return { statusCode: 200, json: { tracks: body.tracks || [],
            sessionDescription: { type: 'answer', sdp: 'fixture-answer' } } };
    } };
    const runtime = { $os: { getenv: (name) => env[name] || '' }, $http: { send: (args) => provider.send(args) } };
    const f = classroomFixture({ runtime });
    f.app.logger = () => ({ info: (...args) => logs.push(args), warn: (...args) => logs.push(args) });
    f.migration('apps/pocketbase/pb_migrations/1790600000_classroom_presence.js').up();
    if (migrated) f.migration(MEDIA_MIGRATION).up();
    const globals = { ...runtime, __hooks: '/hooks', $app: f.app,
        Record: function (collection, values) { return f.record(collection.name, values || {}); },
        ApiError, ForbiddenError: class extends ApiError { constructor(message) { super(403, message); } },
        NotFoundError: class extends ApiError { constructor(message) { super(404, message); } },
        BadRequestError: class extends ApiError { constructor(message) { super(400, message); } },
        $apis: { requireAuth: (name) => ({ auth: name }), bodyLimit: (max) => ({ max }) },
        require: (name) => f.load(name.split('/').at(-1)),
        routerAdd: (method, path, handler, auth, limit) => routes.set(`${method} ${path}`, { handler, auth, limit }) };
    for (const name of ['classroom-realtime.pb.js', 'classroom-presence.pb.js'])
        vm.runInNewContext(source(`apps/pocketbase/pb_hooks/${name}`), globals, { filename: name });
    const request = (method, path, { actor = 'owner', body = {}, query = {} } = {}) => {
        const event = f.event(actor, body, { query });
        event.response = { header: () => ({ set() {} }) };
        event.json = (status, data) => ({ status, body: plain(data) });
        const route = routes.get(`${method} ${path}`);
        if (route.auth && !event.auth) return { status: 401, body: { message: 'authentication required' } };
        try { return route.handler(event); }
        catch (error) { if (!error.status) throw error; return { status: error.status, body: { message: error.message } }; }
    };
    const start = (options = {}) => {
        const result = f.create(options);
        f.command('room.start', { id: result.id }, options);
        return result.id;
    };
    const session = (room, actor = 'owner') => request('POST', '/api/classroom/session', { actor,
        body: { room, sessionDescription: { type: 'offer', sdp: 'fixture-offer' } } });
    const publish = (room, sessionId, actor = 'owner', trackName = 'seat:owner/mic') => request('POST', '/api/classroom/tracks', { actor,
        body: { room, sessionId, action: 'push', tracks: [{ location: 'local', mid: '0', trackName, kind: 'audio' }],
            sessionDescription: { type: 'offer', sdp: 'fixture-offer' } } });
    return { ...f, get data() { return f.data; }, env, requests, provider, request, routes, logs, start, session, publish };
}
