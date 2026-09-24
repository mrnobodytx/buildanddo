// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/telemetry-browser.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/telemetry.js, apps/web/src/lib/datadogRum.js, apps/web/src/lib/navigationIntent.js, apps/web/src/lib/observability/network.js, apps/web/src/lib/observability/vitals.js, apps/web/src/lib/observability/context.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/telemetry.js; VALIDATES apps/web/src/lib/datadogRum.js; VALIDATES apps/web/src/lib/navigationIntent.js; VALIDATES apps/web/src/lib/observability/network.js; VALIDATES apps/web/src/lib/observability/vitals.js; CONSUMES apps/web/src/lib/observability/context.js
// Intent:      Exercise browser privacy and collection lifetimes with both vendors, transport, clocks and browser events replaced by offline doubles.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as navigation from '../../apps/web/src/lib/navigationIntent.js';

const root = new URL('../../apps/web/src/', import.meta.url);
const plain = (value) => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let fixtureSequence = 0;

function target() {
    const listeners = new Map();
    return {
        listeners,
        addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
        removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
        dispatch(name, event = {}) { for (const handler of [...(listeners.get(name) || [])]) handler(event); },
        count(name) { return listeners.get(name)?.size || 0; },
    };
}

function fixture(env = {}) {
    const calls = [], events = [], metrics = [], logs = [], actions = [], observers = [], timers = new Map(), failures = new Set();
    let clock = 0, sequence = 0, heapReads = 0;
    const page = ++fixtureSequence;
    let anonymousSequence = 0;
    const anonymousId = () => `sdk-anonymous-${page}-${++anonymousSequence}`;
    const document = Object.assign(target(), { visibilityState: 'visible', readyState: 'complete', title: 'private-document-title' });
    const location = new URL('https://fixture.invalid/app/tutorials?lesson=private-lesson#private-fragment');
    const window = Object.assign(target(), { document, location,
        setInterval(callback) { const id = ++sequence; timers.set(id, callback); return id; },
        clearInterval(id) { timers.delete(id); },
    });
    const performance = { now: () => clock, getEntriesByType: () => [{ type: 'reload' }],
        get memory() { heapReads++; return { usedJSHeapSize: 10000, jsHeapSizeLimit: 20000 }; } };
    const invoke = (name, args = []) => { calls.push([name, ...args]); if (failures.has(name)) throw new Error(`fixture ${name} failure`); };
    const posthog = {
        config: null, optedOut: false, userId: null, distinctId: null, deviceId: null, persisted: {},
        get_config(key) { return this.config?.[key]; },
        get_property(key) { return { $user_id: this.userId, distinct_id: this.distinctId, $device_id: this.deviceId }[key]; },
        has_opted_out_capturing() { return this.optedOut; },
        init(key, config) {
            invoke('posthog.init', [key]); this.config = { ...config, token: key };
            // Model the public persistence contract, not an auth implementation:
            // memory never loads the previous document's persisted identity.
            const stored = config.persistence === 'memory' ? {} : this.persisted;
            this.userId = stored.$user_id || null;
            this.distinctId = stored.distinct_id || anonymousId();
            this.deviceId = stored.$device_id || this.distinctId;
            if (config.capture_pageview) this.capture('$pageview');
            return this;
        },
        set_config(config) { invoke('posthog.set_config'); this.config = { ...this.config, ...config }; },
        capture(name, properties = {}) {
            invoke('posthog.capture', [name, properties]);
            if (this.optedOut) return;
            const event = { event: name, properties: { $current_url: window.location.href, $pathname: window.location.pathname,
                $title: document.title, $search_keyword: 'private-search', distinct_id: this.distinctId,
                $device_id: this.deviceId, ...(this.userId ? { $user_id: this.userId } : {}), $is_identified: Boolean(this.userId),
                ...properties, token: this.config?.token } };
            const scrubbed = this.config?.before_send ? this.config.before_send(event) : event;
            if (scrubbed) events.push(scrubbed);
        },
        identify(...args) {
            invoke('posthog.identify', args);
            const previous = this.distinctId, wasAnonymous = !this.userId;
            this.userId = args[0]; this.distinctId = args[0];
            if (wasAnonymous && previous !== this.distinctId) this.capture('$identify', { $anon_distinct_id: previous });
        },
        reset(...args) { invoke('posthog.reset', args); this.userId = null; this.distinctId = anonymousId(); },
    };
    const vendor = (name) => ({ config: null,
        getInitConfiguration() { return this.config; },
        init(config) { invoke(`${name}.init`); this.config = config; },
        setUser(user) { invoke(`${name}.setUser`, [user]); },
        clearUser() { invoke(`${name}.clearUser`); },
    });
    const datadogRum = vendor('rum'), datadogLogs = vendor('logs');
    const reportMetric = (name, value, options) => { invoke('reportMetric'); metrics.push({ name, value, ...plain(options) }); };
    const reportLog = (...args) => { invoke('reportLog'); logs.push(plain(args)); };
    const reportAction = (...args) => { invoke('reportAction'); actions.push(plain(args)); };
    const PerformanceObserver = class {
        static supportedEntryTypes = ['paint', 'largest-contentful-paint', 'layout-shift', 'event', 'longtask', 'resource'];
        constructor(callback) { this.callback = callback; this.pending = []; observers.push(this); }
        observe(options) { this.options = options; }
        takeRecords() { return this.pending.splice(0); }
        disconnect() { this.disconnected = true; }
    };
    const f = { calls, events, metrics, logs, actions, observers, timers, failures, posthog, datadogRum, datadogLogs, window, document, performance,
        fetchCalls: [], transport: () => Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })),
        advance(ms) { clock += ms; },
        tick() { for (const callback of [...timers.values()]) callback(); },
        visibility(value) { document.visibilityState = value; document.dispatch('visibilitychange'); },
        entries(type, entries, queued = false) {
            for (const observer of observers.filter((value) => !value.disconnected && value.options.type === type)) {
                if (queued) observer.pending.push(...entries); else observer.callback({ getEntries: () => entries });
            }
        },
        get heapReads() { return heapReads; },
        count(name) { return calls.filter(([value]) => value === name).length; },
    };
    window.fetch = function (...args) { f.fetchCalls.push({ receiver: this, args }); return f.transport(...args); };
    const globals = { window, document, navigator: { webdriver: true, sendBeacon() { assert.fail('No outbound beacon is allowed'); } },
        performance, PerformanceObserver, URL, Request, Response, Headers, AbortController, console,
        fetch: (...args) => window.fetch(...args), XMLHttpRequest: class { constructor() { assert.fail('No real transport is allowed'); } },
        posthog, datadogRum, datadogLogs, ...navigation,
        BROWSER_TELEMETRY: { site: 'us5.datadoghq.com', service: 'fixture', sessionSampleRate: 0, sessionReplaySampleRate: 0, traceSampleRate: 0 },
        resolveSampleRate: (_key, fallback) => fallback,
        navigationType: () => 'reload', networkSummary: () => ({ requests: 0, failures: 0, error_rate_pct: 0, offline_events: 0 }),
        enableReporting: () => invoke('enableReporting'), incrementCounter: (...args) => invoke('incrementCounter', args),
        reportMetric, reportLog, reportAction, metricSnapshot: () => ({ observed_samples: metrics.length }),
        __env: { MODE: 'fixture', VITE_BUILDANDDO_PH: 'fixture-project', VITE_DD_APPLICATION_ID: 'fixture-app',
            VITE_DD_CLIENT_TOKEN: 'fixture-client', ...env },
    };
    // Only module linking and Vite's environment are replaced. No vendor package
    // is imported, and the production functions execute in an isolated browser.
    f.load = (relative) => {
        const filename = fileURLToPath(new URL(relative, root));
        const source = readFileSync(filename, 'utf8');
        const names = [...source.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((match) => match[1]);
        const code = source.replace(/^import\s[\s\S]*?;\s*$/gm, (statement) => statement.replace(/[^\n]/g, '')).replaceAll('import.meta.env', '__env')
            .replace(/^export (?=(?:async )?(?:function|const)\b)/gm, '');
        const module = { exports: {} };
        vm.runInNewContext(`${code}\nmodule.exports = { ${names.join(', ')} };`, { ...globals, module }, { filename });
        return module.exports;
    };
    const { resolveEnvironment, resolveRelease } = f.load('lib/observability/context.js');
    Object.assign(globals, { resolveEnvironment, resolveRelease });
    f.navigator = globals.navigator;
    return f;
}

