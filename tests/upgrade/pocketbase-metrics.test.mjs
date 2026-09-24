// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/pocketbase-metrics.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/pocketbase/pb_hooks/metrics.pb.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/metrics.pb.js
// DAG Node:    none
// Intent:      Verify JSVM callback behavior, fail-open telemetry and bounded public metric fields.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const helperPath = 'apps/pocketbase/pb_hooks/telemetry.js';
const hookPath = 'apps/pocketbase/pb_hooks/metrics.pb.js';
const helperSource = readFileSync(helperPath, 'utf8');
const hookSource = readFileSync(hookPath, 'utf8');

// Model the JSVM event contract. These are adapter tests, not a claim that a
// native PocketBase server or the private Datadog sink ran in this test suite.
function runtime(env = { BUILDANDDO_TELEMETRY_TRANSPORT: 'stdout', NODE_ENV: 'production' }) {
    const records = [];
    const hooks = {};
    const registrations = {};
    const priorities = {};
    const scope = {
        module: { exports: {} },
        $os: { getenv: (key) => env[key] || '' },
        console: { log: (line) => records.push(JSON.parse(line)) },
    };
    vm.runInNewContext(helperSource, scope, { filename: pathToFileURL(resolve(helperPath)).href });
    const hookScope = { __hooks: '/hooks', require: () => scope.module.exports,
        Middleware: function (definition) {
            assert.equal(typeof definition, 'object', 'Middleware requires a definition object');
            assert.equal(typeof definition.func, 'function');
            this.func = definition.func;
            this.priority = definition.priority ?? 0;
            assert.ok(Number.isInteger(this.priority));
        } };
    for (const hook of [
        'onRecordAfterCreateSuccess',
        'onRecordAfterUpdateSuccess',
        'onRecordAfterDeleteSuccess',
        'onRecordAfterCreateError',
        'onRecordAfterUpdateError',
        'onRecordAfterDeleteError',
        // 0.39.8 binds no onServe - global middleware registers through routerUse, which receives
        // the request directly rather than handing back a router to bind. Stubbing the old name
        // left routerUse undefined, so metrics.pb.js threw at load and every test in this file
        // failed on "routerUse is not defined" rather than on anything it asserts.
        'routerUse',
    ]) {
        hookScope[hook] = (handler) => {
            hooks[hook] = typeof handler === 'function' ? handler : handler.func;
            priorities[hook] = handler.priority || 0;
            registrations[hook] = (registrations[hook] || 0) + 1;
        };
    }
    vm.runInNewContext(hookSource, hookScope, { filename: pathToFileURL(resolve(hookPath)).href });
    return { records, hooks, registrations, priorities, scope, hookScope, telemetry: scope.module.exports };
}

function recordEvent(collection = 'missions') {
    let calls = 0;
    return {
        record: { collection: () => ({ name: collection }) },
        next: () => {
            calls++;
        },
        get calls() {
            return calls;
        },
    };
}

function requestEvent(
    path = '/api/collections/missions/records/record-123',
    method = 'PATCH',
    next = () => 'saved',
) {
    let status = 0;
    return {
        request: { url: { path }, method, header: { get: () => '' } }, next,
        status: () => status,
        written: () => status !== 0,
        json(code, value) { status = code; return value; },
        noContent(code) { status = code; },
    };
}

test('committed creates, updates and deletes emit one bounded counter each', () => {
    const { hooks, records } = runtime();
    for (const [hook, metric] of Object.entries({
        onRecordAfterCreateSuccess: 'created',
        onRecordAfterUpdateSuccess: 'updated',
        onRecordAfterDeleteSuccess: 'deleted',
    })) {
        const collection = hook === 'onRecordAfterUpdateSuccess' ? 'services' : 'missions';
        const event = recordEvent(collection);
        hooks[hook](event);
        assert.equal(event.calls, 1);
        assert.equal(records.at(-1).data.metric, `buildanddo.records.${metric}`);
        assert.equal(records.at(-1).data.value, 1);
        assert.equal(records.at(-1).data.tags.collection, collection);
        assert.equal(records.at(-1).data.tags.env, 'production');
    }
    assert.equal(records.length, 3);
});

