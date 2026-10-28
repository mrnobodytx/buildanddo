// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/missionResearch.behavior.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/lib/missionResearch.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/missionResearch.js
// DAG Node:    none
// Intent:      Prove research reads, upload listings and original downloads stay
//              scoped to the signed-in owner and workspace, uploads are bounded,
//              and commands keep one replayable request across uncertain writes.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { createResearchClient, signalProposalKey } from '@/lib/missionResearch';

const ACCOUNT = 'acc_owner';
const WORKSPACE = 'ws_atlas';
const KEY = 'researchkey012345678';
const PREFIX = `/api/buildanddo/workspaces/${WORKSPACE}/research`;

const item = (overrides = {}) => ({ id: 'res_1', workspace: WORKSPACE, mission: 'msn_1', owner: ACCOUNT, kind: 'url', status: 'queued', revision: 1, attempt: 0,
    title: 'Harbour notice', input: 'https://example.com', context: '', origin: 'website', failure: '', created: '2026-10-01', processed_at: '', evidence: '', ...overrides });
const listing = (overrides = {}) => ({ workspace: WORKSPACE, role: 'editor', items: [item()], page: 1, has_more: false,
    capabilities: { enabled: true, kinds: ['search', 'url'] }, ...overrides });
const receipt = (action, overrides = {}) => ({ workspace: WORKSPACE, action, id: 'res_1', revision: 2, replayed: false, status: 'queued', evidence: '', ...overrides });

function setup({ send = vi.fn(), live = { value: true }, demo = false, accountId = ACCOUNT, keyFactory = () => KEY, observe, collection = {} } = {}) {
    const uploads = { getList: vi.fn(), getOne: vi.fn(), create: vi.fn(), ...collection };
    const client = {
        authStore: { record: { id: ACCOUNT } }, send,
        collection: vi.fn(() => uploads),
        filter: vi.fn((expression, params) => `${expression}|${JSON.stringify(params)}`),
        files: { getToken: vi.fn().mockResolvedValue('file_token'), getURL: vi.fn((record, name, options) => `https://files.test/${record.id}/${name}?token=${options.token}&download=${options.download}`) },
    };
    const api = createResearchClient({ client, accountId, workspaceId: WORKSPACE, demo, isCurrent: () => live.value, keyFactory, ...(observe ? { observe } : {}) });
    return { api, client, uploads, send, live };
}

describe('signalProposalKey', () => {
    it('derives a stable key from the saved signal id and timestamp digits', () => {
        expect(signalProposalKey({ id: 'sig_1', updated: '2026-10-01 12:30:45.123Z' })).toBe('signal_sig_1_20261001123045123');
        expect(signalProposalKey({ id: 'sig_1', updated: '2026-10-01T12:30:45+00:00' })).toBe('signal_sig_1_202610011230450000');
    });

    it('requires a saved signal identity and timestamp', () => {
        expect(() => signalProposalKey(undefined)).toThrow('Reload the saved signal before proposing a mission.');
        expect(() => signalProposalKey({ id: 'bad id', updated: '2026-10-01 12:30:45Z' })).toThrow('Reload the saved signal');
        expect(() => signalProposalKey({ id: 'sig_1' })).toThrow('Reload the saved signal');
        expect(() => signalProposalKey({ id: 'sig_1', updated: 'yesterday' })).toThrow('Reload the saved signal');
    });

    it('refuses identities too long to become a proposal key', () => {
        expect(() => signalProposalKey({ id: 'x'.repeat(64), updated: '2026-10-01 12:30:45.123456Z' })).toThrow('cannot be used as a proposal key');
    });
});

