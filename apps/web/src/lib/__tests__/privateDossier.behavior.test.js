// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/privateDossier.behavior.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/lib/privateDossier.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/privateDossier.js
// DAG Node:    none
// Intent:      Prove dossier reads accept only the signed-in owner's well-formed data,
//              declined writes are still observed, uncertain saves keep one replayable
//              request, and disposal or account changes discard every late answer.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { createDossierClient } from '@/lib/privateDossier';

const ACCOUNT = 'acc_owner';
const KEY = 'dossierkey0123456789';

const entity = (overrides = {}) => ({ id: 'ent_1', revision: 1, label: 'Ada', kind: 'person', aliases: ['A.'], tags: ['client'], updated: '2026-10-01', ...overrides });
const recallData = (overrides = {}) => ({ owner: ACCOUNT, encrypted_storage: true, dossier: { owner: ACCOUNT, id: 'dos_1', revision: 2, about: 'Me' },
    page: 1, has_more: false, items: [entity({ note_count: 1, excerpt: 'Met at expo' })], entity_count: 1, total: 1, ...overrides });
const note = (overrides = {}) => ({ id: 'note_1', text: 'Prefers email', source_url: 'https://example.com/card', source_label: 'Card', origin: 'website',
    created: '2026-10-01', updated: '2026-10-02', ...overrides });
const detailData = (notes = [note()], overrides = {}) => ({ owner: ACCOUNT, dossier_id: 'dos_1', entity: { ...entity(), notes }, ...overrides });
const historyData = (overrides = {}) => ({ owner: ACCOUNT, page: 1, has_more: false,
    items: [{ id: 'evt_1', target: 'ent_1', action: 'note.add', revision: 1, origin: 'discord', created: '2026-10-01' }], ...overrides });
const receipt = (action, revision, overrides = {}) => ({ owner: ACCOUNT, action, revision, id: 'ent_1', dossier_id: 'dos_1', replayed: false, ...overrides });

function setup({ send = vi.fn(), live = { value: true }, demo = false, accountId = ACCOUNT, keyFactory = () => KEY,
    observe = vi.fn((_name, _verb, operation) => operation()) } = {}) {
    const client = { authStore: { record: { id: ACCOUNT } }, send };
    const api = createDossierClient({ client, accountId, demo, isCurrent: () => live.value, keyFactory, observe });
    return { api, client, send, live, observe };
}

