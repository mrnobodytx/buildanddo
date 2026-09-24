// --- CGRF Header ------------------------------------------------
// File:        tests/upgrade/mutation-telemetry.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/observability/mutations.js, apps/web/src/lib/observability/config.js, apps/web/src/lib/navigationIntent.js, apps/web/src/lib/telemetry.js, apps/web/src/lib/workspaceRecords.js, apps/web/src/lib/workspaceClaims.js, apps/web/src/lib/workspaceControl.js, apps/web/src/lib/businessExecution.js, apps/web/src/lib/workspaceAssistant.js, apps/web/src/lib/privateDossier.js, apps/web/src/lib/careerPassport.js, apps/web/src/lib/blueprintAnalysis.js, apps/web/src/lib/blueprints.js, tests/upgrade/mutation-telemetry-fixture.mjs
//              apps/web/src/lib/observability/context.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/observability/mutations.js; VALIDATES apps/web/src/lib/observability/config.js; CONSUMES apps/web/src/lib/navigationIntent.js; CONSUMES apps/web/src/lib/telemetry.js; VALIDATES apps/web/src/lib/workspaceRecords.js; VALIDATES apps/web/src/lib/workspaceClaims.js; VALIDATES apps/web/src/lib/workspaceControl.js; VALIDATES apps/web/src/lib/businessExecution.js; VALIDATES apps/web/src/lib/workspaceAssistant.js; VALIDATES apps/web/src/lib/privateDossier.js; VALIDATES apps/web/src/lib/careerPassport.js; VALIDATES apps/web/src/lib/blueprintAnalysis.js; VALIDATES apps/web/src/lib/blueprints.js; CONSUMES tests/upgrade/mutation-telemetry-fixture.mjs
//              CONSUMES apps/web/src/lib/observability/context.js
// Intent:      Connect actual mutation adapters to isolated telemetry sinks and synthetic receipts without contacting any API or vendor.
// ----------------------------------------------------------------

import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as navigation from '../../apps/web/src/lib/navigationIntent.js';
import { createWorkspaceRecordClient } from '../../apps/web/src/lib/workspaceRecords.js';
import { createWorkspaceClaimClient } from '../../apps/web/src/lib/workspaceClaims.js';
import { createWorkspaceControlClient } from '../../apps/web/src/lib/workspaceControl.js';
import { createBusinessClient } from '../../apps/web/src/lib/businessExecution.js';
import { createAssistantClient } from '../../apps/web/src/lib/workspaceAssistant.js';
import { createDossierClient } from '../../apps/web/src/lib/privateDossier.js';
import { createCareerClient } from '../../apps/web/src/lib/careerPassport.js';
import { createBlueprintAnalysisClient } from '../../apps/web/src/lib/blueprintAnalysis.js';
import { createBlueprintClient } from '../../apps/web/src/lib/blueprints.js';
import { fixture, plain, source } from './admin-fixture.mjs';
import { assistantFixture, assistantSurface } from './assistant-fixture.mjs';
import { dossierFixture } from './dossier-fixture.mjs';
import { operatorFixture } from './operator-fixture.mjs';
import { careerPacket } from './career-fixture.mjs';
import { decisionFixture, layoutBlueprintResult } from './decision-fixture.mjs';
import { blueprintFixture } from './blueprint-fixture.mjs';
import { mutationTelemetry as telemetry } from './mutation-telemetry-fixture.mjs';

const privateText = 'synthetic-private-record-and-message';
const scope = { workspaceId: 'ws1', accountId: 'editor', isCurrent: () => true };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function outcome(t, expected, name) {
    assert.equal(t.actions.length, 1);
    assert.equal(t.events.length, 1);
    assert.equal(t.metrics.length, 1);
    assert.equal(t.actions[0][1].outcome, expected);
    if (name) assert.equal(t.actions[0][0], name);
    assert.deepEqual(t.actions, t.events);
    assert.deepEqual(t.metrics[0][2].tags, t.actions[0][1]);
    assert.deepEqual(Object.keys(t.actions[0][1]).sort(), ['collection', 'operation', 'outcome', 'reason', 'section', 'status_class']);
    assert.doesNotMatch(JSON.stringify([t.actions, t.events, t.metrics]), new RegExp(privateText));
}

test('observer retains exact results and snapshots the bounded starting section before awaiting', async () => {
    const t = telemetry(), held = deferred(), record = { id: privateText, title: privateText, status: 'failed', stale: true };
    const result = t.observe('missions', 'update', () => held.promise);
    assert.equal(t.actions.length, 0);
    t.window.location.pathname = '/app/erp'; held.resolve(record);
    assert.equal(await result, record);
    outcome(t, 'success', 'workspace.mission.update');
    assert.equal(t.actions[0][1].section, '/app/missions');
    assert.equal(t.metrics[0][1], 10);
});

