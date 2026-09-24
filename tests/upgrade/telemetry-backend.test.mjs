// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/telemetry-backend.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/telemetry.js, tests/upgrade/admin-fixture.mjs, tests/upgrade/classroom-media-fixture.mjs, tests/upgrade/decision-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/pocketbase/pb_hooks/telemetry.js; CONSUMES tests/upgrade/admin-fixture.mjs; CONSUMES tests/upgrade/classroom-media-fixture.mjs; CONSUMES tests/upgrade/decision-fixture.mjs
// DAG Node:    none
// Intent:      Exercise content-free backend failure reporting and request-independent log forwarding with synthetic storage, logger and transport doubles.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { ApiError, fixture, plain, repoPath, source } from './admin-fixture.mjs';
import { assistantMigration, assistantSurface } from './assistant-fixture.mjs';
import { mediaFixture } from './classroom-media-fixture.mjs';
import { installGovernment } from './government-fixture.mjs';
import { python } from './decision-fixture.mjs';

const PRIVATE = 'private-person@example.invalid request-body credential-marker';

// No native processes, HTTP clients, filesystem writes or vendor SDKs are used.
function backend({ env = {}, answer = () => { throw new Error('synthetic transport unavailable'); }, loggerThrows = false, modules = {} } = {}) {
    const logs = [], stdout = [], calls = [], routes = new Map(), hooks = {};
    const logger = (level) => (...args) => {
        if (loggerThrows) throw new Error('synthetic logger unavailable');
        logs.push({ level, message: args[0], data: Object.fromEntries(
            Array.from({ length: (args.length - 1) / 2 }, (_, i) => [args[1 + i * 2], args[2 + i * 2]])) });
    };
    const globals = {
        __hooks: '/hooks',
        $os: {
            getenv: (name) => env[name] || '',
            mkdirAll() { assert.fail('must not create a journal directory'); },
            cmd() { assert.fail('must not write a journal or invoke a shell'); },
        },
        $filepath: { join() { assert.fail('must not construct a journal path'); } },
        $app: { logger: () => ({ error: logger('error'), warn: logger('warn'), info: logger('info') }) },
        $http: { send(request) { calls.push(request); return answer(request); } },
        console: { log: (line) => stdout.push(JSON.parse(line)), error: (line) => stdout.push(JSON.parse(line)) },
        ApiError,
        BadRequestError: class extends ApiError { constructor(message) { super(400, message); } },
        ForbiddenError: class extends ApiError { constructor(message) { super(403, message); } },
        NotFoundError: class extends ApiError { constructor(message) { super(404, message); } },
        $apis: { requireAuth: (collection) => ({ collection }), bodyLimit: (limit) => ({ limit }) },
        routerAdd: (method, path, callback, ...middleware) => routes.set(`${method} ${path}`, { callback, middleware }),
        onModelCreate: (callback, collection) => { assert.equal(collection, '_logs'); hooks.log = callback; },
        onRecordAfterCreateSuccess: (callback, collection) => { assert.equal(collection, 'early_access'); hooks.reach = callback; },
        onMailerSend: (callback) => { hooks.mailer = callback; },
    };
    const cache = new Map();
    function load(name) {
        assert.notEqual(name, 'ocn-login.pb.js', 'OCN is outside this source dispatch');
        if (Object.hasOwn(modules, name)) return modules[name];
        if (cache.has(name)) return cache.get(name);
        const module = { exports: {} };
        vm.runInNewContext(source(`apps/pocketbase/pb_hooks/${name}`), {
            ...globals, module, require: (path) => load(path.split('/').at(-1)),
        }, { filename: pathToFileURL(repoPath(`apps/pocketbase/pb_hooks/${name}`)).href });
        cache.set(name, module.exports);
        return module.exports;
    }
    return { globals, env, logs, stdout, calls, hooks, routes, load };
}

function diagnostic(h, operation, category) {
    const matches = h.logs.filter((log) => log.message === 'buildanddo.backend.failure' && log.data.operation === operation);
    assert.ok(matches.some((log) => log.data.category === category), JSON.stringify(h.logs));
    assert.ok(matches.every((log) => log.level === 'error'));
    assert.doesNotMatch(JSON.stringify([...h.logs, ...h.stdout]), /private-person|request-body|credential-marker|Authorization|127\.0\.0\.1/);
}