test('section names cover the actual static App routes and collapse dynamic or unknown paths', () => {
    assert.equal(typeof navigation.telemetrySection, 'function');
    const source = readFileSync(new URL('App.jsx', root), 'utf8');
    const publicPaths = [...source.matchAll(/path="(\/[^"?:]*)"/g)].map((match) => match[1]);
    const workspacePaths = [...source.matchAll(/\{ path: '([^':?]+)'/g)].map((match) => `/app/${match[1]}`);
    for (const path of [...publicPaths, ...workspacePaths, '/reset-password', '/app/rooms']) {
        assert.equal(navigation.telemetrySection(`${path}?q=private-search#private-fragment`), path);
    }
    for (const [path, expected] of [['/app/classrooms/short-slug', '/app/classrooms/:room'], ['/guild/private-name', '/guild/:slug'],
        ['/app/rooms/private-name', '/app/rooms/:room'], ['/reset-password/private-token', '/reset-password/:token'],
        ['/app/private-workspace-name', '/unknown'], ['/app/missions/private-mission', '/unknown'],
        ['/arbitrary-private-slug', '/unknown'], ['https://fixture.invalid/guild/a%2Fb?q=x', '/guild/:slug']]) {
        assert.equal(navigation.telemetrySection(path), expected);
    }
    for (const value of [null, {}, '', 'http://[', 'javascript:private-token', 'private-name']) assert.equal(navigation.telemetrySection(value), '/unknown');
});

test('location redaction drops every query, fragment and credential and never echoes malformed URLs', () => {
    for (const [raw, expected] of [
        ['/docs?guide=private-search#private-fragment', '/docs'],
        ['/app/tutorials?lesson=private-lesson&choice=2', '/app/tutorials'],
        ['https://private-user:private-password@fixture.invalid/reset-password/private-token?Token=x#access_token=x', 'https://fixture.invalid/reset-password/:token'],
        ['/hcgi/platform/api/buildanddo/workspaces/short/classrooms/short/record?query=private-search', '/hcgi/platform/api/buildanddo/workspaces/:workspace/classrooms/:room/record'],
        ['/api/buildanddo/learning/short#private-choice', '/api/buildanddo/learning/:tutorial'],
        ['/api/collections/private-collection/records/short?filter=private-search', '/api/collections/:collection/records/:record'],
        ['/unknown-private-slug?email=private-email', '/unknown'], ['http://[private-token', '/unknown'],
        ['data:text/html,private-text', '/unknown'],
    ]) assert.equal(navigation.classroomTelemetryLocation(raw), expected);
    assert.equal(navigation.classroomTelemetryLocation(null), null);
});

test('PostHog property scrubbing covers persisted URLs, page-leave locations, DOM and personal content', () => {
    const event = { event: '$pageview', properties: {
        $current_url: '/app/missions?q=private-query', $prev_pageview_pathname: '/guild/private-person',
        $referrer: 'https://search.example/search?q=private-query#private-fragment',
        $set: { email: 'private-email', name: 'private-name', $initial_current_url: '/reset-password/private-token?code=private-code' },
        $set_once: { $initial_pathname: '/app/classrooms/private-room', $initial_search_keyword: 'private-search' },
        $elements: [{ text: 'private-name', attr__href: '/app?q=private-query' }], $elements_chain: 'private-name',
        $title: 'private-title', $search_keyword: 'private-search', utm_campaign: 'private-campaign',
        mission_name: 'private-mission', workspace_name: 'private-workspace', lesson: 'private-lesson', choice: 2,
        nested: { href: '/app/tutorials?lesson=private-lesson', token: 'private-token', email: 'private-email' },
        outcome: 'success', count: 2,
    } };
    assert.equal(navigation.scrubClassroomProperties(event), event);
    assert.doesNotMatch(JSON.stringify(event), /private-/);
    assert.equal(event.properties.outcome, 'success');
    assert.equal(event.properties.count, 2);
    assert.equal(event.properties.choice, undefined);
    assert.equal(navigation.scrubClassroomProperties(null), null);
});

test('product initialization delegates one initial and subsequent SPA pageview to history_change', () => {
    const f = fixture(), product = f.load('lib/telemetry.js');
    product.initTelemetry(); product.initTelemetry();
    const config = f.posthog.config;
    assert.equal(config.capture_pageview, 'history_change');
    assert.equal(config.autocapture, false);
    assert.equal(config.disable_session_recording, true);
    assert.equal(config.person_profiles, 'identified_only');
    assert.equal(f.count('posthog.init'), 1);
    assert.equal(f.events.filter((event) => event.event === '$pageview').length, 1);
    f.window.location = new URL('https://fixture.invalid/app/classrooms/private-room?q=private-query');
    // The SDK's history listener owns this event, not a manual route capture.
    f.posthog.capture('$pageview');
    assert.equal(f.events.length, 2);
    assert.doesNotMatch(JSON.stringify(f.events), /private-/);
    assert.equal(f.events[1].properties.section, '/app/classrooms/:room');
    assert.equal(f.events[1].properties.nav_type, 'reload');
    assert.equal(f.events[1].properties.browser_automated, true);
    product.trackEvent('section.failure', { section: '/app/missions' });
    assert.equal(f.events.at(-1).properties.section, '/app/missions', 'a bounded operation section survives navigation');
});

test('product identities are ID-only, deduplicated and reset between accounts and on logout', () => {
    const f = fixture(), product = f.load('lib/telemetry.js'); product.initTelemetry();
    assert.equal(typeof product.identifyTelemetryUser, 'function');
    const user = { id: 'member-one', email: 'private-email', name: 'private-name' };
    product.identifyTelemetryUser(user); product.identifyTelemetryUser({ ...user });
    product.identifyTelemetryUser({ ...user, id: 'member-two' }); product.clearTelemetryUser();
    assert.deepEqual(plain(f.calls.filter(([name]) => /posthog\.(identify|reset)/.test(name))), [
        ['posthog.identify', 'member-one'], ['posthog.reset'], ['posthog.identify', 'member-two'], ['posthog.reset'],
    ]);
});

test('missing keys and test mode cannot initialize either vendor or send identity/events', () => {
    for (const env of [{ VITE_BUILDANDDO_PH: '', VITE_DD_APPLICATION_ID: '', VITE_DD_CLIENT_TOKEN: '' }, { MODE: 'test' }]) {
        const f = fixture(env), product = f.load('lib/telemetry.js'), dd = f.load('lib/datadogRum.js');
        product.initTelemetry(); dd.initDatadogRum();
        product.trackEvent('fixture.event', { email: 'private-email' });
        product.identifyTelemetryUser?.({ id: 'member' }); product.clearTelemetryUser?.();
        dd.identifyRumUser({ id: 'member' }); dd.clearRumUser();
        assert.equal(f.calls.length, 0); assert.equal(f.fetchCalls.length, 0);
    }
});

test('product init, capture, identify and reset failures are individually fail-soft and retryable', () => {
    const f = fixture(), product = f.load('lib/telemetry.js');
    f.failures.add('posthog.init'); assert.doesNotThrow(() => product.initTelemetry());
    f.failures.clear(); product.initTelemetry();
    for (const [method, operation] of [['capture', () => product.trackEvent('fixture.event')],
        ['identify', () => product.identifyTelemetryUser({ id: 'member' })], ['reset', () => product.clearTelemetryUser()]]) {
        f.failures.add(`posthog.${method}`); assert.doesNotThrow(operation); f.failures.clear(); assert.doesNotThrow(operation);
    }
    assert.equal(f.count('posthog.init'), 2);
    assert.equal(f.count('posthog.identify'), 2);
});

test('product opt-out survives identity clearing and does not get overridden by initialization', () => {
    const f = fixture(), product = f.load('lib/telemetry.js');
    f.posthog.optedOut = true; product.initTelemetry();
    product.trackEvent('fixture.event'); product.identifyTelemetryUser({ id: 'member' }); product.clearTelemetryUser();
    assert.equal(f.count('posthog.identify'), 0); assert.equal(f.events.length, 0);
    assert.equal(f.posthog.optedOut, true);
    assert.notEqual(f.posthog.config.opt_out_capturing_by_default, false);
    assert.equal(f.posthog.config.respect_dnt, true);
});

test('reloading product instrumentation does not initialize an already configured SDK twice', () => {
    const f = fixture(); f.load('lib/telemetry.js').initTelemetry(); f.load('lib/telemetry.js').initTelemetry();
    assert.equal(f.count('posthog.init'), 1);
    assert.equal(f.events.filter((event) => event.event === '$pageview').length, 1);
});

test('Datadog uses masked replay and private action names with same-origin API-only propagation', () => {
    const f = fixture(), dd = f.load('lib/datadogRum.js'); dd.initDatadogRum(); dd.initDatadogRum();
    assert.equal(f.datadogRum.config.defaultPrivacyLevel, 'mask');
    assert.equal(f.datadogRum.config.enablePrivacyForActionName, true);
    const match = f.datadogRum.config.allowedTracingUrls[0].match;
    for (const value of ['/hcgi/platform/api/classroom/health', 'https://fixture.invalid/api/buildanddo/learning']) assert.equal(match(value), true, value);
    for (const value of ['//intake.example/api/health', 'https://fixture.invalid.evil/api/health', '/analytics/batch', '/assets/app.js', 'data:private']) assert.equal(match(value), false, value);
    assert.equal(f.count('rum.init'), 1); assert.equal(f.count('logs.init'), 1);
});

test('Datadog initialization failures do not prevent the other sink, retries or application rendering', () => {
    for (const failed of ['rum', 'logs']) {
        const f = fixture(), dd = f.load('lib/datadogRum.js');
        f.failures.add(`${failed}.init`); assert.doesNotThrow(() => dd.initDatadogRum());
        assert.equal(f.count(`${failed === 'rum' ? 'logs' : 'rum'}.init`), 1);
        f.failures.clear(); dd.initDatadogRum();
        assert.equal(f.count(`${failed}.init`), 2);
        assert.equal(f.count(`${failed === 'rum' ? 'logs' : 'rum'}.init`), 1);
    }
});

test('Datadog identity and clearing are ID-only and each sink fails independently', () => {
    const f = fixture(), dd = f.load('lib/datadogRum.js'); dd.initDatadogRum();
    f.failures.add('rum.setUser'); assert.doesNotThrow(() => dd.identifyRumUser({ id: 'member', name: 'private-name', email: 'private-email' }));
    assert.deepEqual(plain(f.calls.find(([name]) => name === 'logs.setUser')), ['logs.setUser', { id: 'member' }]);
    f.failures.add('rum.clearUser'); assert.doesNotThrow(() => dd.clearRumUser()); assert.equal(f.count('logs.clearUser'), 1);
    assert.doesNotMatch(JSON.stringify(f.calls), /private-/);
});

test('Datadog egress redacts view, error and log URLs and automatic action labels', () => {
    const f = fixture(), dd = f.load('lib/datadogRum.js'); dd.initDatadogRum();
    const event = { type: 'error', view: { name: '/guild/private-name', url: 'https://fixture.invalid/app/missions?q=private-search#private',
        referrer: 'https://search.example/search?q=private-search' },
        error: { message: 'Failed request', resource: { url: '/reset-password/private-token?code=private-code' } },
        context: { route: '/app/classrooms/private-room', email: 'private-email', lesson: 'private-lesson' },
        usr: { id: 'member', email: 'private-email', name: 'private-name' } };
    assert.equal(f.datadogRum.config.beforeSend(event), true);
    assert.doesNotMatch(JSON.stringify(event), /private-/);
    const action = { type: 'action', action: { type: 'click', target: { name: 'private-mission-name' } } };
    assert.equal(f.datadogRum.config.beforeSend(action), true); assert.equal(action.action.target.name, 'click');
    const log = { message: 'Read failed', http: { url: '/app/tutorials?q=private-query#private-fragment' },
        usr: { id: 'member', email: 'private-email', name: 'private-name' } };
    assert.equal(f.datadogLogs.config.beforeSend(log), true); assert.doesNotMatch(JSON.stringify(log), /private-/);
});

test('RUM excludes vendor intake and unknown same-origin proxies rather than measuring telemetry', () => {
    const f = fixture(); f.load('lib/datadogRum.js').initDatadogRum();
    const beforeSend = f.datadogRum.config.beforeSend;
    for (const url of ['https://us.i.posthog.com/e/', 'https://browser-intake-us5-datadoghq.com/api/v2/rum',
        '/ingest/e', '/analytics/batch', '/api/telemetry']) assert.equal(beforeSend({ type: 'resource', resource: { url } }), false, url);
    for (const url of ['/hcgi/platform/api/classroom/health', '/assets/app-123.js', '/platform-health.json']) {
        assert.equal(beforeSend({ type: 'resource', resource: { url } }), true, url);
    }
});

test('network telemetry uses route templates for short IDs and preserves the exact response and fetch arguments', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'); network.startNetworkTelemetry();
    const response = new Response('{}', { headers: { 'content-type': 'application/json' } });
    f.transport = () => Promise.resolve(response);
    const input = new Request('https://fixture.invalid/hcgi/platform/api/buildanddo/workspaces/short/classrooms/small/presence?room=private-room');
    const init = { method: 'POST', body: 'private-body', headers: { Authorization: 'fixture-credential' } }, receiver = {};
    assert.equal(await f.window.fetch.call(receiver, input, init), response);
    assert.equal(response.bodyUsed, false);
    assert.equal(f.fetchCalls[0].receiver, receiver); assert.equal(f.fetchCalls[0].args[0], input); assert.equal(f.fetchCalls[0].args[1], init);
    assert.equal(f.metrics[0].tags.endpoint, '/hcgi/platform/api/buildanddo/workspaces/:workspace/classrooms/:room/presence');
    assert.equal(f.metrics[0].tags.method, 'POST');
    assert.doesNotMatch(JSON.stringify(f.metrics), /private-|short|small|fixture-credential/);
    assert.equal(network.networkSummary().requests, 1);
});

