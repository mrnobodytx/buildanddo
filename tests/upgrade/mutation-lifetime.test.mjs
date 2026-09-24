// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/mutation-lifetime.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     tests/upgrade/mutation-telemetry-fixture.mjs, apps/web/src/lib/businessExecution.js, apps/web/src/lib/workspaceAssistant.js, apps/web/src/lib/privateDossier.js, apps/web/src/lib/workspaceClaims.js, apps/web/src/lib/workspaceControl.js, apps/web/src/lib/workspaceRecords.js, apps/web/src/lib/blueprints.js, apps/web/src/lib/blueprintAnalysis.js, apps/web/src/lib/careerPassport.js
// EnumType:    Test
// EnumEdges:   CONSUMES tests/upgrade/mutation-telemetry-fixture.mjs; VALIDATES apps/web/src/lib/businessExecution.js; VALIDATES apps/web/src/lib/workspaceAssistant.js; VALIDATES apps/web/src/lib/privateDossier.js; VALIDATES apps/web/src/lib/workspaceClaims.js; VALIDATES apps/web/src/lib/workspaceControl.js; VALIDATES apps/web/src/lib/workspaceRecords.js; VALIDATES apps/web/src/lib/blueprints.js; VALIDATES apps/web/src/lib/blueprintAnalysis.js; VALIDATES apps/web/src/lib/careerPassport.js
// Intent:      Fence deferred rejections before telemetry without changing current errors, stale caller results or recovery identity.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import { mutationTelemetry } from './mutation-telemetry-fixture.mjs';
import { createBusinessClient } from '../../apps/web/src/lib/businessExecution.js';
import { createAssistantClient } from '../../apps/web/src/lib/workspaceAssistant.js';
import { createDossierClient } from '../../apps/web/src/lib/privateDossier.js';
import { createWorkspaceClaimClient } from '../../apps/web/src/lib/workspaceClaims.js';
import { createWorkspaceControlClient } from '../../apps/web/src/lib/workspaceControl.js';
import { createWorkspaceRecordClient } from '../../apps/web/src/lib/workspaceRecords.js';
import { createBlueprintClient } from '../../apps/web/src/lib/blueprints.js';
import { createBlueprintAnalysisClient } from '../../apps/web/src/lib/blueprintAnalysis.js';
import { createCareerClient } from '../../apps/web/src/lib/careerPassport.js';
import { operatorFixture } from './operator-fixture.mjs';
import { careerPacket } from './career-fixture.mjs';
import { plain } from './admin-fixture.mjs';

const privateText = 'synthetic-private-rejection-details';
const staleFlag = { ok: false, stale: true };
const staleReason = { ok: false, reason: 'scope_changed', error: '' };
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const rejection = (status = 503) => Object.freeze(Object.assign(new Error(privateText), {
    status, response: Object.freeze({ message: privateText }),
}));

