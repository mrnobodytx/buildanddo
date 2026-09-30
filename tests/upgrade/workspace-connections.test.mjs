// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workspace-connections.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-30
// Depends:     apps/web/src/components/workspace/IntegrationControls.jsx, apps/web/src/lib/connectorReadiness.js, apps/web/src/components/workspace/WorkspaceAssistant.jsx, apps/web/src/components/workspace/workflows/BusinessActionReview.jsx, apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx, tests/upgrade/admin-fixture.mjs, tests/upgrade/assistant-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/IntegrationControls.jsx; VALIDATES apps/web/src/lib/connectorReadiness.js; VALIDATES apps/web/src/components/workspace/WorkspaceAssistant.jsx; VALIDATES apps/web/src/components/workspace/workflows/BusinessActionReview.jsx; VALIDATES apps/web/src/components/workspace/workflows/WorkflowRunReview.jsx; DEPENDS_ON tests/upgrade/admin-fixture.mjs; DEPENDS_ON tests/upgrade/assistant-fixture.mjs
// Intent:      Reproduce expired connection claims, unconfigured assistant sends and stale workflow readback using production handlers and explicit runtime doubles.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { fixture, plain, source } from './admin-fixture.mjs';
import { assistantFixture, assistantSurface } from './assistant-fixture.mjs';
import * as connectors from '../../apps/web/src/lib/connectorReadiness.js';
import { createAssistantClient } from '../../apps/web/src/lib/workspaceAssistant.js';
import { createRetryIntent, readRunSnapshot, readRunEvents } from '../../apps/web/src/lib/workflowRuns.js';

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const submit = () => ({ preventDefault() {} });

function clock() {
    let now = Date.parse('2026-09-30T10:00:00Z'), nextId = 0;
    const timers = new Map();
    class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
    return { Date: ClockDate, timers,
        setInterval: (callback, interval) => { const id = ++nextId; timers.set(id, { callback, interval, at: now + interval }); return id; },
        clearInterval: (id) => timers.delete(id),
        advance(ms) {
            const until = now + ms;
            for (;;) {
                const next = [...timers.values()].filter((timer) => timer.at <= until).sort((a, b) => a.at - b.at)[0];
                if (!next) break;
                now = next.at; next.at += next.interval; next.callback();
            }
            now = until;
        },
    };
}

// Execute production pre-JSX closures. Hook, timer, storage and HTTP doubles are
// explicit; these regressions do not establish React rendering or native runtime acceptance.
function component(path, name, exposed, globals, props = {}, end = '\n    return <') {
    const code = source(`apps/web/src/${path}`), start = code.indexOf(`function ${name}(`), finish = code.indexOf(end, start);
    assert.ok(start >= 0 && finish > start, `Handler boundaries exist in ${path}`);
    const cells = [], effects = [], scheduled = [];
    let cursor = 0;
    const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
    const hooks = {
        useState(initial) {
            const index = cursor++;
            cells[index] ??= { value: typeof initial === 'function' ? initial() : initial };
            return [cells[index].value, (value) => { cells[index].value = typeof value === 'function' ? value(cells[index].value) : value; }];
        },
        useRef(initial) { const index = cursor++; cells[index] ??= { current: initial }; return cells[index]; },
        useMemo(operation, deps) {
            const index = cursor++;
            if (!cells[index] || !same(cells[index].deps, deps)) cells[index] = { value: operation(), deps };
            return cells[index].value;
        },
        useEffect(callback, deps) {
            const index = cursor++;
            if (!effects[index] || !same(effects[index].deps, deps)) scheduled.push(() => {
                effects[index]?.cleanup?.(); effects[index] = { callback, deps, cleanup: callback() };
            });
        },
    };
    hooks.useCallback = (callback, deps) => hooks.useMemo(() => callback, deps);
    hooks.useLayoutEffect = hooks.useEffect;
    const render = vm.runInNewContext(`${code.slice(start, finish)}\nreturn { ${exposed.join(', ')} };\n}\n${name};`,
        { crypto: globalThis.crypto, ...hooks, ...globals }, { filename: path });
    return {
        read(nextProps = props) { props = nextProps; cursor = 0; const state = render(props); for (const effect of scheduled.splice(0)) effect(); return state; },
        unmount() { for (const effect of effects) effect?.cleanup?.(); },
    };
}