test('network collection skips vendors, telemetry proxies, assets and unregistered endpoints', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'); network.startNetworkTelemetry();
    for (const url of ['https://us.i.posthog.com/e/', '//browser-intake-us5-datadoghq.com/api/v2/rum',
        'https://other.example/api/health', '/analytics/batch', '/api/telemetry', '/hcgi/analytics/api/health',
        '/hcgi/platform/api/unknown/private-name', '/assets/app.js', '/app', 'data:application/json,{}']) {
        const reply = Promise.resolve(new Response('{}')); f.transport = () => reply;
        assert.equal(f.window.fetch(url), reply, `skip without wrapping ${url}`);
        await reply;
    }
    assert.equal(network.networkSummary().requests, 0); assert.equal(f.metrics.length, 0);
    await f.window.fetch('/platform-health.json'); assert.equal(network.networkSummary().requests, 1);
});

test('a successful HTML fallback for expected JSON is invalid_response without reading or changing its body', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'); network.startNetworkTelemetry();
    const response = new Response('<html>private-body</html>', { headers: { 'content-type': 'Text/HTML; charset=UTF-8' } });
    f.transport = () => Promise.resolve(response);
    const returned = await f.window.fetch('/hcgi/platform/api/classroom/health');
    assert.equal(returned, response); assert.equal(response.bodyUsed, false); assert.equal(network.networkSummary().failures, 1);
    assert.equal(f.metrics[0].tags.status, 200); assert.equal(f.metrics[0].tags.status_class, 'invalid_response');
    assert.doesNotMatch(JSON.stringify(f.metrics), /private-body/);
    assert.equal(await returned.text(), '<html>private-body</html>');
});

