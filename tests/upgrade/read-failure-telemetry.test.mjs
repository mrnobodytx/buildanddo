// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/read-failure-telemetry.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/workspaceRecords.js, apps/web/src/lib/workspaceControl.js, apps/web/src/lib/workspaceKnowledge.js, apps/web/src/lib/operatorPlane.js, apps/web/src/hooks, apps/web/src/components/workspace, apps/web/src/components/site/StatusPanels.jsx, apps/web/src/pages
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workspaceRecords.js; VALIDATES apps/web/src/lib/workspaceControl.js; VALIDATES apps/web/src/lib/workspaceKnowledge.js; VALIDATES apps/web/src/lib/operatorPlane.js; VALIDATES apps/web/src/hooks; VALIDATES apps/web/src/components/workspace; VALIDATES apps/web/src/components/site/StatusPanels.jsx; VALIDATES apps/web/src/pages
// Intent:      Exercise real read clients and hook closures with local transport, hook, clock and telemetry sink doubles, without vendor or API access.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as navigation from '../../apps/web/src/lib/navigationIntent.js';
import { createWorkspaceRecordClient } from '../../apps/web/src/lib/workspaceRecords.js';
import { createWorkspaceControlClient, createWorkspaceAccessLoader, workspaceLifecycleKey } from '../../apps/web/src/lib/workspaceControl.js';
import { createKnowledgeClient } from '../../apps/web/src/lib/workspaceKnowledge.js';
import { createOperatorClient } from '../../apps/web/src/lib/operatorPlane.js';
import { createDossierClient } from '../../apps/web/src/lib/privateDossier.js';
import { createTutorialLearningClient } from '../../apps/web/src/lib/tutorialLearning.js';
import { createAssistantClient } from '../../apps/web/src/lib/workspaceAssistant.js';
import * as statusReaders from '../../apps/web/src/lib/communityStatus.js';

const root = new URL('../../apps/web/src/', import.meta.url);
const source = (path) => readFileSync(new URL(path, root), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const privateText = 'synthetic-private-query-prompt-workspace-record';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const strip = (code) => code.replace(/^import\s[\s\S]*?;\s*$/gm, '').replace(/^export \{[^}]*\};?$/gm, '').replace(/^export (?:default )?/gm, '');
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const access = () => ({ workspace: 'ws1', role: 'owner', can_write: true, can_admin: true, can_grant_admin: true,
    settings: { revision: 0, description: privateText, wiki_enabled: true, forum_enabled: true, forum_moderation: true } });
const sourceNames = ['missions', 'signals', 'evidence', 'workflow_runs', 'research', 'suite_runs', 'seat_events', 'integrations'];
const operator = () => ({ schema_version: 'buildanddo.operator-snapshot/v1', workspace: 'ws1', role: 'owner',
    observed_at: '2026-09-24T00:00:00Z', page_size: 20,
    sources: Object.fromEntries(sourceNames.map((key) => [key, { state: 'available', items: [], page: 1, has_more: false }])) });
function knowledge(options = {}, states = {}) {
    const coverage = ['missions', 'evidence', 'research_submissions', 'signals', 'wiki_pages'].map((collection) => ({ collection, state: states[collection] || 'complete', included: 0 }));
    const complete = coverage.every((entry) => ['complete', 'disabled'].includes(entry.state));
    const packet = { schema: 'buildanddo.context/v1', workspace: 'ws1', mission: options.mission || '', source_trust: 'untrusted_reference_material',
        partial: !complete, omitted_sources: 0, source_coverage: coverage.map(({ collection, state }) => ({ collection, state })), sources: [], relationships: [] };
    const text = JSON.stringify(packet);
    return { schema: 'buildanddo.knowledge/v1', workspace: 'ws1', assembled_at: '2026-09-24T00:00:00Z', nodes: [], edges: [], coverage, complete, document_count: 0,
        context: { schema: packet.schema, query: options.query?.trim() || '', mission: packet.mission, max_chars: options.max_chars ?? 12000,
            max_sources: options.max_sources ?? 12, text, characters: text.length, truncated: !complete, citations: [], selections: [], omitted_sources: 0 } };
}

