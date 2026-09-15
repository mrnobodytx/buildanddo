// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/discordAccount.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/pocketbaseClient.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/pocketbaseClient.js
// DAG Node:    none
// Intent:      Link Discord through native PocketBase OAuth without replacing the signed-in account or trusting a typed Discord identifier.
// ───────────────────────────────────────────────────────────────

/** Use an isolated native SDK auth store for account linking.
 * @param {object} options Shared client, isolated client factory and liveness guard.
 * @returns {object} Status, linking, unlinking and cancellation operations.
 */
export function createDiscordAccountLink({ client, createIsolated, accountId, isCurrent }) {
    const current = () => Boolean(accountId && isCurrent() && client.authStore.record?.id === accountId);
    let active = null; let busy = false;
    const stale = () => ({ ok: false, error: '' });
    const failure = () => ({ ok: false, error: 'Discord account linking is unavailable. Ask the operator to check the native Discord OAuth provider, then retry.' });
    const status = async () => {
        if (!current()) return stale();
        try {
            const links = await client.collection('users').listExternalAuths(accountId, { requestKey: null });
            if (!current()) return stale();
            if (!Array.isArray(links)) return failure();
            return { ok: true, linked: links.some((item) => item.provider === 'discord') };
        } catch { return current() ? failure() : stale(); }
    };
    return {
        status,
        async link() {
            if (!current() || busy) return stale();
            busy = true;
            try {
                active = createIsolated();
                active.authStore.save(client.authStore.token, client.authStore.record);
                const result = await active.collection('users').authWithOAuth2({ provider: 'discord', scopes: ['identify', 'email'] });
                if (!current()) return stale();
                if (result?.record?.id !== accountId) return { ok: false, error: 'Discord returned a different BuildAndDo account. Your current sign-in was preserved; resolve the account mapping before using the bot.' };
                return await status();
            } catch { return current() ? failure() : stale(); }
            finally { active?.authStore.clear(); active = null; busy = false; }
        },
        async unlink() {
            if (!current() || busy) return stale();
            busy = true;
            try { await client.collection('users').unlinkExternalAuth(accountId, 'discord', { requestKey: null }); return await status(); }
            catch { return current() ? failure() : stale(); }
            finally { busy = false; }
        },
        dispose() {
            active?.cancelAllRequests();
            if (active?.realtime) void active.realtime.unsubscribe().catch(() => undefined);
            active?.authStore.clear();
        },
    };
}