const cases = [
    { name: 'business', create: createBusinessClient, stale: staleFlag,
        invoke: (api) => api.command({ action: 'source.capture', payload: {}, revision: 0, request_key: 'synthetic-business-lifetime' }) },
    { name: 'assistant command', create: createAssistantClient, stale: staleFlag,
        invoke: (api) => api.command('session.start', { title: privateText }, 'synthetic-assistant-lifetime') },
    { name: 'assistant chat', create: createAssistantClient, stale: staleFlag,
        invoke: (api) => api.chat({ session: 'syntheticsession', message: privateText, request_key: 'synthetic-chat-lifetime' }) },
    { name: 'dossier', create: createDossierClient, stale: staleReason, personal: true, boundaries: ['account', 'session'],
        invoke: (api) => api.command('dossier.update', { about: privateText }, 0) },
    { name: 'claims', create: createWorkspaceClaimClient, options: { collection: 'daily_editions', deferConfirmation: true },
        stale: { ok: false, reason: 'scope_changed', error: 'The account or workspace changed. Reload before continuing.', stale: true },
        boundaries: ['account', 'workspace', 'session', 'permission', 'visit'],
        invoke: (api) => api.write('create', '', { title: privateText, summary: '', body: '', edition_date: '' }) },
    { name: 'controls', create: createWorkspaceControlClient, stale: staleReason,
        invoke: (api) => api.command('settings.save', { description: privateText }, 0) },
    { name: 'record write', create: createWorkspaceRecordClient, options: { collection: 'erp_tasks' },
        stale: { ok: false, stale: true, reason: 'scope_changed', error: 'The workspace or account changed. Reload before continuing.' },
        invoke: (api) => api.write('create', '', { title: privateText }) },
    { name: 'record target read', create: createWorkspaceRecordClient, options: { collection: 'erp_tasks' }, targetRead: true,
        boundaries: ['account', 'workspace'],
        stale: { ok: false, stale: true, reason: 'scope_changed', error: 'The workspace or account changed. Reload before continuing.' },
        invoke: (api) => api.write('update', 'syntheticrecord', { title: privateText }) },
    { name: 'blueprint upload', create: createBlueprintClient, stale: staleReason,
        invoke: (api) => api.upload(new File(['%PDF-synthetic'], 'synthetic.pdf')) },
    { name: 'blueprint command', create: createBlueprintClient, stale: staleReason, boundaries: ['session', 'permission'],
        invoke: (api) => api.command('syntheticblueprint', 'cancel', 1) },
    { name: 'analysis request', create: createBlueprintAnalysisClient, stale: { ok: false, reason: 'scope_changed' },
        invoke: (api) => api.analyze(new File(['%PDF-synthetic'], 'synthetic.pdf')) },
    { name: 'analysis file read', create: createBlueprintAnalysisClient, stale: { ok: false, reason: 'scope_changed' },
        fileRead: true, boundaries: ['account', 'workspace'],
        invoke: (api, transport) => api.analyze({ name: 'synthetic.pdf', size: 1, arrayBuffer: () => transport('file', {}) }) },
];

function scenario(entry, { sinks = {}, afterOperation } = {}) {
    const telemetry = mutationTelemetry(sinks), held = deferred(), sent = deferred(), calls = [], errors = [];
    const state = { workspace: 'ws1', session: 0, permission: 0, visit: 0, polling: false };
    let keys = 0;
    const transport = (path, request) => { calls.push({ path, request }); sent.resolve(); return held.promise; };
    const client = { authStore: { record: { id: 'editor' } }, send: transport,
        collection: () => ({ create: (body) => transport('create', { body }),
            getOne: (id, options) => { assert.equal(entry.targetRead, true); return transport('getOne', { id, ...options }); },
            update: () => assert.fail('A rejected target read must not dispatch an update'),
        }) };
    const scoped = () => (entry.personal || state.workspace === 'ws1') && state.session === 0 && state.permission === 0;
    const observe = (name, verb, operation) => telemetry.observe(name, verb, async () => {
        try {
            const value = await operation();
            afterOperation?.(value, client);
            return value;
        } catch (error) { errors.push(error); throw error; }
    });
    const keyFactory = () => `synthetic-lifetime-request-${++keys}`;
    const api = entry.create({ client, workspaceId: 'ws1', accountId: 'editor', observe,
        isCurrent: () => scoped() && !state.polling, isScopeCurrent: scoped, getLifetime: () => state.visit,
        keyFactory, crypto: { randomUUID: keyFactory, subtle: globalThis.crypto.subtle }, ...entry.options });
    return { api, client, telemetry, state, held, sent, calls, errors, get keys() { return keys; },
        run: () => entry.invoke(api, transport),
        change(boundary) {
            if (boundary === 'account') client.authStore.record = { id: 'otheraccount' };
            else if (boundary === 'workspace') state.workspace = 'ws2';
            else if (boundary === 'session' && entry.personal) api.dispose();
            else state[boundary]++;
        },
    };
}

function observation(c, expected, reason = expected, statusClass = 'unknown') {
    const { actions, events, metrics } = c.telemetry;
    assert.equal(actions.length, 1); assert.equal(events.length, 1); assert.equal(metrics.length, 1);
    assert.deepEqual(actions, events); assert.deepEqual(metrics[0][2].tags, actions[0][1]);
    assert.equal(actions[0][1].outcome, expected); assert.equal(actions[0][1].reason, reason);
    assert.equal(actions[0][1].status_class, statusClass); assert.equal(actions[0][1].section, '/app/missions');
    assert.doesNotMatch(JSON.stringify([actions, events, metrics]), /synthetic-private|otheraccount|ws2/);
}