test('a connected control receipt keeps its starting section through the actual product-analytics scrubber', async () => {
    let analytics;
    const t = telemetry({ event: (...args) => analytics.trackEvent(...args) }), emitted = [], module = { exports: {} };
    const posthog = {
        get_config(name) { return this.config?.[name]; }, has_opted_out_capturing: () => false,
        init(key, config) { this.config = { ...config, token: key }; },
        capture(event, properties) {
            emitted.push(this.config.before_send({ event, properties: { ...properties, $current_url: `https://fixture.invalid${t.window.location.pathname}` } }));
        },
    };
    const code = source('apps/web/src/lib/telemetry.js').replace(/^import .+;$/gm, '').replaceAll('import.meta.env', '__env').replace(/\bexport /g, '');
    const globals = { module, posthog, ...navigation, URL, window: t.window, __env: { VITE_BUILDANDDO_PH: 'synthetic-project', MODE: 'fixture' } };
    const context = source('apps/web/src/lib/observability/context.js').replaceAll('import.meta.env', '__env').replace(/\bexport /g, '');
    Object.assign(globals, vm.runInNewContext(`${context}\n({ resolveEnvironment, resolveRelease });`, globals,
        { filename: 'apps/web/src/lib/observability/context.js' }));
    vm.runInNewContext(`${code}\nmodule.exports = { initTelemetry, trackEvent };`, globals, { filename: 'apps/web/src/lib/telemetry.js' });
    analytics = module.exports; analytics.initTelemetry();
    const held = deferred(), client = { authStore: { record: { id: 'editor' } }, send: () => held.promise };
    const api = createWorkspaceControlClient({ client, ...scope, observe: t.observe, keyFactory: () => 'synthetic-section-retry' });
    t.window.location.pathname = '/app/settings';
    const pending = api.command('settings.save', {}, 0);
    t.window.location.pathname = '/app/erp';
    held.resolve({ workspace: 'ws1', action: 'settings.save', id: 'syntheticsettings', revision: 1, replayed: false });
    assert.equal((await pending).ok, true);
    assert.equal(emitted.length, 1); assert.equal(emitted[0].properties.section, '/app/settings');
    assert.equal(t.actions[0][1].section, emitted[0].properties.section);
});

for (const [result, expected] of [
    [{ ok: false, reason: 'uncertain' }, 'uncertain'],
    [{ ok: false, reason: 'conflict' }, 'conflict'],
    [{ ok: false, reason: 'forbidden', uncertain: true }, 'forbidden'],
    [{ ok: false, reason: 'scope_changed' }, 'scope_changed'],
    [{ ok: false, stale: true }, 'scope_changed'],
    [{ ok: false, reason: 'invalid' }, 'failure'],
    [{ ok: false, status: 403 }, 'forbidden'],
    [{ ok: false, reason: privateText, error: privateText }, 'failure'],
    [{ ok: true, stale: true, packet: { title: privateText } }, 'success'],
]) test(`resolved ${result.reason || result.status || (result.ok ? 'stale import' : 'stale scope')} is measured as ${expected} without changing the result`, async () => {
    const t = telemetry();
    assert.equal(await t.observe('missions', 'create', () => result), result);
    outcome(t, expected);
});

for (const [status, expected, statusClass] of [
    [401, 'forbidden', '4xx'], [403, 'forbidden', '4xx'], [409, 'conflict', '4xx'],
    [0, 'uncertain', 'network'], [503, 'uncertain', '5xx'], [400, 'failure', '4xx'], [429, 'failure', '4xx'],
]) test(`thrown ${status} retains exception identity and a bounded ${expected} outcome`, async () => {
    const t = telemetry(), error = Object.assign(new Error(privateText), { status, response: { message: privateText } });
    await assert.rejects(t.observe('missions', 'update', () => { throw error; }), (caught) => caught === error);
    outcome(t, expected);
    assert.equal(t.actions[0][1].status_class, statusClass);
});

test('abort is distinguished from confirmation and arbitrary exceptions stay unconfirmed', async () => {
    for (const [error, expected] of [[Object.assign(new Error(privateText), { isAbort: true, status: 0 }), 'cancelled'],
        [Object.assign(new Error(privateText), { name: 'AbortError' }), 'cancelled'], [new Error(privateText), 'uncertain']]) {
        const t = telemetry();
        await assert.rejects(t.observe('missions', 'create', () => Promise.reject(error)), (caught) => caught === error);
        outcome(t, expected);
    }
});