// Attempt sources (records, controls, knowledge, estate, room_projection, etc.)
// observe settled current reads. access/control_state/control_feedback and the
// shared notices observe rendered state transitions, NOT extra read attempts.
// This scheduler runs the production hooks, not a replacement implementation of
// their logic. It cannot establish React/DOM acceptance without React/Vitest.
function fixture(path = '/app/missions') {
    const cells = [], effects = [], timers = new Map(), listeners = new Map();
    let cursor = 0, dirty = false, mounted = true, scheduled = [], clock = 0, timerId = 0;
    const same = (left, right) => left && right && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
    const f = { actions: [], events: [], requests: [], current: true, demo: false,
        auth: { isAuthed: true, user: { id: 'owner' }, sessionEpoch: 1, isSessionCurrent: () => true }, workspace: { active: { id: 'ws1' } },
        access: { loading: false, data: access(), error: '' }, transport: async () => access(), fullList: async () => [], list: async () => ({ items: [] }),
        http: async () => response({}), window: { location: new URL('https://fixture.invalid' + path) }, document: { visibilityState: 'visible' } };
    const add = (callback, ms, interval = 0) => { const id = ++timerId; timers.set(id, { callback, at: clock + ms, interval }); return id; };
    for (const target of [f.window, f.document]) {
        target.addEventListener = (name, callback) => { const key = target === f.window ? 'window:' + name : 'document:' + name;
            if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key).add(callback); };
        target.removeEventListener = (name, callback) => listeners.get((target === f.window ? 'window:' : 'document:') + name)?.delete(callback);
    }
    f.pb = { authStore: { record: { id: 'owner' } }, filter: () => 'workspace = "ws1"',
        send(path, options) { f.requests.push({ path, options }); return f.transport(path, options); },
        collection(name) { return {
            getFullList(options) { f.requests.push({ name, options }); return f.fullList(name, options); },
            getList(page, size, options) { f.requests.push({ name, page, size, options }); return f.list(name, page, size, options); },
        }; } };
    const hooks = {
        useState(initial) {
            const index = cursor++;
            cells[index] ??= { value: typeof initial === 'function' ? initial() : initial };
            return [cells[index].value, (value) => { cells[index].value = typeof value === 'function' ? value(cells[index].value) : value; dirty = true; }];
        },
        useRef(current) { const index = cursor++; cells[index] ??= { current }; return cells[index]; },
        useMemo(operation, deps) {
            const index = cursor++;
            if (!cells[index] || !same(cells[index].deps, deps)) cells[index] = { value: operation(), deps };
            return cells[index].value;
        },
        useCallback(operation, deps) { return hooks.useMemo(() => operation, deps); },
        useEffect(callback, deps) {
            const index = cursor++;
            if (!effects[index] || !same(effects[index].deps, deps)) scheduled.push({ index, callback, deps });
        },
    };
    const globals = { ...navigation, ...statusReaders, ...hooks, useLayoutEffect: hooks.useEffect,
        window: f.window, document: f.document, URL, AbortController, console: { error: () => assert.fail('No raw exception logging'), log: () => {} },
        crypto: { randomUUID: () => 'synthetic-request-key' }, pb: f.pb, pocketbaseClient: f.pb,
        createWorkspaceRecordClient, createWorkspaceControlClient, createWorkspaceAccessLoader, workspaceLifecycleKey,
        createKnowledgeClient, createDossierClient, createTutorialLearningClient, createAssistantClient,
        observeMutation: (_name, _verb, operation) => operation(), demoRecords: () => [],
        useAuth: () => f.auth, useWorkspace: () => f.workspace, useDemoMode: () => ({ demo: f.demo }), useWorkspaceAccess: () => f.access,
        useLocation: () => f.window.location, useNavigate: () => () => {},
        setTimeout: (callback, ms) => add(callback, ms), clearTimeout: (id) => timers.delete(id),
        setInterval: (callback, ms) => add(callback, ms, ms), clearInterval: (id) => timers.delete(id),
        fetch: (url, options) => { f.requests.push({ url, options }); return f.http(url, options); },
        reportAction: (name, context) => { f.actions.push([name, plain(context)]); return f.actionSink?.(); },
        trackEvent: (name, context) => { f.events.push([name, plain(context)]); return f.eventSink?.(); },
    };
    const evaluate = (code, names, extras = {}) => vm.runInNewContext(`${strip(code)}\n({ ${names.join(', ')} });`, { ...globals, ...extras });
    f.load = (path, names, extras) => evaluate(source(path), names, extras);
    Object.assign(globals, f.load('lib/observability/runtime.js', ['readFailed']));
    Object.assign(globals, f.load('hooks/useFailureTelemetry.js', ['useFailureTelemetry']));
    f.readFailed = globals.readFailed;
    f.useFailureTelemetry = globals.useFailureTelemetry;
    f.mount = (operation, args = []) => { f.operation = operation; f.args = args; return f.render(); };
    f.render = (args = f.args) => {
        f.args = args; dirty = false; cursor = 0; f.value = f.operation(...args);
        const work = scheduled; scheduled = [];
        for (const { index } of work) effects[index]?.cleanup?.();
        for (const { index, callback, deps } of work) effects[index] = { callback, deps, cleanup: callback() };
        return f.value;
    };
    f.flush = async () => { for (let i = 0; i < 30; i++) { await Promise.resolve(); if (dirty && mounted) f.render(); } return f.value; };
    f.advance = async (ms) => {
        const end = clock + ms;
        for (;;) {
            const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            const [id, timer] = next; clock = timer.at;
            if (timer.interval) timer.at += timer.interval; else timers.delete(id);
            timer.callback(); await f.flush();
        }
        clock = end; await f.flush();
    };
    f.unmount = () => { mounted = false; for (const effect of effects) effect?.cleanup?.(); };
    f.replayEffects = () => { for (const effect of effects) effect?.cleanup?.(); for (const effect of effects) if (effect) effect.cleanup = effect.callback(); };
    f.navigate = (path) => { f.window.location = new URL('https://fixture.invalid' + path); };
    f.account = (id) => { f.auth = { ...f.auth, user: { id }, isAuthed: Boolean(id) }; f.pb.authStore.record = id ? { id } : null; };
    f.event = (name) => { for (const callback of listeners.get(name) || []) callback(); };
    f.private = () => {
        assert.deepEqual(f.actions, f.events, 'both independent sinks receive the same bounded event');
        assert.doesNotMatch(JSON.stringify([f.actions, f.events]), /synthetic-private|ws1|owner|record-id|fixture\.invalid/);
        for (const [name, context] of f.actions) {
            assert.equal(name, 'section.failure');
            assert.deepEqual(Object.keys(context).sort(), ['outcome', 'reason', 'section', 'source', 'status_class']);
        }
    };
    // Only the rendered JSX is omitted; all state/effect/read closures execute.
    f.component = (path, name, end, exposed, extras = {}) => {
        const code = source(path), start = code.indexOf(`function ${name}(`), finish = code.indexOf(end, start);
        assert.ok(start >= 0 && finish > start, 'production component boundaries');
        return evaluate(`${code.slice(start, finish)}\nreturn { ${exposed.join(', ')} };\n}`, [name], extras)[name];
    };
    return f;
}