test('JSON, empty responses and HEAD retain HTTP semantics without speculative body parsing', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'); network.startNetworkTelemetry();
    for (const [method, status, type, body] of [['GET', 200, 'application/problem+json', 'not parsed here'],
        ['DELETE', 204, '', null], ['GET', 205, '', null], ['HEAD', 200, 'text/html', null], ['GET', 503, 'text/html', 'unavailable']]) {
        const response = new Response(body, { status, headers: { 'content-type': type } }); f.transport = () => Promise.resolve(response);
        assert.equal(await f.window.fetch('/api/collections/users/records/member', { method }), response);
        assert.equal(response.bodyUsed, false);
    }
    assert.equal(network.networkSummary().failures, 1);
    assert.equal(f.metrics.filter((row) => row.name === 'api.latency').at(-1).tags.status_class, '5xx');
});

test('fetch rejections and custom abort reasons keep identity without counting cancellation as failure', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'); network.startNetworkTelemetry();
    const offline = new TypeError('private-offline-detail'); f.transport = () => Promise.reject(offline);
    await assert.rejects(f.window.fetch('/api/health'), (error) => error === offline);
    const controller = new AbortController(), reason = new Error('private-abort-reason'); controller.abort(reason);
    f.transport = () => Promise.reject(reason);
    await assert.rejects(f.window.fetch(new Request('https://fixture.invalid/api/health', { signal: controller.signal })), (error) => error === reason);
    assert.equal(network.networkSummary().failures, 1);
    assert.equal(f.metrics.filter((row) => row.name === 'api.latency').at(-1).tags.status_class, 'aborted');
    assert.doesNotMatch(JSON.stringify(f.metrics), /private-/);
});

test('pre-request instrumentation errors and synchronous fetch errors preserve application behavior', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'); network.startNetworkTelemetry();
    const response = new Response('{}'); f.transport = () => Promise.resolve(response);
    f.performance.now = () => { throw new Error('clock unavailable'); };
    assert.equal(await f.window.fetch('/api/health'), response);
    const original = new Error('synchronous transport failure'); f.transport = () => { throw original; };
    assert.throws(() => f.window.fetch('/api/health'), (error) => error === original);
});

test('network teardown fences pending work, removes listeners and preserves a later fetch wrapper', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'), native = f.window.fetch;
    network.startNetworkTelemetry(); network.startNetworkTelemetry(); assert.equal(f.window.count('offline'), 1);
    const wrapped = f.window.fetch, pending = deferred(); f.transport = () => pending.promise;
    const request = wrapped('/api/health'); network.stopNetworkTelemetry();
    assert.equal(f.window.fetch, native); assert.equal(f.window.count('offline'), 0); assert.equal(f.window.count('online'), 0);
    const response = new Response('{}'); pending.resolve(response); assert.equal(await request, response); assert.equal(f.metrics.length, 0);
    network.startNetworkTelemetry(); const ours = f.window.fetch;
    const later = (...args) => ours(...args); f.window.fetch = later; network.stopNetworkTelemetry();
    assert.equal(f.window.fetch, later);
    f.transport = () => Promise.resolve(response); assert.equal(await later('/api/health'), response);
    assert.equal(f.metrics.length, 0);
});

test('emitting API telemetry cannot recursively measure vendor delivery', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'); network.startNetworkTelemetry();
    await f.window.fetch('/api/health');
    await f.window.fetch('https://us.i.posthog.com/e/'); await f.window.fetch('/analytics/e');
    assert.equal(network.networkSummary().requests, 1);
    assert.equal(f.metrics.filter((row) => row.name === 'api.latency').length, 1);
});