test('unknown and inherited collection/action names execute once without emitting dynamic names', async () => {
    const t = telemetry(); let calls = 0;
    for (const [collection, verb] of [[privateText, 'create'], ['missions', privateText], ['__proto__', 'toString'],
        ['missions', 'constructor'], ['constructor', 'create'], ['business_jobs', privateText]]) {
        assert.equal(await t.observe(collection, verb, () => { calls++; return privateText; }), privateText);
    }
    assert.equal(calls, 6);
    assert.deepEqual([t.actions, t.events, t.metrics], [[], [], []]);
});

for (const mode of ['throw', 'reject']) test(`each ${mode}ing SDK sink is isolated on resolved and rejected writes`, async () => {
    const fail = () => { if (mode === 'throw') throw new Error(privateText); return Promise.reject(new Error(privateText)); };
    const t = telemetry({ action: fail, event: fail, metric: fail }), record = { id: privateText }, original = new Error('original');
    assert.equal(await t.observe('missions', 'create', () => record), record);
    await assert.rejects(t.observe('missions', 'update', () => Promise.reject(original)), (caught) => caught === original);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(t.actions.length, 2); assert.equal(t.events.length, 2); assert.equal(t.metrics.length, 2);
});

test('one sink cannot mutate another sink context or replace a result through telemetry property access', async () => {
    const t = telemetry({ action: (_name, context) => { context.section = privateText; context.outcome = 'failure'; } });
    const value = {};
    Object.defineProperty(value, 'ok', { get() { throw new Error(privateText); } });
    assert.equal(await t.observe('missions', 'update', () => value), value);
    assert.equal(t.events[0][1].section, '/app/missions');
    assert.equal(t.events[0][1].outcome, 'uncertain');
    assert.deepEqual(t.events[0][1], t.metrics[0][2].tags);
});

test('unavailable timing cannot stop the operation or either action sink and emits no fabricated duration', async () => {
    const t = telemetry({ clock: () => { throw new Error('Synthetic missing clock'); } }), value = { id: privateText };
    assert.equal(await t.observe('missions', 'create', () => value), value);
    assert.equal(t.actions.length, 1); assert.equal(t.events.length, 1); assert.equal(t.metrics.length, 0);
});

test('collector work does not inflate the observed mutation duration', async () => {
    const t = telemetry({ action: () => t.advance(10000), event: () => t.advance(20000) });
    assert.equal(await t.observe('missions', 'create', () => true), true);
    assert.equal(t.metrics[0][1], 10);
});

function claims(t, options = {}) {
    const f = fixture({ runtime: { toString: String, $os: { readFile: () => source('apps/pocketbase/pb_migrations/data/starter-tutorials.json') } } });
    f.migration('apps/pocketbase/pb_migrations/1789700000_expand_business_learning.js').up();
    f.migration('apps/pocketbase/pb_migrations/1791500001_workspace_claim_authority.js').up();
    const calls = [], client = { authStore: { record: { id: 'editor' } },
        collection: () => { throw new Error('No raw CRUD fallback'); },
        async send(path, input) {
            assert.equal(path, '/api/buildanddo/workspaces/ws1/claims');
            assert.equal(input.requestKey, null); assert.equal(input.cache, 'no-store');
            calls.push(plain(input.body)); return plain(f.load('workspace-claims.js').command(f.event('editor', input.body)));
        } };
    const api = createWorkspaceClaimClient({ client, ...scope, collection: 'daily_editions', observe: t.observe,
        keyFactory: () => 'synthetic-claim-telemetry-key', ...options });
    return { f, client, api, calls };
}
const edition = { title: privateText, summary: 'Synthetic source check', body: 'Synthetic draft', edition_date: '' };

for (const field of ['workspace', 'action', 'id', 'record', 'revision', 'replayed', 'record.owner', 'record.claim_revision', 'html', 'null'])
    test(`claim ${field} loss cannot report success and recovery preserves the exact native request`, async () => {
        const t = telemetry(), c = claims(t), send = c.client.send;
        c.client.send = async (...args) => {
            const value = await send(...args);
            if (field === 'html') return `<html>${privateText}</html>`;
            if (field === 'null') return null;
            if (field.startsWith('record.')) delete value.record[field.slice(7)]; else delete value[field];
            return value;
        };
        assert.equal((await c.api.write('create', '', edition)).reason, 'uncertain');
        outcome(t, 'uncertain', 'workspace.edition.save');
        c.client.send = send;
        const recovered = await c.api.retry();
        assert.equal(recovered.ok, true); assert.equal(recovered.replayed, true);
        assert.deepEqual(c.calls[1], c.calls[0]); assert.equal(c.f.data.daily_editions.length, 1);
        assert.deepEqual(t.actions.map((entry) => entry[1].outcome), ['uncertain', 'success']);
    });

