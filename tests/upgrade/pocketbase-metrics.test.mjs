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
    const scope = {
        module: { exports: {} },
        $os: { getenv: (key) => env[key] || '' },
        console: { log: (line) => records.push(JSON.parse(line)) },
    };
    vm.runInNewContext(helperSource, scope, { filename: pathToFileURL(resolve(helperPath)).href });
    const hookScope = { __hooks: '/hooks', require: () => scope.module.exports };
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
        hookScope[hook] = (callback) => {
            hooks[hook] = callback;
            registrations[hook] = (registrations[hook] || 0) + 1;
        };
    }
    vm.runInNewContext(hookSource, hookScope, { filename: pathToFileURL(resolve(hookPath)).href });
    return { records, hooks, registrations, scope, hookScope, telemetry: scope.module.exports };
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
    return { request: { url: { path }, method, header: { get: () => '' } }, next };
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

test('unset configuration silently disables counters and middleware', () => {
    const { hooks, telemetry, records } = runtime({});
    const event = recordEvent();
    hooks.onRecordAfterCreateSuccess(event);
    assert.equal(event.calls, 1);
    assert.equal(telemetry.observeRequest(requestEvent()), 'saved');
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
    assert.equal(telemetry.observeRequest(requestEvent()), 'saved');
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

test('auth, system collections, arbitrary paths, query values and invalid trace headers do not become tags', () => {
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
    telemetry.record(recordEvent('users'), 'create', false);
    telemetry.record(recordEvent(), 'invented', false);
    assert.equal(records.length, 0);
    const event = requestEvent('/api/collections/missions/records', 'GET');
    event.request.header.get = () => 'private information';
    telemetry.observeRequest(event);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].data.context, {});
    assert.equal(records[0].data.tags.endpoint, '/api/collections/missions/records');
});

test('middleware registers exactly once and times the request it receives', () => {
    const { hooks, registrations, records } = runtime();
    // Under routerUse there is no router to bind and nothing to delegate at registration time:
    // the callback IS the middleware and receives each request. What is still worth asserting is
    // that the hook registers one and only one of them, and that the one it registers observes.
    assert.equal(registrations.routerUse, 1);
    assert.equal(typeof hooks.routerUse, 'function');
    assert.equal(hooks.routerUse(requestEvent()), 'saved');
    assert.equal(records.length, 1);
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
    assert.equal(hooks.routerUse(requestEvent()), 'saved');
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
    assert.equal(records.length, 1);
});