function integrationFixture() {
    const time = clock(), backend = fixture({ runtime: { Date: time.Date }, now: () => new time.Date().toISOString() });
    backend.command('integration.save', { provider: 'firecrawl', enabled: true, configuration: { mode: 'read', binding: 'test-search' } });
    const record = backend.data.workspace_integrations[0];
    Object.assign(record, { observed_at: new time.Date().toISOString(), observed_state: 'healthy', receipt_ref: 'test-health-receipt', applied_revision: record.revision });
    const data = plain(backend.load('workspace-administration.js').integrations(backend.event()));
    const control = { data, saving: false, uncertain: false, refresh: async () => {}, mutate: async () => {} };
    const view = component('components/workspace/IntegrationControls.jsx', 'IntegrationDesk', ['items'], { ...connectors, ...time }, { control });
    return { view, time, control };
}

test('an open integration desk expires the same healthy receipt as its action forms', () => {
    const f = integrationFixture();
    const first = f.view.read().items.find((item) => item.provider === 'firecrawl');
    assert.equal(first.observation.current, true);
    f.time.advance(915_000);
    const expired = f.view.read().items.find((item) => item.provider === 'firecrawl');
    assert.equal(connectors.connectorReadiness(expired, f.time.Date.now()).ready, false);
    assert.equal(expired.observation.current, false, 'The management desk must not retain a healthy-current claim after expiry');
    assert.equal(f.control.data.items.find((item) => item.provider === 'firecrawl').observation.current, true, 'Do not mutate the received snapshot');
    f.view.unmount(); assert.equal(f.time.timers.size, 0);
});

test('fresh integration readback restores current status without upgrading a mismatched revision', () => {
    const f = integrationFixture(); f.view.read(); f.time.advance(915_000);
    const item = f.control.data.items.find((row) => row.provider === 'firecrawl');
    item.observation.at = new f.time.Date().toISOString();
    item.observation.current = false;
    assert.equal(f.view.read().items.find((row) => row.provider === 'firecrawl').observation.current, false);
    item.observation.current = true;
    assert.equal(f.view.read().items.find((row) => row.provider === 'firecrawl').observation.current, true);
    f.view.unmount();
});

test('integration freshness rejects expired, future, malformed and unmatched receipts at the same boundary', () => {
    const now = Date.parse('2026-09-30T10:00:00Z');
    const observation = { state: 'healthy', current: true, receipt_ref: 'test-receipt', at: new Date(now - 900_000).toISOString() };
    assert.equal(connectors.isIntegrationObservationCurrent(observation, now), true);
    assert.equal(connectors.isIntegrationObservationCurrent(observation, now + 1), false);
    for (const value of [null, {}, { ...observation, current: false }, { ...observation, receipt_ref: '' },
        { ...observation, state: 'unknown' }, { ...observation, at: 'invalid' }, { ...observation, at: new Date(now + 1).toISOString() }])
        assert.equal(connectors.isIntegrationObservationCurrent(value, now), false);
    assert.equal(connectors.isIntegrationObservationCurrent(observation, NaN), false);
    for (const state of ['disabled', 'degraded', 'failed']) {
        const item = { id: 'integration1', desired_enabled: true, provider: 'firecrawl', configuration: { binding: 'test-search', mode: 'read' },
            observation: { ...observation, state } };
        assert.equal(connectors.isIntegrationObservationCurrent(item.observation, now), true);
        assert.equal(connectors.connectorReadiness(item, now).ready, false);
    }
});

