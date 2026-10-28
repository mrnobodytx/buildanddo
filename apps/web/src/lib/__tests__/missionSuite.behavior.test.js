// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/missionSuite.behavior.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/lib/missionSuite.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/missionSuite.js
// DAG Node:    none
// Intent:      Prove suite reads reject foreign or malformed responses, commands keep
//              one recoverable request identity across uncertain writes, account
//              changes discard private state, and PDFs are fingerprinted locally.
// ───────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createSuiteClient, fingerprintPdf } from '@/lib/missionSuite';

const ACCOUNT = 'acc_pilot';
const WORKSPACE = 'ws_atlas';
const MISSION = 'msn_harbour';
const KEY = 'requestkey0123456789';
const SHA = 'a'.repeat(64);

const run = (overrides = {}) => ({ id: 'run_1', workspace: WORKSPACE, mission: MISSION, owner: ACCOUNT, suite: 'maritime', status: 'queued',
    revision: 1, attempt: 0, config_revision: 0, base_revision: 0, input_sha256: SHA, binding: '', created: '2026-10-01', processed_at: '',
    failure: '', evidence: '', result_sha256: '', ...overrides });
const snapshot = (overrides = {}) => ({ workspace: WORKSPACE, mission: MISSION, page: 1, has_more: false, role: 'editor', items: [run()],
    configured: true, control: { revision: 2, state_revision: 1, enabled: true, rights: ['observe'], active_run: '', observations: 0, parameters: {} }, ...overrides });
const receipt = (action, revision, overrides = {}) => ({ workspace: WORKSPACE, mission: MISSION, action, id: 'run_1', revision, replayed: false, ...overrides });

function setup({ send = vi.fn(), live = { value: true }, demo = false, accountId = ACCOUNT, keyFactory = () => KEY, observe } = {}) {
    const client = { authStore: { record: { id: ACCOUNT } }, send };
    const api = createSuiteClient({ client, accountId, workspaceId: WORKSPACE, missionId: MISSION, demo, isCurrent: () => live.value, keyFactory,
        ...(observe ? { observe } : {}) });
    return { api, client, send, live };
}

describe('createSuiteClient reads', () => {
    it('posts a snapshot envelope for the current mission and returns validated data', async () => {
        const { api, send } = setup({ send: vi.fn().mockResolvedValue(snapshot()) });
        const result = await api.read();
        expect(result).toEqual({ ok: true, data: snapshot() });
        expect(send).toHaveBeenCalledWith(`/api/buildanddo/workspaces/${WORKSPACE}/suite`, { method: 'POST', cache: 'no-store', requestKey: null,
            body: { action: 'snapshot', mission: MISSION, payload: { page: 1 }, revision: 0, request_key: KEY } });
    });

    it('refuses invalid page numbers without contacting the server', async () => {
        const { api, send } = setup();
        for (const page of [0, 1.5, 10000]) expect(await api.read(page)).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(send).not.toHaveBeenCalled();
    });

    it('rejects snapshots from another workspace or mission, or with a malformed run', async () => {
        for (const data of [snapshot({ workspace: 'ws_other' }), snapshot({ mission: 'msn_other' }), snapshot({ page: 2 }), snapshot({ role: 'guest' }),
            snapshot({ items: [run({ status: 'exploded' })] }), snapshot({ items: [run({ revision: 0 })] }), snapshot({ items: [run({ input_sha256: 'xyz' })] }),
            snapshot({ items: [run({ suite: 'unknown' })] }), snapshot({ items: [run({ evidence: null })] }), snapshot({ control: null }), null]) {
            const { api } = setup({ send: vi.fn().mockResolvedValue(data) });
            expect(await api.read()).toMatchObject({ ok: false, reason: 'unavailable' });
        }
    });

    it('does nothing and reports a scope change when the client is in demo mode, mis-scoped or signed out', async () => {
        const send = vi.fn();
        expect(await setup({ send, demo: true }).api.read()).toEqual({ ok: false, reason: 'scope_changed', error: '' });
        expect(await setup({ send, accountId: 'bad id' }).api.read()).toMatchObject({ reason: 'scope_changed' });
        expect(await setup({ send, live: { value: false } }).api.read()).toMatchObject({ reason: 'scope_changed' });
        const signedOut = setup({ send });
        signedOut.client.authStore.record = null;
        expect(await signedOut.api.read()).toMatchObject({ reason: 'scope_changed' });
        expect(send).not.toHaveBeenCalled();
    });

    it('discards a response that arrives after the account or workspace changed', async () => {
        const live = { value: true };
        const { api } = setup({ live, send: vi.fn(async () => { live.value = false; return snapshot(); }) });
        expect(await api.read()).toMatchObject({ reason: 'scope_changed' });
    });

    it('discards a failure that arrives after the scope changed', async () => {
        const live = { value: true };
        const { api } = setup({ live, send: vi.fn(async () => { live.value = false; throw { status: 500 }; }) });
        expect(await api.read()).toMatchObject({ reason: 'scope_changed' });
    });

    it('maps read failures to forbidden, conflict and unavailable', async () => {
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 401 }) }).api.read()).toMatchObject({ reason: 'forbidden' });
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 409 }) }).api.read()).toMatchObject({ reason: 'conflict' });
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 500, response: { message: '  ' } }) }).api.read())
            .toMatchObject({ reason: 'unavailable', error: expect.stringContaining('mission suite is unavailable') });
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 500, response: { message: 'Something went wrong while processing your request.' } }) }).api.read())
            .toMatchObject({ error: expect.stringContaining('mission suite is unavailable') });
    });

    it('uses a browser-generated UUID as the request identity by default', async () => {
        const send = vi.fn().mockResolvedValue(snapshot());
        const client = { authStore: { record: { id: ACCOUNT } }, send };
        const api = createSuiteClient({ client, accountId: ACCOUNT, workspaceId: WORKSPACE, missionId: MISSION, isCurrent: () => true });
        expect(await api.read()).toMatchObject({ ok: true });
        await api.read();
        const [first, second] = send.mock.calls.map(([, options]) => options.body.request_key);
        expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(second).not.toBe(first);
    });

    it('reports unavailable when no valid request identity can be generated for a read', async () => {
        const { api, send } = setup({ keyFactory: () => 'short' });
        expect(await api.read()).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(send).not.toHaveBeenCalled();
    });
});