test('SDK failures cannot turn a connected confirmed claim into an uncertain retry or duplicate save', async () => {
    const fail = () => { throw new Error(privateText); };
    const t = telemetry({ action: fail, event: fail, metric: fail }), c = claims(t);
    const result = await c.api.write('create', '', edition);
    assert.equal(result.ok, true); assert.equal(result.replayed, false); assert.equal(c.f.data.daily_editions.length, 1);
    assert.equal((await c.api.retry()).reason, 'invalid'); assert.equal(c.calls.length, 1);
    outcome(t, 'success', 'workspace.edition.save');
});

test('claim lifetime fences and deferred confirmation retain unresolved keys until acknowledged', async () => {
    let lifetime = 1;
    const t = telemetry(), c = claims(t, { getLifetime: () => lifetime, deferConfirmation: true });
    const send = c.client.send;
    c.client.send = async (...args) => { const result = await send(...args); lifetime++; return result; };
    assert.equal((await c.api.write('create', '', edition)).reason, 'scope_changed');
    outcome(t, 'scope_changed', 'workspace.edition.save');
    assert.equal(c.api.confirm(), false);
    c.client.send = send;
    assert.equal((await c.api.retry()).replayed, true);
    assert.equal((await c.api.write('create', '', { ...edition, title: 'Another draft' })).blockedByPending, true);
    assert.equal(c.api.confirm(), true); assert.equal((await c.api.retry()).reason, 'invalid');
    assert.deepEqual(c.calls[0], c.calls[1]); assert.equal(c.f.data.daily_editions.length, 1);
});

test('specialist desks and seat reports use their native verbs instead of generic creates', async () => {
    for (const [collection, values, action] of [['specialist_desks', { desk: 'research', scope: privateText, status: 'idle' }, 'desk.save'],
        ['seat_events', { event: 'progress', summary: privateText }, 'seat.report']]) {
        const t = telemetry(), c = claims(t, { collection });
        assert.equal((await c.api.write('create', '', values)).ok, true);
        outcome(t, 'success', `workspace.${action}`);
        assert.equal(t.actions[0][1].operation, action);
    }
});

test('record validation and late scope checks finish inside the observed write', async () => {
    for (const mode of ['malformed', 'scope']) {
        const t = telemetry(); let current = true;
        const client = { authStore: { record: { id: 'editor' } }, collection: () => ({ create: async (data) => {
            assert.equal(data.workspace, 'ws1'); assert.equal(data.owner, 'editor');
            if (mode === 'scope') current = false;
            return { workspace: 'ws1', ...(mode === 'scope' ? { id: 'syntheticrecord' } : {}), title: privateText };
        } }) };
        const api = createWorkspaceRecordClient({ client, ...scope, collection: 'erp_tasks', isCurrent: () => current, observe: t.observe });
        const result = await api.write('create', '', { title: privateText });
        assert.equal(result.ok, false);
        outcome(t, mode === 'scope' ? 'scope_changed' : 'uncertain');
    }
});

test('control commands retain native action names, validate receipts and do not emit read successes', async () => {
    const f = fixture(); f.enable(); const t = telemetry(), calls = [];
    let malformed = true;
    const client = { authStore: { record: { id: 'owner' } }, async send(_path, input) {
        if (input.method === 'GET') return plain(f.load('workspace-access.js').access(f.event()));
        calls.push(plain(input.body));
        const receipt = plain(f.load('workspace-administration.js').command(f.event('owner', input.body)));
        if (malformed) delete receipt.replayed;
        return receipt;
    } };
    const api = createWorkspaceControlClient({ client, ...scope, accountId: 'owner', observe: t.observe, keyFactory: () => 'synthetic-control-retry-key' });
    assert.equal((await api.read('access')).ok, true); assert.equal(t.actions.length, 0);
    assert.equal((await api.command('member.set', { user: 'newuser', role: 'editor' }, 1)).reason, 'uncertain');
    outcome(t, 'uncertain', 'workspace.member.set');
    malformed = false;
    assert.equal((await api.retry()).result.replayed, true);
    assert.deepEqual(calls[0], calls[1]); assert.equal(f.data.workspace_members.filter((row) => row.user === 'newuser').length, 1);
});

test('dossier receipts are validated before observation without losing encrypted-store retry identity', async () => {
    const f = dossierFixture(), t = telemetry(), calls = [];
    let malformed = true;
    const client = { authStore: { record: { id: 'editor' } }, async send(path, input) {
        assert.equal(input.requestKey, null); assert.equal(input.cache, 'no-store');
        const e = f.event('editor', input.body);
        if (path.endsWith('/read')) return plain(f.service.read(e));
        calls.push(plain(input.body)); const result = plain(f.service.command(e));
        if (malformed) delete result.dossier_id;
        return result;
    } };
    const api = createDossierClient({ client, ...scope, observe: t.observe, keyFactory: () => 'synthetic-dossier-retry-key' });
    assert.equal((await api.recall()).ok, true); assert.equal(t.actions.length, 0);
    assert.equal((await api.command('entity.create', f.input())).reason, 'uncertain');
    outcome(t, 'uncertain', 'workspace.dossier.entity.create');
    malformed = false;
    assert.equal((await api.retry()).result.replayed, true);
    assert.deepEqual(calls[0], calls[1]); assert.equal(f.data.dossier_entities.length, 1);
});

