// ─── CGRF Header ───────────────────────────────────────────────
// File:        tests/upgrade/workflow-client.test.mjs
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/workflowRuns.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workflowRuns.js
// DAG Node:    none
// Intent:      Verify retry identity, bounded reads and account/workspace isolation using the actual browser command adapter.
// ───────────────────────────────────────────────────────────────

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetryIntent, createWorkflowRunClient, readWorkflowSteps, readRunSnapshot, readRunEvents,
    RUN_STATUS, STEP_KINDS } from '../../apps/web/src/lib/workflowRuns.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { resolve, reject, promise }; };
const run = { id: 'run1', workspace: 'workspace1', revision: 1, status: 'running' };
function fixture() {
    const requests = []; const observations = []; let live = true;
    const client = {
        authStore: { record: { id: 'account1' } },
        send: async (path, options) => { requests.push({ path, options }); return { record: run }; },
        filter: (format, params) => { requests.push({ format, params }); return 'bound-filter'; },
        collection: (name) => { assert.equal(name, 'workflow_runs'); return collection; },
    };
    const collection = {
        getList: async (...args) => { requests.push({ list: args }); return { items: [run], page: 1, totalPages: 1, totalItems: 1 }; },
        getOne: async (...args) => { requests.push({ read: args }); return run; },
    };
    const api = createWorkflowRunClient({ client, accountId: 'account1', workspaceId: 'workspace1', isCurrent: () => live,
        observe: async (name, verb, operation) => { observations.push([name, verb]); return operation(); } });
    return { api, client, collection, requests, observations, leave: () => { live = false; } };
}

test('workflow display helpers tolerate malformed legacy JSON without rendering arbitrary objects', () => {
    for (const input of [null, false, {}, 'invalid', 'false', '[null,1,{}]']) assert.deepEqual(readWorkflowSteps(input), []);
    const step = { name: 'Read', kind: 'read', detail: '' };
    assert.deepEqual(readWorkflowSteps(JSON.stringify([step])), [{ id: '', ...step }]);
    assert.equal(readWorkflowSteps([{ ...step, id: 'step1', detail: {} }])[0].detail, '');
    assert.equal(readRunSnapshot({ snapshot: { version: 2 } }), null);
    assert.equal(readRunSnapshot({ snapshot: { version: 1, name: 'A', steps: [null] } }), null);
    assert.equal(readRunSnapshot({ snapshot: JSON.stringify({ version: 1, name: 'A', steps: [step] }) }).name, 'A');
    assert.deepEqual(readRunEvents({ events: '[null,{}]' }), []);
    assert.deepEqual(readRunEvents({ events: null }), []);
    const receipt = { command: { observation: 'Observed' }, actor: 'account1', at: '2026-09-15' };
    assert.deepEqual(readRunEvents({ events: JSON.stringify([receipt]) }), [receipt]);
    assert.equal(Object.keys(STEP_KINDS).length, 6); assert.equal(Object.keys(RUN_STATUS).length, 5);
});

test('retry intent survives failures and changes only when the proposed decision changes', () => {
    let next = 0; const intent = createRetryIntent(() => `request-${++next}`);
    assert.equal(intent({ outcome: 'passed', revision: 1 }).request_key, 'request-1');
    assert.equal(intent({ outcome: 'passed', revision: 1 }).request_key, 'request-1');
    assert.equal(intent({ outcome: 'failed', revision: 1 }).request_key, 'request-2');
    assert.equal(intent({ outcome: 'failed', revision: 2 }).request_key, 'request-3');
    assert.match(createRetryIntent()({}).request_key, /^[a-z0-9-]+$/);
});

test('commands pin workspace, use separate POST requests and measure actual mutations', async () => {
    const f = fixture(); const body = { workspace: 'forged', workflow: 'flow1', request_key: 'request-0000000001' };
    assert.equal((await f.api.start(body)).ok, true);
    assert.equal(f.requests[0].options.body.workspace, 'workspace1');
    assert.equal(f.requests[0].options.requestKey, null);
    assert.equal(f.requests[0].options.method, 'POST');
    await f.api.decide('a/b', { revision: 1 });
    assert.match(f.requests[1].path, /a%2Fb\/decisions$/);
    assert.deepEqual(f.observations, [['workflow_runs', 'create'], ['workflow_runs', 'update']]);
    f.client.send = async () => ({ record: run, replayed: true });
    assert.equal((await f.api.start(body)).replayed, true);
});