const clients = {
    records: { create: createWorkspaceRecordClient, options: { collection: 'missions' }, read: (api) => api.read(), good: () => [] },
    controls: { create: createWorkspaceControlClient, read: (api) => api.read('access'), good: access },
    knowledge: { create: createKnowledgeClient, read: (api) => api.assemble(), good: knowledge },
    operator: { create: createOperatorClient, read: (api) => api.read(), good: operator },
};
function clientFixture(kind) {
    const f = fixture(), spec = clients[kind];
    f.reply = spec.good;
    f.transport = f.fullList = async () => f.reply();
    const api = spec.create({ client: f.pb, accountId: 'owner', workspaceId: 'ws1', isCurrent: () => f.current, ...spec.options });
    f.read = () => spec.read(api);
    return f;
}

test('knowledge 404 stays distinct from denied access while retaining bounded failure metadata', async () => {
    const f = clientFixture('knowledge');
    f.reply = () => { throw { status: 404, response: { message: privateText } }; };
    const result = await f.read();
    assert.equal(result.reason, 'missing');
    assert.match(result.error, /no such workspace or mission/);
    assert.deepEqual(result.readFailure, { reason: 'unavailable', status: 404 });
    f.readFailed('/app/knowledge', 'knowledge', result.readFailure.reason, result.readFailure.status);
    assert.equal(f.actions[0][1].reason, 'unavailable');
    assert.equal(f.actions[0][1].status_class, '4xx');
    f.private();
});
for (const kind of Object.keys(clients)) {
    test(`${kind}: pure read metadata distinguishes empty, failed HTTP, JSON and foreign/malformed 200 without exposing content`, async () => {
        const f = clientFixture(kind);
        const empty = await f.read(); assert.equal(empty.ok, true); assert.equal(empty.readFailure, undefined);
        for (const status of [0, 401, 403, 409, 429, 500, 503, privateText, -1, 700]) {
            f.reply = () => { throw { status, message: privateText, response: { message: privateText, query: privateText } }; };
            const result = await f.read(); assert.equal(result.ok, false);
            assert.equal(result.readFailure.reason, kind === 'knowledge' && [401, 403].includes(status) ? 'forbidden' : 'unavailable');
            assert.equal(result.readFailure.status, Number.isInteger(status) && status >= 0 && status < 600 ? status : undefined);
            assert.doesNotMatch(JSON.stringify(result.readFailure), /synthetic-private/);
        }
        for (const value of [null, '<html>' + privateText, {}, kind === 'records' ? [{ id: 'record-id', workspace: 'foreign', title: privateText }] : { ...clients[kind].good(), workspace: 'foreign' }]) {
            f.reply = () => value;
            assert.deepEqual((await f.read()).readFailure, { reason: 'invalid_response', status: 200 });
        }
        f.reply = () => { throw Object.assign(new SyntaxError(privateText), { status: 200 }); };
        assert.deepEqual((await f.read()).readFailure, { reason: 'invalid_response', status: 200 });
        f.reply = () => { throw { status: 0, originalError: new SyntaxError(privateText) }; };
        assert.deepEqual((await f.read()).readFailure, { reason: 'invalid_response', status: undefined }, 'do not fabricate HTTP 200 for an opaque SDK parse error');
        assert.equal(f.actions.length, 0, 'pure clients do not import vendors or emit telemetry');
    });
    test(`${kind}: cancellations and stale scope keep their current result semantics without a backend failure signal`, async () => {
        const f = clientFixture(kind);
        for (const failure of [{ name: 'AbortError' }, { isAbort: true, status: 0 }, { originalError: { name: 'AbortError' } }]) {
            f.reply = () => { throw failure; };
            const result = await f.read(); assert.equal(result.readFailure.reason, 'cancelled');
            f.readFailed('/app', kind, result.readFailure.reason, result.readFailure.status);
        }
        const pending = deferred(); f.reply = () => pending.promise;
        const reading = f.read(); f.account('other'); pending.reject({ status: 503, message: privateText });
        const stale = await reading; assert.equal(stale.reason, 'scope_changed'); assert.equal(stale.readFailure, undefined);
        assert.equal(f.actions.length, 0); f.private();
    });
}

test('knowledge and operator retain usable partial results while marking only unavailable sources, not limits or empty records', async () => {
    const k = clientFixture('knowledge');
    for (const state of ['complete', 'disabled', 'limited', 'unavailable']) {
        k.reply = () => knowledge({}, { research_submissions: state });
        const result = await k.read(); assert.equal(result.ok, true);
        assert.deepEqual(result.readFailure, state === 'unavailable' ? { reason: 'degraded', status: 200 } : undefined);
    }
    const o = clientFixture('operator');
    o.reply = () => { const value = operator(); value.sources.missions.has_more = true; return value; };
    assert.equal((await o.read()).readFailure, undefined);
    o.reply = () => { const value = operator(); value.sources.research.state = 'unavailable'; return value; };
    const result = await o.read(); assert.equal(result.ok, true); assert.equal(Object.isFrozen(result.data), true);
    assert.deepEqual(result.readFailure, { reason: 'degraded', status: 200 });
});

function mountShared(f, kind, options = {}) {
    if (kind === 'records') {
        const { useWorkspaceRecords } = f.load('hooks/useWorkspaceRecords.js', ['useWorkspaceRecords']);
        f.mount(useWorkspaceRecords, ['missions', options]);
    } else if (kind === 'controls') {
        const { useWorkspaceControl } = f.load('hooks/useWorkspaceControl.js', ['useWorkspaceControl']);
        f.mount(useWorkspaceControl, ['access', options]);
    } else {
        const { useWorkspaceKnowledge } = f.load('hooks/useWorkspaceKnowledge.js', ['useWorkspaceKnowledge']);
        f.mount(useWorkspaceKnowledge, [options]);
    }
}

