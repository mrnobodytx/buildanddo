// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/missionResearch.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/research.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/research.pb.js
// DAG Node:    none
// Intent:      Preserve research retry identity and reject stale account responses while uploading protected source material.
// ───────────────────────────────────────────────────────────────

export const RESEARCH_KINDS = { search: 'Web search', url: 'Web page', document: 'Document', audio: 'Audio', video: 'Video' };
export const RESEARCH_STATES = { queued: 'Queued', processing: 'Processing', ready: 'Ready for review', blocked: 'Capability unavailable',
    failed: 'Processing failed', cancelled: 'Cancelled', attached: 'Attached to evidence' };
export const FILE_ACCEPT = '.txt,.md,.pdf,.docx,.mp3,.wav,.m4a,.ogg,.mp4,.webm';
const extensions = { txt: 'document', md: 'document', pdf: 'document', docx: 'document', mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', mp4: 'video', webm: 'video' };
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const revision = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const itemShape = (item, workspace) => item && id(item.id) && item.workspace === workspace && id(item.mission) && id(item.owner) &&
    Object.hasOwn(RESEARCH_KINDS, item.kind) && Object.hasOwn(RESEARCH_STATES, item.status) && revision(item.revision, 1) &&
    revision(item.attempt) && ['title', 'input', 'context', 'origin', 'failure', 'created', 'processed_at', 'evidence'].every((key) => typeof item[key] === 'string');

/** Connect research operations to one authenticated account and workspace.
 * @param {object} options Native PocketBase client, scope and observation callback.
 * @returns {object} Scoped reads, uploads and replayable commands.
 */
export function createResearchClient({ client, accountId, workspaceId, demo = false, isCurrent,
    keyFactory = () => globalThis.crypto.randomUUID(), observe = (_name, _verb, operation) => operation() }) {
    const current = () => !demo && id(accountId) && id(workspaceId) && isCurrent() && client.authStore.record?.id === accountId;
    const prefix = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/research`;
    let pending = null; let busy = false;
    const failure = (error, writing = false) => ({ ok: false,
        reason: error?.status === 403 ? 'forbidden' : error?.status === 409 ? 'conflict' : writing && (!error?.status || error.status >= 500) ? 'uncertain' : 'unavailable',
        error: typeof error?.response?.message === 'string' ? error.response.message : writing ?
            'Could not confirm the save. Retry the previous request to recover its result.' : 'Research is unavailable. Reload or ask the workspace operator to check the installed research API.' });
    const read = async (suffix, query, validate) => {
        if (!current()) return stale();
        try {
            const data = await client.send(prefix + suffix, { method: 'GET', query, requestKey: null, cache: 'no-store' });
            if (!current()) return stale();
            return validate(data) ? { ok: true, data } : failure(null);
        } catch (error) { return current() ? failure(error) : stale(); }
    };
    const send = async () => {
        if (!current()) return stale();
        if (busy) return { ok: false, reason: 'busy', error: '' };
        if (!pending) return { ok: false, reason: 'invalid', error: 'There is no unresolved request.' };
        busy = true;
        try {
            const body = pending.body;
            const result = await observe('research_submissions', 'update', async () => {
                const value = await client.send(prefix, { method: 'POST', body, requestKey: null, cache: 'no-store' });
                if (value?.workspace !== workspaceId || value.action !== body.action || !id(value.id) || !revision(value.revision, 1) ||
                    typeof value.replayed !== 'boolean' || typeof value.status !== 'string' || typeof value.evidence !== 'string') throw new Error('Incomplete research receipt');
                return value;
            });
            if (!current()) return stale();
            pending = null; return { ok: true, result };
        } catch (error) {
            if (!current()) return stale();
            const result = failure(error, true); if (result.reason !== 'uncertain') pending = null;
            return result;
        } finally { busy = false; }
    };
    return {
        read: (query = {}) => read('', query, (data) => data?.workspace === workspaceId && ['owner', 'admin', 'editor', 'viewer'].includes(data.role) &&
            Array.isArray(data.items) && data.items.length <= 20 && data.items.every((item) => itemShape(item, workspaceId)) &&
            revision(data.page, 1) && typeof data.has_more === 'boolean' && typeof data.capabilities?.enabled === 'boolean' &&
            Array.isArray(data.capabilities.kinds) && data.capabilities.kinds.every((kind) => Object.hasOwn(RESEARCH_KINDS, kind))),
        detail: (value) => id(value) ? read(`/${value}`, {}, (data) => data?.workspace === workspaceId && data.record?.id === value &&
            itemShape(data.record, workspaceId) && typeof data.record.upload === 'string' &&
            (!data.record.result || (typeof data.record.result.text === 'string' && Array.isArray(data.record.result.citations) &&
                data.record.result.citations.every((citation) => typeof citation.title === 'string' && typeof citation.url === 'string')))) : Promise.resolve(failure(null)),
        async uploads() {
            if (!current()) return stale();
            try {
                const data = await client.collection('research_uploads').getList(1, 50, { filter: client.filter('workspace = {:workspace} && owner = {:owner}',
                    { workspace: workspaceId, owner: accountId }), sort: '-created', requestKey: null });
                if (!current()) return stale();
                if (!Array.isArray(data?.items) || !data.items.every((item) => item.workspace === workspaceId && item.owner === accountId && id(item.id))) return failure(null);
                return { ok: true, items: data.items, hasMore: data.totalPages > 1 };
            } catch (error) { return current() ? failure(error) : stale(); }
        },
        async original(uploadId) {
            if (!current()) return stale();
            if (!id(uploadId)) return failure(null);
            try {
                const file = await client.collection('research_uploads').getOne(uploadId, { requestKey: null });
                if (!current()) return stale();
                if (file.workspace !== workspaceId || file.id !== uploadId || typeof file.asset !== 'string') return failure(null);
                const token = await client.files.getToken();
                if (!current()) return stale();
                return { ok: true, url: client.files.getURL(file, file.asset, { token, download: true }) };
            } catch (error) { return current() ? failure(error) : stale(); }
        },
        async upload(file) {
            if (!current()) return stale();
            const kind = extensions[file?.name?.split('.').pop().toLowerCase()];
            if (!kind || !file.size || file.size > 20971520 || file.name.length > 180 || /[\x00-\x1f/\\]/.test(file.name))
                return { ok: false, reason: 'invalid', error: 'Choose a supported file of at most 20 MiB.' };
            if (busy || pending) return { ok: false, reason: 'uncertain', error: 'Recover the previous request before uploading another source.' };
            busy = true;
            try {
                const body = new FormData(); body.append('workspace', workspaceId); body.append('owner', accountId); body.append('asset', file);
                const data = await observe('research_uploads', 'create', () => client.collection('research_uploads').create(body, { requestKey: null }));
                if (!current()) return stale();
                if (!id(data?.id) || data.workspace !== workspaceId || data.owner !== accountId || data.kind !== kind) throw new Error('Incomplete upload receipt');
                return { ok: true, result: data };
            } catch (error) {
                if (!current()) return stale();
                const result = failure(error, true);
                if (result.reason === 'uncertain') return { ok: false, reason: 'upload_uncertain', error: 'The upload response was lost. Refresh your saved uploads and select the file before uploading again.' };
                return result;
            } finally { busy = false; }
        },
        async command(action, payload, expectedRevision = 0) {
            if (!current()) return stale();
            if (!['mission.propose', 'submit', 'retry', 'cancel', 'attach'].includes(action) || !payload || typeof payload !== 'object' || Array.isArray(payload) || !revision(expectedRevision))
                return { ok: false, reason: 'invalid', error: 'Reload the current submission before continuing.' };
            const signature = JSON.stringify([action, canonical(payload), expectedRevision]);
            if (pending && signature !== pending.signature) return { ok: false, reason: 'uncertain', error: 'Recover the previous request before starting a different change.' };
            if (!pending) {
                let key;
                try { key = keyFactory(); } catch { return { ok: false, reason: 'invalid', error: 'A secure request identifier is unavailable.' }; }
                if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(key)) return { ok: false, reason: 'invalid', error: 'A secure request identifier is unavailable.' };
                pending = { signature, body: { action, payload: { ...payload }, revision: expectedRevision, request_key: key } };
            }
            return send();
        },
        retry: send,
    };
}