describe('research reads', () => {
    it('lists research with a no-store GET and returns validated data', async () => {
        const { api, send } = setup({ send: vi.fn().mockResolvedValue(listing()) });
        expect(await api.read({ page: 2 })).toEqual({ ok: true, data: listing() });
        expect(send).toHaveBeenCalledWith(PREFIX, { method: 'GET', query: { page: 2 }, requestKey: null, cache: 'no-store' });
        expect(await setup({ send: vi.fn().mockResolvedValue(listing()) }).api.read()).toMatchObject({ ok: true });
    });

    it('rejects listings from another workspace or with malformed items and capabilities', async () => {
        for (const data of [listing({ workspace: 'ws_other' }), listing({ role: 'guest' }), listing({ items: [item({ workspace: 'ws_other' })] }),
            listing({ items: [item({ kind: 'fax' })] }), listing({ items: [item({ status: 'lost' })] }), listing({ items: [item({ evidence: undefined })] }),
            listing({ page: 0 }), listing({ capabilities: { enabled: true, kinds: ['telepathy'] } }), listing({ capabilities: undefined }), null]) {
            expect(await setup({ send: vi.fn().mockResolvedValue(data) }).api.read()).toEqual({ ok: false, reason: 'unavailable',
                error: 'Research is unavailable. Reload or ask the workspace operator to check the installed research API.' });
        }
    });

    it('maps read failures and passes through a server explanation', async () => {
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 403, response: { message: 'Viewer only.' } }) }).api.read())
            .toEqual({ ok: false, reason: 'forbidden', error: 'Viewer only.' });
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 409 }) }).api.read()).toMatchObject({ reason: 'conflict' });
        expect(await setup({ send: vi.fn().mockRejectedValue(new Error('offline')) }).api.read()).toMatchObject({ reason: 'unavailable' });
    });

    it('reports a scope change instead of reading in demo mode, for invalid scope or another signed-in account', async () => {
        const send = vi.fn();
        expect(await setup({ send, demo: true }).api.read()).toEqual({ ok: false, reason: 'scope_changed', error: '' });
        expect(await setup({ send, accountId: 'bad id' }).api.read()).toMatchObject({ reason: 'scope_changed' });
        const other = setup({ send });
        other.client.authStore.record = { id: 'acc_other' };
        expect(await other.api.read()).toMatchObject({ reason: 'scope_changed' });
        expect(send).not.toHaveBeenCalled();
    });

    it('discards answers and errors that arrive after the scope changed', async () => {
        const live = { value: true };
        expect(await setup({ live, send: vi.fn(async () => { live.value = false; return listing(); }) }).api.read()).toMatchObject({ reason: 'scope_changed' });
        live.value = true;
        expect(await setup({ live, send: vi.fn(async () => { live.value = false; throw { status: 500 }; }) }).api.read()).toMatchObject({ reason: 'scope_changed' });
    });

    it('reads one submission detail with optional cited results', async () => {
        const record = item({ upload: '' });
        const { api, send } = setup({ send: vi.fn().mockResolvedValue({ workspace: WORKSPACE, record }) });
        expect(await api.detail('res_1')).toMatchObject({ ok: true });
        expect(send.mock.calls[0][0]).toBe(`${PREFIX}/res_1`);
        const cited = { workspace: WORKSPACE, record: item({ upload: 'up_1', result: { text: 'Summary', citations: [{ title: 'Notice', url: 'https://example.com' }] } }) };
        expect(await setup({ send: vi.fn().mockResolvedValue(cited) }).api.detail('res_1')).toEqual({ ok: true, data: cited });
    });

    it('rejects invalid detail ids and malformed detail records', async () => {
        const { api, send } = setup();
        expect(await api.detail('../x')).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(send).not.toHaveBeenCalled();
        for (const data of [{ workspace: WORKSPACE, record: item({ id: 'res_2', upload: '' }) }, { workspace: WORKSPACE, record: item() },
            { workspace: WORKSPACE, record: item({ upload: '', result: { text: 5, citations: [] } }) },
            { workspace: WORKSPACE, record: item({ upload: '', result: { text: 'x', citations: 'none' } }) },
            { workspace: WORKSPACE, record: item({ upload: '', result: { text: 'x', citations: [{ title: 'T' }] } }) }, { workspace: 'ws_other', record: item({ upload: '' }) }]) {
            expect(await setup({ send: vi.fn().mockResolvedValue(data) }).api.detail('res_1')).toMatchObject({ ok: false });
        }
    });
});

