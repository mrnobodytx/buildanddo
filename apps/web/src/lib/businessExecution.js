// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/lib/businessExecution.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/pocketbase/pb_hooks/business-actions.js
// EnumType:     Adapter
// EnumEdges:    DEPENDS_ON apps/pocketbase/pb_hooks/business-actions.js
// DAG Node:     none
// Intent:       Expose scope-bound business commands and replay facts without inventing external outcomes.
// ───────────────────────────────────────────────────────────────

/** Bind business actions and receipt reads to the current account/workspace.
 * @param {object} options Native client, identity and scope guard.
 * @returns {object} Scoped list and command functions.
 */
export function createBusinessClient({ client, workspaceId, accountId, isCurrent }) {
    const current = () => Boolean(workspaceId && accountId && isCurrent() && client.authStore.record?.id === accountId);
    const base = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/business`;
    const request = async (method, body, query) => {
        if (!current()) return { ok: false, stale: true };
        try {
            const value = await client.send(base, { method, body, query, requestKey: null });
            if (!current()) return { ok: false, stale: true };
            if (value?.workspace !== workspaceId || method === 'GET' && (!Array.isArray(value.items) || value.items.some((job) => job.workspace !== workspaceId)))
                return { ok: false, error: 'The action receipt has a different workspace scope.' };
            return { ok: true, data: value };
        } catch (error) {
            if (!current()) return { ok: false, stale: true };
            // A read performed no action, so the command sentence would name one the person never
            // took and send them looking for a receipt that was never going to exist.
            const fallback = method === 'GET' ? 'Could not load these action receipts. Reload the page to try again.'
                : 'Could not confirm this action. Reload its receipts before retrying.';
            return { ok: false, error: error?.response?.message || fallback };
        }
    };
    return { list: (query = {}) => request('GET', undefined, query), command: (input) => request('POST', input) };
}
/** Prepare a bounded internal ERP action for explicit workflow review.
 * @returns {object} Editable task creation action.
 */
export function defaultBusinessAction() {
    return { provider: 'erp', binding: '', max_seconds: 30, parameters: { title: '', description: '', objective: '', contact: '', priority: 'normal', due_date: '' } };
}
/** Project retained execution facts without promoting provider claims to verification.
 * @param {object[]} jobs Workspace-scoped receipts.
 * @returns {object} Replay counts and chronologically ordered observations.
 */
export function businessReplay(jobs) {
    return { completed: jobs.filter((job) => job.status === 'succeeded').length,
        uncertain: jobs.filter((job) => ['hold', 'dispatched'].includes(job.status)).length,
        failed: jobs.filter((job) => job.status === 'failed').length,
        timeline: jobs.flatMap((job) => [
            { job: job.id, at: job.created, stage: 'requested', actor: job.owner },
            ...(job.started_at ? [{ job: job.id, at: job.started_at, stage: 'dispatched', actor: job.worker }] : []),
            ...(job.finished_at ? [{ job: job.id, at: job.finished_at, stage: job.status, actor: job.worker || job.owner, evidence: job.evidence }] : []),
        ]).filter((entry) => Number.isFinite(Date.parse(entry.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.job.localeCompare(b.job)) };
}