test('control read metadata coexists with the settled unavailable explanation and access message', async () => {
    const f = fixture('/app/integrations');
    f.transport = async () => { throw { status: 403 }; };
    const { useWorkspaceControl, describeAccess } = f.load('hooks/useWorkspaceControl.js', ['useWorkspaceControl', 'describeAccess']);
    f.mount(useWorkspaceControl, ['access']);
    await f.flush();
    assert.equal(f.value.loading, false);
    assert.equal(f.value.unavailableReason, f.value.error);
    assert.ok(f.value.unavailableReason);
    assert.equal(f.value.readFailure.status, 403);
    assert.match(describeAccess(f.value), /controls stay off/);
    assert.equal(f.actions[0][1].reason, 'forbidden');
    f.transport = async () => access();
    await f.value.refresh(); await f.flush();
    assert.equal(f.value.unavailableReason, '');
    assert.equal(f.value.readFailure, undefined);
    assert.equal(describeAccess(f.value), '');
    f.private(); f.unmount();
});
for (const kind of ['records', 'controls', 'knowledge']) {
    test(`${kind} hook: actual client failure emits once per retry, not on unrelated renders, and preserves UI`, async () => {
        const f = fixture('/app/classrooms/synthetic-private-room?query=' + privateText);
        f.transport = f.fullList = async () => { throw { status: 503, response: { message: privateText } }; };
        mountShared(f, kind); assert.equal(f.actions.length, 0);
        await f.advance(250);
        assert.equal(f.value.loading, false); assert.ok(f.value.error);
        assert.equal(f.actions.length, 1);
        assert.deepEqual(f.actions[0][1], { section: '/app/classrooms/:room', source: kind, reason: 'server_error', outcome: 'failure', status_class: '5xx' });
        f.render(); f.render(); await f.flush(); assert.equal(f.actions.length, 1);
        await f.value.refresh(); await f.flush(); assert.equal(f.actions.length, 2);
        f.transport = async (_path, options) => kind === 'knowledge' ? knowledge(options.body) : access(); f.fullList = async () => [];
        await f.value.refresh(); await f.flush(); assert.equal(f.value.error, ''); assert.equal(f.actions.length, 2);
        f.private(); f.unmount();
    });
    test(`${kind} hook: malformed success and denial are observed but account, route and unmounted responses are not`, async () => {
        const f = fixture(); f.transport = f.fullList = async () => ({});
        mountShared(f, kind); await f.advance(250);
        assert.equal(f.actions[0][1].reason, 'invalid_response'); assert.equal(f.actions[0][1].status_class, '2xx');
        f.transport = f.fullList = async () => { throw { status: 403, response: { message: privateText } }; };
        await f.value.refresh(); await f.flush(); assert.equal(f.actions[1][1].reason, 'forbidden');
        for (const change of [() => f.navigate('/app/knowledge?query=' + privateText), () => f.account('other'), () => f.unmount()]) {
            const pending = deferred(); f.transport = f.fullList = () => pending.promise;
            const reading = f.value.refresh(); change(); pending.reject({ status: 500, message: privateText });
            f.transport = async (_path, options) => kind === 'knowledge' ? knowledge(options.body) : access(); f.fullList = async () => [];
            await reading; await f.flush(); assert.equal(f.actions.length, 2);
        }
        f.private();
    });
    test(`${kind} hook: demo, loading and absent scope never count as failures`, async () => {
        for (const setup of [(f) => { f.demo = true; }, (f) => f.account(''), (f) => { f.workspace.active = null; }]) {
            const f = fixture(); setup(f); mountShared(f, kind); await f.advance(250);
            assert.equal(f.requests.length, 0); assert.equal(f.actions.length, 0); f.unmount();
        }
    });
}

test('record and control hooks ignore superseded queries and Strict Mode effect replays', async () => {
    for (const kind of ['records', 'controls']) {
        const f = fixture(), old = deferred();
        f.transport = f.fullList = () => old.promise;
        mountShared(f, kind);
        f.transport = async () => access(); f.fullList = async () => [];
        f.replayEffects(); await f.flush();
        old.reject({ status: 500, message: privateText }); await f.flush();
        assert.equal(f.actions.length, 0); assert.equal(f.value.error, '');
        const stale = deferred(); f.transport = f.fullList = () => stale.promise;
        const read = f.value.refresh(); f.render([kind === 'records' ? 'missions' : 'access', { page: 2, extraFilter: privateText }]);
        f.unmount(); stale.reject({ status: 503 }); await read; await f.flush();
        assert.equal(f.actions.length, 0); f.private();
    }
});

test('knowledge hook observes a deadline but ignores navigation aborts, budgets and partial pagination', async () => {
    const f = fixture('/app/knowledge');
    f.transport = (_path, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject({ name: 'AbortError', status: 0 })));
    mountShared(f, 'knowledge', { query: privateText }); await f.advance(15250);
    assert.equal(f.actions.length, 1); assert.equal(f.actions[0][1].reason, 'network'); assert.equal(f.value.loading, false);
    const pending = f.value.refresh(); f.unmount(); await pending; await f.flush(); assert.equal(f.actions.length, 1);
    for (const state of ['limited', 'disabled', 'unavailable']) {
        const k = fixture('/app/knowledge'); k.transport = async (_path, options) => knowledge(options.body, { research_submissions: state });
        mountShared(k, 'knowledge'); await k.advance(250);
        assert.equal(k.value.error, ''); assert.ok(k.value.data);
        assert.equal(k.actions.length, state === 'unavailable' ? 1 : 0);
        if (state === 'unavailable') assert.equal(k.actions[0][1].reason, 'degraded');
        k.private(); k.unmount();
    }
});