describe('research uploads listing', () => {
    it('lists only the owner uploads in this workspace, newest first, and reports more pages', async () => {
        const items = [{ id: 'up_1', workspace: WORKSPACE, owner: ACCOUNT }];
        const { api, client, uploads } = setup({ collection: { getList: vi.fn().mockResolvedValue({ items, totalPages: 2 }) } });
        expect(await api.uploads()).toEqual({ ok: true, items, hasMore: true });
        expect(client.collection).toHaveBeenCalledWith('research_uploads');
        expect(client.filter).toHaveBeenCalledWith('workspace = {:workspace} && owner = {:owner}', { workspace: WORKSPACE, owner: ACCOUNT });
        expect(uploads.getList).toHaveBeenCalledWith(1, 50, expect.objectContaining({ sort: '-created', requestKey: null }));
        expect(await setup({ collection: { getList: vi.fn().mockResolvedValue({ items: [], totalPages: 1 }) } }).api.uploads())
            .toEqual({ ok: true, items: [], hasMore: false });
    });

    it('rejects listings containing another owner or workspace, or no item array', async () => {
        for (const data of [{ items: [{ id: 'up_1', workspace: WORKSPACE, owner: 'acc_other' }] }, { items: [{ id: 'up_1', workspace: 'ws_other', owner: ACCOUNT }] },
            { items: [{ id: 'bad id', workspace: WORKSPACE, owner: ACCOUNT }] }, {}, null]) {
            expect(await setup({ collection: { getList: vi.fn().mockResolvedValue(data) } }).api.uploads()).toMatchObject({ ok: false, reason: 'unavailable' });
        }
    });

    it('maps failures and discards answers after a scope change', async () => {
        expect(await setup({ collection: { getList: vi.fn().mockRejectedValue({ status: 403 }) } }).api.uploads()).toMatchObject({ reason: 'forbidden' });
        expect(await setup({ live: { value: false } }).api.uploads()).toMatchObject({ reason: 'scope_changed' });
        const live = { value: true };
        expect(await setup({ live, collection: { getList: vi.fn(async () => { live.value = false; return { items: [] }; }) } }).api.uploads())
            .toMatchObject({ reason: 'scope_changed' });
        live.value = true;
        expect(await setup({ live, collection: { getList: vi.fn(async () => { live.value = false; throw { status: 500 }; }) } }).api.uploads())
            .toMatchObject({ reason: 'scope_changed' });
    });
});

describe('research original downloads', () => {
    const file = { id: 'up_1', workspace: WORKSPACE, asset: 'notice.pdf' };

    it('returns a tokenized download link for an upload in this workspace', async () => {
        const { api, client, uploads } = setup({ collection: { getOne: vi.fn().mockResolvedValue(file) } });
        expect(await api.original('up_1')).toEqual({ ok: true, url: 'https://files.test/up_1/notice.pdf?token=file_token&download=true' });
        expect(uploads.getOne).toHaveBeenCalledWith('up_1', { requestKey: null });
        expect(client.files.getURL).toHaveBeenCalledWith(file, 'notice.pdf', { token: 'file_token', download: true });
    });

    it('refuses invalid ids, foreign files and files without an asset', async () => {
        const { api, uploads } = setup();
        expect(await api.original('bad/id')).toMatchObject({ ok: false, reason: 'unavailable' });
        expect(uploads.getOne).not.toHaveBeenCalled();
        for (const record of [{ ...file, workspace: 'ws_other' }, { ...file, id: 'up_2' }, { ...file, asset: null }]) {
            const scoped = setup({ collection: { getOne: vi.fn().mockResolvedValue(record) } });
            expect(await scoped.api.original('up_1')).toMatchObject({ ok: false, reason: 'unavailable' });
            expect(scoped.client.files.getToken).not.toHaveBeenCalled();
        }
    });

    it('maps failures and discards answers after a scope change at any step', async () => {
        expect(await setup({ collection: { getOne: vi.fn().mockRejectedValue({ status: 404 }) } }).api.original('up_1')).toMatchObject({ reason: 'unavailable' });
        expect(await setup({ live: { value: false } }).api.original('up_1')).toMatchObject({ reason: 'scope_changed' });
        const live = { value: true };
        expect(await setup({ live, collection: { getOne: vi.fn(async () => { live.value = false; return file; }) } }).api.original('up_1'))
            .toMatchObject({ reason: 'scope_changed' });
        live.value = true;
        const tokenLate = setup({ live, collection: { getOne: vi.fn().mockResolvedValue(file) } });
        tokenLate.client.files.getToken.mockImplementation(async () => { live.value = false; return 'file_token'; });
        expect(await tokenLate.api.original('up_1')).toMatchObject({ reason: 'scope_changed' });
        expect(tokenLate.client.files.getURL).not.toHaveBeenCalled();
        live.value = true;
        expect(await setup({ live, collection: { getOne: vi.fn(async () => { live.value = false; throw { status: 500 }; }) } }).api.original('up_1'))
            .toMatchObject({ reason: 'scope_changed' });
    });
});