test('business observation preserves request bytes and scope rejection without automatic retries or raw writes', async () => {
    const t = telemetry(), body = { action: 'source.capture', request_key: 'synthetic-business-request', revision: 0,
        payload: { url: 'https://example.test/synthetic', binding: privateText } }, calls = [];
    let current = true, value = { workspace: 'foreign', id: privateText };
    const client = { authStore: { record: { id: 'editor' } }, async send(_path, input) { calls.push(input); return value; } };
    const api = createBusinessClient({ client, ...scope, isCurrent: () => current, observe: t.observe });
    assert.equal((await api.command(body)).reason, 'uncertain');
    outcome(t, 'uncertain', 'workspace.business.source.capture');
    value = { workspace: 'ws1', id: 'syntheticjob', status: 'queued' };
    assert.equal((await api.command(body)).data, value);
    assert.equal(calls.length, 2); assert.equal(calls[0].body, body); assert.equal(calls[1].body, body);
    assert.equal(calls[0].requestKey, null);
    client.send = async () => { current = false; return value; };
    assert.equal((await api.command(body)).stale, true);
    assert.deepEqual(t.actions.map((entry) => entry[1].outcome), ['uncertain', 'success', 'scope_changed']);
});

test('assistant semantic-unavailable 200 is not success and retains same-key explicit chat recovery', async () => {
    const f = assistantFixture(), t = telemetry(), calls = [];
    f.agentConfig.enabled = false;
    const client = { authStore: { record: { id: 'editor' } }, async send(path, input) {
        calls.push(input); const e = f.event('editor', input.body);
        return plain(path.endsWith('/chat') ? f.service.chat(e) : f.service.command(e));
    } };
    const api = createAssistantClient({ client, ...scope, observe: t.observe });
    const session = await api.command('session.start', { title: privateText }, 'synthetic-assistant-session');
    assert.equal(session.ok, true);
    outcome(t, 'success', 'workspace.assistant.session.start');
    const body = { session: session.data.id, message: privateText, surface: assistantSurface, request_key: 'synthetic-assistant-chat' };
    const result = await api.chat(body);
    assert.equal(result.ok, true); assert.equal(result.data.status, 'unavailable');
    assert.equal(t.actions[1][1].outcome, 'failure'); assert.equal(t.actions[1][1].reason, 'unavailable');
    assert.equal(f.agentConfig.calls.length, 0); assert.equal(calls.length, 2);
    f.agentConfig.enabled = true;
    assert.equal((await api.chat(body)).data.status, 'ready');
    assert.equal(calls[1].body, body); assert.equal(calls[2].body, body);
    assert.equal(f.data.assistant_turns.length, 1); assert.equal(f.agentConfig.calls.length, 1);
    assert.deepEqual(t.actions.map((entry) => entry[1].outcome), ['success', 'failure', 'success']);
    assert.doesNotMatch(JSON.stringify([t.actions, t.events, t.metrics]), new RegExp(privateText));
});

test('observed assistant commands still settle during polling while delayed chat remains fenced', async () => {
    for (const chat of [false, true]) {
        const f = assistantFixture(), session = f.start('editor'), t = telemetry(), held = deferred();
        let authorized = true;
        const client = { authStore: { record: { id: 'editor' } }, async send(path, input) {
            const e = f.event('editor', input.body);
            const result = plain(path.endsWith('/chat') ? f.service.chat(e) : f.service.command(e));
            await held.promise; return result;
        } };
        const api = createAssistantClient({ client, ...scope, isCurrent: () => authorized, isScopeCurrent: () => true, observe: t.observe });
        const result = chat ? api.chat({ session: session.id, message: privateText, surface: assistantSurface, request_key: 'synthetic-poll-chat' })
            : api.command('session.close', { session: session.id }, 'synthetic-poll-close');
        authorized = false; held.resolve();
        assert.equal((await result).ok, !chat);
        outcome(t, chat ? 'scope_changed' : 'success');
    }
});