test('failed writes are counted as errors and never as successful writes', () => {
    const { hooks, records } = runtime();
    for (const hook of [
        'onRecordAfterCreateError',
        'onRecordAfterUpdateError',
        'onRecordAfterDeleteError',
    ])
        hooks[hook](recordEvent());
    assert.equal(records.length, 3);
    assert.ok(
        records.every(
            (record) =>
                record.data.metric === 'buildanddo.records.errors' &&
                record.data.tags.outcome === 'failure',
        ),
    );
});

test('specialist desk counters and OCN request templates remain visible without record or login content', () => {
    const { hooks, telemetry, records } = runtime();
    hooks.onRecordAfterUpdateSuccess(recordEvent('specialist_desks'));
    assert.equal(records.length, 1);
    assert.equal(records[0].data.tags.collection, 'specialist_desks');
    for (const suffix of ['login', 'health']) {
        const event = requestEvent(`/api/ocn/${suffix}?token=private`, 'GET');
        event.next = () => event.json(503, { private: 'not exported' });
        telemetry.observeRequest(event);
        assert.equal(records.at(-1).data.tags.endpoint, `/api/ocn/${suffix}`);
        assert.equal(records.at(-1).data.tags.outcome, 'failure');
    }
    assert.doesNotMatch(JSON.stringify(records), /private|token/);
});

test('workflow run counters omit stored observations and receipt identifiers', () => {
    const { hooks, records } = runtime();
    const event = recordEvent('workflow_runs');
    event.record.snapshot = { name: 'Private procedure title' };
    event.record.events = [{ observation: 'Private outcome', evidence: 'receipt-private' }];
    hooks.onRecordAfterCreateSuccess(event);
    assert.equal(records.length, 1);
    assert.equal(records[0].data.tags.collection, 'workflow_runs');
    assert.equal(records[0].data.metric, 'buildanddo.records.created');
    assert.doesNotMatch(JSON.stringify(records), /Private|receipt-private/);
});

test('workflow command latency uses bounded endpoint names and preserves failed outcomes', () => {
    const { telemetry, records } = runtime();
    assert.equal(telemetry.observeRequest(requestEvent('/api/buildanddo/workflow-runs', 'POST')), 'saved');
    assert.equal(records[0].data.tags.endpoint, '/api/buildanddo/workflow-runs');
    const rejected = new Error('stale revision');
    assert.throws(() => telemetry.observeRequest(requestEvent('/api/buildanddo/workflow-runs/private-run-id/decisions', 'POST',
        () => { throw rejected; })), (error) => error === rejected);
    assert.equal(records[1].data.tags.endpoint, '/api/buildanddo/workflow-runs/:id/decisions');
    assert.equal(records[1].data.tags.outcome, 'failure');
    assert.equal(records[1].data.tags.collection, 'workflow_runs');
    assert.doesNotMatch(JSON.stringify(records), /private-run-id/);
});

test('unset transport configuration keeps registered middleware inert without changing requests', () => {
    const { hooks, records } = runtime({});
    const event = recordEvent();
    hooks.onRecordAfterCreateSuccess(event);
    assert.equal(event.calls, 1);
    assert.equal(hooks.routerUse(requestEvent()), 'saved');
    assert.equal(records.length, 0);
});

test('logging failures and helper load failures preserve the write result', () => {
    const { hooks, telemetry, scope } = runtime();
    scope.console.log = () => {
        throw new Error('sink unavailable');
    };
    const event = recordEvent();
    assert.doesNotThrow(() => hooks.onRecordAfterCreateSuccess(event));
    assert.equal(event.calls, 1);
    assert.equal(hooks.routerUse(requestEvent()), 'saved');
    assert.doesNotThrow(() => telemetry.record({}, 'create', false));
});

