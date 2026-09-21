// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/lib/onboarding.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/workspace-onboarding.js
// EnumType:     Adapter
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/workspace-onboarding.js
// DAG Node:     none
// Intent:       Recover complete onboarding receipts while discarding late responses from a previous account.
// ───────────────────────────────────────────────────────────────

/** Create or recover one account-bound setup using a server-derived retry identity.
 * @param {object} client Native PocketBase client.
 * @param {string} accountId Account that reviewed the form.
 * @param {{name: string, domain: string}} input Reviewed workspace details.
 * @returns {Promise<object>} Confirmed receipt or recoverable failure.
 */
export async function createWorkspace(client, accountId, input) {
    if (!accountId || client.authStore.record?.id !== accountId) return { ok: false, error: 'Sign in before setting up a workspace.' };
    try {
        const result = await client.send('/api/buildanddo/onboarding', { method: 'POST', body: input, requestKey: null });
        if (client.authStore.record?.id !== accountId) return { ok: false, stale: true };
        if (!result?.workspace || result.owner !== accountId || !Array.isArray(result.services) || result.services.length !== 7)
            throw new Error('Incomplete setup receipt');
        return { ok: true, ...result };
    } catch (error) {
        if (client.authStore.record?.id !== accountId) return { ok: false, stale: true };
        return { ok: false, error: error?.response?.message || 'Could not confirm workspace setup. Retry these same details to recover it without creating a duplicate.' };
    }
}
