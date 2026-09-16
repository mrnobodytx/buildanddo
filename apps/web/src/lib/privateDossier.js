// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/privateDossier.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/dossier.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/dossier.pb.js
// DAG Node:    none
// Intent:      Recall and revise only the current user's private dossier without URL leakage, browser persistence or duplicated uncertain saves.
// ───────────────────────────────────────────────────────────────

export const ENTITY_KINDS = Object.freeze({ person: 'Person', organization: 'Organization', project: 'Project', place: 'Place', topic: 'Topic' });
export const DOSSIER_ACTIONS = Object.freeze({ 'dossier.update': 'Dossier updated', 'entity.create': 'Entity added', 'entity.update': 'Entity corrected',
    'entity.delete': 'Entity forgotten', 'note.add': 'Note added', 'note.update': 'Note corrected', 'note.delete': 'Note removed' });
const id = (value, empty = false) => typeof value === 'string' && ((empty && !value) || /^[a-zA-Z0-9_-]{1,64}$/.test(value));
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const text = (value, maximum) => typeof value === 'string' && value.length <= maximum;
const strings = (value, maximum, length) => Array.isArray(value) && value.length <= maximum && value.every((item) => text(item, length));
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });
const origin = (value) => ['website', 'discord'].includes(value);
const entityShape = (row) => row && id(row.id) && integer(row.revision, 1) && text(row.label, 160) &&
    Object.hasOwn(ENTITY_KINDS, row.kind) && strings(row.aliases, 10, 120) && strings(row.tags, 10, 40) && text(row.updated, 40);
const pageShape = (data, page) => data?.page === page && typeof data.has_more === 'boolean' && Array.isArray(data.items);
const safeUrl = (value) => {
    if (value === '') return true;
    if (!text(value, 2048)) return false;
    try { const parsed = new URL(value); return parsed.protocol === 'https:' && !parsed.username && !parsed.password; } catch { return false; }
};
const noteShape = (row) => row && id(row.id) && text(row.text, 2000) && safeUrl(row.source_url) && text(row.source_label, 160) &&
    origin(row.origin) && text(row.created, 40) && text(row.updated, 40) && (!row.corrected_via || origin(row.corrected_via));

/** Bind personal reads and replayable writes to the current native account.
 * @param {object} options Native client, account, demo state and scope guard.
 * @returns {object} Validated reads, mutations and in-memory retry recovery.
 */
export function createDossierClient({ client, accountId, demo = false, isCurrent, keyFactory = () => globalThis.crypto.randomUUID() }) {
    let pending = null; let busy = false; let generation = 0;
    const current = () => !demo && id(accountId) && isCurrent() && client.authStore.record?.id === accountId;
    const failure = (error, writing = false) => {
        const reason = [401, 403].includes(error?.status) ? 'forbidden' : error?.status === 409 ? 'conflict' : error?.status === 400 ? 'invalid' :
            writing && (!error?.status || error.status >= 500) ? 'uncertain' : 'unavailable';
        const messages = { forbidden: 'Your account cannot access this dossier. Sign in again and retry.',
            conflict: 'This record changed. Reload it and review the current revision before saving.',
            invalid: 'Check the input limits, aliases, source URL and saved revision, then retry.',
            uncertain: 'Could not confirm the save. Recover the previous request before saving another change.',
            unavailable: 'Private dossier storage is unavailable. Reload, or ask the operator to check its schema and encryption binding.' };
        return { ok: false, reason, error: messages[reason] };
    };
    const read = async (body, validate) => {
        if (!current()) return stale(); const attempt = generation;
        try {
            const data = await client.send('/api/buildanddo/dossier/read', { method: 'POST', body, requestKey: null, cache: 'no-store' });
            if (!current() || attempt !== generation) return stale();
            return data?.owner === accountId && validate(data) ? { ok: true, data } : failure(null);
        } catch (error) { return current() && attempt === generation ? failure(error) : stale(); }
    };
    const send = async () => {
        if (!current()) return stale();
        if (busy) return { ok: false, reason: 'busy', error: '' };
        if (!pending) return { ok: false, reason: 'invalid', error: 'There is no unresolved dossier save.' };
        busy = true; const attempt = generation; const body = pending;
        try {
            const result = await client.send('/api/buildanddo/dossier', { method: 'POST', body, requestKey: null, cache: 'no-store' });
            if (!current() || attempt !== generation) return stale();
            if (result?.owner !== accountId || result.action !== body.action || result.revision !== body.revision + 1 ||
                !id(result.id) || !id(result.dossier_id) || typeof result.replayed !== 'boolean') throw new Error('Incomplete private save receipt.');
            pending = null; return { ok: true, result };
        } catch (error) {
            if (!current() || attempt !== generation) return stale();
            const result = failure(error, true); if (result.reason !== 'uncertain') pending = null;
            return result;
        } finally { if (attempt === generation) busy = false; }
    };
    return {
        recall(query = '', page = 1) {
            if (!text(query, 200) || !integer(page, 1) || page > 20) return Promise.resolve(failure({ status: 400 }));
            return read({ action: 'recall', query, page }, (data) => data.encrypted_storage === true &&
                data.dossier?.owner === accountId && id(data.dossier.id, true) && integer(data.dossier.revision) && text(data.dossier.about, 2000) &&
                pageShape(data, page) && data.items.length <= 10 && integer(data.entity_count) && data.entity_count <= 200 &&
                integer(data.total) && data.total <= data.entity_count && data.items.every((row) => entityShape(row) && integer(row.note_count) &&
                    row.note_count <= 20 && text(row.excerpt, 240)));
        },
        detail(entityId) {
            if (!id(entityId)) return Promise.resolve(failure({ status: 400 }));
            return read({ action: 'entity', id: entityId }, (data) => id(data.dossier_id) && data.entity?.id === entityId &&
                entityShape(data.entity) && Array.isArray(data.entity.notes) && data.entity.notes.length <= 20 && data.entity.notes.every(noteShape));
        },
        history(page = 1) {
            if (!integer(page, 1) || page > 9999) return Promise.resolve(failure({ status: 400 }));
            return read({ action: 'history', page }, (data) => pageShape(data, page) && data.items.length <= 20 &&
                data.items.every((row) => id(row.id) && id(row.target) && Object.hasOwn(DOSSIER_ACTIONS, row.action) &&
                    integer(row.revision, 1) && origin(row.origin) && text(row.created, 40)));
        },
        async command(action, payload, revision = 0) {
            if (!current()) return stale();
            if (busy) return { ok: false, reason: 'busy', error: '' };
            if (pending) return failure(null, true);
            if (!Object.hasOwn(DOSSIER_ACTIONS, action) || !payload || typeof payload !== 'object' || Array.isArray(payload) || !integer(revision))
                return failure({ status: 400 });
            try {
                const requestKey = keyFactory();
                if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey)) return failure({ status: 400 });
                const serialized = JSON.stringify({ action, payload, revision, request_key: requestKey });
                if (serialized.length > 12000) return failure({ status: 400 });
                pending = JSON.parse(serialized);
            } catch { return failure({ status: 400 }); }
            return send();
        },
        retry: send,
        dispose() { generation++; pending = null; busy = false; },
    };
}