test('request timing normalizes record paths, with trace IDs outside metric tags', () => {
    const { telemetry, records } = runtime();
    const event = requestEvent();
    event.request.header.get = () => '00-' + '1'.repeat(32) + '-' + '2'.repeat(16) + '-01';
    assert.equal(telemetry.observeRequest(event), 'saved');
    const data = records[0].data;
    assert.equal(data.type, 'distribution');
    assert.ok(data.value >= 0);
    assert.equal(data.tags.endpoint, '/api/collections/missions/records/:id');
    assert.equal(data.context.trace_id, '1'.repeat(32));
    assert.equal(data.context.span_id, '2'.repeat(16));
    assert.ok(!JSON.stringify(data.tags).includes('record-123'));
    assert.ok(!JSON.stringify(data.tags).includes('111111'));
});

test('downstream errors are rethrown exactly once and timed as failures', () => {
    const { telemetry, records } = runtime();
    const failure = new Error('rejected');
    let calls = 0;
    const event = requestEvent(undefined, undefined, () => {
        calls++;
        throw failure;
    });
    assert.throws(
        () => telemetry.observeRequest(event),
        (error) => error === failure,
    );
    assert.equal(calls, 1);
    assert.equal(records.length, 1);
    assert.equal(records[0].data.tags.outcome, 'failure');
});

test('unknown paths and system collections get bounded request names, never record counters', () => {
    const { telemetry, records } = runtime();
    for (const path of [
        '/api/collections/users/records',
        '/api/collections/_superusers/auth-with-password',
        '/arbitrary/private-id',
        '/api/collections/missions/records/id/extra',
    ]) {
        assert.equal(telemetry.observeRequest(requestEvent(path)), 'saved');
    }
    telemetry.record(recordEvent('_logs'), 'create', false);
    telemetry.record(recordEvent(), 'invented', false);
    assert.equal(records.length, 4);
    assert.ok(records.every((record) => record.data.metric === 'buildanddo.request.duration_ms'));
    assert.doesNotMatch(JSON.stringify(records), /_superusers|private-id|\/id\/extra/);
    const event = requestEvent('/api/collections/missions/records', 'GET');
    event.request.header.get = () => 'private information';
    telemetry.observeRequest(event);
    assert.equal(records.length, 5);
    assert.deepEqual(records.at(-1).data.context, {});
    assert.equal(records.at(-1).data.tags.endpoint, '/api/collections/missions/records');
});

test('routerUse registers request timing exactly once, without an onServe compatibility fake', () => {
    const { hooks, registrations, records } = runtime();
    // Under routerUse there is no router to bind and nothing to delegate at registration time:
    // the callback IS the middleware and receives each request. What is still worth asserting is
    // that the hook registers one and only one of them, and that the one it registers observes.
    assert.equal(registrations.routerUse, 1);
    assert.equal(typeof hooks.routerUse, 'function');
    assert.equal(Object.hasOwn(hooks, 'onServe'), false);
    let calls = 0;
    const event = requestEvent(undefined, undefined, () => { calls++; return 'saved'; });
    assert.equal(hooks.routerUse(event), 'saved');
    assert.equal(calls, 1);
    assert.equal(records.length, 1);
    assert.equal(records[0].data.metric, 'buildanddo.request.duration_ms');
});

test('middleware registration uses a definition object rather than a positional constructor', () => {
    const { hooks, hookScope, priorities } = runtime();
    assert.equal(priorities.routerUse, -2000);
    const registered = new hookScope.Middleware({ func: hooks.routerUse, priority: -2000 });
    assert.equal(registered.func, hooks.routerUse);
    assert.equal(registered.priority, -2000);
    assert.throws(() => new hookScope.Middleware(hooks.routerUse, -2000), /definition object/);
});

test('router middleware loads the helper inside its isolated callback and preserves downstream errors', () => {
    const { hooks, telemetry, records } = runtime();
    const handler = vm.runInNewContext(`(${hooks.routerUse.toString()})`, {
        __hooks: '/native/hooks', require: (path) => {
            assert.equal(path, '/native/hooks/telemetry.js'); return telemetry;
        },
    });
    const failure = new Error('downstream failed');
    let calls = 0;
    assert.throws(() => handler(requestEvent(undefined, undefined, () => { calls++; throw failure; })), (error) => error === failure);
    assert.equal(calls, 1);
    assert.equal(records.length, 1);
    assert.equal(records[0].data.tags.outcome, 'failure');
});

