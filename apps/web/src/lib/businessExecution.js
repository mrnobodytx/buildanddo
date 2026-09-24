// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/businessExecution.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/pocketbase/pb_hooks/business-actions.js, apps/web/src/lib/missionReplay.js
// EnumType:    Adapter
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/business-actions.js; CONSUMES apps/web/src/lib/missionReplay.js
// DAG Node:    none
// Intent:      Expose scope-bound business commands and replay facts without inventing external outcomes.
// ───────────────────────────────────────────────────────────────

import { validateMissionReplay } from './missionReplay.js';

/** Bind business actions and receipt reads to the current account/workspace.
 * @param {object} options Native client, identity and scope guard.
 * @returns {object} Scoped list and command functions.
 */
export function createBusinessClient({ client, workspaceId, accountId, isCurrent,
    observe = (_name, _verb, operation) => operation() }) {
    const current = () => Boolean(workspaceId && accountId && isCurrent() && client.authStore.record?.id === accountId);
    const base = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/business`;
    const request = async (method, body, query) => {
        if (!current()) {
            const result = { ok: false, stale: true };
            return method === 'POST' ? observe('business_jobs', body?.action, () => result) : result;
        }
        try {
            const operation = async () => {
                try {
                    const value = await client.send(base, { method, body, query, requestKey: null });
                    if (!current()) return { ok: false, stale: true };
                    if (value?.workspace !== workspaceId || method === 'GET' && (!Array.isArray(value.items) || value.items.some((job) => job.workspace !== workspaceId)))
                        return { ok: false, reason: method === 'POST' ? 'uncertain' : 'rejected', error: 'The action receipt has a different workspace scope.' };
                    return { ok: true, data: value };
                } catch (error) {
                    if (!current()) return { ok: false, stale: true };
                    throw error;
                }
            };
            const result = await (method === 'POST' ? observe('business_jobs', body?.action, operation) : operation());
            return current() ? result : { ok: false, stale: true };
        } catch (error) { return current() ? { ok: false, reason: method === 'POST' && !(error?.status > 0 && error.status < 500) ? 'uncertain' : 'rejected',
            error: error?.response?.message || 'Could not confirm this action. Reload its receipts before retrying.' } : { ok: false, stale: true }; }
    };
    return { list: (query = {}) => request('GET', undefined, query), command: (input) => request('POST', input),
        async captureMission(mission) {
            if (!current()) return { ok: false, stale: true };
            if (typeof mission !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(mission)) return { ok: false, error: 'Choose a saved mission.' };
            try {
                const capture = await client.send(`/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/mission-replay/${encodeURIComponent(mission)}`, { method: 'GET', requestKey: null, cache: 'no-store' });
                if (!current()) return { ok: false, stale: true };
                if (capture?.captured_by !== accountId) throw new Error('The capture belongs to another account.');
                const data = await validateMissionReplay(capture, workspaceId, mission);
                return current() ? { ok: true, data } : { ok: false, stale: true };
            } catch (error) { return current() ? { ok: false, error: error?.response?.message || 'Could not verify the complete mission capture. Refresh the retained records before exporting.' } : { ok: false, stale: true }; }
        },
        async read(id) {
            if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return { ok: false, error: 'Choose a saved action receipt.' };
            const result = await request('GET', undefined, { id });
            if (!result.ok) return result;
            if (result.data.items.length !== 1 || result.data.items[0].id !== id)
                return { ok: false, error: 'This receipt is unavailable in the current workspace.' };
            return { ok: true, data: result.data.items[0] };
        } };
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