test('global record hook handles empty and malformed collections, retries and late account errors without raw logging', async () => {
    const f = fixture('/docs'); const { useRecords } = f.load('hooks/useWorkspaceRecords.js', ['useRecords']);
    f.mount(useRecords, ['tutorials']); await f.flush(); assert.equal(f.value.degraded, false); assert.equal(f.actions.length, 0);
    f.fullList = async () => '<html>' + privateText; await f.value.refresh(); await f.flush();
    assert.equal(f.value.degraded, true); assert.equal(f.actions[0][1].reason, 'invalid_response');
    f.fullList = async () => { throw { status: 429, response: { message: privateText } }; };
    await f.value.refresh(); await f.flush(); assert.equal(f.actions[1][1].reason, 'rate_limited');
    const old = deferred(); f.fullList = () => old.promise; const reading = f.value.refresh(); f.account('other');
    old.reject({ status: 500, message: privateText }); await reading; await f.flush(); assert.equal(f.actions.length, 2);
    f.private(); f.unmount();
});

test('dossier hook observes only current read errors, leaving local validation, demo and write state alone', async () => {
    const f = fixture('/app/dossier'); const { usePrivateDossier } = f.load('hooks/usePrivateDossier.js', ['usePrivateDossier']);
    f.transport = async () => { throw { status: 403, response: { message: privateText } }; };
    f.mount(usePrivateDossier, [privateText]); await f.flush();
    assert.equal(f.actions.length, 1); assert.equal(f.actions[0][1].reason, 'forbidden'); assert.equal(f.value.writeError, '');
    await f.value.refresh(); await f.flush(); assert.equal(f.actions.length, 2);
    f.render(['x'.repeat(201)]); await f.flush(); assert.equal(f.actions.length, 2);
    f.demo = true; f.render(); await f.flush(); assert.equal(f.actions.length, 2);
    f.private(); f.unmount();
});

test('rendered-state helper deduplicates messages and rerenders, resets after recovery and isolates both sink failures', async () => {
    const f = fixture('/app/missions?query=' + privateText);
    f.mount(f.useFailureTelemetry, [false, 'control_state']); await f.flush(); assert.equal(f.actions.length, 0);
    f.render([true, 'control_state', 'unavailable']); await f.flush(); assert.equal(f.actions.length, 1);
    f.render(); f.replayEffects(); await f.flush(); assert.equal(f.actions.length, 1);
    f.render([false, 'control_state']); f.render([true, 'control_state']); await f.flush(); assert.equal(f.actions.length, 2);
    f.actionSink = () => { throw new Error(privateText); }; f.eventSink = () => Promise.reject(new Error(privateText));
    f.render([true, 'control_state', 'forbidden', 403]); await f.flush(); assert.equal(f.events.length, 3);
    f.private(); f.unmount();
});

function page(f, name) {
    const configs = {
        FleetPage: ['pages/workspace/FleetPage.jsx', '\n    const hosts =', ['failed', 'report', 'loading', 'setAttempt'], { REPORT_ROUTE: '/api/buildanddo/estate/fleet-status' }],
        // Served to a master seat through the estate route since #109, as FleetPage is; the public file is gone.
        PlatformHealthPage: ['pages/workspace/PlatformHealthPage.jsx', '\n    const platforms =', ['failed', 'report', 'loading', 'setAttempt'], { REPORT_ROUTE: '/api/buildanddo/estate/platform-health' }],
        PracticePage: ['pages/PracticePage.jsx', '\n    return (', ['error', 'methods'], {}],
        RoadmapPage: ['pages/RoadmapPage.jsx', '\n    const activityStale =', ['liveError', 'activityError', 'live', 'activity', 'capabilities'],
            { mergeLiveStatus: () => [], STALE_AFTER_MS: 48 * 3600000, SPRINT_DAYS: 21 }],
    };
    const [path, end, exposed, extras] = configs[name];
    f.mount(f.component(path, name, end, exposed, extras));
}
const pageCases = {
    FleetPage: { path: '/app/fleet', source: 'estate', good: { state: 'MEASURED', hosts: [], planes: [], totals: { agent_versions: [] } }, failed: 'failed' },
    PlatformHealthPage: { path: '/app/platforms', source: 'estate', good: { state: 'MEASURED', platforms: [], totals: {} }, failed: 'failed' },
    PracticePage: { path: '/practice', source: 'practice', good: { items: [] }, failed: 'error' },
};
for (const [name, config] of Object.entries(pageCases)) {
    test(`${name}: empty is valid, malformed 200 and HTTP failures keep the existing error state and bounded source`, async () => {
        for (const kind of ['empty', 'malformed', 'json', 'http']) {
            const f = fixture(config.path);
            const value = kind === 'empty' ? config.good : privateText;
            f.http = async () => kind === 'json' ? { ok: true, status: 200, json: async () => { throw new SyntaxError(privateText); } } : response(value, kind === 'http' ? 503 : 200);
            f.transport = f.list = async () => {
                if (kind === 'http') throw { status: 503, response: { message: privateText } };
                if (kind === 'json') throw Object.assign(new SyntaxError(privateText), { status: 200 });
                return value;
            };
            page(f, name); await f.flush();
            assert.equal(f.actions.length, kind === 'empty' ? 0 : 1);
            assert.equal(f.value[config.failed], kind !== 'empty');
            if (kind !== 'empty') { assert.equal(f.actions[0][1].source, config.source); assert.equal(f.actions[0][1].reason, kind === 'http' ? 'server_error' : 'invalid_response'); }
            f.render(); await f.flush(); assert.equal(f.actions.length, kind === 'empty' ? 0 : 1);
            f.private(); f.unmount();
        }
    });
    test(`${name}: delayed and navigationally cancelled reads never emit failure`, async () => {
        for (const action of ['unmount', 'route', 'abort']) {
            const f = fixture(config.path), pending = deferred(); f.transport = f.list = f.http = () => pending.promise;
            page(f, name);
            if (action === 'unmount') f.unmount(); else if (action === 'route') f.navigate('/docs');
            pending.reject(action === 'abort' ? { name: 'AbortError', isAbort: true } : { status: 500, message: privateText });
            await f.flush(); assert.equal(f.actions.length, 0); f.unmount();
        }
    });
}