test('an unsupported router registration fails instead of silently disabling telemetry', () => {
    const { hookScope } = runtime();
    delete hookScope.routerUse;
    assert.throws(() => vm.runInNewContext(hookSource, hookScope), /routerUse is not defined/);
});

test('missing helpers cannot stop record hooks or middleware', () => {
    const { hooks, hookScope, records } = runtime();
    hookScope.require = () => {
        throw new Error('helper unavailable');
    };
    for (const [name, callback] of Object.entries(hooks)) {
        if (name === 'routerUse') continue;
        const event = recordEvent();
        callback(event);
        assert.equal(event.calls, 1);
    }
    // With the helper unavailable the middleware must still pass the request through rather than
    // failing the request to protect a metric.
    let calls = 0;
    assert.equal(hooks.routerUse(requestEvent(undefined, undefined, () => { calls++; return 'saved'; })), 'saved');
    assert.equal(calls, 1);
    assert.equal(records.length, 0);
});

test('bad event shapes, methods and environments stay bounded', () => {
    const { telemetry, records, scope } = runtime({
        BUILDANDDO_TELEMETRY_TRANSPORT: 'stdout',
        DD_ENV: 'arbitrary-env',
    });
    assert.equal(telemetry.observeRequest({ next: () => 'uninspectable' }), 'uninspectable');
    assert.equal(telemetry.observeRequest(requestEvent(undefined, 'OPTIONS')), 'saved');
    const event = requestEvent();
    event.request.header.get = () => {
        throw new Error('header unavailable');
    };
    assert.equal(telemetry.observeRequest(event), 'saved');
    assert.equal(records[0].data.tags.env, 'other');
    assert.deepEqual(records[0].data.context, {});
    scope.$os.getenv = () => {
        throw new Error('environment unavailable');
    };
    telemetry.record(recordEvent(), 'create', false);
    assert.equal(telemetry.observeRequest(requestEvent()), 'saved');
    assert.equal(records.length, 3);
});