describe('research upload', () => {
    const source = (name = 'notes.MD', size = 10) => ({ name, size });

    it('uploads a supported file through the observer and checks the receipt kind', async () => {
        const observe = vi.fn((_name, _verb, operation) => operation());
        const created = { id: 'up_1', workspace: WORKSPACE, owner: ACCOUNT, kind: 'document' };
        const { api, uploads } = setup({ observe, collection: { create: vi.fn().mockResolvedValue(created) } });
        expect(await api.upload(source())).toEqual({ ok: true, result: created });
        expect(observe).toHaveBeenCalledWith('research_uploads', 'create', expect.any(Function));
        const [body, options] = uploads.create.mock.calls[0];
        expect(body.get('workspace')).toBe(WORKSPACE);
        expect(body.get('owner')).toBe(ACCOUNT);
        expect(options).toEqual({ requestKey: null });
    });

    it('rejects unsupported, empty, oversized and unsafely named files before uploading', async () => {
        const { api, uploads } = setup();
        for (const file of [undefined, source('run.exe'), source('clip.mp4', 0), source('clip.mp4', 20971521), source(`${'n'.repeat(180)}.mp3`),
            source('dir/evil.wav'), source('bad\\name.ogg'), source('tab\tname.pdf')]) {
            expect(await api.upload(file)).toEqual({ ok: false, reason: 'invalid', error: 'Choose a supported file of at most 20 MiB.' });
        }
        expect(uploads.create).not.toHaveBeenCalled();
    });

    it('reports a lost upload response so the user refreshes before uploading again', async () => {
        for (const create of [vi.fn().mockResolvedValue({ id: 'up_1', workspace: WORKSPACE, owner: ACCOUNT, kind: 'audio' }), vi.fn().mockRejectedValue({ status: 502 })]) {
            expect(await setup({ collection: { create } }).api.upload(source('memo.webm'))).toEqual({ ok: false, reason: 'upload_uncertain',
                error: 'The upload response was lost. Refresh your saved uploads and select the file before uploading again.' });
        }
    });

    it('returns a definitive upload rejection unchanged', async () => {
        expect(await setup({ collection: { create: vi.fn().mockRejectedValue({ status: 403, response: { message: 'Uploads are closed.' } }) } }).api.upload(source()))
            .toEqual({ ok: false, reason: 'forbidden', error: 'Uploads are closed.' });
    });

    it('refuses to upload while another request is in flight', async () => {
        let finish;
        const { api } = setup({ collection: { create: vi.fn(() => new Promise((resolve) => { finish = resolve; })) } });
        const first = api.upload(source());
        expect(await api.upload(source())).toEqual({ ok: false, reason: 'uncertain', error: 'Recover the previous request before uploading another source.' });
        finish({ id: 'up_1', workspace: WORKSPACE, owner: ACCOUNT, kind: 'document' });
        expect(await first).toMatchObject({ ok: true });
    });

    it('discards upload outcomes after a scope change', async () => {
        expect(await setup({ live: { value: false } }).api.upload(source())).toMatchObject({ reason: 'scope_changed' });
        const live = { value: true };
        expect(await setup({ live, collection: { create: vi.fn(async () => { live.value = false; return {}; }) } }).api.upload(source())).toMatchObject({ reason: 'scope_changed' });
        live.value = true;
        expect(await setup({ live, collection: { create: vi.fn(async () => { live.value = false; throw { status: 500 }; }) } }).api.upload(source()))
            .toMatchObject({ reason: 'scope_changed' });
    });
});

