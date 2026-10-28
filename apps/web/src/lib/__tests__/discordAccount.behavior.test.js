// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/discordAccount.behavior.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-27
// Depends:     apps/web/src/lib/discordAccount.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/discordAccount.js
// DAG Node:    none
// Intent:      Prove Discord linking runs in an isolated auth store, never accepts a
//              different BuildAndDo account, reports status from native external
//              auths, and discards outcomes after the signed-in account changes.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { createDiscordAccountLink } from '@/lib/discordAccount';

const ACCOUNT = 'acc_owner';
const UNAVAILABLE = 'Discord account linking is unavailable. Ask the operator to check the native Discord OAuth provider, then retry.';

function setup({ links = [], live = { value: true }, oauth, accountId = ACCOUNT } = {}) {
    const users = {
        listExternalAuths: vi.fn(async () => links),
        unlinkExternalAuth: vi.fn().mockResolvedValue(true),
    };
    const client = { authStore: { token: 'session_token', record: { id: ACCOUNT } }, collection: vi.fn(() => users) };
    const isolatedUsers = { authWithOAuth2: oauth || vi.fn().mockResolvedValue({ record: { id: ACCOUNT } }) };
    const isolated = {
        authStore: { save: vi.fn(), clear: vi.fn() },
        collection: vi.fn(() => isolatedUsers),
        cancelAllRequests: vi.fn(),
        realtime: { unsubscribe: vi.fn().mockRejectedValue(new Error('closed')) },
    };
    const createIsolated = vi.fn(() => isolated);
    const api = createDiscordAccountLink({ client, createIsolated, accountId, isCurrent: () => live.value });
    return { api, client, users, isolated, isolatedUsers, createIsolated, live };
}

describe('Discord link status', () => {
    it('reports linked only when a Discord external auth exists', async () => {
        const linked = setup({ links: [{ provider: 'google' }, { provider: 'discord' }] });
        expect(await linked.api.status()).toEqual({ ok: true, linked: true });
        expect(linked.users.listExternalAuths).toHaveBeenCalledWith(ACCOUNT, { requestKey: null });
        expect(await setup({ links: [{ provider: 'google' }] }).api.status()).toEqual({ ok: true, linked: false });
    });

    it('reports the provider as unavailable for malformed or failed listings', async () => {
        expect(await setup({ links: null }).api.status()).toEqual({ ok: false, error: UNAVAILABLE });
        const failing = setup();
        failing.users.listExternalAuths.mockRejectedValue(new Error('500'));
        expect(await failing.api.status()).toEqual({ ok: false, error: UNAVAILABLE });
    });

    it('returns a silent stale result without an account, after sign-out or when an answer arrives late', async () => {
        expect(await setup({ accountId: '' }).api.status()).toEqual({ ok: false, error: '' });
        const switched = setup();
        switched.client.authStore.record = { id: 'acc_other' };
        expect(await switched.api.status()).toEqual({ ok: false, error: '' });
        expect(switched.users.listExternalAuths).not.toHaveBeenCalled();

        const late = setup();
        late.users.listExternalAuths.mockImplementation(async () => { late.live.value = false; return []; });
        expect(await late.api.status()).toEqual({ ok: false, error: '' });
        const lateFailure = setup();
        lateFailure.users.listExternalAuths.mockImplementation(async () => { lateFailure.live.value = false; throw new Error('500'); });
        expect(await lateFailure.api.status()).toEqual({ ok: false, error: '' });
    });
});

describe('Discord link', () => {
    it('links through an isolated copy of the session and then reports the confirmed status', async () => {
        const view = setup({ links: [{ provider: 'discord' }] });
        expect(await view.api.link()).toEqual({ ok: true, linked: true });
        expect(view.isolated.authStore.save).toHaveBeenCalledWith('session_token', { id: ACCOUNT });
        expect(view.isolatedUsers.authWithOAuth2).toHaveBeenCalledWith({ provider: 'discord', scopes: ['identify', 'email'] });
        expect(view.isolated.authStore.clear).toHaveBeenCalled();
    });

    it('refuses a Discord identity mapped to a different BuildAndDo account', async () => {
        const view = setup({ oauth: vi.fn().mockResolvedValue({ record: { id: 'acc_other' } }) });
        expect(await view.api.link()).toEqual({ ok: false, error: 'Discord returned a different BuildAndDo account. Your current sign-in was preserved; resolve the account mapping before using the bot.' });
        expect(view.users.listExternalAuths).not.toHaveBeenCalled();
        expect(view.isolated.authStore.clear).toHaveBeenCalled();
    });

    it('reports an OAuth failure as unavailable and clears the isolated store', async () => {
        const view = setup({ oauth: vi.fn().mockRejectedValue(new Error('popup closed')) });
        expect(await view.api.link()).toEqual({ ok: false, error: UNAVAILABLE });
        expect(view.isolated.authStore.clear).toHaveBeenCalled();
    });

    it('ignores a second link or unlink while one is pending', async () => {
        let finish;
        const view = setup({ oauth: vi.fn(() => new Promise((resolve) => { finish = resolve; })) });
        const first = view.api.link();
        expect(await view.api.link()).toEqual({ ok: false, error: '' });
        expect(await view.api.unlink()).toEqual({ ok: false, error: '' });
        expect(view.createIsolated).toHaveBeenCalledTimes(1);
        finish({ record: { id: ACCOUNT } });
        expect(await first).toEqual({ ok: true, linked: false });
    });

    it('discards OAuth outcomes after the signed-in account changes', async () => {
        expect(await setup({ live: { value: false } }).api.link()).toEqual({ ok: false, error: '' });
        const live = { value: true };
        const late = setup({ live, oauth: vi.fn(async () => { live.value = false; return { record: { id: ACCOUNT } }; }) });
        expect(await late.api.link()).toEqual({ ok: false, error: '' });
        live.value = true;
        const lateFailure = setup({ live, oauth: vi.fn(async () => { live.value = false; throw new Error('closed'); }) });
        expect(await lateFailure.api.link()).toEqual({ ok: false, error: '' });
    });

    it('cancels pending isolated requests and realtime on dispose, and tolerates having nothing active', async () => {
        expect(() => setup().api.dispose()).not.toThrow();
        const view = setup({ oauth: vi.fn(() => new Promise(() => undefined)) });
        void view.api.link();
        await Promise.resolve();
        view.api.dispose();
        expect(view.isolated.cancelAllRequests).toHaveBeenCalled();
        expect(view.isolated.realtime.unsubscribe).toHaveBeenCalled();
        expect(view.isolated.authStore.clear).toHaveBeenCalled();
        delete view.isolated.realtime;
        expect(() => view.api.dispose()).not.toThrow();
    });
});

describe('Discord unlink', () => {
    it('unlinks the Discord provider and reports the refreshed status', async () => {
        const view = setup();
        expect(await view.api.unlink()).toEqual({ ok: true, linked: false });
        expect(view.users.unlinkExternalAuth).toHaveBeenCalledWith(ACCOUNT, 'discord', { requestKey: null });
    });

    it('reports failures as unavailable and late failures as stale', async () => {
        const view = setup();
        view.users.unlinkExternalAuth.mockRejectedValue(new Error('500'));
        expect(await view.api.unlink()).toEqual({ ok: false, error: UNAVAILABLE });
        view.users.unlinkExternalAuth.mockImplementation(async () => { view.live.value = false; throw new Error('500'); });
        expect(await view.api.unlink()).toEqual({ ok: false, error: '' });
        expect(await view.api.unlink()).toEqual({ ok: false, error: '' });
    });
});