for (const entry of cases) for (const boundary of entry.boundaries || ['account', 'workspace', 'session', 'permission'])
    test(`${entry.name} rejected after ${boundary} invalidation is measured as stale before caller handling`, async () => {
        const c = scenario(entry), pending = c.run();
        await c.sent.promise;
        c.change(boundary); c.telemetry.window.location.pathname = '/app/erp';
        c.held.reject(rejection());
        assert.deepEqual(await pending, entry.stale);
        assert.equal(c.calls.length, 1);
        observation(c, 'scope_changed');
        assert.deepEqual(c.errors, [], 'A stale native exception must not reach the observer');
    });

for (const entry of cases) test(`${entry.name} still-current rejections retain original exception identity and classification`, async () => {
    for (const [status, expected, reason, statusClass] of [[503, 'uncertain', 'server_error', '5xx'],
        [403, 'forbidden', 'forbidden', '4xx'], [409, 'conflict', 'conflict', '4xx'], [0, 'uncertain', 'network', 'network']]) {
        const c = scenario(entry), error = rejection(status), pending = c.run();
        await c.sent.promise; c.held.reject(error);
        const result = await pending;
        assert.equal(result.ok, false); assert.notEqual(result.stale, true); assert.notEqual(result.reason, 'scope_changed');
        assert.equal(c.calls.length, 1); assert.equal(c.errors.length, 1); assert.equal(c.errors[0], error);
        observation(c, expected, reason, statusClass);
    }
});

test('assistant polling preserves command rejection semantics but fences rejected chat content', async () => {
    for (const name of ['assistant command', 'assistant chat']) {
        const entry = cases.find((item) => item.name === name), c = scenario(entry), error = rejection(), pending = c.run();
        await c.sent.promise; c.state.polling = true; c.held.reject(error);
        const result = await pending;
        if (name === 'assistant command') {
            assert.deepEqual(result, { ok: false, error: privateText });
            assert.equal(c.errors[0], error); observation(c, 'uncertain', 'server_error', '5xx');
        } else {
            assert.deepEqual(result, staleFlag); assert.equal(c.errors.length, 0); observation(c, 'scope_changed');
        }
    }
});

function receipt(entry, request) {
    const { body } = request;
    if (entry.name === 'claims') return { workspace: 'ws1', action: body.action, id: 'syntheticrecord', revision: 1, replayed: true,
        record: { id: 'syntheticrecord', workspace: 'ws1', owner: 'editor', claim_revision: 1 } };
    if (entry.name === 'controls') return { workspace: 'ws1', action: body.action, id: 'syntheticsettings', revision: 1, replayed: true };
    if (entry.name === 'dossier') return { owner: 'editor', action: body.action, id: 'syntheticdossier', dossier_id: 'syntheticdossier', revision: 1, replayed: true };
    return { workspace: 'ws1', replayed: true, record: { id: 'syntheticblueprint', workspace: 'ws1', owner: 'editor',
        submission: 'syntheticsubmission', upload: 'syntheticupload', input_sha256: body.get('input_sha256'), source_file: 'synthetic.pdf',
        status: 'queued', revision: 1, attempt: 0, text: '', blueprint_failure: '', evaluation_failure: '', truncated: false, blueprint: null, evaluation: null } };
}