describe('dossier reads', () => {
    it('recalls the owner dossier with a no-store POST and accepts an unsaved dossier id', async () => {
        const data = recallData({ dossier: { owner: ACCOUNT, id: '', revision: 0, about: '' }, items: [], entity_count: 0, total: 0 });
        const { api, send } = setup({ send: vi.fn().mockResolvedValue(data) });
        expect(await api.recall()).toEqual({ ok: true, data });
        expect(send).toHaveBeenCalledWith('/api/buildanddo/dossier/read', { method: 'POST', body: { action: 'recall', query: '', page: 1 }, requestKey: null, cache: 'no-store' });
    });

    it('refuses oversized queries and out-of-range pages without contacting the server', async () => {
        const { api, send } = setup();
        expect(await api.recall('q'.repeat(201))).toMatchObject({ ok: false, reason: 'invalid' });
        expect(await api.recall('', 0)).toMatchObject({ reason: 'invalid' });
        expect(await api.recall('', 21)).toMatchObject({ reason: 'invalid' });
        expect(await api.detail('bad id')).toMatchObject({ reason: 'invalid' });
        expect(await api.history(0)).toMatchObject({ reason: 'invalid' });
        expect(await api.history(10000)).toMatchObject({ reason: 'invalid' });
        expect(send).not.toHaveBeenCalled();
    });

    it('rejects recall data for another owner, without encryption, or with malformed entities', async () => {
        for (const data of [recallData({ owner: 'acc_other' }), recallData({ encrypted_storage: false }),
            recallData({ dossier: { owner: 'acc_other', id: 'dos_1', revision: 0, about: '' } }),
            recallData({ items: [entity({ kind: 'robot', note_count: 0, excerpt: '' })] }), recallData({ items: [entity({ aliases: 'A.', note_count: 0, excerpt: '' })] }),
            recallData({ items: [entity({ note_count: 21, excerpt: '' })] }), recallData({ total: 5 }), recallData({ page: 2 }), null]) {
            expect(await setup({ send: vi.fn().mockResolvedValue(data) }).api.recall()).toEqual({ ok: false, reason: 'unavailable',
                error: 'Private dossier storage is unavailable. Reload, or ask the operator to check its schema and encryption binding.' });
        }
    });

    it('accepts entity detail with safe note sources and correction origins', async () => {
        const data = detailData([note(), note({ id: 'note_2', source_url: '', corrected_via: 'discord' })]);
        const { api, send } = setup({ send: vi.fn().mockResolvedValue(data) });
        expect(await api.detail('ent_1')).toEqual({ ok: true, data });
        expect(send.mock.calls[0][1].body).toEqual({ action: 'entity', id: 'ent_1' });
    });

    it('rejects entity detail with unsafe or malformed notes', async () => {
        for (const notes of [[note({ source_url: 'http://example.com' })], [note({ source_url: 'https://u:p@example.com' })], [note({ source_url: 'https://u@example.com' })],
            [note({ source_url: 'not a url' })], [note({ source_url: `https://example.com/${'a'.repeat(2048)}` })], [note({ origin: 'email' })],
            [note({ corrected_via: 'sms' })], [note({ text: 'x'.repeat(2001) })], Array(21).fill(note())]) {
            expect(await setup({ send: vi.fn().mockResolvedValue(detailData(notes)) }).api.detail('ent_1')).toMatchObject({ ok: false, reason: 'unavailable' });
        }
        expect(await setup({ send: vi.fn().mockResolvedValue(detailData([], { dossier_id: '' })) }).api.detail('ent_1')).toMatchObject({ ok: false });
        expect(await setup({ send: vi.fn().mockResolvedValue(detailData([note()])) }).api.detail('ent_2')).toMatchObject({ ok: false });
    });

    it('accepts well-formed history and rejects unknown actions or origins', async () => {
        const { api, send } = setup({ send: vi.fn().mockResolvedValue(historyData({ page: 3 })) });
        expect(await api.history(3)).toMatchObject({ ok: true });
        expect(send.mock.calls[0][1].body).toEqual({ action: 'history', page: 3 });
        expect(await setup({ send: vi.fn().mockResolvedValue(historyData()) }).api.history()).toMatchObject({ ok: true });
        const bad = (row) => historyData({ items: [{ ...historyData().items[0], ...row }] });
        for (const data of [bad({ action: 'entity.merge' }), bad({ origin: 'api' }), bad({ revision: 0 }), bad({ target: '' })])
            expect(await setup({ send: vi.fn().mockResolvedValue(data) }).api.history()).toMatchObject({ ok: false });
    });

    it('maps read errors to forbidden, conflict, invalid and unavailable', async () => {
        const reasons = [[401, 'forbidden'], [403, 'forbidden'], [409, 'conflict'], [400, 'invalid'], [500, 'unavailable'], [undefined, 'unavailable']];
        for (const [status, reason] of reasons)
            expect(await setup({ send: vi.fn().mockRejectedValue({ status }) }).api.recall()).toMatchObject({ ok: false, reason });
    });

    it('returns a scope change and never reads in demo mode, for an invalid account or after sign-out', async () => {
        const send = vi.fn();
        expect(await setup({ send, demo: true }).api.recall()).toEqual({ ok: false, reason: 'scope_changed', error: '' });
        expect(await setup({ send, accountId: '' }).api.recall()).toMatchObject({ reason: 'scope_changed' });
        expect(await setup({ send, live: { value: false } }).api.history()).toMatchObject({ reason: 'scope_changed' });
        const signedOut = setup({ send });
        signedOut.client.authStore.record = { id: 'acc_other' };
        expect(await signedOut.api.detail('ent_1')).toMatchObject({ reason: 'scope_changed' });
        expect(send).not.toHaveBeenCalled();
    });

    it('discards answers and failures that arrive after disposal or an account change', async () => {
        let api;
        ({ api } = setup({ send: vi.fn(async () => { api.dispose(); return recallData(); }) }));
        expect(await api.recall()).toMatchObject({ reason: 'scope_changed' });
        ({ api } = setup({ send: vi.fn(async () => { api.dispose(); throw { status: 500 }; }) }));
        expect(await api.recall()).toMatchObject({ reason: 'scope_changed' });
        const live = { value: true };
        ({ api } = setup({ live, send: vi.fn(async () => { live.value = false; throw { status: 409 }; }) }));
        expect(await api.history()).toMatchObject({ reason: 'scope_changed' });
    });
});