test('vitals do not flush or sample heap on idle ticks and suspend the timer while hidden', () => {
    const f = fixture(); f.performance.getEntriesByType = () => [];
    const vitals = f.load('lib/observability/vitals.js'); vitals.startVitals(); vitals.startVitals();
    assert.equal(f.timers.size, 1); f.tick(); f.tick();
    assert.equal(f.metrics.length, 0); assert.equal(f.logs.length, 0); assert.equal(f.heapReads, 0);
    f.entries('layout-shift', [{ value: 0.2, hadRecentInput: false }]); f.visibility('hidden');
    assert.equal(f.timers.size, 0); assert.equal(f.metrics.filter((row) => row.name === 'web.vital.cls').length, 1);
    const count = f.metrics.length, reads = f.heapReads;
    f.tick(); vitals.flushVitals('interval'); f.window.dispatch('pagehide');
    assert.equal(f.metrics.length, count); assert.equal(f.heapReads, reads);
    f.visibility('visible'); f.visibility('visible'); assert.equal(f.timers.size, 1);
});

test('vitals emit only changed aggregates, not every previously observed metric again', () => {
    const f = fixture(); f.performance.getEntriesByType = () => [];
    const vitals = f.load('lib/observability/vitals.js'); vitals.startVitals();
    f.entries('layout-shift', [{ value: 0.1, hadRecentInput: true }, { value: 0.1, hadRecentInput: false }]);
    f.entries('event', [{ interactionId: 1, duration: 50, name: 'click' }]);
    f.entries('longtask', [{ duration: 80 }]); vitals.flushVitals('manual');
    const first = f.metrics.length; vitals.flushVitals('manual'); assert.equal(f.metrics.length, first);
    f.entries('event', [{ interactionId: 2, duration: 40, name: 'click' }]); vitals.flushVitals('manual');
    assert.equal(f.metrics.length, first);
    f.entries('layout-shift', [{ value: 0.2, hadRecentInput: false }]); vitals.flushVitals('manual');
    assert.equal(f.metrics.filter((row) => row.name === 'web.vital.cls').length, 2);
    assert.equal(f.metrics.filter((row) => row.name === 'web.interaction.worst').length, 1);
    assert.equal(f.metrics.filter((row) => row.name === 'browser.long_task.total_time').length, 1);
});

test('resource and long-task metrics exclude intake and never retain resource, route or frame names', () => {
    const f = fixture(); f.performance.getEntriesByType = () => [];
    const vitals = f.load('lib/observability/vitals.js'); vitals.startVitals();
    for (const name of ['https://us.i.posthog.com/e/', 'https://browser-intake-us5-datadoghq.com/api/v2/logs', '/analytics/batch']) {
        f.entries('resource', [{ name, duration: 9999, transferSize: 100, decodedBodySize: 100 }]);
    }
    vitals.flushVitals('manual'); assert.equal(f.metrics.length, 0);
    f.entries('resource', [{ name: '/hcgi/platform/api/buildanddo/learning/private-lesson?answer=private-choice', duration: 10, transferSize: 100 }]);
    f.window.location = new URL('https://fixture.invalid/app/classrooms/private-room');
    f.entries('longtask', [{ duration: 300, attribution: [{ containerType: 'iframe', containerName: 'private-workspace-name' }] }]);
    vitals.flushVitals('manual');
    assert.doesNotMatch(JSON.stringify(f.metrics), /private-/);
    assert.equal(f.metrics.find((row) => row.name === 'browser.resource.transfer_bytes').tags.resource_count, 1);
});

test('hidden and pagehide final flushes drain queued observations once and restore after bfcache', () => {
    const f = fixture(); f.performance.getEntriesByType = () => [];
    const vitals = f.load('lib/observability/vitals.js'); f.document.visibilityState = 'hidden'; vitals.startVitals();
    assert.equal(f.timers.size, 0);
    f.visibility('visible'); f.entries('layout-shift', [{ value: 0.1, hadRecentInput: false }], true); f.visibility('hidden');
    assert.equal(f.metrics.filter((row) => row.name === 'web.vital.cls').length, 1);
    f.entries('longtask', [{ duration: 60 }], true); f.window.dispatch('pagehide');
    assert.equal(f.metrics.filter((row) => row.name === 'browser.long_task.total_time').length, 1);
    f.document.visibilityState = 'visible'; f.window.dispatch('pageshow'); assert.equal(f.timers.size, 1);
});

test('vitals teardown removes all callbacks and pending load work without duplicate restart listeners', () => {
    const f = fixture(); f.performance.getEntriesByType = () => []; f.document.readyState = 'loading';
    const vitals = f.load('lib/observability/vitals.js'); vitals.startVitals(); vitals.stopVitals();
    assert.equal(f.window.count('load'), 0); assert.equal(f.window.count('pagehide'), 0); assert.equal(f.document.count('visibilitychange'), 0);
    assert.equal(f.timers.size, 0); assert.ok(f.observers.every((observer) => observer.disconnected));
    f.window.dispatch('load'); f.window.dispatch('pagehide'); f.visibility('hidden'); assert.equal(f.metrics.length, 0);
    vitals.startVitals(); assert.equal(f.window.count('pagehide'), 1); assert.equal(f.document.count('visibilitychange'), 1);
    vitals.stopVitals();
});

test('failed product identity transitions suppress automatic and explicit events until safely resolved', () => {
    const f = fixture(), product = f.load('lib/telemetry.js'); product.initTelemetry();
    product.identifyTelemetryUser({ id: 'member-one' }); const initial = f.events.length;
    f.failures.add('posthog.reset'); product.identifyTelemetryUser({ id: 'member-two' });
    product.trackEvent('fixture.event'); f.posthog.capture('$pageview');
    assert.equal(f.events.length, initial, 'no event may inherit the old account after a failed reset');
    f.failures.clear(); f.failures.add('posthog.identify'); product.identifyTelemetryUser({ id: 'member-two' });
    f.posthog.capture('$pageview'); assert.equal(f.events.length, initial);
    f.failures.clear(); product.identifyTelemetryUser({ id: 'member-two' }); product.trackEvent('fixture.event');
    assert.equal(f.events.length, initial + 2, 'one SDK identify event plus the explicit event');
    f.failures.add('posthog.reset'); product.clearTelemetryUser(); f.posthog.capture('$pageview');
    assert.equal(f.events.length, initial + 2, 'logout failure cannot retain an emitting authenticated identity');
    f.failures.clear(); product.clearTelemetryUser(); product.trackEvent('fixture.event'); assert.equal(f.events.length, initial + 3);
});