test('the diagnostic helper admits only bounded operations, categories and status codes', () => {
    const h = backend();
    const telemetry = h.load('telemetry.js');
    telemetry.diagnostic('assistant.infer', 'config', 503, 'assistant_turns');
    telemetry.diagnostic(PRIVATE, PRIVATE, PRIVATE, PRIVATE);
    diagnostic(h, 'assistant.infer', 'config');
    assert.equal(h.logs.length, 2);
    assert.equal(h.stdout.length, 0, 'native diagnostics do not enable an off-box transport');
    assert.equal(h.calls.length, 0);
    assert.doesNotMatch(JSON.stringify(h.logs), /private-person|request-body|credential-marker/);
    const broken = backend({ loggerThrows: true });
    assert.doesNotThrow(() => broken.load('telemetry.js').diagnostic('assistant.infer', 'transport', 503));
});

for (const environment of ['production', 'development', '']) {
    test(`forwarding in ${environment || 'unset environment'} persists first and never dumps raw log content`, () => {
        const h = backend({ env: { NODE_ENV: environment, BUILDANDDO_TELEMETRY_TRANSPORT: 'stdout' } });
        h.load('logs-forwarder.pb.js');
        let persisted = 0;
        const result = {};
        const event = { next() { persisted++; return result; }, model: {
            id: PRIVATE, level: 8, message: PRIVATE,
            created: { string: () => PRIVATE }, data: { string: () => JSON.stringify({ ip: '192.0.2.55', body: PRIVATE, Authorization: PRIVATE }) },
        } };
        const write = h.globals.console.log;
        h.globals.console.log = (line) => { assert.equal(persisted, 1); write(line); };
        assert.equal(h.hooks.log(event), result);
        assert.equal(persisted, 1);
        assert.equal(h.stdout.length, 1);
        assert.doesNotMatch(JSON.stringify(h.stdout), /private-person|request-body|credential-marker|192\.0\.2\.55|Authorization/);
        assert.equal(h.calls.length, 0);
    });
}

test('a disabled forwarder is inert; a failing sink cannot suppress database records or replace errors', () => {
    for (const enabled of [false, true]) {
        const h = backend({ env: { NODE_ENV: 'production', BUILDANDDO_TELEMETRY_TRANSPORT: enabled ? 'stdout' : '' } });
        h.load('logs-forwarder.pb.js');
        h.globals.console.log = h.globals.console.error = () => { throw new Error('sink failed'); };
        let calls = 0;
        const event = { next() { calls++; return 'stored'; }, model: { level: 8, message: PRIVATE } };
        assert.equal(h.hooks.log(event), 'stored');
        assert.equal(calls, 1);
        const failure = new Error(PRIVATE);
        event.next = () => { calls++; throw failure; };
        assert.throws(() => h.hooks.log(event), (error) => error === failure);
        assert.equal(calls, 2);
        assert.equal(h.logs.length, 0, 'a failed log sink must not log its own failure');
    }
    const absent = backend({ modules: { 'telemetry.js': null } });
    absent.load('logs-forwarder.pb.js');
    assert.equal(absent.hooks.log({ next: () => 'stored', model: {} }), 'stored');
});

test('the forwarder revalidates known diagnostics and suppresses its own stdout envelopes', () => {
    const h = backend({ env: { BUILDANDDO_TELEMETRY_TRANSPORT: 'stdout' } });
    h.load('logs-forwarder.pb.js');
    const model = { level: 8, message: 'buildanddo.backend.failure', data: { string: () => JSON.stringify({
        operation: 'career.profile', category: 'upstream_status', status_code: 503,
        collection: PRIVATE, ip: '192.0.2.55', body: PRIVATE,
    }) } };
    h.hooks.log({ next() {}, model });
    assert.equal(h.stdout.length, 1);
    assert.equal(h.stdout[0].data.operation, 'career.profile');
    assert.equal(h.stdout[0].data.status_code, 503);
    assert.doesNotMatch(JSON.stringify(h.stdout), /private-person|request-body|credential-marker|192\.0\.2/);
    for (const message of ['buildanddo.telemetry', 'buildanddo.forwarded', 'buildanddo.decision'])
        h.hooks.log({ next() {}, model: { level: 0, message } });
    assert.equal(h.stdout.length, 1);
    model.data.string = () => { throw new Error(PRIVATE); };
    assert.doesNotThrow(() => h.hooks.log({ next() {}, model }));
});