test('custom route families use source-owned templates and strip IDs, queries and fragments', () => {
    const { telemetry, records } = runtime();
    const routes = [
        ['/api/buildanddo/workspaces/person@example.invalid/assistant/chat?message=private#secret', '/api/buildanddo/workspaces/:workspace/assistant/chat'],
        ['/api/buildanddo/workspaces/private-workspace/knowledge/context', '/api/buildanddo/workspaces/:workspace/knowledge/context'],
        ['/api/buildanddo/workspaces/private-workspace/operator', '/api/buildanddo/workspaces/:workspace/operator'],
        ['/api/buildanddo/workspaces/private-workspace/classrooms/private-room/record', '/api/buildanddo/workspaces/:workspace/classrooms/:id/record'],
        ['/api/buildanddo/workspaces/private-workspace/research/private-result', '/api/buildanddo/workspaces/:workspace/research/:id'],
        ['/api/buildanddo/workspaces/private-workspace/decisions/private-decision', '/api/buildanddo/workspaces/:workspace/decisions/:id'],
        ['/api/buildanddo/workspaces/private-workspace/blueprints/analyze', '/api/buildanddo/workspaces/:workspace/blueprints/analyze'],
        ['/api/buildanddo/career/profile?email=person@example.invalid', '/api/buildanddo/career/profile'],
        ['/api/buildanddo/estate/fleet-status', '/api/buildanddo/estate/fleet-status'],
        ['/api/classroom/presence/health#private-fragment', '/api/classroom/presence/health'],
        ['/api/classroom/renegotiate', '/api/classroom/renegotiate'],
        ['/api/collections/users/records/private-person?expand=email', '/api/collections/users/records/:id'],
        ['/api/collections/private-collection/records/private-id', '/api/collections/:collection/records/:id'],
    ];
    for (const [path, template] of routes) {
        const event = requestEvent(path, 'PUT');
        event.next = () => event.json(202, { private: 'response-marker' });
        const result = telemetry.observeRequest(event);
        assert.equal(result.private, 'response-marker');
        assert.equal(records.at(-1).data.tags.endpoint, template, path);
        assert.equal(records.at(-1).data.tags.status_code, 202);
    }
    assert.equal(records.length, routes.length);
    assert.doesNotMatch(JSON.stringify(records), /person@|private-|response-marker|email|message=|#/);
});

test('unknown route values and methods collapse to a fixed fallback instead of becoming labels', () => {
    const { telemetry, records } = runtime();
    for (const path of [
        '/api/buildanddo/private-family/person@example.invalid',
        '/api/buildanddo/another-private-family/secret',
        '/api/classroom/private-action?secret=value',
        '/private-static-file.txt',
        '/api/collections/_logs/records/log-private-id',
        '/api/collections/users/auth-with-password',
    ]) telemetry.observeRequest(requestEvent(path, 'private-method'));
    assert.equal(records.length, 6);
    assert.equal(records[0].data.tags.endpoint, records[1].data.tags.endpoint);
    assert.ok(records.every((record) => record.data.tags.method === 'OTHER'));
    assert.doesNotMatch(JSON.stringify(records), /private|person@|secret|_logs|auth-with-password/);
});

for (const code of [204, 400, 401, 403, 404, 409, 429, 500, 503]) {
    test(`e.json status ${code} is observed once without consuming or resending its body`, () => {
        const { telemetry, records } = runtime();
        const event = requestEvent('/api/buildanddo/workspaces/private-workspace/assistant', 'POST');
        let contentReads = 0;
        const payload = { get content() { contentReads++; throw new Error('must not inspect response content'); } };
        for (const field of ['body', 'remoteAddr']) Object.defineProperty(event.request, field, {
            enumerable: true, get() { contentReads++; return 'private-content'; },
        });
        Object.defineProperty(event, 'auth', { get() { contentReads++; return { id: 'private-user' }; } });
        event.requestInfo = () => { contentReads++; return { body: payload }; };
        let sends = 0, nexts = 0;
        const json = event.json;
        event.json = (status, value) => { sends++; return json(status, value); };
        event.next = () => { nexts++; return event.json(code, payload); };
        assert.equal(telemetry.observeRequest(event), payload);
        assert.equal(sends, 1);
        assert.equal(nexts, 1);
        assert.equal(contentReads, 0);
        assert.equal(records.length, 1);
        assert.equal(records[0].data.tags.status_code, code);
        assert.equal(records[0].data.tags.outcome, code >= 400 ? 'failure' : 'success');
    });
}

for (const code of [400, 403, 429, 500, 503]) {
    test(`thrown ${code} keeps the original exception even when it contains private values`, () => {
        const { telemetry, records } = runtime();
        const failure = Object.freeze(Object.assign(new Error('private-person@example.invalid credential-marker'), { status: code }));
        let calls = 0;
        const event = requestEvent('/api/classroom/tracks', 'POST', () => { calls++; throw failure; });
        assert.throws(() => telemetry.observeRequest(event), (error) => error === failure);
        assert.equal(calls, 1);
        assert.equal(records.length, 1);
        assert.equal(records[0].data.tags.status_code, code);
        assert.equal(records[0].data.tags.outcome, 'failure');
        assert.doesNotMatch(JSON.stringify(records), /private|credential-marker/);
    });
}

test('non-JSON responses, written-then-thrown failures and unavailable status access remain truthful', () => {
    const { telemetry, records } = runtime();
    const event = requestEvent('/health', 'HEAD');
    event.next = () => event.noContent(204);
    assert.equal(telemetry.observeRequest(event), undefined);
    assert.equal(records[0].data.tags.status_code, 204);
    const error = Object.assign(new Error('after write'), { status: 503 });
    event.next = () => { event.json(202, null); throw error; };
    assert.throws(() => telemetry.observeRequest(event), (value) => value === error);
    assert.equal(records[1].data.tags.status_code, 202);
    assert.equal(records[1].data.tags.error_status, 503);
    assert.equal(records[1].data.tags.outcome, 'failure');
    event.status = () => { throw new Error('unavailable'); };
    event.next = () => 'unchanged';
    assert.equal(telemetry.observeRequest(event), 'unchanged');
    assert.equal(records[2].data.tags.status_code, 0);
    assert.equal(records[2].data.tags.outcome, 'unknown');
});

test('users and new application collections emit counts without reading personal record fields', () => {
    const { hooks, telemetry, records } = runtime();
    const collections = ['users', 'early_access', 'assistant_sessions', 'assistant_turns', 'assistant_patterns',
        'classroom_rooms', 'classroom_members', 'classroom_attendance', 'classroom_media_sessions', 'classroom_presence',
        'research_submissions', 'suite_runs', 'workspace_decisions', 'workspace_blueprints', 'government_memberships', 'wiki_pages', 'seat_events'];
    for (const collection of collections) {
        const event = recordEvent(collection);
        event.record.get = event.record.getString = () => { throw new Error('must not read record content'); };
        hooks.onRecordAfterCreateSuccess(event);
        assert.equal(event.calls, 1);
        assert.equal(records.at(-1)?.data.tags.collection, collection);
        assert.equal(records.at(-1)?.data.value, 1);
    }
    assert.equal(records.length, collections.length);
    telemetry.record(recordEvent('_logs'), 'create', false);
    for (const operation of ['constructor', 'toString', '__proto__']) telemetry.record(recordEvent('users'), operation, false);
    assert.equal(records.length, collections.length, 'logging must not count itself');
});

test('sink errors, unsafe status values and request inspection failures cannot replace application errors', () => {
    const { telemetry, records, scope } = runtime();
    const failure = Object.freeze({ status: 'private-status', message: 'credential-marker' });
    const event = requestEvent('/api/classroom/session', 'POST', () => { throw failure; });
    assert.throws(() => telemetry.observeRequest(event), (error) => error === failure);
    assert.equal(records[0].data.tags.status_code, 0, 'an opaque error has no observed HTTP status');
    scope.console.log = () => { throw new Error('logger failed'); };
    Object.defineProperty(event, 'request', { get: () => { throw new Error('inspection failed'); } });
    assert.throws(() => telemetry.observeRequest(event), (error) => error === failure);
});

test('transport is opt-in for every method and never invokes an HTTP transport', () => {
    for (const transport of ['', 'http', 'datadog', 'STDOUT']) {
        const { telemetry, records, scope } = runtime({ BUILDANDDO_TELEMETRY_TRANSPORT: transport });
        scope.$http = { send() { assert.fail('telemetry must never send HTTP'); } };
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
            const event = requestEvent('/api/classroom/session', method);
            event.next = () => event.json(503, null);
            assert.equal(telemetry.observeRequest(event), null);
        }
        assert.equal(records.length, 0);
    }
});