test('native identity attaches once without retaining the previous document identifiers', () => {
    const f = fixture(); f.posthog.persisted = { $user_id: 'member-old', distinct_id: 'member-old' };
    const product = f.load('lib/telemetry.js'); product.initTelemetry(); product.identifyTelemetryUser({ id: 'member-new' });
    product.identifyTelemetryUser({ id: 'member-new' });
    assert.equal(f.count('posthog.identify'), 1);
    assert.equal(f.events.filter((event) => event.event === '$identify').length, 1);
    assert.doesNotMatch(JSON.stringify(f.events.filter((event) => event.event === '$identify')), /member-old/);
});

test('SDKs that silently reject initialization do not enable event or identity reporting', () => {
    const f = fixture(); f.posthog.init = () => undefined; f.datadogRum.init = () => undefined; f.datadogLogs.init = () => undefined;
    const product = f.load('lib/telemetry.js'), dd = f.load('lib/datadogRum.js');
    product.initTelemetry(); dd.initDatadogRum(); product.trackEvent('fixture.event');
    product.identifyTelemetryUser({ id: 'member' }); dd.identifyRumUser({ id: 'member' });
    assert.equal(f.calls.length, 0); assert.equal(f.events.length, 0);
});

test('capture does not mutate application properties or accept DOM/replay events and invalid identities', () => {
    const f = fixture(), product = f.load('lib/telemetry.js'); product.initTelemetry();
    const properties = { nested: { href: '/app?q=private-query', name: 'private-name' }, has_query: true };
    const original = structuredClone(properties); product.trackEvent('fixture.event', properties);
    assert.deepEqual(properties, original); assert.equal(f.events.at(-1).properties.has_query, true);
    const count = f.events.length;
    for (const name of ['$autocapture', '$snapshot', '$exception', '$dead_click']) f.posthog.capture(name, { text: 'private-text' });
    product.trackEvent('$pageview'); product.trackEvent('private event name');
    for (const user of [null, {}, { id: 'member@example.invalid' }, { id: 3 }]) product.identifyTelemetryUser(user);
    assert.equal(f.events.length, count); assert.equal(f.count('posthog.identify'), 0);
    const cycle = { route: '/app/classrooms/private-room' }; cycle.cycle = cycle;
    assert.doesNotThrow(() => product.trackEvent('fixture.event', cycle));
    assert.doesNotMatch(JSON.stringify(f.events), /private-/);
});

test('diagnostic text cannot leak private names, search queries or tokens through errors, causes or logs', () => {
    const f = fixture(); f.load('lib/datadogRum.js').initDatadogRum();
    const error = { type: 'TypeError', message: 'private-workspace failed for private-user@example.invalid',
        stack: 'TypeError: private-workspace\n    at private-name (https://fixture.invalid/assets/main.js?token=private-token:42:8)',
        causes: [{ message: 'private-mission', stack: 'private-search' }] };
    const event = { type: 'error', error: structuredClone(error), context: { error_message: 'private-name', description: 'private-search' } };
    assert.equal(f.datadogRum.config.beforeSend(event), true); assert.doesNotMatch(JSON.stringify(event), /private-/);
    assert.equal(event.error.type, 'TypeError'); assert.match(event.error.stack, /42:8/);
    const log = { message: 'private-workspace failed', error: { ...structuredClone(error), kind: 'TypeError' },
        http: { url: '/app/missions?search=private-search' } };
    assert.equal(f.datadogLogs.config.beforeSend(log), true); assert.doesNotMatch(JSON.stringify(log), /private-/);
    assert.equal(log.error.kind, 'TypeError');
});

test('Datadog repeated initialization and explicit safe action names preserve only reviewed configuration', () => {
    const f = fixture(); f.load('lib/datadogRum.js').initDatadogRum(); f.load('lib/datadogRum.js').initDatadogRum();
    assert.equal(f.count('rum.init'), 1); assert.equal(f.count('logs.init'), 1);
    for (const [type, name] of [['click', 'Open dossier source'], ['custom', 'workspace.mission.create']]) {
        const event = { type: 'action', action: { type, target: { name } } };
        assert.equal(f.datadogRum.config.beforeSend(event), true); assert.equal(event.action.target.name, name);
    }
    for (const message of ['INTEGRATION_NOT_CONFIGURED', 'Failed to authenticate', 'Insufficient credits']) {
        assert.equal(f.datadogRum.config.beforeSend({ type: 'error', error: { message } }), false);
        assert.equal(f.datadogLogs.config.beforeSend({ message }), false);
    }
});

test('network outage, slow-response and connectivity observations remain bounded and fail-soft', async () => {
    const f = fixture(), network = f.load('lib/observability/network.js'); network.startNetworkTelemetry();
    f.transport = () => { f.advance(2000); return Promise.resolve(new Response('{}', { status: 503, headers: { 'content-type': 'application/json', 'content-length': '2048' } })); };
    for (let i = 0; i < 4; i++) await f.window.fetch('/api/health');
    assert.equal(f.actions.filter(([name]) => name === 'api.outage_suspected').length, 1);
    assert.equal(f.metrics.filter((row) => row.name === 'api.response_bytes').length, 4);
    f.window.dispatch('offline'); f.window.dispatch('online'); assert.equal(network.networkSummary().offline_events, 1);
    f.failures.add('reportAction'); assert.doesNotThrow(() => f.window.dispatch('offline'));
    f.failures.add('reportMetric'); assert.equal((await f.window.fetch('/api/health')).status, 503);
    network.stopNetworkTelemetry(); f.window.dispatch('offline'); assert.equal(network.networkSummary().offline_events, 2);
});

test('navigation, paint and LCP are measured once while new entries and sanitized resources remain available', () => {
    const f = fixture();
    f.performance.getEntriesByType = () => [{ type: 'navigate', responseStart: 100, requestStart: 50, loadEventEnd: 250,
        duration: 250, transferSize: 100, decodedBodySize: 200, secureConnectionStart: 0 }];
    const vitals = f.load('lib/observability/vitals.js'); vitals.startVitals();
    f.entries('paint', [{ name: 'first-paint', startTime: 50 }, { name: 'first-contentful-paint', startTime: 100 }]);
    f.entries('largest-contentful-paint', [{ startTime: 200, url: '/assets/private-filename.png?key=private-key', element: { tagName: 'IMG' } }]);
    f.entries('resource', [{ name: '/assets/private-filename.js?key=private-key', transferSize: 0, decodedBodySize: 20, duration: 30 }]);
    vitals.flushVitals('manual'); const count = f.metrics.length; vitals.flushVitals('manual');
    assert.equal(f.metrics.length, count);
    assert.equal(f.metrics.filter((row) => row.name === 'web.vital.fcp').length, 1);
    assert.equal(f.metrics.find((row) => row.name === 'browser.resource.transfer_bytes').tags.cache_hit_pct, 100);
    assert.doesNotMatch(JSON.stringify(f.metrics), /private-/);
    vitals.stopVitals();
});