test('native cause logging can reach the opt-in stdout forwarder only after its database write', () => {
    const h = backend({ env: { BUILDANDDO_TELEMETRY_TRANSPORT: 'stdout' } });
    h.load('logs-forwarder.pb.js');
    const stored = [];
    h.globals.$app.logger = () => ({ error(message, ...pairs) {
        const data = {};
        for (let i = 0; i < pairs.length; i += 2) data[pairs[i]] = pairs[i + 1];
        const model = { level: 8, message, data: { string: () => JSON.stringify(data) } };
        h.hooks.log({ model, next() { stored.push({ message, data }); } });
    } });
    const write = h.globals.console.log;
    h.globals.console.log = (line) => { assert.equal(stored.length, 1); write(line); };
    h.load('telemetry.js').diagnostic('assistant.infer', 'config');
    assert.equal(stored.length, 1);
    assert.equal(h.stdout.length, 1);
    assert.equal(h.stdout[0].data.operation, 'assistant.infer');
    assert.equal(h.stdout[0].data.category, 'config');
    assert.equal(h.calls.length, 0);
});

const assistantEnv = { BUILDANDDO_ASSISTANT_URL: 'https://synthetic.invalid/chat', BUILDANDDO_ASSISTANT_MODEL: 'synthetic-model' };
for (const [category, env, answer] of [
    ['config', {}, () => assert.fail('unconfigured inference must not send')],
    ['transport', assistantEnv, () => { throw new Error(PRIVATE); }],
    ['upstream_status', assistantEnv, () => ({ statusCode: 503, raw: PRIVATE })],
    ['parse', assistantEnv, () => ({ statusCode: 200, raw: '{invalid-json ' + PRIVATE })],
    ['schema', assistantEnv, () => ({ statusCode: 200, raw: JSON.stringify({ choices: [{ message: {
        content: JSON.stringify({ reply: PRIVATE, steps: [{ kind: 'fill', control: 'private-unlisted-control', value: PRIVATE }] }),
    } }] }) })],
]) {
    test(`assistant ${category} remains retryable, reports no content and survives a failing logger`, () => {
        for (const loggerThrows of [false, true]) {
            const h = backend({ env, answer, loggerThrows });
            const f = fixture({ runtime: h.globals });
            f.migration(assistantMigration).up();
            const service = f.load('workspace-assistant.js');
            const session = service.command(f.event('owner', { action: 'session.start', request_key: 'synthetic-session-key', payload: { title: 'Synthetic session' } }));
            const result = service.chat(f.event('owner', { session: session.id, request_key: 'synthetic-request-key', message: PRIVATE, surface: assistantSurface }));
            assert.equal(result.status, 'unavailable');
            assert.equal(result.failure, 'inference_unavailable');
            assert.equal(f.data.assistant_turns.length, 1);
            assert.equal(f.data.assistant_turns[0].message, PRIVATE, 'telemetry must not change retained retry inputs');
            if (!loggerThrows) diagnostic(h, 'assistant.infer', category);
            assert.equal(h.stdout.length, 0);
        }
    });
}

test('operator and knowledge swallowed source failures retain degraded results and current permissions', () => {
    const h = backend();
    const f = fixture({ runtime: h.globals });
    f.collections.missions.fields.removeByName('workspace');
    const operator = f.load('workspace-operator.js');
    const knowledge = f.load('workspace-knowledge.js');
    const before = plain(f.data);
    assert.equal(operator.snapshot(f.event()).sources.missions.state, 'unavailable');
    assert.equal(knowledge.snapshot(f.event()).coverage.find((item) => item.collection === 'missions').state, 'unavailable');
    diagnostic(h, 'operator.snapshot', 'schema');
    diagnostic(h, 'knowledge.collect', 'schema');
    assert.deepEqual(plain(f.data), before);
    assert.throws(() => operator.snapshot(f.event(null)), { status: 403 });
    assert.throws(() => knowledge.snapshot(f.event('outsider')), { status: 403 });
});