test('business and assistant body.action are allowlisted without changing backend request admission', async () => {
    for (const create of [createBusinessClient, createAssistantClient]) {
        const t = telemetry(), calls = [];
        const client = { authStore: { record: { id: 'editor' } }, async send(_path, input) {
            calls.push(input.body); throw { status: 400, response: { message: privateText } };
        } };
        const api = create({ client, ...scope, observe: t.observe });
        const result = create === createBusinessClient ? await api.command({ action: privateText }) : await api.command(privateText, {}, 'synthetic-key');
        assert.equal(result.ok, false); assert.equal(calls.length, 1);
        assert.deepEqual([t.actions, t.events, t.metrics], [[], [], []]);
    }
});

for (const [name, create, invoke] of [
    ['business', createBusinessClient, (api) => api.command({ action: 'action.enqueue', request_key: 'synthetic-key', payload: {} })],
    ['assistant', createAssistantClient, (api) => api.command('session.start', { title: privateText }, 'synthetic-key')],
    ['dossier', createDossierClient, (api) => api.command('dossier.update', { about: privateText })],
]) for (const [status, expected] of [[403, 'forbidden'], [409, 'conflict'], [0, 'uncertain']])
    test(`${name} thrown ${status} is measured before the client preserves its existing failure contract`, async () => {
        const t = telemetry(), calls = [], error = { status, response: { message: privateText } };
        const client = { authStore: { record: { id: 'editor' } }, async send(...args) { calls.push(args); throw error; } };
        const api = create({ client, ...scope, observe: t.observe, keyFactory: () => 'synthetic-stable-request' });
        assert.equal((await invoke(api)).ok, false); assert.equal(calls.length, 1);
        outcome(t, expected);
    });

test('career import observation follows checksum, receipt validation and account fences, not native reads', async () => {
    const f = operatorFixture(), t = telemetry(); let current = true;
    const client = { authStore: { record: { id: 'editor' } }, async send(_path, input) {
        assert.equal(input.method, 'GET'); return plain(f.operator.snapshot(f.event('editor', {}, { query: input.query })));
    } };
    const held = deferred(); let delay = false;
    const crypto = { subtle: { digest: async (...args) => { if (delay) await held.promise; return webcrypto.subtle.digest(...args); } } };
    const api = createCareerClient({ client, ...scope, isCurrent: () => current, observe: t.observe, crypto });
    assert.equal((await api.read()).ok, true); assert.equal(t.actions.length, 0);
    assert.equal((await api.importReview('{malformed')).ok, false);
    outcome(t, 'failure', 'workspace.career.review.import');
    const raw = JSON.stringify(careerPacket());
    assert.equal((await api.importReview(raw)).ok, true);
    delay = true;
    const pending = api.importReview(raw); current = false; held.resolve();
    assert.equal((await pending).reason, 'scope_changed');
    assert.deepEqual(t.actions.map((entry) => entry[1].outcome), ['failure', 'success', 'scope_changed']);
    assert.equal(api.exportWork(), null);
});

test('blueprint analysis measures the actual validated response and preserves PDF and scope behavior', async () => {
    const f = decisionFixture(), t = telemetry(), calls = [];
    f.transport(() => ({ statusCode: 200, json: layoutBlueprintResult() }));
    let current = true, malformed = true;
    const client = { authStore: { record: { id: 'member' } }, async send(_path, input) {
        calls.push(input); const value = f.request(input.body, { operation: 'blueprints/analyze' }).result;
        if (malformed) delete value.blueprint.scan.pages;
        return value;
    } };
    const api = createBlueprintAnalysisClient({ client, ...scope, accountId: 'member', isCurrent: () => current, observe: t.observe });
    const bytes = new TextEncoder().encode('%PDF-1.4 synthetic');
    const file = { name: `${privateText}.pdf`, size: bytes.length, arrayBuffer: async () => bytes.buffer };
    assert.equal((await api.analyze(file)).ok, false);
    outcome(t, 'failure', 'workspace.blueprint.analyze');
    malformed = false;
    assert.equal((await api.analyze(file, true)).ok, true);
    assert.equal(calls[0].body.pdf_base64, btoa('%PDF-1.4 synthetic'));
    assert.equal(calls[1].body.include_prompts, true); assert.equal(calls[1].requestKey, null); assert.equal(calls[1].cache, 'no-store');
    client.send = async () => { current = false; return { ...layoutBlueprintResult(), workspace: 'ws1' }; };
    assert.equal((await api.analyze(file)).reason, 'scope_changed');
    assert.deepEqual(t.actions.map((entry) => entry[1].outcome), ['failure', 'success', 'scope_changed']);
});

test('the blueprint wrapper forwards its observer into analysis rather than silently dropping it', async () => {
    const t = telemetry(), response = { ...layoutBlueprintResult(), workspace: 'ws1' }, calls = [];
    const client = { authStore: { record: { id: 'editor' } }, async send(path, input) { calls.push({ path, input }); return response; } };
    const api = createBlueprintClient({ client, ...scope, observe: t.observe });
    const result = await api.analyze(new File(['%PDF-synthetic'], 'synthetic.pdf'), true);
    assert.equal(result.ok, true); assert.equal(result.data, response); assert.equal(calls.length, 1);
    assert.equal(calls[0].input.body.include_prompts, true); assert.equal(calls[0].input.requestKey, null);
    outcome(t, 'success', 'workspace.blueprint.analyze');
});

