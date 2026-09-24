// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/telemetry-runtime.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/observability/runtime.js, apps/web/src/hooks/useFailureTelemetry.js, apps/web/src/lib/navigationIntent.js, apps/web/src/App.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/observability/runtime.js; VALIDATES apps/web/src/hooks/useFailureTelemetry.js; CONSUMES apps/web/src/lib/navigationIntent.js; VALIDATES apps/web/src/App.jsx
// Intent:      Prove independent failure sinks, private section names and transition lifetimes without importing or contacting vendor SDKs.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as navigation from '../../apps/web/src/lib/navigationIntent.js';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function runtimeFixture() {
    const rum = [], product = [], errors = [], identity = [], counters = [];
    const fail = new Set();
    const sink = (kind, into) => (...args) => {
        if (fail.has(kind)) throw new Error(`private ${kind} collector detail`);
        if (fail.has(`${kind}_async`)) return Promise.reject(new Error('private rejection'));
        into.push(args);
    };
    const window = { location: { pathname: '/docs' } };
    const globals = { ...navigation, window, console, Promise,
        identifyRumUser: sink('rum_identity', identity), clearRumUser: () => identity.push(['rum_clear']),
        identifyTelemetryUser: sink('product_identity', identity), clearTelemetryUser: () => identity.push(['product_clear']),
        reportAction: sink('rum', rum), trackEvent: sink('product', product), reportError: sink('errors', errors),
        incrementCounter: (...args) => counters.push(args), isReporting: () => false,
        setGlobalProperty() {}, reportMetric() {}, networkSummary: () => ({ requests: 2 }),
    };
    const code = source('apps/web/src/lib/observability/runtime.js')
        .replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export \{[^}]+\};?$/gm, '').replace(/^export /gm, '');
    const module = { exports: {} };
    vm.runInNewContext(`${code}\nmodule.exports = { readFailed, trackRenderError, trackAuthIdentity, trackRouteChange, trackUnknownRoute };`,
        { ...globals, module }, { filename: 'runtime.js' });
    return { ...module.exports, rum, product, errors, identity, counters, fail, window };
}

test('shared failures reach both sinks with a bounded section, source and reason only', () => {
    const f = runtimeFixture();
    f.readFailed('/app/classrooms/private-room?q=private-email', 'knowledge', 'invalid_response', 200);
    assert.deepEqual(plain(f.rum), plain(f.product));
    assert.deepEqual(plain(f.rum[0]), ['section.failure', {
        section: '/app/classrooms/:room', source: 'knowledge', reason: 'invalid_response', outcome: 'failure', status_class: '2xx',
    }]);
    assert.equal(JSON.stringify(f.rum).includes('private'), false);
});

for (const [status, reason, outcome, statusClass] of [
    [401, 'forbidden', 'forbidden', '4xx'], [403, 'forbidden', 'forbidden', '4xx'],
    [409, 'conflict', 'conflict', '4xx'], [429, 'rate_limited', 'failure', '4xx'],
    [503, 'server_error', 'failure', '5xx'], [0, 'network', 'failure', 'network'],
]) test(`read status ${status} has a distinct safe failure classification`, () => {
    const f = runtimeFixture(); f.readFailed('/app/dossier', 'dossier', 'private error text', status);
    assert.deepEqual(plain(f.product[0][1]), { section: '/app/dossier', source: 'dossier', reason, outcome, status_class: statusClass });
});

test('unknown values and missing statuses cannot create personal or high-cardinality facets', () => {
    const f = runtimeFixture();
    for (const status of [undefined, NaN, '401', -1, 999, true]) {
        f.readFailed('/private-person-id?email=secret', 'private payload', 'private-error-message', status);
        assert.deepEqual(plain(f.product.at(-1)[1]), { section: '/unknown', source: 'records', reason: 'unavailable', outcome: 'failure', status_class: 'unknown' });
    }
});

test('stale reads and ordinary cancellation never become backend failures', () => {
    const f = runtimeFixture();
    for (const reason of ['scope_changed', 'cancelled']) f.readFailed('/app', 'records', reason, 0);
    assert.equal(f.rum.length + f.product.length, 0);
});

test('uncertain and degraded states are not represented as successful or empty reads', () => {
    const f = runtimeFixture();
    for (const reason of ['uncertain', 'degraded', 'unmeasured', 'invalid_receipt', 'disabled']) {
        f.readFailed('/app/edition', 'control_feedback', reason);
        assert.equal(f.product.at(-1)[1].reason, reason);
        assert.notEqual(f.product.at(-1)[1].outcome, 'success');
    }
});

for (const broken of ['rum', 'product', 'rum_async', 'product_async']) test(`a ${broken} collector failure cannot suppress the other sink`, async () => {
    const f = runtimeFixture(); f.fail.add(broken);
    assert.doesNotThrow(() => f.readFailed('/app', 'records'));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((broken.startsWith('rum') ? f.product : f.rum).length, 1);
});