test('government missing, altered or duplicate membership schema is diagnosed without changing denials', () => {
    const h = backend();
    const f = fixture({ runtime: h.globals });
    const service = f.load('government-access.js');
    const auth = f.app.findRecordById('users', 'owner');
    assert.equal(service.status(f.app, auth).reason, 'membership_unavailable');
    diagnostic(h, 'government.membership', 'schema');
    installGovernment(f, ['owner']);
    assert.equal(service.status(f.app, auth).allowed, true);
    f.collections.government_memberships.indexes = [];
    assert.equal(service.status(f.app, auth).reason, 'membership_unavailable');
    assert.throws(() => service.requireMember(f.app, auth), { status: 403 });
    assert.equal(service.status(f.app, null).reason, 'sign_in_required');
    assert.equal(h.stdout.length, 0);
});

for (const [category, answer] of [
    ['transport', () => { throw new Error(PRIVATE); }],
    ['upstream_status', () => ({ statusCode: 503, json: { errorDescription: PRIVATE } })],
    ['parse', () => ({ statusCode: 200, json: null })],
]) {
    test(`classroom realtime ${category} has a bounded diagnostic and retains provider result semantics`, () => {
        const h = backend({ answer });
        const value = h.load('classroom-realtime-lib.js').callRealtime('/synthetic-app/sessions/private-session', PRIVATE, { sdp: PRIVATE });
        assert.equal(value.status, category === 'transport' ? 0 : category === 'upstream_status' ? 503 : 200);
        diagnostic(h, 'classroom.realtime', category);
        assert.equal(h.calls.length, 1);
        assert.equal(h.stdout.length, 0);
    });
}

test('classroom health returns 503 when its existing installation/config checks fail, without provider calls', () => {
    for (const hook of ['classroom-realtime.pb.js', 'classroom-presence.pb.js']) {
        let installed = true;
        const h = backend({ modules: { 'classroom-media.js': { schema() { if (!installed) throw new Error(PRIVATE); } } } });
        h.env.CLOUDFLARE_REALTIME_APP_ID = 'synthetic-app';
        h.env.CLOUDFLARE_REALTIME_APP_SECRET = PRIVATE;
        h.load(hook);
        const path = hook === 'classroom-realtime.pb.js' ? '/api/classroom/health' : '/api/classroom/presence/health';
        const route = h.routes.get(`GET ${path}`);
        const event = { app: { findCollectionByNameOrId() { if (!installed) throw new Error(PRIVATE); } }, auth: null,
            response: { header: () => ({ set() {} }) }, json: (status, body) => ({ status, body: plain(body) }) };
        assert.equal(route.middleware.length, 0, 'retain existing public health scope rather than inventing a bypass');
        assert.equal(route.callback(event).status, 200);
        installed = false;
        const down = route.callback(event);
        assert.equal(down.status, 503);
        assert.equal(down.body.ok, false);
        assert.doesNotMatch(JSON.stringify(down), /private-person|request-body|credential-marker/);
        assert.equal(h.calls.length, 0);
        installed = true;
        if (hook === 'classroom-realtime.pb.js') {
            delete h.env.CLOUDFLARE_REALTIME_APP_SECRET;
            assert.equal(route.callback(event).status, 503);
        }
    }
});