function savedBlueprints(t) {
    const f = blueprintFixture(), calls = []; let current = true;
    const client = { authStore: { record: { id: 'editor' } }, async send(path, request) {
        calls.push({ path, request });
        assert.equal(request.requestKey, null); assert.equal(request.cache, 'no-store');
        if (request.body instanceof FormData) {
            const file = request.body.get('asset');
            return f.upload({ bytes: Buffer.from(await file.arrayBuffer()), name: file.name,
                fields: { request_key: request.body.get('request_key'), input_sha256: request.body.get('input_sha256') } });
        }
        return plain(f.blueprint.command(f.event('editor', request.body, { id: path.split('/')[6] })));
    } };
    const api = createBlueprintClient({ client, ...scope, isCurrent: () => current, observe: t.observe });
    return { f, calls, client, api, setCurrent: (value) => { current = value; } };
}

for (const field of ['workspace', 'record', 'record.id', 'record.workspace', 'record.input_sha256', 'record.status', 'record.revision', 'replayed'])
    test(`saved blueprint ${field} loss is uncertain before telemetry and retains the original upload bytes`, async () => {
        const t = telemetry(), c = savedBlueprints(t), send = c.client.send;
        c.client.send = async (...args) => {
            const value = await send(...args);
            if (field.startsWith('record.')) delete value.record[field.slice(7)]; else delete value[field];
            return value;
        };
        assert.equal((await c.api.upload(new File(['%PDF-fixture'], 'synthetic.pdf'))).reason, 'uncertain');
        outcome(t, 'uncertain', 'workspace.blueprint.upload');
        c.client.send = send;
        assert.equal((await c.api.retry()).data.replayed, true);
        assert.equal(c.calls[1].request.body, c.calls[0].request.body);
        assert.equal(c.f.data.workspace_blueprints.length, 1);
        assert.deepEqual(t.actions.map((entry) => entry[1].outcome), ['uncertain', 'success']);
    });

test('saved blueprint commands retain native retry/cancel verbs and their exact uncertain request', async () => {
    const t = telemetry(), c = savedBlueprints(t); c.f.env.value = '';
    const saved = await c.api.upload(new File(['%PDF-fixture'], 'synthetic.pdf'));
    assert.equal(saved.data.record.status, 'blocked');
    c.f.env.value = JSON.stringify(c.f.registered);
    const send = c.client.send;
    c.client.send = async (...args) => { const value = await send(...args); delete value.record.id; return value; };
    assert.equal((await c.api.command(saved.data.record.id, 'retry', 1)).reason, 'uncertain');
    assert.equal(t.actions[1][0], 'workspace.blueprint.retry'); assert.equal(t.actions[1][1].outcome, 'uncertain');
    c.client.send = send;
    const recovered = await c.api.retry();
    assert.equal(recovered.ok, true); assert.equal(recovered.data.record.status, 'queued');
    assert.equal(c.calls[1].request.body, c.calls[2].request.body);
    assert.equal((await c.api.command(saved.data.record.id, 'cancel', recovered.data.record.revision)).data.record.status, 'cancelled');
    assert.deepEqual(t.actions.map((entry) => entry[0]), ['workspace.blueprint.upload', 'workspace.blueprint.retry', 'workspace.blueprint.retry', 'workspace.blueprint.cancel']);
    assert.deepEqual(t.actions.map((entry) => entry[1].outcome), ['success', 'uncertain', 'success', 'success']);
});

test('late saved-blueprint receipts never emit success or release their recovery identity', async () => {
    const t = telemetry(), c = savedBlueprints(t), send = c.client.send;
    c.client.send = async (...args) => { const value = await send(...args); c.setCurrent(false); return value; };
    assert.equal((await c.api.upload(new File(['%PDF-fixture'], 'synthetic.pdf'))).reason, 'scope_changed');
    outcome(t, 'scope_changed', 'workspace.blueprint.upload');
    c.client.send = send; c.setCurrent(true);
    assert.equal((await c.api.retry()).data.replayed, true);
    assert.equal(c.calls[0].request.body, c.calls[1].request.body); assert.equal(c.f.data.workspace_blueprints.length, 1);
});

