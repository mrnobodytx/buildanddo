// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/missionSuite.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_hooks/suite.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/suite.pb.js
// DAG Node:    none
// Intent:      Call one scoped mission API while recovering uncertain writes and discarding private state after account changes.
// ───────────────────────────────────────────────────────────────

export const SUITE_STATES = { queued: 'Queued for worker', blocked: 'Worker not configured', processing: 'Processing', ready: 'Ready for review',
    attached: 'Review attached to evidence', failed: 'Processing failed', cancelled: 'Cancelled' };
const id = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
const revision = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const scopeChanged = () => ({ ok: false, reason: 'scope_changed', error: '' });
const signature = (value) => {
    if (Array.isArray(value)) return '[' + value.map(signature).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + signature(value[key])).join(',') + '}';
    return JSON.stringify(value);
};

/** @param {object} options Native client, current scope and mutation observer. @returns {object} Mission reads and recoverable commands. */
export function createSuiteClient({ client, accountId, workspaceId, missionId, demo = false, isCurrent,
    keyFactory = () => globalThis.crypto.randomUUID(), observe = (_name, _action, operation) => operation() }) {
    const current = () => !demo && id(accountId) && id(workspaceId) && id(missionId) && isCurrent() && client.authStore.record?.id === accountId;
    const path = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/suite`;
    let pending = null; let busy = false;
    const item = (value) => value && id(value.id) && value.workspace === workspaceId && value.mission === missionId && id(value.owner) &&
        ['maritime', 'submission'].includes(value.suite) && Object.hasOwn(SUITE_STATES, value.status) && revision(value.revision, 1) && revision(value.attempt) &&
        revision(value.config_revision) && revision(value.base_revision) && hash(value.input_sha256) &&
        ['binding', 'created', 'processed_at', 'failure', 'evidence', 'result_sha256'].every((key) => typeof value[key] === 'string');
    const failure = (error, writing = false) => ({ ok: false,
        reason: error?.status === 403 || error?.status === 401 ? 'forbidden' : error?.status === 409 ? 'conflict' : writing && (!error?.status || error.status >= 500) ? 'uncertain' : 'unavailable',
        error: typeof error?.response?.message === 'string' ? error.response.message : writing ? 'The save was not confirmed. Recover the previous request before making another change.' :
            'The mission suite is unavailable. Reload or ask the workspace operator to check its installed API.' });
    const envelope = (action, payload, expectedRevision = 0) => {
        const key = keyFactory();
        if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(key)) throw new Error('Request identity unavailable');
        return { action, mission: missionId, payload, revision: expectedRevision, request_key: key };
    };
    const read = async (action, payload, validate) => {
        if (!current()) return scopeChanged();
        try {
            const data = await client.send(path, { method: 'POST', body: envelope(action, payload), cache: 'no-store', requestKey: null });
            if (!current()) return scopeChanged();
            if (data?.workspace !== workspaceId || data.mission !== missionId || !validate(data)) return failure(null);
            return { ok: true, data };
        } catch (error) { return current() ? failure(error) : scopeChanged(); }
    };
    const send = async () => {
        if (!current()) { pending = null; return scopeChanged(); }
        if (busy) return { ok: false, reason: 'busy', error: '' };
        if (!pending) return { ok: false, reason: 'invalid', error: 'There is no unresolved save.' };
        busy = true;
        try {
            const body = JSON.parse(pending.serialized);
            const value = await observe('suite_runs', 'update', () => client.send(path, { method: 'POST', body, cache: 'no-store', requestKey: null }));
            if (!current()) { pending = null; return scopeChanged(); }
            if (value?.workspace !== workspaceId || value.mission !== missionId || value.action !== body.action || !id(value.id) ||
                !revision(value.revision, 1) || typeof value.replayed !== 'boolean' ||
                !['configure', 'enqueue'].includes(body.action) && (value.id !== body.payload.id || value.revision !== body.revision + 1) ||
                body.action === 'configure' && value.revision !== body.revision + 1 || body.action === 'enqueue' && value.revision !== 1)
                throw new Error('Incomplete suite receipt');
            pending = null; return { ok: true, result: value };
        } catch (error) {
            if (!current()) { pending = null; return scopeChanged(); }
            const result = failure(error, true); if (result.reason !== 'uncertain') pending = null;
            return result;
        } finally { busy = false; }
    };
    return {
        read: (page = 1) => revision(page, 1) && page <= 9999 ? read('snapshot', { page }, (data) => data.page === page && typeof data.has_more === 'boolean' &&
            ['owner', 'admin', 'editor', 'viewer'].includes(data.role) && Array.isArray(data.items) && data.items.length <= 20 && data.items.every(item) &&
            typeof data.configured === 'boolean' && data.control && revision(data.control.revision) && revision(data.control.state_revision) &&
            typeof data.control.enabled === 'boolean' && Array.isArray(data.control.rights) && data.control.rights.length <= 32 &&
            typeof data.control.active_run === 'string' && revision(data.control.observations) && data.control.parameters && typeof data.control.parameters === 'object') : Promise.resolve(failure(null)),
        detail: (value) => id(value) ? read('detail', { id: value }, (data) => data.record?.id === value && item(data.record) && typeof data.record.input_canonical === 'string' &&
            typeof data.record.result_canonical === 'string' &&
            (!data.record.result || data.record.result.schema_version === 'mission-suite.result/v1' && data.record.result.tenant_id === workspaceId &&
                data.record.result.mission_id === missionId && data.record.result.release_state === 'HOLD' && data.record.result.input_sha256 === data.record.input_sha256 &&
                hash(data.record.result.source_sha256) && data.record.result.analysis && data.record.result.proof?.authority === 'evidence_only')) : Promise.resolve(failure(null)),
        async command(action, payload, expectedRevision = 0) {
            if (!current()) { pending = null; return scopeChanged(); }
            if (!['configure', 'enqueue', 'retry', 'cancel', 'attach'].includes(action) || !revision(expectedRevision)) return failure({ status: 400 });
            try {
                const clone = JSON.parse(JSON.stringify(payload));
                const identity = signature([action, clone, expectedRevision]);
                if (identity.length > 250000 || !clone || typeof clone !== 'object' || Array.isArray(clone)) return failure({ status: 400 });
                if (pending && pending.signature !== identity) return { ok: false, reason: 'uncertain', error: 'Recover the previous save before starting a different change.' };
                if (!pending) pending = { signature: identity, serialized: JSON.stringify(envelope(action, clone, expectedRevision)) };
                return send();
            } catch { return { ok: false, reason: 'invalid', error: 'Use bounded input and a browser that supports secure request identifiers.' }; }
        },
        retry: send,
    };
}

/** @param {File} file A locally selected rendered PDF. @returns {Promise<object>} Metadata without uploading document bytes. */
export async function fingerprintPdf(file) {
    if (!file || !file.name?.toLowerCase().endsWith('.pdf') || file.size < 5 || file.size > 20 * 1024 * 1024)
        throw new Error('Choose a rendered PDF of at most 20 MiB.');
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength !== file.size || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Choose a PDF with its expected file header.');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return { name: file.name.slice(0, 160), sha256: Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, '0')).join('') };
}
