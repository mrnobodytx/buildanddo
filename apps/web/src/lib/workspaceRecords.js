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
// Depends:     apps/pocketbase/pb_hooks/workspace-record-policy.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-record-policy.js
// Intent:      Keep collection requests and their results bound to the account and workspace that initiated them.
// ───────────────────────────────────────────────────────────────

/** Create scope-bound CRUD operations over native PocketBase rules.
 * @param {object} options Client, collection, current scope and mutation observer.
 * @returns {object} Read and write methods that discard stale results.
 */
export function createWorkspaceRecordClient({ client, collection, workspaceId, accountId, isCurrent,
    observe = (_collection, _operation, action) => action() }) {
    let busy = false;
    const current = () => Boolean(accountId && workspaceId && isCurrent() && client.authStore.record?.id === accountId);
    const stale = () => ({ ok: false, stale: true, reason: 'scope_changed', error: 'The workspace or account changed. Reload before continuing.' });
    const belongs = (record) => record && record.workspace === workspaceId && typeof record.id === 'string' && record.id;
    return {
        async read({ sort = '-created', expand, extraFilter = '' } = {}) {
            if (!current()) return stale();
            try {
                const base = client.filter('workspace = {:ws}', { ws: workspaceId });
                const records = await client.collection(collection).getFullList({ sort, expand,
                    filter: extraFilter ? `${base} && (${extraFilter})` : base, requestKey: null });
                if (!current()) return stale();
                if (!Array.isArray(records) || records.some((record) => !belongs(record))) throw new Error('Unexpected record scope');
                return { ok: true, records };
            } catch { return current() ? { ok: false, error: 'Could not load this data right now. What you see may be incomplete.' } : stale(); }
        },
        async write(operation, id, data = {}) {
            if (!current()) return stale();
            if (busy) return { ok: false, reason: 'busy', error: 'Wait for the current save to finish.' };
            if (!['create', 'update', 'delete'].includes(operation) ||
                operation !== 'create' && ['owner', 'workspace'].some((field) => Object.hasOwn(data, field)))
                return { ok: false, error: 'Record authorship and workspace cannot be reassigned.' };
            busy = true;
            try {
                const table = client.collection(collection);
                if (operation !== 'create') {
                    const target = await table.getOne(id, { requestKey: null });
                    if (!current()) return stale();
                    if (!belongs(target) || target.id !== id) return { ok: false, error: 'Choose a record from the current workspace.' };
                }
                const record = await observe(collection, operation, () => operation === 'create'
                    ? table.create({ ...data, workspace: workspaceId, owner: accountId })
                    : operation === 'update' ? table.update(id, data) : table.delete(id));
                if (!current()) return stale();
                if (operation !== 'delete' && !belongs(record)) throw new Error('Unexpected save response');
                return { ok: true, record };
            } catch (error) {
                if (!current()) return stale();
                const field = Object.values(error?.response?.data || {}).find((value) => value?.message);
                return { ok: false, reason: 'write_failed', error: field?.message || error?.response?.message ||
                    'Could not confirm this save. Refresh the records before trying again.' };
            } finally { busy = false; }
        },
    };
}