for (const [name, create, options, invoke, expected] of [
    ['business scope', createBusinessClient, { isCurrent: () => false }, (api) => api.command({ action: 'source.capture' }), 'scope_changed'],
    ['assistant scope', createAssistantClient, { isCurrent: () => false }, (api) => api.command('session.start', {}, 'synthetic-key'), 'scope_changed'],
    ['control validation', createWorkspaceControlClient, {}, (api) => api.command('member.set', {}, -1), 'failure'],
    ['claim validation', createWorkspaceClaimClient, { collection: 'daily_editions' }, (api) => api.write('update', 'missing', edition), 'failure'],
    ['dossier validation', createDossierClient, {}, (api) => api.command('dossier.update', {}, -1), 'failure'],
    ['record validation', createWorkspaceRecordClient, { collection: 'erp_tasks' }, (api) => api.write('update', 'task', { workspace: 'foreign' }), 'failure'],
    ['career admission', createCareerClient, {}, (api) => api.importReview('{}'), 'failure'],
    ['analysis validation', createBlueprintAnalysisClient, {}, (api) => api.analyze(null), 'failure'],
    ['blueprint upload validation', createBlueprintClient, {}, (api) => api.upload(null), 'failure'],
    ['blueprint command validation', createBlueprintClient, {}, (api) => api.command('saved', 'cancel', -1), 'failure'],
]) test(`known ${name} denial emits once without a network attempt or response-semantic change`, async () => {
    const t = telemetry(); let requests = 0;
    const client = { authStore: { record: { id: 'editor' } }, send: () => { requests++; throw new Error('No request is admitted'); },
        collection: () => { requests++; throw new Error('No raw collection access is admitted'); } };
    const api = create({ client, ...scope, ...options, observe: t.observe });
    assert.equal((await invoke(api)).ok, false); assert.equal(requests, 0);
    outcome(t, expected);
});

test('record target denial is observed before a write and does not replace the existing failure result', async () => {
    const t = telemetry(), calls = [], denied = { status: 403, response: { message: privateText } };
    const client = { authStore: { record: { id: 'editor' } }, collection: () => ({
        getOne: async (...args) => { calls.push(args); throw denied; }, update: () => assert.fail('A denied target cannot be updated'),
    }) };
    const api = createWorkspaceRecordClient({ client, ...scope, collection: 'erp_tasks', observe: t.observe });
    assert.deepEqual(await api.write('update', 'synthetictask', { title: privateText }), { ok: false, reason: 'write_failed', error: privateText });
    assert.equal(calls.length, 1); assert.deepEqual(calls[0], ['synthetictask', { requestKey: null }]);
    outcome(t, 'forbidden', 'workspace.task.update');
});

test('business and dossier hooks construct their actual clients with the mutation observer', async () => {
    for (const kind of ['BusinessExecution', 'PrivateDossier']) {
        const t = telemetry(), f = kind === 'PrivateDossier' ? dossierFixture() : null, calls = [], module = { exports: {} };
        const pb = { authStore: { record: { id: 'editor' } }, async send(path, options) {
            calls.push({ path, options });
            if (f) return plain(path.endsWith('/read') ? f.service.read(f.event('editor', options.body)) : f.service.command(f.event('editor', options.body)));
            return { workspace: 'ws1', id: 'syntheticjob', status: 'queued' };
        } };
        const code = source(`apps/web/src/hooks/use${kind}.js`).replace(/^import .+;$/gm, '').replace(/\bexport /g, '');
        vm.runInNewContext(`${code}\nmodule.exports = { use${kind} };`, {
            module, pb, createBusinessClient, createDossierClient, observeMutation: t.observe,
            telemetrySection: () => '/app/dossier', readFailed: () => assert.fail('A successful read cannot report failure'),
            useMemo: (operation) => operation(), useRef: (current) => ({ current }), useState: (initial) => [initial, () => {}],
            useEffect: () => {}, useCallback: (operation) => operation,
            useAuth: () => ({ user: { id: 'editor' }, isAuthed: true }), useWorkspace: () => ({ active: { id: 'ws1' } }), useDemoMode: () => ({ demo: false }),
        });
        const hook = module.exports[`use${kind}`]();
        const result = f ? await hook.command('entity.create', f.input(), 0) : await hook.api.command({ action: 'source.capture', request_key: 'synthetic-source-key' });
        assert.equal(result.ok, true); assert.equal(calls.filter((call) => !call.path.endsWith('/read')).length, 1);
        outcome(t, 'success');
    }
});

test('personal knowledge retains its existing constructor scope while injecting observe in JSX source', () => {
    const code = source('apps/web/src/components/workspace/PersonalAssistantKnowledge.jsx');
    assert.match(code, /import \{ observeMutation \} from '@\/lib\/observability\/mutations'/);
    assert.match(code, /createAssistantClient\(\{[^}]+isCurrent:\s*\(\)\s*=>\s*alive\.current\s*&&\s*!demo[^}]+observe:\s*observeMutation/);
});
