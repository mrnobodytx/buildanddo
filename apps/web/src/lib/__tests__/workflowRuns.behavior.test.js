// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/workflowRuns.behavior.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/lib/workflowRuns.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/workflowRuns.js
// DAG Node:    none
// Intent:      Hold workflow run parsing, retry identity and scoped command/read results to their contract, including rejected, foreign and late responses.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { createRetryIntent, createWorkflowRunClient, readRunEvents, readRunSnapshot, readWorkflowSteps } from '@/lib/workflowRuns';

const DEFAULT_FAILURE = 'Could not confirm the saved result. Retry the same request to recover it.';
const deferred = () => { let resolve; let reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

/** A PocketBase-shaped client whose signed-in account can be switched mid-request. */
const fakeClient = (accountId = 'acct1') => {
    const runs = { getList: vi.fn(), getOne: vi.fn() };
    return {
        runs,
        authStore: { record: { id: accountId } },
        send: vi.fn(),
        collection: vi.fn(() => runs),
        filter: vi.fn((expression, params) => expression.replace(/\{:(\w+)\}/g, (_match, key) => JSON.stringify(params[key]))),
    };
};
const scoped = (overrides = {}) => {
    const client = overrides.client || fakeClient();
    const state = { current: true };
    const observe = overrides.observe || vi.fn((_collection, _verb, operation) => operation());
    const api = createWorkflowRunClient({ client, workspaceId: 'ws1', accountId: 'acct1',
        isCurrent: () => state.current, observe, ...overrides });
    return { api, client, state, observe };
};

describe('readWorkflowSteps', () => {
    it('parses stored JSON and keeps only named steps of a supported kind', () => {
        const stored = JSON.stringify([
            { id: 's1', name: 'Read rows', kind: 'read', detail: 'From export' },
            { name: 'No id or detail', kind: 'notify', detail: 42 },
            { id: 's3', name: 'Run task', kind: 'execute', action: { provider: 'erp' } },
            { id: 's4', name: 'Unknown kind', kind: 'teleport' },
            { id: 's5', kind: 'read' },
            null,
        ]);
        expect(readWorkflowSteps(stored)).toEqual([
            { id: 's1', name: 'Read rows', kind: 'read', detail: 'From export' },
            { id: '', name: 'No id or detail', kind: 'notify', detail: '' },
            { id: 's3', name: 'Run task', kind: 'execute', detail: '', action: { provider: 'erp' } },
        ]);
    });

    it('returns no steps for malformed JSON or a non-list value', () => {
        expect(readWorkflowSteps('{not json')).toEqual([]);
        expect(readWorkflowSteps({ name: 'single', kind: 'read' })).toEqual([]);
        expect(readWorkflowSteps(undefined)).toEqual([]);
    });

    it('only carries an action on execute steps', () => {
        const [step] = readWorkflowSteps([{ id: 'x', name: 'Read', kind: 'read', action: { provider: 'erp' } }]);
        expect(step).not.toHaveProperty('action');
    });
});

describe('readRunSnapshot', () => {
    const steps = [{ id: 's1', name: 'Read rows', kind: 'read' }];

    it('accepts a version 1 snapshot stored as a JSON string', () => {
        const snapshot = readRunSnapshot({ snapshot: JSON.stringify({ version: 1, name: 'Weekly', steps }) });
        expect(snapshot).toMatchObject({ version: 1, name: 'Weekly', steps: [{ id: 's1', detail: '' }] });
    });

    it('rejects an unsupported version, a missing name or missing steps', () => {
        expect(readRunSnapshot({ snapshot: { version: 2, name: 'Weekly', steps } })).toBeNull();
        expect(readRunSnapshot({ snapshot: { version: 1, steps } })).toBeNull();
        expect(readRunSnapshot({ snapshot: { version: 1, name: 'Weekly', steps: 'nope' } })).toBeNull();
        expect(readRunSnapshot({ snapshot: 'corrupt' })).toBeNull();
        expect(readRunSnapshot({})).toBeNull();
    });

    it('rejects a snapshot when any saved step is unreadable or there are none', () => {
        expect(readRunSnapshot({ snapshot: { version: 1, name: 'Weekly', steps: [...steps, { name: 'Bad', kind: 'teleport' }] } })).toBeNull();
        expect(readRunSnapshot({ snapshot: { version: 1, name: 'Weekly', steps: [] } })).toBeNull();
    });
});

describe('readRunEvents', () => {
    it('keeps only receipts with an observation, an actor and a timestamp', () => {
        const valid = { actor: 'acct1', at: '2026-10-01T00:00:00Z', command: { observation: 'Saw it' } };
        const events = JSON.stringify([valid, null, { actor: 'acct1', at: 'x' },
            { actor: 'acct1', at: 'x', command: { observation: 3 } },
            { actor: 7, at: 'x', command: { observation: 'Saw it' } },
            { actor: 'acct1', command: { observation: 'Saw it' } }]);
        expect(readRunEvents({ events })).toEqual([valid]);
    });

    it('returns no receipts for unparseable or absent events', () => {
        expect(readRunEvents({ events: '[oops' })).toEqual([]);
        expect(readRunEvents({})).toEqual([]);
    });
});

describe('createRetryIntent', () => {
    it('reuses one request key until the submitted input changes', () => {
        const generateKey = vi.fn().mockReturnValueOnce('key-1').mockReturnValueOnce('key-2');
        const intent = createRetryIntent(generateKey);
        expect(intent({ workflow: 'w1' })).toEqual({ workflow: 'w1', request_key: 'key-1' });
        expect(intent({ workflow: 'w1' })).toEqual({ workflow: 'w1', request_key: 'key-1' });
        expect(intent({ workflow: 'w2' })).toEqual({ workflow: 'w2', request_key: 'key-2' });
        expect(generateKey).toHaveBeenCalledTimes(2);
    });

    it('generates random UUID keys by default', () => {
        const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('uuid-1');
        try {
            expect(createRetryIntent()({ a: 1 }).request_key).toBe('uuid-1');
        } finally { spy.mockRestore(); }
    });
});

describe('createWorkflowRunClient commands', () => {
    it('starts a run in the mounted workspace through the observed create mutation', async () => {
        const { api, client, observe } = scoped();
        client.send.mockResolvedValue({ record: { id: 'run1', workspace: 'ws1' }, replayed: true });
        await expect(api.start({ workflow: 'w1', request_key: 'k' })).resolves.toEqual({
            ok: true, record: { id: 'run1', workspace: 'ws1' }, replayed: true });
        expect(observe).toHaveBeenCalledWith('workflow_runs', 'create', expect.any(Function));
        expect(client.send).toHaveBeenCalledWith('/api/buildanddo/workflow-runs', {
            method: 'POST', body: { workflow: 'w1', request_key: 'k', workspace: 'ws1' }, requestKey: null });
    });

    it('records a decision against the encoded run path as an update and reports a fresh write', async () => {
        const { api, client, observe } = scoped();
        client.send.mockResolvedValue({ record: { id: 'run/1', workspace: 'ws1' } });
        const result = await api.decide('run/1', { action: 'step' });
        expect(result).toEqual({ ok: true, record: { id: 'run/1', workspace: 'ws1' }, replayed: false });
        expect(client.send.mock.calls[0][0]).toBe('/api/buildanddo/workflow-runs/run%2F1/decisions');
        expect(observe).toHaveBeenCalledWith('workflow_runs', 'update', expect.any(Function));
    });

    it('works without an explicit observer', async () => {
        const client = fakeClient();
        client.send.mockResolvedValue({ record: { id: 'run1', workspace: 'ws1' } });
        const api = createWorkflowRunClient({ client, workspaceId: 'ws1', accountId: 'acct1', isCurrent: () => true });
        await expect(api.start({})).resolves.toMatchObject({ ok: true });
    });

    it('refuses to send when the scope is missing, not current or signed in as another account', async () => {
        for (const options of [{ workspaceId: '' }, { accountId: '' }, { client: fakeClient('someone-else') }]) {
            const { api, client } = scoped(options);
            await expect(api.start({})).resolves.toEqual({ ok: false, reason: 'scope_changed', error: '' });
            expect(client.send).not.toHaveBeenCalled();
        }
        const { api, client, state } = scoped();
        state.current = false;
        await expect(api.decide('run1', {})).resolves.toMatchObject({ reason: 'scope_changed' });
        expect(client.send).not.toHaveBeenCalled();
    });

    it('rejects a second command while one is in flight and accepts one after it settles', async () => {
        const { api, client } = scoped(); const pending = deferred();
        client.send.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ record: { id: 'run2', workspace: 'ws1' } });
        const first = api.start({ workflow: 'w1' });
        await expect(api.decide('run1', {})).resolves.toEqual({ ok: false, reason: 'busy', error: '' });
        pending.resolve({ record: { id: 'run1', workspace: 'ws1' } });
        await expect(first).resolves.toMatchObject({ ok: true });
        await expect(api.start({ workflow: 'w2' })).resolves.toMatchObject({ ok: true, record: { id: 'run2' } });
        expect(client.send).toHaveBeenCalledTimes(2);
    });

    it('treats a response without a record, or for another workspace, as unconfirmed', async () => {
        const { api, client } = scoped();
        client.send.mockResolvedValueOnce({}).mockResolvedValueOnce({ record: { id: 'run1', workspace: 'foreign' } });
        await expect(api.start({})).resolves.toEqual({ ok: false, reason: 'request_failed', error: DEFAULT_FAILURE });
        await expect(api.start({})).resolves.toEqual({ ok: false, reason: 'request_failed', error: DEFAULT_FAILURE });
    });

    it('reports a stale revision as a conflict with the backend message', async () => {
        const { api, client } = scoped();
        client.send.mockRejectedValue({ status: 409, response: { message: 'The run changed. Reload it.' } });
        await expect(api.decide('run1', { revision: 1 })).resolves.toEqual({
            ok: false, reason: 'conflict', error: 'The run changed. Reload it.' });
    });

    it('keeps a lost response recoverable with the default retry message', async () => {
        const { api, client } = scoped();
        client.send.mockRejectedValue(new Error('network down'));
        await expect(api.start({})).resolves.toEqual({ ok: false, reason: 'request_failed', error: DEFAULT_FAILURE });
    });

    it('discards a late success or failure once the scope has changed', async () => {
        const { api, client, state } = scoped();
        const success = deferred();
        client.send.mockReturnValueOnce(success.promise);
        const late = api.start({});
        state.current = false; success.resolve({ record: { id: 'run1', workspace: 'ws1' } });
        await expect(late).resolves.toMatchObject({ ok: false, reason: 'scope_changed' });

        state.current = true;
        const failure = deferred();
        client.send.mockReturnValueOnce(failure.promise);
        const lateFailure = api.start({});
        client.authStore.record = { id: 'next-account' }; failure.reject({ status: 500 });
        await expect(lateFailure).resolves.toMatchObject({ ok: false, reason: 'scope_changed' });
    });
});

