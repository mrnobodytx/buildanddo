// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workspaceRecords.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/pocketbase/pb_hooks/workspace-record-policy.js, apps/web/src/lib/workspaceClaims.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-record-policy.js; CONSUMES apps/web/src/lib/workspaceClaims.js
// Intent:      Keep collection requests and their results bound to the account and workspace that initiated them.
// ───────────────────────────────────────────────────────────────

import { CLAIM_COLLECTIONS, createWorkspaceClaimClient } from './workspaceClaims.js';

/** Create scope-bound CRUD operations over native PocketBase rules.
 * Read-only readFailure metadata is diagnostic; the existing result and error UI remain authoritative.
 * @param {object} options Client, collection, current scope and mutation observer.
 * @returns {object} Read and write methods that discard stale results.
 */
export function createWorkspaceRecordClient({ client, collection, workspaceId, accountId, isCurrent,
    observe = (_collection, _operation, action) => action() }) {
    let busy = false;
    const current = () => Boolean(accountId && workspaceId && isCurrent() && client.authStore.record?.id === accountId);
    const stale = () => ({ ok: false, stale: true, reason: 'scope_changed', error: 'The workspace or account changed. Reload before continuing.' });
    const decline = (operation, result) => observe(collection, operation, () => result);
    const belongs = (record) => record && record.workspace === workspaceId && typeof record.id === 'string' && record.id;
    let saved = new Map();
    const claims = CLAIM_COLLECTIONS.includes(collection) ? createWorkspaceClaimClient({ client, collection, workspaceId, accountId, isCurrent, observe }) : null;
    return {
        async read({ sort = '-created', expand, extraFilter = '' } = {}) {
            if (!current()) return stale();
            let received = false;
            try {
                const base = client.filter('workspace = {:ws}', { ws: workspaceId });
                const records = await client.collection(collection).getFullList({ sort, expand,
                    filter: extraFilter ? `${base} && (${extraFilter})` : base, requestKey: null });
                if (!current()) return stale();
                received = true;
                if (!Array.isArray(records) || records.some((record) => !belongs(record))) throw new Error('Unexpected record scope');
                if (claims) saved = new Map(records.map((record) => [record.id, record]));
                return { ok: true, records };
            } catch (error) {
                if (!current()) return stale();
                const cancelled = error?.isAbort || error?.name === 'AbortError' || error?.originalError?.name === 'AbortError';
                const malformed = received || error?.name === 'SyntaxError' || error?.originalError?.name === 'SyntaxError';
                const status = received ? 200 : Number.isInteger(error?.status) && (error.status === 0 || error.status >= 100 && error.status < 600) &&
                    !(malformed && error.status === 0) ? error.status : undefined;
                return { ok: false, error: 'Could not load this data right now. What you see may be incomplete.',
                    readFailure: { reason: cancelled ? 'cancelled' : malformed ? 'invalid_response' : 'unavailable', status } };
            }
        },
        async write(operation, id, data = {}, version) {
            if (!current()) return decline(operation, stale());
            if (claims) return claims.write(operation, id, data, version || saved.get(id));
            if (busy) return decline(operation, { ok: false, reason: 'busy', error: 'Wait for the current save to finish.' });
            if (!['create', 'update', 'delete'].includes(operation) ||
                operation !== 'create' && ['owner', 'workspace'].some((field) => Object.hasOwn(data, field)))
                return decline(operation, { ok: false, error: 'Record authorship and workspace cannot be reassigned.' });
            busy = true;
            try {
                const table = client.collection(collection);
                const result = await observe(collection, operation, async () => {
                    try {
                        if (operation !== 'create') {
                            const target = await table.getOne(id, { requestKey: null });
                            if (!current()) return stale();
                            if (!belongs(target) || target.id !== id) return { ok: false, error: 'Choose a record from the current workspace.' };
                        }
                        const record = await (operation === 'create' ? table.create({ ...data, workspace: workspaceId, owner: accountId })
                            : operation === 'update' ? table.update(id, data) : table.delete(id));
                        if (!current()) return stale();
                        if (operation !== 'delete' && !belongs(record)) throw Object.assign(new Error('Unexpected save response'), { reason: 'invalid_receipt' });
                        return { ok: true, record };
                    } catch (error) {
                        if (!current()) return stale();
                        throw error;
                    }
                });
                return current() ? result : stale();
            } catch (error) {
                if (!current()) return stale();
                const field = Object.values(error?.response?.data || {}).find((value) => value?.message);
                return { ok: false, reason: 'write_failed', error: field?.message || error?.response?.message ||
                    'Could not confirm this save. Refresh the records before trying again.' };
            } finally { busy = false; }
        },
        retry: () => claims ? claims.retry() : Promise.resolve({ ok: false, reason: 'invalid', error: 'Refresh these records before trying again.' }),
    };
}