describe('createSuiteClient detail', () => {
    const detail = (record) => ({ workspace: WORKSPACE, mission: MISSION, record });
    const result = (overrides = {}) => ({ schema_version: 'mission-suite.result/v1', tenant_id: WORKSPACE, mission_id: MISSION, release_state: 'HOLD',
        input_sha256: SHA, source_sha256: 'b'.repeat(64), analysis: {}, proof: { authority: 'evidence_only' }, ...overrides });

    it('accepts a run detail without a result or with an evidence-only held result', async () => {
        const plain = detail(run({ input_canonical: '{}', result_canonical: '' }));
        expect(await setup({ send: vi.fn().mockResolvedValue(plain) }).api.detail('run_1')).toEqual({ ok: true, data: plain });
        const held = detail(run({ input_canonical: '{}', result_canonical: '{}', result: result() }));
        expect(await setup({ send: vi.fn().mockResolvedValue(held) }).api.detail('run_1')).toEqual({ ok: true, data: held });
    });

    it('rejects an invalid run id without contacting the server', async () => {
        const { api, send } = setup();
        expect(await api.detail('../other')).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(send).not.toHaveBeenCalled();
    });

    it('rejects a different run, missing canonical text, or a result that is released or bound elsewhere', async () => {
        for (const record of [run({ id: 'run_2', input_canonical: '{}', result_canonical: '' }), run({ result_canonical: '' }),
            run({ input_canonical: '{}' }),
            run({ input_canonical: '{}', result_canonical: '{}', result: result({ release_state: 'RELEASE' }) }),
            run({ input_canonical: '{}', result_canonical: '{}', result: result({ tenant_id: 'ws_other' }) }),
            run({ input_canonical: '{}', result_canonical: '{}', result: result({ proof: { authority: 'binding' } }) }),
            run({ input_canonical: '{}', result_canonical: '{}', result: result({ source_sha256: 'nope' }) })]) {
            expect(await setup({ send: vi.fn().mockResolvedValue(detail(record)) }).api.detail('run_1')).toMatchObject({ ok: false, reason: 'unavailable' });
        }
        expect(await setup({ send: vi.fn().mockResolvedValue({ workspace: WORKSPACE, mission: MISSION }) }).api.detail('run_1')).toMatchObject({ ok: false });
    });
});