test('estate readers report semantic unmeasured 200 and each explicit retry without duplicating rerenders', async () => {
    for (const name of ['FleetPage', 'PlatformHealthPage']) {
        const f = fixture(pageCases[name].path); f.http = async () => response({ state: 'UNMEASURED' }); f.transport = async () => ({ state: 'UNMEASURED' });
        page(f, name); await f.flush(); assert.equal(f.actions.length, 1); assert.equal(f.actions[0][1].reason, 'unmeasured');
        assert.equal(f.value.failed, false); f.value.setAttempt((value) => value + 1); await f.flush(); assert.equal(f.actions.length, 2);
        f.private(); f.unmount();
    }
});

test('platform health uses the private native route and fences telemetry across account changes', async () => {
    const f = fixture('/app/platforms');
    f.http = async () => assert.fail('The full platform report must not be fetched from a public file');
    f.transport = async () => pageCases.PlatformHealthPage.good;
    page(f, 'PlatformHealthPage'); await f.flush();
    assert.equal(f.requests[0].path, '/api/buildanddo/estate/platform-health');
    assert.equal(f.requests[0].options.method, 'GET');
    assert.equal(f.actions.length, 0);
    const held = deferred(); f.transport = () => held.promise;
    f.value.setAttempt((value) => value + 1); await f.flush();
    f.account('other'); held.reject({ status: 503, message: privateText });
    await f.flush();
    assert.equal(f.actions.length, 0);
    f.private(); f.unmount();
});

test('room projection hook separates HTTP, JSON, foreign projection and semantic unavailable from valid empty graphs/episodes', async () => {
    for (const kind of ['systems', 'utilization']) {
        for (const value of [kind === 'systems' ? { projection: kind, nodes: [], edges: [] } : { projection: kind, episode: null },
            { projection: kind, state: 'UNMEASURED' }, { projection: 'foreign', nodes: [], edges: [] }, {}, privateText]) {
            const f = fixture('/app/rooms/' + (kind === 'systems' ? 'systems' : 'live')); f.http = async () => response(value);
            f.mount(f.load('hooks/useRoomProjection.js', ['useRoomProjection']).useRoomProjection, [kind]); await f.flush();
            const empty = value.projection === kind && value.state !== 'UNMEASURED';
            assert.equal(f.actions.length, empty ? 0 : 1);
            if (!empty) assert.equal(f.actions[0][1].reason, value.state === 'UNMEASURED' ? 'unmeasured' : 'invalid_response');
            f.private(); f.unmount();
        }
    }
    const f = fixture('/app/rooms/systems'), old = deferred(); f.http = () => old.promise;
    f.mount(f.load('hooks/useRoomProjection.js', ['useRoomProjection']).useRoomProjection, ['systems']);
    f.http = async () => response({ projection: 'utilization', episode: null }); f.render(['utilization']); await f.flush();
    old.reject(new Error(privateText)); await f.flush(); assert.equal(f.actions.length, 0); f.unmount();
    const empty = fixture('/app/rooms/live'); empty.http = async () => response({ projection: 'utilization', nodes: [], edges: [], utilization: [] });
    empty.mount(empty.load('hooks/useRoomProjection.js', ['useRoomProjection']).useRoomProjection, ['utilization']); await empty.flush();
    assert.equal(empty.actions.length, 0, 'a published room without an episode is a valid empty view'); empty.unmount();
});

test('roadmap measures all three silent feeds, including capability suppression and explicit unavailable 200', async () => {
    for (const kind of ['empty', 'malformed', 'json', 'http', 'unmeasured']) {
        const f = fixture('/roadmap');
        const files = { '/roadmap-status.json': { state: 'MEASURED', milestones: [] }, '/capabilities.json': { state: 'MEASURED', capabilities: [], counts: {} }, '/activity-status.json': { entries: [] } };
        f.http = async (url) => kind === 'json' ? { ok: true, status: 200, json: async () => { throw new SyntaxError(privateText); } } :
            response(kind === 'empty' ? files[url] : kind === 'unmeasured' ? { state: 'UNMEASURED' } : privateText, kind === 'http' ? 404 : 200);
        page(f, 'RoadmapPage'); await f.flush(); assert.equal(f.actions.length, kind === 'empty' ? 0 : 3);
        if (kind !== 'empty') assert.ok(f.actions.every(([, context]) => context.source === 'roadmap_feed' && context.reason ===
            (kind === 'http' ? 'unavailable' : kind === 'unmeasured' ? 'unmeasured' : 'invalid_response')));
        f.render(); await f.flush(); assert.equal(f.actions.length, kind === 'empty' ? 0 : 3); f.private(); f.unmount();
    }
});