describe('createWorkflowRunClient reads', () => {
    const page = (items) => ({ page: 1, perPage: 20, totalItems: items.length, totalPages: 1, items });

    it('lists the first page of the workspace by default, newest first', async () => {
        const { api, client } = scoped();
        client.runs.getList.mockResolvedValue(page([{ id: 'run1', workspace: 'ws1' }]));
        await expect(api.list()).resolves.toEqual({ ok: true, page: page([{ id: 'run1', workspace: 'ws1' }]) });
        expect(client.collection).toHaveBeenCalledWith('workflow_runs');
        expect(client.runs.getList).toHaveBeenCalledWith(1, 20, { filter: 'workspace = "ws1"', sort: '-started_at,-id', requestKey: null });
    });

    it('narrows the list by workflow and status when both are chosen', async () => {
        const { api, client } = scoped();
        client.runs.getList.mockResolvedValue(page([]));
        await api.list({ page: 3, workflow: 'w1', status: 'failed' });
        expect(client.runs.getList).toHaveBeenCalledWith(3, 20, expect.objectContaining({
            filter: 'workspace = "ws1" && workflow = "w1" && status = "failed"' }));
    });

    it('rejects a page that is malformed or contains another workspace’s run', async () => {
        const { api, client } = scoped();
        client.runs.getList.mockResolvedValueOnce({ items: null })
            .mockResolvedValueOnce(page([{ id: 'run1', workspace: 'ws1' }, { id: 'run2', workspace: 'foreign' }]));
        await expect(api.list()).resolves.toEqual({ ok: false, reason: 'request_failed', error: DEFAULT_FAILURE });
        await expect(api.list()).resolves.toEqual({ ok: false, reason: 'request_failed', error: DEFAULT_FAILURE });
    });

    it('reports a failed list read, or nothing at all once the scope has moved on', async () => {
        const { api, client, state } = scoped();
        client.runs.getList.mockRejectedValueOnce({ status: 0, response: { message: 'Offline' } });
        await expect(api.list()).resolves.toEqual({ ok: false, reason: 'request_failed', error: 'Offline' });

        const slow = deferred();
        client.runs.getList.mockReturnValueOnce(slow.promise);
        const pending = api.list();
        state.current = false; slow.resolve(page([]));
        await expect(pending).resolves.toMatchObject({ reason: 'scope_changed' });

        state.current = true;
        const failing = deferred();
        client.runs.getList.mockReturnValueOnce(failing.promise);
        const pendingFailure = api.list();
        state.current = false; failing.reject(new Error('late'));
        await expect(pendingFailure).resolves.toMatchObject({ reason: 'scope_changed' });
        await expect(api.list()).resolves.toMatchObject({ reason: 'scope_changed' });
        expect(client.runs.getList).toHaveBeenCalledTimes(3);
    });

    it('reads one run only when it belongs to the mounted workspace', async () => {
        const { api, client } = scoped();
        client.runs.getOne.mockResolvedValueOnce({ id: 'run1', workspace: 'ws1' }).mockResolvedValueOnce({ id: 'run2', workspace: 'foreign' });
        await expect(api.read('run1')).resolves.toEqual({ ok: true, record: { id: 'run1', workspace: 'ws1' } });
        expect(client.runs.getOne).toHaveBeenCalledWith('run1', { requestKey: null });
        await expect(api.read('run2')).resolves.toEqual({ ok: false, reason: 'request_failed', error: DEFAULT_FAILURE });
    });

    it('reports a missing run, and drops a read that returns after the scope changed', async () => {
        const { api, client, state } = scoped();
        client.runs.getOne.mockRejectedValueOnce({ status: 404, response: { message: 'Not found.' } });
        await expect(api.read('gone')).resolves.toEqual({ ok: false, reason: 'request_failed', error: 'Not found.' });

        const slow = deferred();
        client.runs.getOne.mockReturnValueOnce(slow.promise);
        const pending = api.read('run1');
        state.current = false; slow.resolve({ id: 'run1', workspace: 'ws1' });
        await expect(pending).resolves.toMatchObject({ reason: 'scope_changed' });

        state.current = true;
        const failing = deferred();
        client.runs.getOne.mockReturnValueOnce(failing.promise);
        const pendingFailure = api.read('run1');
        state.current = false; failing.reject(new Error('late'));
        await expect(pendingFailure).resolves.toMatchObject({ reason: 'scope_changed' });
        await expect(api.read('run1')).resolves.toMatchObject({ reason: 'scope_changed' });
        expect(client.runs.getOne).toHaveBeenCalledTimes(3);
    });
});