describe('createSuiteClient commands', () => {
    it('sends a configure command through the observer and accepts the next revision', async () => {
        const observe = vi.fn((_name, _action, operation) => operation());
        const { api, send } = setup({ observe, send: vi.fn().mockResolvedValue(receipt('configure', 4)) });
        expect(await api.command('configure', { parameters: { depth: 3 } }, 3)).toEqual({ ok: true, result: receipt('configure', 4) });
        expect(observe).toHaveBeenCalledWith('suite_runs', 'update', expect.any(Function));
        expect(send.mock.calls[0][1].body).toEqual({ action: 'configure', mission: MISSION, payload: { parameters: { depth: 3 } }, revision: 3, request_key: KEY });
    });

    it('accepts an enqueue receipt only at revision one', async () => {
        expect(await setup({ send: vi.fn().mockResolvedValue(receipt('enqueue', 1)) }).api.command('enqueue', { suite: 'maritime' }))
            .toMatchObject({ ok: true });
        expect(await setup({ send: vi.fn().mockResolvedValue(receipt('enqueue', 2)) }).api.command('enqueue', { suite: 'maritime' }))
            .toMatchObject({ ok: false, reason: 'uncertain' });
    });

    it('accepts a run command only for the same run at the next revision', async () => {
        expect(await setup({ send: vi.fn().mockResolvedValue(receipt('cancel', 3)) }).api.command('cancel', { id: 'run_1' }, 2)).toMatchObject({ ok: true });
        expect(await setup({ send: vi.fn().mockResolvedValue(receipt('cancel', 3, { id: 'run_2' })) }).api.command('cancel', { id: 'run_1' }, 2))
            .toMatchObject({ reason: 'uncertain' });
        expect(await setup({ send: vi.fn().mockResolvedValue(receipt('cancel', 4)) }).api.command('cancel', { id: 'run_1' }, 2))
            .toMatchObject({ reason: 'uncertain' });
        expect(await setup({ send: vi.fn().mockResolvedValue(receipt('configure', 4)) }).api.command('configure', {}, 2))
            .toMatchObject({ reason: 'uncertain' });
    });

    it('treats an incomplete receipt as uncertain and keeps the same request identity for recovery', async () => {
        const keyFactory = vi.fn().mockReturnValueOnce(KEY).mockReturnValueOnce('anotherkey0123456789');
        const send = vi.fn().mockResolvedValueOnce(receipt('attach', 2, { replayed: 'no' })).mockResolvedValueOnce(receipt('attach', 2, { replayed: true }));
        const { api } = setup({ send, keyFactory });
        expect(await api.command('attach', { id: 'run_1' }, 1)).toMatchObject({ ok: false, reason: 'uncertain', error: expect.stringContaining('not confirmed') });
        expect(await api.command('attach', { id: 'run_1' }, 1)).toEqual({ ok: true, result: receipt('attach', 2, { replayed: true }) });
        expect(send.mock.calls[1][1].body.request_key).toBe(KEY);
        expect(keyFactory).toHaveBeenCalledTimes(1);
    });

    it('refuses a different change while an uncertain save is unresolved, then recovers it with retry', async () => {
        const send = vi.fn().mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce(receipt('retry', 2));
        const { api } = setup({ send });
        expect(await api.command('retry', { id: 'run_1' }, 1)).toMatchObject({ reason: 'uncertain' });
        expect(await api.command('cancel', { id: 'run_1' }, 1)).toEqual({ ok: false, reason: 'uncertain', error: 'Recover the previous save before starting a different change.' });
        expect(await api.retry()).toEqual({ ok: true, result: receipt('retry', 2) });
        expect(await api.retry()).toEqual({ ok: false, reason: 'invalid', error: 'There is no unresolved save.' });
    });

    it('treats key order as the same change when recovering', async () => {
        const send = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(receipt('configure', 1));
        const { api } = setup({ send });
        expect(await api.command('configure', { a: 1, b: [1, { c: 2, d: 3 }] })).toMatchObject({ reason: 'uncertain' });
        expect(await api.command('configure', { b: [1, { d: 3, c: 2 }], a: 1 })).toMatchObject({ ok: true });
    });

    it('drops a definitive rejection so the next change can start', async () => {
        const send = vi.fn().mockRejectedValueOnce({ status: 409, response: { message: 'Run moved on.' } }).mockResolvedValueOnce(receipt('cancel', 6));
        const { api } = setup({ send });
        expect(await api.command('cancel', { id: 'run_1' }, 4)).toEqual({ ok: false, reason: 'conflict', error: 'Run moved on.' });
        expect(await api.command('cancel', { id: 'run_1' }, 5)).toMatchObject({ ok: true });
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 403 }) }).api.command('cancel', { id: 'run_1' }, 1)).toMatchObject({ reason: 'forbidden' });
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 422 }) }).api.command('cancel', { id: 'run_1' }, 1)).toMatchObject({ reason: 'unavailable' });
    });

    it('reports busy while the same save is still in flight', async () => {
        let finish;
        const { api } = setup({ send: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
        const first = api.command('cancel', { id: 'run_1' }, 1);
        expect(await api.retry()).toEqual({ ok: false, reason: 'busy', error: '' });
        expect(await api.command('cancel', { id: 'run_1' }, 1)).toMatchObject({ reason: 'busy' });
        finish(receipt('cancel', 2));
        expect(await first).toMatchObject({ ok: true });
    });

    it('rejects unknown actions, negative revisions and non-object payloads before sending', async () => {
        const { api, send } = setup();
        expect(await api.command('delete', { id: 'run_1' })).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(await api.command('cancel', { id: 'run_1' }, -1)).toMatchObject({ ok: false });
        expect(await api.command('cancel', [1, 2])).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(await api.command('cancel', null)).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(await api.command('cancel', { text: 'x'.repeat(250001) })).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(await api.command('cancel', undefined)).toMatchObject({ ok: false, reason: 'invalid' });
        expect(send).not.toHaveBeenCalled();
    });

    it('reports invalid input when no secure request identity is available', async () => {
        const { api, send } = setup({ keyFactory: () => 'bad key!' });
        expect(await api.command('cancel', { id: 'run_1' }, 1)).toEqual({ ok: false, reason: 'invalid',
            error: 'Use bounded input and a browser that supports secure request identifiers.' });
        expect(send).not.toHaveBeenCalled();
    });

    it('discards the unresolved save when the scope changes before, during or after sending', async () => {
        const live = { value: true };
        const send = vi.fn().mockRejectedValueOnce({ status: 500 });
        const { api } = setup({ live, send });
        expect(await api.command('cancel', { id: 'run_1' }, 1)).toMatchObject({ reason: 'uncertain' });
        live.value = false;
        expect(await api.retry()).toMatchObject({ reason: 'scope_changed' });
        live.value = true;
        expect(await api.retry()).toMatchObject({ reason: 'invalid' });

        live.value = false;
        expect(await api.command('cancel', { id: 'run_1' }, 1)).toMatchObject({ reason: 'scope_changed' });

        const lateLive = { value: true };
        const late = setup({ live: lateLive, send: vi.fn(async () => { lateLive.value = false; return receipt('cancel', 2); }) });
        expect(await late.api.command('cancel', { id: 'run_1' }, 1)).toMatchObject({ reason: 'scope_changed' });
        lateLive.value = true;
        expect(await late.api.retry()).toMatchObject({ reason: 'invalid' });

        const failLive = { value: true };
        const failing = setup({ live: failLive, send: vi.fn(async () => { failLive.value = false; throw { status: 500 }; }) });
        expect(await failing.api.command('cancel', { id: 'run_1' }, 1)).toMatchObject({ reason: 'scope_changed' });
        failLive.value = true;
        expect(await failing.api.retry()).toMatchObject({ reason: 'invalid' });
    });
});