test('published status hook keeps unknown UI semantics and reports transport, malformed and unmeasured documents once', async () => {
    for (const reader of [statusReaders.readCommunityStatus, statusReaders.readPlatformHealth]) {
        for (const kind of ['empty', 'malformed', 'json', 'http', 'unmeasured', 'unavailable']) {
            const f = fixture('/status'), date = new Date().toISOString();
            const doc = reader === statusReaders.readCommunityStatus ? { schema: statusReaders.COMMUNITY_STATUS_SCHEMA, surfaces: [], generated_at: date } : { platforms: [], observed_at: date };
            if (kind === 'unmeasured') { doc.generated_at = null; doc.observed_at = null; }
            f.http = async () => kind === 'json' ? { ok: true, status: 200, json: async () => { throw new SyntaxError(privateText); } } :
                response(kind === 'malformed' ? privateText : kind === 'unavailable' ? { state: 'UNMEASURED' } : doc, kind === 'http' ? 503 : 200);
            const usePublishedJson = f.component('components/site/StatusPanels.jsx', 'usePublishedJson', '\n    return state;', ['...state'], statusReaders);
            f.mount(usePublishedJson, [reader === statusReaders.readCommunityStatus ? '/community-status.json' : '/platform-health.json', reader]); await f.flush();
            assert.equal(f.value.settled, true); assert.equal(f.actions.length, kind === 'empty' ? 0 : 1);
            if (kind !== 'empty') assert.equal(f.actions[0][1].reason, kind === 'http' ? 'server_error' : ['unmeasured', 'unavailable'].includes(kind) ? 'unmeasured' : 'invalid_response');
            f.private(); f.unmount();
        }
    }
});

test('personal knowledge read failures and malformed successes are observed independently of forgetting-session writes', async () => {
    const f = fixture('/app/knowledge');
    const operation = f.component('components/workspace/PersonalAssistantKnowledge.jsx', 'PersonalKnowledge', '\n    return <section', ['error', 'data', 'setRefresh']);
    f.transport = async () => ({ workspace: 'ws1', owner: 'owner', patterns: [] });
    f.mount(operation, [{ workspaceId: 'ws1', accountId: 'owner', demo: false }]); await f.flush(); assert.equal(f.actions.length, 0);
    f.transport = async () => ({ workspace: 'ws1', owner: 'owner', patterns: privateText }); f.value.setRefresh((value) => value + 1); await f.flush();
    assert.equal(f.actions[0][1].reason, 'invalid_response'); assert.ok(f.value.error);
    f.transport = async () => { throw { status: 500, response: { message: privateText } }; }; f.value.setRefresh((value) => value + 1); await f.flush();
    assert.equal(f.actions.length, 2); assert.equal(f.requests.every(({ options }) => options.method === 'GET'), true);
    f.render(); await f.flush(); assert.equal(f.actions.length, 2); f.private(); f.unmount();
});

test('tutorial catalogue observes growth and states failures without treating completed empty reads as failures', async () => {
    const f = fixture('/docs');
    const operation = f.component('components/workspace/TutorialCatalog.jsx', 'SignedInCatalog', '\n    const lessons =', ['refreshGrowth', 'refreshStates', 'growth', 'states'], { useRecords: () => ({ records: [] }) });
    f.transport = async (path) => path.endsWith('/states') ? { schema_version: 1, account_id: 'owner', page: 1, has_more: false, items: [] } :
        { schema_version: 1, account_id: 'owner', completed: 0, points: 0, level: { name: 'Starter', number: 1, floor: 0, next: 100 },
            milestones: [1, 2, 3].map((n) => ({ id: 'm' + n, title: 'Lesson milestone', target: n, earned: false })), certificates: { page: 1, has_more: false, items: [] }, resume: null };
    f.mount(operation, [{ userId: 'owner' }]); await f.flush(); assert.equal(f.actions.length, 0); assert.equal(f.value.growth.error, '');
    f.transport = async () => { throw { status: 403, response: { message: privateText } }; };
    await f.value.refreshGrowth(); await f.value.refreshStates(); await f.flush();
    assert.equal(f.actions.length, 2); assert.ok(f.actions.every(([, context]) => context.reason === 'forbidden' && context.source === 'tutorial_catalog'));
    f.private(); f.unmount();
});

test('assistant access disappearance is a deduplicated settled state, never loading, demo or normal missing-provider state', async () => {
    const f = fixture('/app/missions');
    const operation = f.component('components/workspace/WorkspaceAssistant.jsx', 'WorkspaceAssistant', '\n    if (!isAuthed', ['scopeKey']);
    f.mount(operation); await f.flush(); assert.equal(f.actions.length, 0);
    f.access = { loading: true, data: null, error: '' }; f.render(); await f.flush(); assert.equal(f.actions.length, 0);
    f.access = { loading: false, data: null, error: '' }; f.render(); await f.flush(); assert.equal(f.actions.length, 0);
    f.access = { loading: false, data: null, error: privateText, readFailure: { reason: 'unavailable', status: 403 } }; f.render(); await f.flush();
    assert.equal(f.actions.length, 1); assert.equal(f.actions[0][1].source, 'access'); assert.equal(f.actions[0][1].reason, 'forbidden');
    f.render(); f.access.error = 'different ' + privateText; f.render(); await f.flush(); assert.equal(f.actions.length, 1);
    f.demo = true; f.render(); await f.flush(); assert.equal(f.actions.length, 1); f.private(); f.unmount();
});

test('assistant feedback and knowledge notices use distinct state sources without exporting their text', async () => {
    const f = fixture('/app/missions');
    const operation = f.component('components/workspace/WorkspaceAssistant.jsx', 'AssistantDesk', '\n    selectedSession.current = session;', ['setOpen', 'setError', 'setMessage']);
    f.mount(operation, [{ demo: false }]); f.value.setOpen(true); f.value.setError(privateText); await f.flush();
    assert.equal(f.actions.length, 1); assert.equal(f.actions[0][1].source, 'control_feedback');
    f.value.setMessage(privateText); await f.flush(); assert.equal(f.actions.length, 1); f.private(); f.unmount();
    for (const state of ['complete', 'limited', 'unavailable']) {
        const k = fixture('/app/knowledge');
        const show = knowledgeResults(k);
        const context = knowledge({}, { research_submissions: state }).context;
        k.mount(show, [{ context }]); await k.flush(); assert.equal(k.actions.length, state === 'unavailable' ? 1 : 0);
        if (state === 'unavailable') assert.equal(k.actions[0][1].source, 'control_state');
        k.private(); k.unmount();
    }
});