test('render failures reach product analytics even when Datadog is disabled', () => {
    const f = runtimeFixture(), error = new Error('Private document content');
    f.window.location.pathname = '/reset-password/private-token';
    f.trackRenderError(error, { page: 'Private document title', componentStack: 'Private component text' });
    assert.equal(f.product[0][0], 'section.render_error');
    assert.equal(f.product[0][1].section, '/reset-password/:token');
    assert.equal(f.product[0][1].page, '/reset-password/:token');
    assert.equal(JSON.stringify(f.product).includes('Private'), false);
    assert.equal(f.errors[0][0], error, 'SDK redaction retains the original exception for its bounded stack handling');
    f.fail.add('errors'); f.trackRenderError(error, { page: 'Workspace shell', section: '/app' });
    assert.equal(f.product.at(-1)[1].page, 'workspace_shell');
});

test('product and RUM identities are independent of reporting and of each other', () => {
    const f = runtimeFixture(), user = { id: 'native123' };
    f.trackAuthIdentity(null);
    assert.deepEqual(f.identity, [['product_clear'], ['rum_clear']], 'first anonymous render clears persisted SDK identity');
    f.identity.length = 0; f.fail.add('rum_identity');
    f.trackAuthIdentity(user); f.trackAuthIdentity(user);
    assert.equal(f.identity.length, 2, 'the product adapter owns identity deduplication and can retry a failed initialization');
    f.trackAuthIdentity(null); f.trackAuthIdentity(null);
    assert.deepEqual(f.identity.slice(-2), [['product_clear'], ['rum_clear']]);
    assert.equal(f.identity.filter(([value]) => value === 'product_clear').length, 1);
});

test('route actions have private templates and unknown-route reports never contain the attempted URL', () => {
    const f = runtimeFixture();
    f.trackRouteChange({ from: '/guild/private-name', to: '/reset-password/private-token', dwellMs: 10, search: '?token=private' });
    assert.equal(f.product[0][1].from_route, '/guild/:slug');
    assert.equal(f.product[0][1].route, '/reset-password/:token');
    assert.equal(f.product[0][1].has_query, true);
    f.trackUnknownRoute();
    assert.deepEqual(plain(f.product[1]), ['route.not_found', { section: '/unknown', outcome: 'failure', reason: 'not_found' }]);
    assert.equal(JSON.stringify(f.product).includes('private'), false);
});

test('rendered failure tracking deduplicates rerenders but observes recovery, retry and section changes', () => {
    const calls = [], emitted = { current: '' }, window = { location: { pathname: '/app/knowledge' } };
    const module = { exports: {} };
    const code = source('apps/web/src/hooks/useFailureTelemetry.js').replace(/^import .+;$/gm, '').replace(/^export /gm, '');
    vm.runInNewContext(`${code}\nmodule.exports = { useFailureTelemetry };`, { module, window, ...navigation,
        useRef: () => emitted, useEffect: (effect) => effect(), readFailed: (...args) => calls.push(args) });
    const hook = module.exports.useFailureTelemetry;
    hook(true, 'control_state'); hook(true, 'control_state');
    assert.equal(calls.length, 1, 'includes StrictMode effect replay');
    hook(false, 'control_state'); hook(true, 'control_state');
    assert.equal(calls.length, 2);
    hook(true, 'control_state', 'forbidden', 403);
    assert.equal(calls.length, 3);
    hook(true, 'control_state', 'forbidden', 403, '/app/classrooms/private');
    assert.equal(calls.at(-1)[0], '/app/classrooms/:room');
});

test('public routes, workspace shell and catch-all use the shared named failure boundaries', () => {
    const app = source('apps/web/src/App.jsx');
    assert.match(app, /<Route element=\{<PublicPageBoundary \/>\}>/);
    assert.match(app, /<PageBoundary name="Workspace shell" section="\/app">/);
    assert.match(app, /<Route path="\*" element=\{<UnknownRoute \/>\} \/>/);
    for (const path of ['WorkspaceNotices.jsx', 'ControlPrimitives.jsx']) {
        const text = source(`apps/web/src/components/workspace/${path}`);
        assert.match(text, /useFailureTelemetry\(/);
        assert.doesNotMatch(text, /readFailed\([^;]*(?:message|writeError)\s*[,)]/);
    }
});

test('control notices preserve actual read classification and never turn cancellation into an outage', () => {
    const text = source('apps/web/src/components/workspace/ControlPrimitives.jsx');
    const start = text.indexOf('export function ControlState({ control, children }) {');
    const code = text.slice(start, text.indexOf('    if (control.loading)', start)).replace('export ', '') + '}';
    const f = runtimeFixture(), window = f.window, module = { exports: {} };
    vm.runInNewContext(`${code}\nmodule.exports = ControlState;`, { module, useFailureTelemetry: (active, source, reason, status) => {
        if (active) f.readFailed(window.location.pathname, source, reason, status);
    } });
    for (const [reason, status] of [['unavailable', 403], ['invalid_response', 200], ['cancelled', 0]]) {
        module.exports({ control: { loading: false, demo: false, error: 'Private detail', readFailure: { reason, status } } });
    }
    assert.equal(f.product.length, 2);
    assert.equal(f.product[0][1].reason, 'forbidden');
    assert.equal(f.product[0][1].status_class, '4xx');
    assert.equal(f.product[1][1].reason, 'invalid_response');
});