test('router telemetry runs outside early request rejections without bypassing them', () => {
    const { hooks, priorities, records } = runtime();
    assert.ok(priorities.routerUse < -1000, 'observe authorization and rate-limit middleware, not just the endpoint handler');
    const refusal = Object.freeze({ status: 403 });
    let reachedHandler = false;
    const stack = [
        { priority: priorities.routerUse, handler: hooks.routerUse },
        { priority: -1000, handler: () => { throw refusal; } },
        { priority: 0, handler: () => { reachedHandler = true; } },
    ].sort((a, b) => a.priority - b.priority);
    const event = requestEvent('/api/buildanddo/workspaces/private-workspace/assistant', 'POST');
    let index = 0;
    event.next = () => stack[index++].handler(event);
    assert.throws(() => event.next(), (error) => error === refusal);
    assert.equal(reachedHandler, false);
    assert.equal(records.length, 1);
    assert.equal(records[0].data.tags.status_code, 403);
});

test('request metrics and record counters cannot recurse through their own stdout sink', () => {
    const { telemetry, records, scope } = runtime();
    const write = scope.console.log;
    scope.console.log = (line) => {
        write(line);
        telemetry.record(recordEvent('_logs'), 'create', false);
        telemetry.record(recordEvent('missions'), 'create', false);
    };
    const event = requestEvent('/api/classroom/health', 'GET');
    event.next = () => event.json(503, null);
    assert.equal(telemetry.observeRequest(event), null);
    assert.equal(records.length, 1);
});

