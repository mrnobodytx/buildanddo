// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/authSession.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/lib/pocketbaseClient.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/pocketbaseClient.js
// Intent:      Revalidate native sessions without letting an old refresh overwrite a different signed-in account.
// ───────────────────────────────────────────────────────────────

/** Revalidate PocketBase sessions and discard responses after identity changes.
 * @param {object} client Native PocketBase client.
 * @param {(state: object) => void} changed Session state observer.
 * @returns {object} Lifecycle and explicit retry operations.
 */
export function createAuthSession(client, changed) {
    let epoch = 0, sessionEpoch = 0, status = 'checking', stopped = true, ownSave = false, pending = null, validated = '', unsubscribe = () => {};
    const publish = (next, error = '') => { status = next; changed({ status, error, user: client.authStore.record, sessionEpoch }); };
    const refresh = () => {
        if (stopped) return Promise.resolve(false);
        if (!client.authStore.isValid || !client.authStore.record?.id) {
            epoch += 1;
            if (client.authStore.record || validated) sessionEpoch += 1;
            validated = '';
            ownSave = true;
            if (client.authStore.record) client.authStore.clear();
            ownSave = false;
            publish('anonymous');
            return Promise.resolve(false);
        }
        const token = client.authStore.token, account = client.authStore.record.id;
        if (pending?.token === token && pending.account === account) return pending.promise;
        const attempt = ++epoch;
        const current = () => !stopped && attempt === epoch && client.authStore.token === token && client.authStore.record?.id === account;
        if (validated !== token) publish('checking');
        const job = { token, account, promise: null };
        pending = job;
        job.promise = (async () => {
            try {
                // Use PocketBase's native refresh endpoint, saving only after the
                // identity check. authRefresh() saves before its promise resolves.
                const result = await client.send('/api/collections/users/auth-refresh', {
                    method: 'POST', headers: { Authorization: token }, requestKey: null,
                });
                if (!current()) return false;
                if (result?.record?.id !== account || typeof result.token !== 'string' || !result.token)
                    throw new Error('Invalid native session response');
                ownSave = true;
                try { client.authStore.save(result.token, result.record); } finally { ownSave = false; }
                if (!client.authStore.isValid) {
                    sessionEpoch += 1;
                    ownSave = true;
                    try { client.authStore.clear(); } finally { ownSave = false; }
                    validated = ''; publish('anonymous'); return false;
                }
                validated = client.authStore.token;
                publish('ready');
                return true;
            } catch (error) {
                if (!current()) return false;
                if ([401, 403].includes(error?.status)) {
                    sessionEpoch += 1; validated = '';
                    ownSave = true;
                    try { client.authStore.clear(); } finally { ownSave = false; }
                    publish('anonymous');
                } else publish('unavailable', 'Your session could not be checked. Retry before opening workspace data.');
                return false;
            } finally { if (pending === job) pending = null; }
        })();
        return job.promise;
    };
    return {
        refresh,
        isCurrent: (expectedEpoch) => !stopped && status === 'ready' && expectedEpoch === sessionEpoch &&
            client.authStore.isValid && Boolean(client.authStore.record?.id) && client.authStore.token === validated,
        start() {
            stopped = false;
            unsubscribe();
            unsubscribe = client.authStore.onChange(() => {
                if (ownSave) return;
                // Native refresh saves retain this lifetime. An externally saved
                // login, replacement or clear must fence even the same account.
                epoch += 1; sessionEpoch += 1; pending = null; validated = '';
                void refresh();
            });
            return refresh();
        },
        stop() { stopped = true; epoch += 1; sessionEpoch += 1; pending = null; validated = ''; unsubscribe(); },
    };
}