for (const [hook, path] of [
    ['classroom-realtime.pb.js', '/api/classroom/health'],
    ['classroom-presence.pb.js', '/api/classroom/presence/health'],
]) {
    test(`${path} reports each real media schema failure once and sends one unchanged response`, () => {
        for (const defect of ['missing collection', 'missing field', 'open rule']) {
            for (const loggerThrows of [false, true]) {
                const f = mediaFixture();
                const h = backend({ env: f.env, loggerThrows });
                h.load(hook);
                const logger = h.globals.$app.logger();
                let attempts = 0;
                h.globals.$app.logger = () => ({ error(...args) { attempts++; return logger.error(...args); } });
                const route = h.routes.get(`GET ${path}`);
                const headers = new Map();
                let sends = 0;
                const event = { app: f.app, auth: null,
                    response: { header: () => ({ set: (key, value) => headers.set(key, value) }) },
                    json(status, body) { sends++; return { status, body: plain(body) }; } };
                assert.equal(route.callback(event).status, 200);
                assert.equal(attempts, 0);
                if (defect === 'missing collection') delete f.collections.classroom_media_sessions;
                if (defect === 'missing field') f.collections.classroom_media_sessions.fields.removeByName('protocol_version');
                if (defect === 'open rule') f.collections.classroom_media_sessions.viewRule = '';
                const before = plain(f.data);
                sends = 0;
                const result = route.callback(event);
                assert.equal(result.status, 503);
                assert.equal(sends, 1);
                assert.equal(attempts, 1, `${path}: ${defect}, loggerThrows=${loggerThrows}`);
                assert.deepEqual(h.logs.map((log) => [log.message, log.data.operation, log.data.category, log.data.status_code]),
                    loggerThrows ? [] : [['buildanddo.backend.failure', 'classroom.media.schema', 'schema', 503]]);
                assert.deepEqual(result.body, path === '/api/classroom/health' ? {
                    ok: false, route: 'classroom-realtime/v2', app_id_configured: true, app_secret_configured: true,
                    publishers_configured: 3, sessions_installed: false, reason: 'classroom media session migration required',
                } : {
                    ok: false, route: 'classroom-presence/v1', collection_installed: false, publishers_configured: 3,
                    max_ttl_ms: 120000, max_rows: 50, verification: 'ECHO_ON_READ',
                    reason: 'Classroom presence/session migrations required.',
                });
                assert.equal(route.middleware.length, 0);
                assert.equal(headers.get('Cache-Control'), 'no-store');
                assert.deepEqual(plain(f.data), before);
                assert.equal(h.calls.length, 0);
                assert.equal(f.requests.length, 0);
            }
        }
    });
}

test('presence storage lookup keeps its own single diagnostic before the real media schema check', () => {
    const f = mediaFixture();
    const h = backend({ env: f.env });
    h.load('classroom-presence.pb.js');
    delete f.collections.classroom_presence;
    // Both stores are absent, but the first failed prerequisite remains the owner.
    delete f.collections.classroom_media_sessions;
    let sends = 0;
    const result = h.routes.get('GET /api/classroom/presence/health').callback({ app: f.app, auth: null,
        response: { header: () => ({ set() {} }) }, json(status, body) { sends++; return { status, body }; } });
    assert.equal(result.status, 503);
    assert.equal(result.body.collection_installed, false);
    assert.equal(sends, 1);
    assert.deepEqual(h.logs.map((log) => [log.data.operation, log.data.category, log.data.status_code]),
        [['classroom.presence.health', 'schema', 503]]);
    assert.equal(h.calls.length, 0);
});

test('classroom media malformed confirmations are diagnosed without retaining tracks or changing errors', () => {
    const f = mediaFixture(), room = f.start();
    const h = backend({ env: f.env, answer: () => ({ statusCode: 201, json: { sessionId: '' } }), modules: {
        'workspace-access.js': f.load('workspace-access.js'), 'classrooms.js': f.load('classrooms.js'),
    } });
    const service = h.load('classroom-media.js');
    assert.throws(() => service.session(f.event('owner', { room, sessionDescription: { type: 'offer', sdp: PRIVATE } })), { status: 502 });
    assert.equal(f.data.classroom_media_sessions.length, 0);
    diagnostic(h, 'classroom.media.session', 'schema');
});

const careerEnv = { BUILDANDDO_CAREER_PROFILE_URL: 'https://synthetic.invalid/profile', BUILDANDDO_CAREER_PROFILE_TOKEN: PRIVATE };
for (const [category, env, answer] of [
    ['config', { ...careerEnv, BUILDANDDO_CAREER_PROFILE_TOKEN: '' }, () => assert.fail('must not send')],
    ['transport', careerEnv, () => { throw new Error(PRIVATE); }],
    ['upstream_status', careerEnv, () => ({ statusCode: 502, json: { message: PRIVATE } })],
    ['parse', careerEnv, () => ({ statusCode: 200, get json() { throw new Error(PRIVATE); } })],
    ['schema', careerEnv, () => ({ statusCode: 200, json: { schema: PRIVATE, subject_id: 'foreign-person' } })],
]) {
    test(`career ${category} diagnostics cannot change unavailable responses when the logger throws`, () => {
        for (const loggerThrows of [false, true]) {
            const h = backend({ env, answer, loggerThrows });
            const result = h.load('career-profile.js').load({ auth: { id: 'synthetic-person', getBool: () => true, getString: () => PRIVATE } });
            assert.deepEqual(plain(result), { status: 503, body: { state: 'unavailable', subject_id: 'synthetic-person' } });
            if (!loggerThrows) diagnostic(h, 'career.profile', category);
            assert.equal(h.stdout.length, 0);
        }
    });
}