for (const name of ['claims', 'controls', 'dossier', 'blueprint upload'])
    test(`${name} stale rejection retains its original request even if the account returns before the outer continuation`, async () => {
        const entry = cases.find((item) => item.name === name);
        let handled = false;
        const c = scenario(entry, { afterOperation(result, client) {
            if (result.reason === 'scope_changed' || result.stale === true) {
                handled = true; client.authStore.record = { id: 'editor' };
            }
        } });
        const pending = c.run(); await c.sent.promise;
        c.change('account'); c.held.reject(rejection());
        assert.deepEqual(await pending, entry.stale);
        assert.equal(handled, true, 'The rejection must settle as stale inside the observed operation');
        observation(c, 'scope_changed');
        const original = c.calls[0].request.body;
        if (name === 'claims') {
            assert.equal(c.api.confirm(), false, 'A stale response cannot be acknowledged as a receipt');
            c.client.send = async (path, request) => { c.calls.push({ path, request }); throw rejection(403); };
            const denied = await c.api.retry();
            assert.equal(denied.reason, 'forbidden'); assert.equal(denied.uncertain, true);
            assert.equal(c.api.confirm(), false);
            assert.equal((await c.api.write('create', '', { title: 'A distinct draft' })).blockedByPending, true);
        }
        c.client.send = async (path, request) => { c.calls.push({ path, request }); return receipt(entry, request); };
        assert.equal((await c.api.retry()).ok, true);
        assert.equal(c.keys, 1); assert.ok(c.calls.every((call) => call.request.body === original));
        if (name === 'claims') assert.equal(c.api.confirm(), true);
        assert.equal((await c.api.retry()).reason, 'invalid');
        assert.deepEqual(c.telemetry.actions.map((item) => item[1].outcome), name === 'claims'
            ? ['scope_changed', 'forbidden', 'success'] : ['scope_changed', 'success']);
    });

test('an old dossier rejection cannot release a new generation busy flag or pending key', async () => {
    const telemetry = mutationTelemetry(), old = deferred(), fresh = deferred(), calls = [];
    let keys = 0;
    const client = { authStore: { record: { id: 'editor' } }, send: (_path, request) => {
        calls.push(request); return calls.length === 1 ? old.promise : fresh.promise;
    } };
    const api = createDossierClient({ client, accountId: 'editor', isCurrent: () => true, observe: telemetry.observe,
        keyFactory: () => `synthetic-dossier-generation-${++keys}` });
    const first = api.command('dossier.update', { about: 'Old private draft' });
    api.dispose();
    const second = api.command('dossier.update', { about: 'Current private draft' });
    old.reject(rejection()); assert.deepEqual(await first, staleReason);
    observation({ telemetry }, 'scope_changed');
    assert.equal((await api.command('dossier.update', { about: 'Must remain busy' })).reason, 'busy');
    assert.equal(calls.length, 2); assert.notEqual(calls[0].body.request_key, calls[1].body.request_key);
    fresh.resolve(receipt({ name: 'dossier' }, calls[1])); assert.equal((await second).ok, true);
    assert.equal((await api.retry()).reason, 'invalid'); assert.equal(keys, 2);
});

for (const mode of ['throw', 'reject']) test(`${mode}ing SDK sinks cannot replace any stale rejection result`, async () => {
    const fail = () => { if (mode === 'throw') throw new Error('Synthetic SDK failure'); return Promise.reject(new Error('Synthetic SDK failure')); };
    for (const entry of cases) {
        const c = scenario(entry, { sinks: { action: fail, event: fail, metric: fail } }), pending = c.run();
        await c.sent.promise; c.change('account'); c.held.reject(rejection());
        assert.deepEqual(await pending, entry.stale); assert.equal(c.errors.length, 0); assert.equal(c.calls.length, 1);
        observation(c, 'scope_changed');
    }
    await new Promise((resolve) => setImmediate(resolve));
});

for (const boundary of ['account', 'workspace', 'session', 'permission'])
    test(`career checksum rejection already respects the ${boundary} lifetime before observation`, async () => {
        const f = operatorFixture(), telemetry = mutationTelemetry(), held = deferred(), hashing = deferred();
        let current = true;
        const client = { authStore: { record: { id: 'editor' } }, async send(_path, options) {
            assert.equal(options.method, 'GET'); return plain(f.operator.snapshot(f.event('editor', {}, { query: options.query })));
        } };
        const api = createCareerClient({ client, accountId: 'editor', workspaceId: 'ws1', isCurrent: () => current, observe: telemetry.observe,
            crypto: { subtle: { digest: () => { hashing.resolve(); return held.promise; } } } });
        assert.equal((await api.read()).ok, true);
        const pending = api.importReview(JSON.stringify(careerPacket())); await hashing.promise;
        if (boundary === 'account') client.authStore.record = { id: 'otheraccount' };
        else if (boundary === 'session') api.dispose();
        else current = false;
        held.reject(rejection());
        assert.deepEqual(await pending, staleReason); observation({ telemetry }, 'scope_changed');
    });