test('vitals restart neither replays navigation nor accepts a queued callback from a stopped observer', () => {
    const f = fixture(), vitals = f.load('lib/observability/vitals.js'); vitals.startVitals();
    const oldObserver = f.observers.find((observer) => observer.options.type === 'layout-shift');
    vitals.stopVitals(); vitals.startVitals();
    assert.equal(f.actions.filter(([name]) => name === 'browser.navigation').length, 1);
    oldObserver.callback({ getEntries: () => [{ value: 0.5, hadRecentInput: false }] });
    vitals.flushVitals('manual'); assert.equal(f.metrics.filter((row) => row.name === 'web.vital.cls').length, 0);
    assert.ok(f.observers.filter((observer) => !observer.disconnected).every((observer) => observer.options.buffered === false));
    vitals.stopVitals();
});

test('vitals clock and sink failures cannot escape startup or periodic/final flushes', () => {
    const f = fixture(); f.performance.getEntriesByType = () => [];
    const vitals = f.load('lib/observability/vitals.js'); vitals.startVitals();
    f.entries('layout-shift', [{ value: 0.1, hadRecentInput: false }]); f.failures.add('reportMetric');
    assert.doesNotThrow(() => f.tick());
    f.entries('layout-shift', [{ value: 0.1, hadRecentInput: false }]); assert.doesNotThrow(() => f.visibility('hidden'));
    assert.equal(f.timers.size, 0); vitals.stopVitals();
    const missing = fixture(); missing.performance.getEntriesByType = () => { throw new Error('unsupported clock'); };
    assert.doesNotThrow(() => missing.load('lib/observability/vitals.js').startVitals());
});

test('PostHog SDK routing token survives before_send, but forged application tokens and credentials never do', () => {
    const f = fixture(), product = f.load('lib/telemetry.js'); product.initTelemetry();
    assert.equal(f.events[0].properties.token, 'fixture-project', 'the real SDK envelope needs its public routing key');
    const properties = { token: 'forged-project', apiKey: 'private-api-key', authorization: 'private-authorization',
        nested: { token: 'private-token', refresh_token: 'private-refresh', 'custom.token': 'private-dotted-token', 'x-api-key': 'private-header-key' },
        $set: { token: 'private-person-token' }, $set_once: { token: 'private-initial-token' }, outcome: 'success', term_length: 8 };
    product.trackEvent('fixture.event', properties);
    const call = f.calls.find(([name, event]) => name === 'posthog.capture' && event === 'fixture.event');
    assert.equal(call[2].token, undefined, 'application tokens are removed before entering the SDK');
    const forgedEnvelope = f.posthog.config.before_send({ event: 'fixture.event', properties });
    for (const event of [...f.events, forgedEnvelope]) {
        assert.equal(event.properties.token, 'fixture-project');
        const rest = structuredClone(event); delete rest.properties.token;
        assert.doesNotMatch(JSON.stringify(rest), /private-|forged-project|fixture-project/);
    }
    assert.equal(f.events.at(-1).properties.term_length, 8);
    assert.equal(properties.token, 'forged-project', 'scrubbing does not mutate caller data');
    assert.equal(navigation.scrubClassroomProperties({ properties: { token: 'fixture-project' } }).properties.token, undefined,
        'the shared scrubber must not make a global exception for project-looking tokens');
});

test('the automatic initial pageview is anonymous before any native auth callback despite a persisted account', () => {
    const f = fixture(); f.posthog.persisted = { $user_id: 'stale-account-a', distinct_id: 'stale-account-a', $device_id: 'stale-device-a' };
    const product = f.load('lib/telemetry.js'); product.initTelemetry();
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].event, '$pageview');
    assert.equal(f.events[0].properties.$is_identified, false);
    assert.equal(f.events[0].properties.$user_id, undefined);
    assert.doesNotMatch(JSON.stringify(f.events), /stale-account-a|stale-device-a/);
    assert.equal(f.posthog.config.persistence, 'memory');
    assert.equal(f.count('posthog.identify'), 0);
    assert.equal(f.count('posthog.reset'), 0, 'anonymous startup is established by init, not a post-capture reset');
});

test('initial null auth preserves the first anonymous view and native validation links it exactly once', () => {
    const f = fixture(), product = f.load('lib/telemetry.js'); product.initTelemetry();
    const initialId = f.events[0].properties.distinct_id;
    product.clearTelemetryUser(); product.clearTelemetryUser();
    assert.equal(f.posthog.get_property('distinct_id'), initialId);
    assert.equal(f.count('posthog.reset'), 0);
    product.identifyTelemetryUser({ id: 'native-account-b', email: 'private-email', name: 'private-name' });
    product.identifyTelemetryUser({ id: 'native-account-b' });
    assert.equal(f.events.filter((event) => event.event === '$pageview').length, 1);
    assert.equal(f.events.filter((event) => event.event === '$identify').length, 1);
    const identity = f.events.find((event) => event.event === '$identify');
    assert.equal(identity.properties.$anon_distinct_id, initialId);
    assert.equal(identity.properties.distinct_id, 'native-account-b');
    assert.equal(f.events.some((event) => event.event === '$create_alias'), false);
    assert.doesNotMatch(JSON.stringify(f.events), /private-/);
    f.window.location = new URL('https://fixture.invalid/app/missions'); f.posthog.capture('$pageview');
    assert.equal(f.events.filter((event) => event.event === '$pageview').length, 2);
    assert.equal(f.events.at(-1).properties.$user_id, 'native-account-b');
});

test('each document starts fresh, consent survives and logout/account changes cannot retain prior user attribution', () => {
    const first = fixture(), product = first.load('lib/telemetry.js'); product.initTelemetry();
    const initialId = first.events[0].properties.distinct_id;
    product.identifyTelemetryUser({ id: 'native-account-a' }); product.clearTelemetryUser();
    const afterLogout = first.events.length; first.posthog.capture('$pageview');
    assert.equal(first.events.at(-1).properties.$is_identified, false);
    product.identifyTelemetryUser({ id: 'native-account-b' }); product.trackEvent('fixture.event');
    assert.doesNotMatch(JSON.stringify(first.events.slice(afterLogout)), /native-account-a/);
    const second = fixture(); second.posthog.persisted = { distinct_id: 'native-account-a', $user_id: 'native-account-a' };
    const next = second.load('lib/telemetry.js'); next.initTelemetry();
    assert.notEqual(second.events[0].properties.distinct_id, initialId);
    assert.equal(second.events[0].properties.$is_identified, false);
    const optedOut = fixture(); optedOut.posthog.optedOut = true; optedOut.posthog.persisted = second.posthog.persisted;
    const disabled = optedOut.load('lib/telemetry.js'); disabled.initTelemetry(); disabled.clearTelemetryUser();
    disabled.identifyTelemetryUser({ id: 'native-account-b' }); disabled.trackEvent('fixture.event');
    assert.equal(optedOut.events.length, 0); assert.equal(optedOut.posthog.optedOut, true);
});

