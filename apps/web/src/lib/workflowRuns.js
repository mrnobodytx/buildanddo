// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workflowRuns.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/workflows.pb.js
// EnumType:    Service
// EnumEdges:   DEPENDS_ON apps/pocketbase/pb_hooks/workflows.pb.js
// DAG Node:    none
// Intent:      Keep workflow command retries, paginated reads and late responses bound to the initiating account and workspace.
// ───────────────────────────────────────────────────────────────

export const STEP_KINDS = Object.freeze({ read: 'Read data', transform: 'Summarise or transform',
    approval: 'Wait for approval', notify: 'Send a message', record: 'Record evidence', execute: 'Execute bounded action' });
export const RUN_STATUS = Object.freeze({
    running: { label: 'In progress', tone: 'violet' },
    awaiting_approval: { label: 'Awaiting approval', tone: 'amber' },
    completed: { label: 'Completed', tone: 'teal' },
    failed: { label: 'Failed', tone: 'amber' },
    cancelled: { label: 'Cancelled', tone: 'neutral' },
});

function json(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
}

/** @param {unknown} value Stored steps. @returns {object[]} Renderable steps. */
export function readWorkflowSteps(value) {
    const parsed = json(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((step) => step && typeof step.name === 'string' && Object.hasOwn(STEP_KINDS, step.kind))
        .map((step) => ({ id: typeof step.id === 'string' ? step.id : '', name: step.name, kind: step.kind,
            detail: typeof step.detail === 'string' ? step.detail : '', ...(step.kind === 'execute' ? { action: step.action } : {}) }));
}

/** @param {object} run Saved run. @returns {object|null} Supported immutable snapshot. */
export function readRunSnapshot(run) {
    const value = json(run.snapshot);
    if (!value || value.version !== 1 || typeof value.name !== 'string' || !Array.isArray(value.steps)) return null;
    const steps = readWorkflowSteps(value.steps);
    return steps.length && steps.length === value.steps.length ? { ...value, steps } : null;
}

/** @param {object} run Saved run. @returns {object[]} Recorded command receipts. */
export function readRunEvents(run) {
    const events = json(run.events);
    return Array.isArray(events) ? events.filter((event) => event && event.command &&
        typeof event.command.observation === 'string' && typeof event.actor === 'string' && typeof event.at === 'string') : [];
}

/** Retain one request key while a failed submission's exact inputs remain unchanged.
 * @param {() => string} generateKey Request identifier factory.
 * @returns {(input: object) => object} A command carrying a stable request key.
 */
export function createRetryIntent(generateKey = () => globalThis.crypto.randomUUID()) {
    let last = '';
    let requestKey = '';
    return (input) => {
        const signature = JSON.stringify(input);
        if (signature !== last) { requestKey = generateKey(); last = signature; }
        return { ...input, request_key: requestKey };
    };
}

/** Create bounded workflow operations for one mounted account/workspace.
 * @param {object} options PocketBase client, scope, liveness and mutation observer.
 * @returns {{start: Function, decide: Function, list: Function, read: Function}} Scoped operations.
 */
export function createWorkflowRunClient({ client, workspaceId, accountId, isCurrent,
    observe = (_collection, _verb, operation) => operation() }) {
    let busy = false;
    const current = () => Boolean(workspaceId && accountId && isCurrent() && client.authStore.record?.id === accountId);
    const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });
    const failure = (error) => ({ ok: false, reason: error?.status === 409 ? 'conflict' : 'request_failed',
        error: error?.response?.message || 'Could not confirm the saved result. Retry the same request to recover it.' });
    const send = async (path, input, verb) => {
        if (!current()) return stale();
        if (busy) return { ok: false, reason: 'busy', error: '' };
        busy = true;
        try {
            const response = await observe('workflow_runs', verb, () => client.send(path, {
                method: 'POST', body: { ...input, workspace: workspaceId }, requestKey: null,
            }));
            if (!current()) return stale();
            if (!response?.record?.id || response.record.workspace !== workspaceId)
                return failure(null);
            return { ok: true, record: response.record, replayed: response.replayed === true };
        } catch (error) {
            return current() ? failure(error) : stale();
        } finally { busy = false; }
    };
    return {
        start: (input) => send('/api/buildanddo/workflow-runs', input, 'create'),
        decide: (id, input) => send(`/api/buildanddo/workflow-runs/${encodeURIComponent(id)}/decisions`, input, 'update'),
        async list({ page = 1, workflow = '', status = '' } = {}) {
            if (!current()) return stale();
            const filters = ['workspace = {:workspace}'];
            if (workflow) filters.push('workflow = {:workflow}');
            if (status) filters.push('status = {:status}');
            try {
                const result = await client.collection('workflow_runs').getList(page, 20, {
                    filter: client.filter(filters.join(' && '), { workspace: workspaceId, workflow, status }),
                    sort: '-started_at,-id', requestKey: null,
                });
                if (!current()) return stale();
                if (!Array.isArray(result.items) || result.items.some((run) => run.workspace !== workspaceId))
                    return failure(null);
                return { ok: true, page: result };
            } catch (error) { return current() ? failure(error) : stale(); }
        },
        async read(id) {
            if (!current()) return stale();
            try {
                const record = await client.collection('workflow_runs').getOne(id, { requestKey: null });
                if (!current()) return stale();
                return record.workspace === workspaceId ? { ok: true, record } : failure(null);
            } catch (error) { return current() ? failure(error) : stale(); }
        },
    };
}