function knowledgeResults(f) {
    return f.component('components/workspace/KnowledgeContext.jsx', 'KnowledgeContextResults',
        '\n    const download =', ['state', 'packet']);
}

test('context absence remains normal and unreadable packets emit once before safe early returns', async () => {
    const f = fixture('/app/knowledge');
    f.mount(knowledgeResults(f), [{ context: undefined }]); await f.flush();
    assert.equal(f.value.state, 'absent'); assert.equal(f.actions.length, 0);
    f.render([{ context: { text: '{' + privateText } }]); await f.flush();
    assert.equal(f.value.state, 'unreadable');
    assert.equal(f.actions.length, 1); assert.equal(f.actions[0][1].reason, 'invalid_response');
    assert.equal(f.actions[0][1].status_class, 'unknown');
    f.render(); f.replayEffects(); await f.flush(); assert.equal(f.actions.length, 1);
    f.render([{ context: knowledge().context }]); await f.flush();
    assert.equal(f.value.state, 'ok'); assert.equal(f.actions.length, 1);
    f.render([{ context: { text: '{' + privateText } }]); await f.flush(); assert.equal(f.actions.length, 2);
    f.private(); f.unmount();
});

test('published status, room and roadmap readers discard deferred parse failures on navigation and unmount', async () => {
    for (const kind of ['status', 'room', 'roadmap']) {
        for (const change of ['route', 'unmount']) {
            const f = fixture('/roadmap'), json = deferred();
            f.http = async () => ({ ok: true, status: 200, json: () => json.promise });
            if (kind === 'roadmap') page(f, 'RoadmapPage');
            else if (kind === 'room') f.mount(f.load('hooks/useRoomProjection.js', ['useRoomProjection']).useRoomProjection, ['systems']);
            else f.mount(f.component('components/site/StatusPanels.jsx', 'usePublishedJson', '\n    return state;', ['...state'], statusReaders),
                ['/community-status.json', statusReaders.readCommunityStatus]);
            await f.flush();
            if (change === 'route') f.navigate('/app/missions'); else f.unmount();
            json.reject(new SyntaxError(privateText)); await f.flush(); assert.equal(f.actions.length, 0); f.private(); f.unmount();
        }
    }
});

test('personal and catalogue readers do not report late account data, and personal demo mode performs no read', async () => {
    for (const kind of ['personal', 'catalogue']) {
        const f = fixture('/app/knowledge'), pending = deferred(); f.transport = () => pending.promise;
        const operation = kind === 'personal' ?
            f.component('components/workspace/PersonalAssistantKnowledge.jsx', 'PersonalKnowledge', '\n    return <section', ['error', 'data', 'setRefresh']) :
            f.component('components/workspace/TutorialCatalog.jsx', 'SignedInCatalog', '\n    const lessons =', ['growth', 'states'], { useRecords: () => ({ records: [] }) });
        f.mount(operation, [kind === 'personal' ? { accountId: 'owner', workspaceId: 'ws1', demo: false } : { userId: 'owner' }]);
        f.account('other'); pending.reject({ status: 500, response: { message: privateText } }); await f.flush();
        assert.equal(f.actions.length, 0); f.private(); f.unmount();
    }
    const demo = fixture('/app/knowledge');
    demo.mount(demo.component('components/workspace/PersonalAssistantKnowledge.jsx', 'PersonalKnowledge', '\n    return <section', ['error', 'data']),
        [{ accountId: 'owner', workspaceId: 'ws1', demo: true }]);
    await demo.flush(); assert.equal(demo.requests.length, 0); assert.equal(demo.actions.length, 0); demo.unmount();
});

test('mission context observes only actual settled read metadata, not loading, demo or a normal empty packet', async () => {
    const f = fixture('/app/missions');
    let control = { loading: true, demo: false, error: '', data: null };
    const show = f.component('components/workspace/KnowledgeContext.jsx', 'MissionKnowledgeContext', '\n    return <Card', ['control'], { useWorkspaceKnowledge: () => control });
    f.mount(show, [{ missionId: privateText }]); await f.flush(); assert.equal(f.actions.length, 0);
    control = { loading: false, demo: true, error: privateText }; f.render(); await f.flush(); assert.equal(f.actions.length, 0);
    control = { loading: false, demo: false, error: '', data: knowledge() }; f.render(); await f.flush(); assert.equal(f.actions.length, 0);
    control = { loading: false, demo: false, error: privateText, readFailure: { reason: 'invalid_response', status: 200 } };
    f.render(); await f.flush(); assert.equal(f.actions.length, 1); assert.equal(f.actions[0][1].source, 'control_state');
    f.render(); await f.flush(); assert.equal(f.actions.length, 1); f.private(); f.unmount();
});

test('a collector failure cannot change a failed read into another response or trigger an automatic retry', async () => {
    const f = fixture('/app/missions');
    f.actionSink = () => { throw new Error(privateText); }; f.eventSink = () => Promise.reject(new Error(privateText));
    f.fullList = async () => { throw { status: 503, response: { message: privateText } }; };
    mountShared(f, 'records'); await f.flush();
    assert.equal(f.requests.length, 1); assert.equal(f.value.loading, false); assert.equal(f.value.degraded, true);
    assert.equal(f.actions.length, 1); assert.equal(f.events.length, 1); f.private(); f.unmount();
});