test('every inspected custom route registration has a static template, including collection-backed families', () => {
    const { telemetry, records } = runtime();
    // Read route declarations only; OCN signing/auth and private services are excluded.
    const files = ['administration', 'assistant', 'blueprint', 'business-execution', 'career-profile', 'classroom-presence',
        'classroom-realtime', 'classrooms', 'decision', 'dossier', 'estate', 'government', 'knowledge', 'operator',
        'research', 'suite', 'tutorial-learning', 'workflows', 'workspace-claims'];
    const routes = new Set();
    for (const file of files) {
        const source = readFileSync(`apps/pocketbase/pb_hooks/${file}.pb.js`, 'utf8');
        for (const match of source.matchAll(/routerAdd\('(?:GET|POST|PUT|PATCH|DELETE)', '([^']+)'/g)) routes.add(match[1]);
    }
    assert.ok(routes.size >= 40, 'exercise real declarations rather than an empty discovery result');
    for (const path of routes) {
        const template = path.replace(/\{workspace\}/g, ':workspace').replace(/\{[^}]+\}/g, ':id');
        const event = requestEvent(path.replace(/\{[^}]+\}/g, 'private-identifier') + '?private-query#private-fragment', 'GET');
        event.next = () => event.noContent(204);
        telemetry.observeRequest(event);
        assert.equal(records.at(-1).data.tags.endpoint, template, path);
    }
    assert.equal(records.length, routes.size);
    assert.doesNotMatch(JSON.stringify(records), /private-identifier|private-query|private-fragment/);
});

test('a failing clock in the final observation cannot replace the original exception', () => {
    const { telemetry, records, scope } = runtime();
    let calls = 0;
    scope.Date = { now() { if (++calls === 2) throw new Error('clock unavailable'); return 100; } };
    const failure = new Error('original failure');
    const event = requestEvent('/api/classroom/session', 'POST', () => { throw failure; });
    assert.throws(() => telemetry.observeRequest(event), (error) => error === failure);
    assert.equal(records.length, 0);
});

test('Goja GoError status comes from its native value without unwrapping or replacing the exception', () => {
    const { telemetry, records } = runtime();
    for (const status of [400, 403, 429, 503]) {
        const failure = Object.freeze(Object.assign(new Error('private native failure'), {
            name: 'GoError', value: Object.freeze({ status, message: 'private native message', data: { body: 'private body' } }),
        }));
        assert.throws(() => telemetry.observeRequest(requestEvent('/api/classroom/tracks', 'POST', () => { throw failure; })),
            (error) => error === failure);
        assert.equal(records.at(-1).data.tags.status_code, status);
        assert.equal(records.at(-1).data.tags.error_status, status);
    }
    assert.equal(records.length, 4);
    assert.doesNotMatch(JSON.stringify(records), /private|GoError/);
});

test('plain JS failures remain failures without guessing the HTTP mapping performed after middleware unwinds', () => {
    const { telemetry, records } = runtime();
    const failure = new TypeError('private body');
    const event = requestEvent('/api/buildanddo/learning/short', 'POST', () => { throw failure; });
    assert.throws(() => telemetry.observeRequest(event), (error) => error === failure);
    assert.equal(records[0].data.tags.outcome, 'failure');
    assert.equal(records[0].data.tags.error_status, 0);
    assert.equal(records[0].data.tags.status_code, 0);
    event.json(400, {}); // The outer native handler may map generic JS errors to 400, not 500.
    assert.equal(records.length, 1);
});