describe('dossier commands', () => {
    it('sends a bounded command through the observer and accepts the next revision', async () => {
        const { api, send, observe } = setup({ send: vi.fn().mockResolvedValue(receipt('note.add', 3)) });
        expect(await api.command('note.add', { entity: 'ent_1', text: 'Prefers email' }, 2)).toEqual({ ok: true, result: receipt('note.add', 3) });
        expect(observe).toHaveBeenCalledWith('private_dossiers', 'note.add', expect.any(Function));
        expect(send).toHaveBeenCalledWith('/api/buildanddo/dossier', { method: 'POST', requestKey: null, cache: 'no-store',
            body: { action: 'note.add', payload: { entity: 'ent_1', text: 'Prefers email' }, revision: 2, request_key: KEY } });
        expect(await api.retry()).toEqual({ ok: false, reason: 'invalid', error: 'There is no unresolved dossier save.' });
    });

    it('uses a browser UUID and a pass-through observer by default', async () => {
        const send = vi.fn().mockResolvedValue(receipt('dossier.update', 1));
        const api = createDossierClient({ client: { authStore: { record: { id: ACCOUNT } }, send }, accountId: ACCOUNT, isCurrent: () => true });
        expect(await api.command('dossier.update', { about: 'Me' })).toMatchObject({ ok: true });
        expect(send.mock.calls[0][1].body.request_key).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('observes declined commands with the reason they were refused', async () => {
        const { api, send, observe } = setup();
        const invalid = 'Check the input limits, aliases, source URL and saved revision, then retry.';
        expect(await api.command('entity.merge', {})).toEqual({ ok: false, reason: 'invalid', error: invalid });
        expect(await api.command('note.add', null)).toMatchObject({ reason: 'invalid' });
        expect(await api.command('note.add', ['x'])).toMatchObject({ reason: 'invalid' });
        expect(await api.command('note.add', {}, -1)).toMatchObject({ reason: 'invalid' });
        expect(await api.command('note.add', { text: 'x'.repeat(12000) })).toMatchObject({ reason: 'invalid' });
        expect(send).not.toHaveBeenCalled();
        expect(observe).toHaveBeenCalledTimes(5);
        expect(observe.mock.calls.map(([name, verb]) => [name, verb])).toContainEqual(['private_dossiers', 'entity.merge']);
    });

    it('declines when no valid request key can be generated', async () => {
        expect(await setup({ keyFactory: () => 'short' }).api.command('note.add', {})).toMatchObject({ reason: 'invalid' });
        expect(await setup({ keyFactory: () => { throw new Error('no crypto'); } }).api.command('note.add', {})).toMatchObject({ reason: 'invalid' });
    });

    it('keeps an uncertain save for replay with the same request key and blocks other changes until it resolves', async () => {
        const keyFactory = vi.fn(() => KEY);
        const send = vi.fn().mockRejectedValueOnce({ status: 502 }).mockResolvedValueOnce(receipt('note.add', 1, { replayed: true }));
        const { api } = setup({ send, keyFactory });
        expect(await api.command('note.add', { text: 'a' })).toEqual({ ok: false, reason: 'uncertain',
            error: 'Could not confirm the save. Recover the previous request before saving another change.' });
        expect(await api.command('note.delete', { id: 'note_1' })).toMatchObject({ reason: 'uncertain' });
        expect(await api.retry()).toEqual({ ok: true, result: receipt('note.add', 1, { replayed: true }) });
        expect(send.mock.calls[1][1].body).toEqual(send.mock.calls[0][1].body);
        expect(keyFactory).toHaveBeenCalledTimes(1);
    });

    it('treats an incomplete receipt as uncertain', async () => {
        for (const value of [receipt('note.add', 2), receipt('note.update', 1), receipt('note.add', 1, { owner: 'acc_other' }), receipt('note.add', 1, { id: '' }),
            receipt('note.add', 1, { dossier_id: '' }), receipt('note.add', 1, { replayed: 1 }), null]) {
            expect(await setup({ send: vi.fn().mockResolvedValue(value) }).api.command('note.add', {})).toMatchObject({ ok: false, reason: 'uncertain' });
        }
    });

    it('drops a definitive rejection so the next change can start', async () => {
        const send = vi.fn().mockRejectedValueOnce({ status: 409 }).mockResolvedValueOnce(receipt('entity.update', 5));
        const { api } = setup({ send });
        expect(await api.command('entity.update', { id: 'ent_1' }, 3)).toMatchObject({ reason: 'conflict' });
        expect(await api.command('entity.update', { id: 'ent_1' }, 4)).toMatchObject({ ok: true });
    });

    it('reports busy for commands and retries while a save is in flight', async () => {
        let finish;
        const { api, observe } = setup({ send: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
        const first = api.command('note.add', {});
        expect(await api.command('note.add', {})).toEqual({ ok: false, reason: 'busy', error: '' });
        expect(await api.retry()).toEqual({ ok: false, reason: 'busy', error: '' });
        expect(observe.mock.calls.filter(([, verb]) => verb === 'note.add').length).toBeGreaterThanOrEqual(3);
        finish(receipt('note.add', 1));
        expect(await first).toMatchObject({ ok: true });
    });

    it('returns a non-ok observer result unchanged and keeps the save for retry', async () => {
        const send = vi.fn().mockResolvedValue(receipt('note.add', 1));
        const observe = vi.fn().mockResolvedValueOnce({ ok: false, reason: 'throttled', error: 'Try later.' })
            .mockImplementation((_name, _verb, operation) => operation());
        const { api } = setup({ send, observe });
        expect(await api.command('note.add', {})).toEqual({ ok: false, reason: 'throttled', error: 'Try later.' });
        expect(send).not.toHaveBeenCalled();
        expect(await api.retry()).toMatchObject({ ok: true });
    });

    it('refuses commands outside the current account scope and observes the refusal', async () => {
        const { api, observe, send } = setup({ live: { value: false } });
        expect(await api.command('note.add', {})).toEqual({ ok: false, reason: 'scope_changed', error: '' });
        expect(await api.retry()).toMatchObject({ reason: 'scope_changed' });
        expect(observe).toHaveBeenCalledWith('private_dossiers', 'note.add', expect.any(Function));
        expect(observe).toHaveBeenCalledWith('private_dossiers', undefined, expect.any(Function));
        expect(send).not.toHaveBeenCalled();
    });

    it('discards a save whose answer arrives after disposal', async () => {
        let api;
        ({ api } = setup({ send: vi.fn(async () => { api.dispose(); return receipt('note.add', 1); }) }));
        expect(await api.command('note.add', {})).toMatchObject({ reason: 'scope_changed' });
        expect(await api.retry()).toMatchObject({ reason: 'invalid' });

        ({ api } = setup({ send: vi.fn(async () => { api.dispose(); throw { status: 500 }; }) }));
        expect(await api.command('note.add', {})).toMatchObject({ reason: 'scope_changed' });
        expect(await api.retry()).toMatchObject({ reason: 'invalid' });
    });

    it('discards a save when the account changes during or right after the request', async () => {
        const live = { value: true };
        const send = vi.fn(async () => { live.value = false; throw { status: 500 }; });
        const { api } = setup({ live, send });
        expect(await api.command('note.add', {})).toMatchObject({ reason: 'scope_changed' });

        const afterObserve = { value: true };
        const outer = setup({ live: afterObserve, send: vi.fn().mockResolvedValue(receipt('note.add', 1)),
            observe: vi.fn(async (_name, _verb, operation) => { const value = await operation(); afterObserve.value = false; return value; }) });
        expect(await outer.api.command('note.add', {})).toMatchObject({ reason: 'scope_changed' });

        const throwAfter = { value: true };
        const outerThrow = setup({ live: throwAfter, send: vi.fn().mockRejectedValue({ status: 409 }),
            observe: vi.fn(async (_name, _verb, operation) => { try { return await operation(); } finally { throwAfter.value = false; } }) });
        expect(await outerThrow.api.command('note.add', {})).toMatchObject({ reason: 'scope_changed' });
    });
});