function assistant() {
    const backend = assistantFixture(), requests = [];
    const f = { backend, requests, access: { loading: false, error: '', data: { can_write: true } }, failRead: false, readDelay: null };
    const pb = { authStore: { record: { id: 'owner' } }, send: async (path, options) => {
        requests.push({ path, options });
        if (options.method === 'GET' && f.failRead) throw new Error('Synthetic unavailable read');
        const event = backend.event('owner', options.body || {}, { query: options.query || {} });
        const result = plain(path.endsWith('/chat') ? backend.service.chat(event) : options.method === 'GET' ? backend.service.snapshot(event) : backend.service.command(event));
        if (options.method === 'GET' && f.readDelay) await f.readDelay;
        return result;
    } };
    f.props = { accountId: 'owner', workspaceId: 'ws1', demo: false, sessionEpoch: 1, isSessionCurrent: () => true,
        scopeKey: 'owner:ws1', currentScope: { current: 'owner:ws1' } };
    f.view = component('components/workspace/WorkspaceAssistant.jsx', 'AssistantDesk',
        ['setOpen', 'setMessage', 'send', 'load', 'session', 'snapshot', 'error', 'message', 'turn', 'connection'],
        { pb, createAssistantClient, window: new EventTarget(), document: {},
            useWorkspaceAccess: () => f.access, useLocation: () => ({ pathname: '/app/erp' }), useNavigate: () => () => {},
            useFailureTelemetry() {}, observeMutation: (_name, _verb, operation) => operation(),
            captureAssistantSurface: () => ({ public: assistantSurface, targets: new Map() }),
        }, f.props);
    f.open = async () => { f.view.read().setOpen(true); f.view.read(); await tick(); return f.view.read(); };
    f.send = async () => { f.view.read().setMessage('Help me with the customer task'); await f.view.read().send(submit()); await tick(); return f.view.read(); };
    return f;
}

test('Buddi does not create a session before its connection configuration has loaded', async () => {
    const f = assistant();
    await f.send();
    assert.equal(f.requests.filter((request) => request.options.method === 'POST').length, 0);
    assert.equal(f.view.read().message, 'Help me with the customer task');
    f.view.unmount();
});

test('unconfigured Buddi retains the draft and can resume after an explicit connection recheck', async () => {
    const f = assistant(); f.backend.agentConfig.enabled = false;
    await f.open(); await f.send();
    assert.equal(f.requests.filter((request) => request.options.method === 'POST').length, 0);
    assert.equal(f.backend.data.assistant_sessions.length, 0);
    assert.equal(f.view.read().message, 'Help me with the customer task');
    f.backend.agentConfig.enabled = true;
    await f.view.read().load(); await f.view.read().send(submit()); await tick();
    assert.equal(f.backend.data.assistant_sessions.length, 1);
    assert.equal(f.backend.data.assistant_turns.length, 1);
    assert.equal(f.view.read().turn.status, 'ready');
    f.view.unmount();
});

test('failed Buddi readback cannot reuse an earlier configured state to send a new message', async () => {
    const f = assistant(); await f.open();
    f.failRead = true; await f.view.read().load(); await f.send();
    assert.equal(f.requests.filter((request) => request.options.method === 'POST').length, 0);
    f.failRead = false; await f.view.read().load(); await f.view.read().send(submit()); await tick();
    assert.equal(f.backend.data.assistant_turns.length, 1);
    f.view.unmount();
});

test('Buddi preserves its draft through a pending recheck and ignores the result after leaving its scope', async () => {
    const f = assistant(); await f.open();
    const response = deferred(); f.readDelay = response.promise;
    f.requests.length = 0;
    const reading = f.view.read().load();
    await f.send();
    assert.equal(f.requests.filter((request) => request.options.method === 'POST').length, 0);
    assert.equal(f.view.read().connection, 'checking');
    f.props.currentScope.current = 'owner:ws2';
    response.resolve(); await reading;
    await f.send();
    assert.equal(f.requests.length, 1);
    assert.equal(f.view.read().connection, 'checking');
    assert.equal(f.view.read().message, 'Help me with the customer task');
    f.view.unmount();
});