test('retrying startup preserves the SDK-owned initial view even when init throws after capturing it', () => {
    for (const afterView of [false, true]) {
        const f = fixture(), product = f.load('lib/telemetry.js'), init = f.posthog.init;
        let fail = true;
        f.posthog.init = function (...args) {
            if (!afterView && fail) { fail = false; throw new Error('init unavailable'); }
            const result = init.apply(this, args);
            if (fail) { fail = false; throw new Error('failure after initial capture'); }
            return result;
        };
        assert.doesNotThrow(() => product.initTelemetry());
        product.initTelemetry(); product.initTelemetry(); product.clearTelemetryUser();
        product.identifyTelemetryUser({ id: 'native-account' });
        assert.equal(f.events.filter((event) => event.event === '$pageview').length, 1);
        assert.equal(f.events.filter((event) => event.event === '$identify').length, 1);
        assert.equal(f.events.find((event) => event.event === '$identify').properties.$anon_distinct_id,
            f.events.find((event) => event.event === '$pageview').properties.distinct_id);
    }
});

test('SDK pageviews, identity and explicit events use the real release/environment helpers, not caller claims', () => {
    for (const [env, origin, environment, release] of [
        [{ VITE_DD_VERSION: '38+abcdef0', VITE_BUILD_SHA: 'a'.repeat(40) }, 'https://buildanddo.com', 'production', '38+abcdef0'],
        [{ VITE_BUILD_SHA: 'b'.repeat(40) }, 'https://staging.buildanddo.com', 'staging', 'b'.repeat(40)],
        [{}, 'http://localhost:3000', 'development', 'unversioned'],
        [{}, 'https://demo.pages.dev', 'preview', 'unversioned'],
        [{ VITE_DD_ENV: 'staging', VITE_DD_VERSION: '39+fedcba0' }, 'https://buildanddo.com', 'staging', '39+fedcba0'],
    ]) {
        const f = fixture(env);
        f.window.location = new URL(`${origin}/app/tutorials?lesson=private-lesson#private-fragment`);
        const product = f.load('lib/telemetry.js'); product.initTelemetry(); f.load('lib/datadogRum.js').initDatadogRum();
        product.trackEvent('fixture.event', { env: 'forged-env', release: 'forged-release', token: 'forged-project' });
        product.identifyTelemetryUser({ id: 'native-account' });
        f.posthog.capture('$pageleave', { env: { value: 'forged-env' }, release: ['forged-release'] });
        assert.deepEqual(f.events.map((event) => event.event), ['$pageview', 'fixture.event', '$identify', '$pageleave']);
        for (const event of f.events) {
            assert.equal(event.properties.env, environment);
            assert.equal(event.properties.release, release);
            assert.equal(event.properties.env, f.datadogRum.config.env);
            assert.equal(event.properties.release, f.datadogRum.config.version);
            assert.equal(event.properties.token, 'fixture-project');
        }
        assert.doesNotMatch(JSON.stringify(f.events), /private-|forged-/);
        assert.equal(f.fetchCalls.length, 0);
    }
});

test('an initial heartbeat declaration survives SPA changes without WebDriver or raw query values', () => {
    const f = fixture(); delete f.navigator.webdriver;
    f.window.location = new URL('https://fixture.invalid/app?telemetry_test=heartbeat&token=private-token#private-fragment');
    const product = f.load('lib/telemetry.js'); product.initTelemetry();
    product.trackEvent('fixture.event', { declared_synthetic: false, telemetry_test: 'private-caller-marker' });
    f.window.location = new URL('https://fixture.invalid/app/missions?telemetry_test=private-new-marker');
    product.initTelemetry(); f.posthog.capture('$pageview'); f.posthog.capture('$pageleave');
    for (const event of f.events) {
        assert.equal(event.properties.declared_synthetic, true);
        assert.equal(event.properties.browser_automated, false, 'a URL declaration is not a WebDriver observation');
        assert.equal(event.properties.telemetry_test, undefined);
        assert.equal(event.properties.token, 'fixture-project');
    }
    assert.doesNotMatch(JSON.stringify(f.events), /telemetry_test|heartbeat|private-/);
    assert.equal(f.events.filter((event) => event.event === '$pageview').length, 2);
    assert.equal(f.count('posthog.init'), 1);
    assert.equal(f.fetchCalls.length, 0); assert.equal(f.timers.size, 0, 'no heartbeat scheduler is installed');
});

test('absent, nonmatching, repeated and late markers cannot forge the initial declaration', () => {
    for (const suffix of ['', '?telemetry_test=', '?telemetry_test=private-value', '?telemetry_test=HEARTBEAT',
        '?telemetry_test=heartbeat-extra', '?other=heartbeat', '#telemetry_test=heartbeat',
        '?telemetry_test=heartbeat&telemetry_test=private-value', '?telemetry_test=heartbeat&telemetry_test=heartbeat']) {
        const f = fixture(); f.window.location = new URL(`https://fixture.invalid/app${suffix}`);
        const product = f.load('lib/telemetry.js'); product.initTelemetry();
        product.trackEvent('fixture.event', { declared_synthetic: true, telemetry_test: 'private-forged-marker' });
        f.window.location = new URL('https://fixture.invalid/app/missions?telemetry_test=heartbeat');
        f.posthog.capture('$pageview', { declared_synthetic: 'private-value' });
        for (const event of f.events) {
            assert.equal(event.properties.declared_synthetic, false, suffix);
            assert.equal(event.properties.browser_automated, true, 'WebDriver remains an independent observed signal');
        }
        assert.doesNotMatch(JSON.stringify(f.events), /telemetry_test|heartbeat|private-/);
    }
});

test('a heartbeat declaration cannot enable missing-key, test-mode or opted-out collection', () => {
    for (const [env, optedOut] of [[{ VITE_BUILDANDDO_PH: '' }, false], [{ MODE: 'test' }, false], [{}, true]]) {
        const f = fixture(env); f.posthog.optedOut = optedOut;
        f.window.location = new URL('https://fixture.invalid/?telemetry_test=heartbeat');
        const product = f.load('lib/telemetry.js'); product.initTelemetry();
        product.trackEvent('fixture.event'); product.identifyTelemetryUser({ id: 'native-account' }); product.clearTelemetryUser();
        assert.equal(f.events.length, 0); assert.equal(f.posthog.optedOut, optedOut);
        assert.equal(f.fetchCalls.length, 0); assert.equal(f.timers.size, 0);
    }
});

test('an unavailable or malformed initial URL yields no declaration without breaking SDK startup', () => {
    for (const href of [undefined, 'http://[']) {
        const f = fixture(); f.window.location = { href, pathname: '/app', hostname: 'fixture.invalid' };
        const product = f.load('lib/telemetry.js'); assert.doesNotThrow(() => product.initTelemetry());
        assert.equal(f.events.length, 1);
        assert.equal(f.events[0].properties.declared_synthetic, false);
        assert.equal(f.events[0].properties.env, 'staging');
        assert.equal(f.events[0].properties.release, 'unversioned');
    }
});