test('lost response can retry the same key and structured conflicts retain their meaning', async () => {
    const f = fixture(); const intent = createRetryIntent(() => 'stable-request-0001');
    const request = intent({ workflow: 'flow1' });
    f.client.send = async () => { throw new Error('response lost after commit'); };
    assert.match((await f.api.start(request)).error, /confirm the saved result/);
    f.client.send = async () => ({ record: run, replayed: true });
    assert.equal(intent({ workflow: 'flow1' }).request_key, request.request_key);
    assert.equal((await f.api.start(request)).replayed, true);
    f.client.send = async () => { throw { status: 409, response: { message: 'Reload the latest run.' } }; };
    assert.deepEqual(await f.api.decide(run.id, {}), { ok: false, reason: 'conflict', error: 'Reload the latest run.' });
    f.client.send = async () => ({ record: { ...run, workspace: 'foreign' } });
    assert.equal((await f.api.start(request)).ok, false);
    f.client.send = async () => ({}); assert.equal((await f.api.start(request)).ok, false);
});

test('duplicate clicks and responses after account changes cannot affect the active workspace', async () => {
    const f = fixture(); const wait = deferred(); f.client.send = () => wait.promise;
    const pending = f.api.start({});
    assert.equal((await f.api.start({})).reason, 'busy');
    f.client.authStore.record = { id: 'account2' }; wait.resolve({ record: run });
    assert.equal((await pending).reason, 'scope_changed');
    assert.equal((await f.api.decide(run.id, {})).reason, 'scope_changed');
    const late = fixture(); const failure = deferred(); late.client.send = () => failure.promise;
    const result = late.api.start({}); late.leave(); failure.reject(new Error('late error'));
    assert.deepEqual(await result, { ok: false, reason: 'scope_changed', error: '' });
});

test('history uses bounded pages and parameterized workflow/status filters', async () => {
    const f = fixture(); const response = await f.api.list({ page: 3, workflow: 'workflow1', status: 'awaiting_approval' });
    assert.equal(response.ok, true);
    assert.deepEqual(f.requests[0], { format: 'workspace = {:workspace} && workflow = {:workflow} && status = {:status}',
        params: { workspace: 'workspace1', workflow: 'workflow1', status: 'awaiting_approval' } });
    assert.deepEqual(f.requests[1].list, [3, 20, { filter: 'bound-filter', sort: '-started_at,-id', requestKey: null }]);
    assert.equal((await f.api.read(run.id)).record.id, run.id);
    assert.deepEqual(f.requests[2].read, [run.id, { requestKey: null }]);
    assert.equal((await f.api.list()).ok, true);
});

test('reads suppress private results and errors after scope changes, and surface genuine outages', async () => {
    for (const method of ['list', 'read']) {
        const f = fixture(); const wait = deferred();
        f.collection[method === 'list' ? 'getList' : 'getOne'] = () => wait.promise;
        const pending = f.api[method](); f.leave(); wait.resolve(method === 'list' ? { items: [run] } : run);
        assert.equal((await pending).reason, 'scope_changed');
        assert.equal((await f.api[method]()).reason, 'scope_changed');
        const g = fixture(); g.collection[method === 'list' ? 'getList' : 'getOne'] = async () => { throw new Error('offline'); };
        assert.equal((await g.api[method]()).ok, false);
        const h = fixture(); const lost = deferred(); h.collection[method === 'list' ? 'getList' : 'getOne'] = () => lost.promise;
        const noLongerCurrent = h.api[method](); h.leave(); lost.reject(new Error('offline'));
        assert.equal((await noLongerCurrent).reason, 'scope_changed');
        const foreign = fixture(); foreign.collection[method === 'list' ? 'getList' : 'getOne'] = async () =>
            method === 'list' ? { items: [{ ...run, workspace: 'foreign' }] } : { ...run, workspace: 'foreign' };
        assert.equal((await foreign.api[method]()).ok, false);
    }
});