const job = (status = 'dispatched') => ({ id: 'job1', run: 'run1', step_id: 'step1', workspace: 'ws1', status });
const jobs = (items) => ({ ok: true, data: { workspace: 'ws1', items } });
function action() {
    const time = clock(), calls = [], saved = [], busy = [], reads = [];
    const f = { calls, saved, busy, reads, time, scope: 'owner:ws1:false', demo: false,
        access: { loading: false, error: '', data: { can_write: true } },
        list: async () => jobs([]), command: async () => ({ ok: true, data: job() }),
    };
    f.api = { list: (query) => { reads.push(query); return f.list(query); }, command: (body) => { calls.push(plain(body)); return f.command(body); } };
    f.props = { run: { id: 'run1', revision: 2 }, step: { id: 'step1' }, disabled: false,
        runApi: { read: async () => ({ ok: true, record: { id: 'run1', revision: 3 } }) },
        onSaved: (record) => saved.push(record), onBusy: (value) => busy.push(value) };
    f.view = component('components/workspace/workflows/BusinessActionReview.jsx', 'BusinessActionReview',
        ['load', 'execute', 'job', 'error', 'busy', 'loaded'],
        { ...time, document: { hidden: false }, createRetryIntent,
            useBusinessExecution: () => ({ api: f.api, scope: f.scope, demo: f.demo }), useWorkspaceAccess: () => f.access }, f.props);
    f.mount = async () => { f.view.read(); await tick(); return f.view.read(); };
    return f;
}

test('an older action poll cannot erase the receipt returned by a newer read', async () => {
    const f = action(); await f.mount();
    const old = deferred(), recent = deferred(); let count = 0;
    f.list = () => ++count === 1 ? old.promise : recent.promise;
    const first = f.view.read().load(), second = f.view.read().load();
    recent.resolve(jobs([job()])); await second;
    old.resolve(jobs([])); await first;
    assert.equal(f.view.read().job?.id, 'job1');
    f.view.unmount(); assert.equal(f.time.timers.size, 0);
});

test('a read begun before dispatch cannot erase the newly accepted workflow action', async () => {
    const f = action(); await f.mount();
    const old = deferred(); let count = 0;
    f.list = () => ++count === 1 ? old.promise : Promise.resolve(jobs([job()]));
    const reading = f.view.read().load();
    await f.view.read().execute();
    assert.equal(f.calls.length, 1);
    old.resolve(jobs([])); await reading;
    assert.equal(f.view.read().job?.id, 'job1');
    assert.deepEqual(f.busy, [true, false], 'The parent review must know dispatch is in flight');
    f.view.unmount();
});

test('a failed action readback disables dispatch until a successful receipt reload', async () => {
    const f = action(); await f.mount();
    f.list = async () => ({ ok: false, error: 'Synthetic unavailable receipts' });
    await f.view.read().load();
    assert.equal(f.view.read().loaded, false);
    await f.view.read().execute(); assert.equal(f.calls.length, 0);
    f.list = async () => jobs([]); await f.view.read().load();
    await f.view.read().execute(); assert.equal(f.calls.length, 1);
    f.view.unmount();
});

test('permission polling and failed access checks block workflow dispatch even with cached write access', async () => {
    for (const access of [{ loading: true, error: '' }, { loading: false, error: 'Access unavailable' }]) {
        const f = action(); await f.mount();
        f.access = { ...access, data: { can_write: true } };
        await f.view.read().execute(); assert.equal(f.calls.length, 0);
        f.view.unmount();
    }
});

test('late action reads cannot appear in a different step or trigger another run refresh', async () => {
    const f = action(); await f.mount();
    const old = deferred(); f.list = () => old.promise;
    const read = f.view.read().load();
    f.list = async () => jobs([]);
    f.props = { ...f.props, run: { id: 'run2', revision: 2 }, step: { id: 'step2' } };
    f.view.read(f.props); await tick();
    old.resolve(jobs([job('succeeded')])); await read;
    assert.equal(f.view.read().job, null);
    assert.deepEqual(f.saved, []);
    f.view.unmount();
});

test('a delayed run refresh from a terminal action is fenced by a newer receipt read', async () => {
    const f = action(); await f.mount();
    const latest = deferred();
    f.props.runApi.read = () => latest.promise;
    f.list = async () => jobs([job('succeeded')]);
    const reading = f.view.read().load(); await tick();
    f.list = async () => jobs([job('hold')]); await f.view.read().load();
    latest.resolve({ ok: true, record: { id: 'run1', revision: 3 } }); await reading;
    assert.deepEqual(f.saved, []);
    assert.equal(f.view.read().job.status, 'hold');
    f.view.unmount();
});