describe('research commands', () => {
    it('submits a command with a fresh request key and accepts a complete receipt', async () => {
        const send = vi.fn().mockResolvedValue(receipt('submit'));
        const { api } = setup({ send });
        expect(await api.command('submit', { kind: 'url', input: 'https://example.com' }, 1)).toEqual({ ok: true, result: receipt('submit') });
        expect(send).toHaveBeenCalledWith(PREFIX, { method: 'POST', requestKey: null, cache: 'no-store',
            body: { action: 'submit', payload: { kind: 'url', input: 'https://example.com' }, revision: 1, request_key: KEY } });
        expect(await api.retry()).toEqual({ ok: false, reason: 'invalid', error: 'There is no unresolved request.' });
    });

    it('uses a browser UUID by default', async () => {
        const send = vi.fn().mockResolvedValue(receipt('cancel'));
        const api = createResearchClient({ client: { authStore: { record: { id: ACCOUNT } }, send }, accountId: ACCOUNT, workspaceId: WORKSPACE, isCurrent: () => true });
        expect(await api.command('cancel', { id: 'res_1' }, 1)).toMatchObject({ ok: true });
        expect(send.mock.calls[0][1].body.request_key).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rejects unknown actions, malformed payloads and revisions before sending', async () => {
        const { api, send } = setup();
        const invalid = { ok: false, reason: 'invalid', error: 'Reload the current submission before continuing.' };
        expect(await api.command('delete', {})).toEqual(invalid);
        expect(await api.command('submit', null)).toEqual(invalid);
        expect(await api.command('submit', ['x'])).toEqual(invalid);
        expect(await api.command('submit', {}, 1.5)).toEqual(invalid);
        expect(send).not.toHaveBeenCalled();
    });

    it('declines when no secure request identifier is available', async () => {
        const error = { ok: false, reason: 'invalid', error: 'A secure request identifier is unavailable.' };
        expect(await setup({ keyFactory: () => { throw new Error('no crypto'); } }).api.command('submit', {})).toEqual(error);
        expect(await setup({ keyFactory: () => 'short' }).api.command('submit', {})).toEqual(error);
    });

    it('keeps an uncertain request for replay and refuses a different change meanwhile', async () => {
        const keyFactory = vi.fn(() => KEY);
        const send = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(receipt('attach', { replayed: true }));
        const { api } = setup({ send, keyFactory });
        expect(await api.command('attach', { id: 'res_1', evidence: 'ev_1' }, 1)).toEqual({ ok: false, reason: 'uncertain',
            error: 'Could not confirm the save. Retry the previous request to recover its result.' });
        expect(await api.command('cancel', { id: 'res_1' }, 1)).toEqual({ ok: false, reason: 'uncertain', error: 'Recover the previous request before starting a different change.' });
        expect(await api.command('attach', { evidence: 'ev_1', id: 'res_1' }, 1)).toMatchObject({ ok: true });
        expect(send.mock.calls[1][1].body.request_key).toBe(KEY);
        expect(keyFactory).toHaveBeenCalledTimes(1);
    });

    it('treats incomplete receipts as uncertain', async () => {
        for (const value of [receipt('retry', { workspace: 'ws_other' }), receipt('submit'), receipt('retry', { id: '' }), receipt('retry', { revision: 0 }),
            receipt('retry', { replayed: 'yes' }), receipt('retry', { status: 1 }), receipt('retry', { evidence: null }), null]) {
            expect(await setup({ send: vi.fn().mockResolvedValue(value) }).api.command('retry', { id: 'res_1' }, 1)).toMatchObject({ reason: 'uncertain' });
        }
    });

    it('drops definitive rejections so a new change can start', async () => {
        const send = vi.fn().mockRejectedValueOnce({ status: 409 }).mockResolvedValueOnce(receipt('cancel'));
        const { api } = setup({ send });
        expect(await api.command('cancel', { id: 'res_1' }, 1)).toMatchObject({ reason: 'conflict' });
        expect(await api.command('cancel', { id: 'res_1' }, 2)).toMatchObject({ ok: true });
        expect(await setup({ send: vi.fn().mockRejectedValue({ status: 422 }) }).api.command('cancel', { id: 'res_1' }, 1)).toMatchObject({ reason: 'unavailable' });
    });

    it('reports busy while a request is in flight', async () => {
        let finish;
        const { api } = setup({ send: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
        const first = api.command('mission.propose', { title: 'Survey' });
        expect(await api.retry()).toEqual({ ok: false, reason: 'busy', error: '' });
        expect(await api.upload({ name: 'a.txt', size: 1 })).toMatchObject({ reason: 'uncertain' });
        finish(receipt('mission.propose'));
        expect(await first).toMatchObject({ ok: true });
    });

    it('reports a scope change before sending and discards late answers', async () => {
        const live = { value: false };
        const { api, send } = setup({ live });
        expect(await api.command('submit', {})).toMatchObject({ reason: 'scope_changed' });
        expect(await api.retry()).toMatchObject({ reason: 'scope_changed' });
        expect(send).not.toHaveBeenCalled();
        live.value = true;
        expect(await setup({ live, send: vi.fn(async () => { live.value = false; return receipt('submit'); }) }).api.command('submit', {})).toMatchObject({ reason: 'scope_changed' });
        live.value = true;
        expect(await setup({ live, send: vi.fn(async () => { live.value = false; throw { status: 500 }; }) }).api.command('submit', {})).toMatchObject({ reason: 'scope_changed' });
    });
});