describe('fingerprintPdf', () => {
    const pdfBytes = new TextEncoder().encode('%PDF-1.7\n% test document\n%%EOF');
    const file = (name, bytes = pdfBytes, size = bytes.byteLength) => ({ name, size, arrayBuffer: async () => bytes.slice().buffer });

    it('returns the SHA-256 of the local bytes and the file name without uploading anything', async () => {
        const expected = createHash('sha256').update(pdfBytes).digest('hex');
        expect(await fingerprintPdf(file('Report.PDF'))).toEqual({ name: 'Report.PDF', sha256: expected });
    });

    it('truncates very long names to 160 characters', async () => {
        const name = `${'n'.repeat(200)}.pdf`;
        expect((await fingerprintPdf(file(name))).name).toBe(name.slice(0, 160));
    });

    it('rejects missing files, other extensions, tiny files and files over 20 MiB', async () => {
        const message = 'Choose a rendered PDF of at most 20 MiB.';
        await expect(fingerprintPdf(undefined)).rejects.toThrow(message);
        await expect(fingerprintPdf({ size: 100 })).rejects.toThrow(message);
        await expect(fingerprintPdf(file('report.docx'))).rejects.toThrow(message);
        await expect(fingerprintPdf(file('tiny.pdf', new Uint8Array(4)))).rejects.toThrow(message);
        await expect(fingerprintPdf(file('huge.pdf', pdfBytes, 20 * 1024 * 1024 + 1))).rejects.toThrow(message);
    });

    it('rejects content without a PDF header or whose length differs from the reported size', async () => {
        const message = 'Choose a PDF with its expected file header.';
        await expect(fingerprintPdf(file('fake.pdf', new TextEncoder().encode('<html>not a pdf</html>')))).rejects.toThrow(message);
        await expect(fingerprintPdf(file('short.pdf', pdfBytes, pdfBytes.byteLength + 10))).rejects.toThrow(message);
    });
});