test('action polling pauses during dispatch and an uncertain result requires receipt recovery with the same retry key', async () => {
    const f = action(); await f.mount();
    const response = deferred(); f.command = () => response.promise;
    const executing = f.view.read().execute();
    assert.deepEqual(f.busy, [true]);
    const count = f.reads.length; f.time.advance(30_000);
    assert.equal(f.reads.length, count);
    response.resolve({ ok: false, reason: 'uncertain', error: 'Synthetic lost command response' }); await executing;
    assert.equal(f.view.read().busy, false); assert.equal(f.view.read().loaded, false);
    await f.view.read().execute(); assert.equal(f.calls.length, 1);
    await f.view.read().load();
    f.command = async () => ({ ok: true, data: job() }); f.list = async () => jobs([job()]);
    await f.view.read().execute();
    assert.equal(f.calls.length, 2); assert.deepEqual(f.calls[0], f.calls[1]);
    await f.view.read().execute(); assert.equal(f.calls.length, 2);
    assert.deepEqual(f.busy, [true, false, true, false]);
    f.view.unmount();
});

test('unmounting a pending action releases the review lock and ignores its later receipt', async () => {
    const f = action(); await f.mount();
    const response = deferred(); f.command = () => response.promise;
    const executing = f.view.read().execute();
    f.view.unmount(); const count = f.reads.length;
    response.resolve({ ok: true, data: job('succeeded') }); await executing;
    assert.deepEqual(f.busy, [true, false]);
    assert.equal(f.reads.length, count); assert.deepEqual(f.saved, []); assert.equal(f.time.timers.size, 0);
});

test('a thrown action request releases busy state while a failed readback stays non-dispatchable', async () => {
    const f = action(); await f.mount();
    f.command = async () => { throw new Error('Synthetic transport exception'); };
    await f.view.read().execute();
    assert.equal(f.view.read().busy, false); assert.equal(f.view.read().loaded, false);
    assert.deepEqual(f.busy, [true, false]);
    f.list = async () => { throw new Error('Synthetic read exception'); };
    await f.view.read().load(); assert.equal(f.view.read().loaded, false);
    assert.match(f.view.read().error, /Reload before dispatching/);
    f.view.unmount();
});

test('demo action reviews make no native reads or writes', async () => {
    const f = action(); f.demo = true; f.scope = 'owner:ws1:true';
    await f.mount(); f.time.advance(30_000); await f.view.read().execute();
    assert.equal(f.reads.length, 0); assert.equal(f.calls.length, 0);
    f.view.unmount();
});

test('the workflow review blocks cancellation and revision reload while its execution is in flight', async () => {
    const commands = [], reads = [], busy = [];
    const props = { run: { id: 'run1', revision: 2, status: 'running', next_step: 0, events: [],
        snapshot: { version: 1, name: 'Approved task', steps: [{ id: 'step1', name: 'Create task', kind: 'execute' }] } },
        api: { decide: async (...args) => { commands.push(args); return { ok: true, record: { id: 'run1' } }; },
            read: async (...args) => { reads.push(args); return { ok: true, record: { id: 'run1' } }; } },
        onSaved() {}, onBusy: (value) => busy.push(value) };
    const view = component('components/workspace/workflows/WorkflowRunReview.jsx', 'WorkflowRunReview',
        ['setReason', 'executionBusy', 'send', 'reload'], { createRetryIntent, readRunSnapshot, readRunEvents }, props, '\n    if (!snapshot) return');
    view.read().setReason('Stop after the current action settles.'); view.read().executionBusy(true);
    await view.read().send('cancel'); await view.read().reload();
    assert.equal(commands.length, 0); assert.equal(reads.length, 0); assert.deepEqual(busy, [true]);
    view.read().executionBusy(false); await view.read().send('cancel');
    assert.equal(commands.length, 1);
    view.unmount();
});