for (const [category, env, answer] of [
    ['config', {}, () => assert.fail('missing configuration must not send')],
    ['transport', { REACH_API_URL: 'https://synthetic.invalid', REACH_API_TOKEN: PRIVATE }, () => { throw new Error(PRIVATE); }],
    ['upstream_status', { REACH_API_URL: 'https://synthetic.invalid', REACH_API_TOKEN: PRIVATE }, () => ({ statusCode: 429, get json() { assert.fail('do not inspect contact response content'); } })],
    ['schema', { REACH_API_URL: 'https://synthetic.invalid', REACH_API_TOKEN: PRIVATE }, () => null],
]) {
    test(`Reach ${category} diagnostics preserve the committed record and call next once even with a broken logger`, () => {
        for (const loggerThrows of [false, true]) {
            const h = backend({ env, answer, loggerThrows });
            h.load('reach-contact-sync.pb.js');
            let nexts = 0;
            assert.doesNotThrow(() => h.hooks.reach({ record: { get: () => PRIVATE }, next() { nexts++; } }));
            assert.equal(nexts, 1);
            if (!loggerThrows) diagnostic(h, 'reach.contacts', category);
            assert.equal(h.stdout.length, 0);
        }
    });
}

test('mailer diagnostics retain the original transport exception and do not export mail content', () => {
    const failure = Object.freeze(new Error(PRIVATE));
    for (const loggerThrows of [false, true]) {
        const h = backend({ env: { BUILDER_MAILER_SENDER_ADDRESS: 'synthetic@example.invalid', BUILDER_MAILER_API_URL: 'https://synthetic.invalid', BUILDER_MAILER_API_KEY: PRIVATE },
            answer: () => { throw failure; }, loggerThrows });
        h.load('builder-mailer.pb.js');
        const event = { app: { settings: () => ({ smtp: { enabled: false } }) }, message: { subject: PRIVATE, text: PRIVATE, to: [{ address: PRIVATE }] } };
        assert.throws(() => h.hooks.mailer(event), (error) => error === failure);
        if (!loggerThrows) diagnostic(h, 'mailer.send', 'transport');
        assert.equal(h.stdout.length, 0);
    }
});

test('mailer upstream refusal logs status only and preserves its existing user-facing response', () => {
    const h = backend({ env: { BUILDER_MAILER_SENDER_ADDRESS: 'synthetic@example.invalid', BUILDER_MAILER_API_URL: 'https://synthetic.invalid', BUILDER_MAILER_API_KEY: PRIVATE },
        answer: () => ({ statusCode: 503, json: { message: 'Original mail failure', raw: PRIVATE } }) });
    h.load('builder-mailer.pb.js');
    const event = { app: { settings: () => ({ smtp: { enabled: false } }) }, message: { subject: PRIVATE, html: PRIVATE, to: [{ address: PRIVATE }] } };
    assert.throws(() => h.hooks.mailer(event), { status: 500, message: 'Original mail failure' });
    diagnostic(h, 'mailer.send', 'upstream_status');
    event.app.settings = () => ({ smtp: { enabled: true } });
    event.next = () => 'native-smtp-result';
    assert.equal(h.hooks.mailer(event), 'native-smtp-result');
    assert.equal(h.calls.length, 1);
});

for (const [category, env, answer, expectedStatus] of [
    ['config', { BUILDANDDO_DECISION_PORT: 'unsafe-port' }, () => assert.fail('must not send'), 503],
    ['transport', {}, () => { throw new Error(PRIVATE); }, 503],
    ['upstream_status', {}, () => ({ statusCode: 400, json: { message: PRIVATE } }), 400],
    ['upstream_status', {}, () => ({ statusCode: 403, json: { message: PRIVATE } }), 403],
    ['upstream_status', {}, () => ({ statusCode: 502, json: { message: PRIVATE } }), 503],
    ['parse', {}, () => ({ statusCode: 200, json: null }), 502],
    ['schema', {}, () => ({ statusCode: 200, json: { verified: true, private: PRIVATE } }), 502],
]) {
    test(`decision ${category}/${expectedStatus} keeps processor failure semantics without saving a receipt`, () => {
        for (const loggerThrows of [false, true]) {
            const h = backend({ env, answer, loggerThrows, modules: { 'workflow-policy.js': {
                authenticated() {}, role() {}, schema() {}, fields: () => true,
                invalid(message) { throw new ApiError(400, message); },
            } } });
            const event = { app: { findRecordsByFilter: () => [], save() { assert.fail('must not save a failed result'); } },
                auth: { id: 'synthetic-person' }, request: { pathValue: () => 'synthetic-workspace' },
                requestInfo: () => ({ body: { state: { description: PRIVATE }, questions: { decide: {} }, trace_id: 'synthetic-trace' } }) };
            assert.throws(() => h.load('decision-runtime.js').decide(event), { status: expectedStatus });
            if (!loggerThrows) diagnostic(h, category === 'schema' ? 'decision.result' : 'decision.request', category);
            assert.equal(h.stdout.length, 0);
        }
    });
}

test('successful decision telemetry stays opt-in and never exports a provider-controlled route label', () => {
    for (const transport of ['', 'stdout']) {
        const h = backend({ env: { BUILDANDDO_TELEMETRY_TRANSPORT: transport } });
        h.load('telemetry.js').decision(PRIVATE, 12, 0.01);
        assert.equal(h.stdout.length, transport ? 1 : 0);
        assert.doesNotMatch(JSON.stringify(h.stdout), /private-person|request-body|credential-marker/);
        if (transport) assert.equal(h.stdout[0].data.route, 'other');
        assert.equal(h.calls.length, 0);
    }
});

test('decision telemetry recognizes only known single routes and valid mixed components', () => {
    const h = backend({ env: { BUILDANDDO_TELEMETRY_TRANSPORT: 'stdout' } });
    const telemetry = h.load('telemetry.js');
    for (const [route, expected] of [
        ...['rules', 'local_reflex', 'frontier', 'abstain'].map((route) => [route, route]),
        ...['mixed(rules,abstain)', 'mixed(abstain,rules)', 'mixed(rules,frontier)',
            'mixed(local_reflex,abstain)', 'mixed(rules,local_reflex,frontier,abstain)'].map((route) => [route, 'mixed']),
        ...['mixed()', 'mixed(rules)', 'mixed(rules,rules)', 'mixed(rules,unknown)', 'mixed(rules,abstain,)',
            'mixed(rules, abstain)', 'mixed(rules,abstain)\n', 'mixed(mixed(rules,abstain),frontier)',
            'mixed(' + PRIVATE + ',rules)', 'mixed(' + 'rules,'.repeat(1000) + 'abstain)',
            'mixed', '', PRIVATE, null, { toString() { assert.fail('do not coerce route content'); } }]
            .map((route) => [route, 'other']),
    ]) {
        const before = h.stdout.length;
        telemetry.decision(route, 12, 0.01);
        assert.equal(h.stdout.length, before + 1);
        assert.equal(h.stdout.at(-1).data.route, expected);
    }
    assert.doesNotMatch(JSON.stringify(h.stdout), /private-person|request-body|credential-marker|mixed\(/);
    assert.equal(h.calls.length, 0);
});

test('the actual Python DecisionRouter mixed result uses the bounded mixed telemetry bucket', () => {
    const result = python('decide', { state: { answers: { known: true } },
        questions: { known: { type: 'noul' }, unknown: { type: 'noul' } }, authority: 'A0', trace_id: 'synthetic-mixed-route' });
    assert.equal(result.route, 'mixed(rules,abstain)');
    const h = backend({ env: { BUILDANDDO_TELEMETRY_TRANSPORT: 'stdout' } });
    h.load('telemetry.js').decision(result.route, result.latency_ms, result.cost_usd);
    assert.equal(h.stdout.length, 1);
    assert.equal(h.stdout[0].data.route, 'mixed');
    assert.equal(result.route, 'mixed(rules,abstain)', 'telemetry cannot rewrite the decision receipt');
    assert.equal(h.calls.length, 0);
});
