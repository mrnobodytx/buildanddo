// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/lib/guildPublications.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/pocketbase/pb_hooks/guild-publishing.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/guild-publishing.pb.js; CONSUMED_BY apps/web/src/components/workspace/GuildPublicationsPanel.jsx
// Intent:      Read the guild publication history and send owner/admin withdrawals that recover an uncertain write with its original retry key.
// ----------------------------------------------------------------
//
// The server decides who may read or withdraw; these checks only refuse malformed input and
// responses. An uncertain withdrawal keeps its exact command, so retrying it replays the original
// key and returns the saved receipt instead of withdrawing twice.

const KINDS = Object.freeze(['daily_edition', 'social_content', 'forum_topic', 'forum_reply', 'wiki_page', 'guild_lesson']);
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ?
    `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const failure = (reason, error, extra = {}) => ({ ok: false, reason, error, ...extra });
const path = (workspaceId) => `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/guild-publications`;
// One unresolved withdrawal per client and workspace, held only in this tab's memory.
const pending = new WeakMap();

function reasonFor(error) {
    const status = error?.status;
    return status === 409 ? 'conflict' : status === 403 || status === 401 ? 'forbidden' : !status || status >= 500 ? 'uncertain' : 'unavailable';
}
function rowShape(item) {
    return Boolean(item) && id(item.id) && ['published', 'withdrawn'].includes(item.action) && KINDS.includes(item.kind) &&
        id(item.target) && text(item.title, 200) && text(item.persona, 64) && (item.actor === '' || id(item.actor)) && text(item.actor_seat, 32) &&
        (item.content_digest === '' || /^[0-9a-f]{64}$/.test(item.content_digest)) && text(item.note, 800) && text(item.created, 50) &&
        text(item.target_status, 30) && (item.target_revision === null || Number.isSafeInteger(item.target_revision) && item.target_revision >= 0) &&
        typeof item.withdrawable === 'boolean' && (!item.withdrawable || item.action === 'published' && item.target_revision !== null);
}

/** Read one page of the workspace's guild publications. Owners and admins only (enforced by the server). */
export async function list(client, workspaceId, page = 1) {
    if (!id(workspaceId) || !Number.isSafeInteger(page) || page < 1 || page > 9999) return failure('invalid', 'Choose a workspace and page.');
    try {
        const data = await client.send(path(workspaceId), { method: 'GET', query: { page: String(page) }, requestKey: null, cache: 'no-store' });
        if (!data || data.workspace !== workspaceId || data.page !== page || typeof data.has_more !== 'boolean' || !Array.isArray(data.items) ||
            data.items.length > 20 || new Set(data.items.map((item) => item?.id)).size !== data.items.length || !data.items.every(rowShape))
            return failure('invalid', 'The publication history could not be read. Reload to try again.');
        return { ok: true, items: data.items, page: data.page, has_more: data.has_more };
    } catch (error) {
        const reason = reasonFor(error);
        return failure(reason, reason === 'forbidden' ? 'Only a workspace owner or administrator can read guild publications.' :
            error?.status === 503 ? 'Guild publishing is not installed on this backend yet.' : 'The publication history could not be read. Reload to try again.');
    }
}

/**
 * Withdraw one guild publication. Repeating the same withdrawal after an uncertain result reuses
 * its original retry key; a different withdrawal waits until that one is resolved.
 * @returns {Promise<object>} `{ok: true, result, replayed}` or `{ok: false, reason, error, uncertain}`.
 */
export async function withdraw(client, workspaceId, { kind, target, revision, note } = {}, keyFactory = () => globalThis.crypto.randomUUID()) {
    if (!id(workspaceId) || !KINDS.includes(kind) || !id(target) || !Number.isSafeInteger(revision) || revision < 0 ||
        typeof note !== 'string' || !note.trim() || note.length > 800)
        return failure('invalid', 'Choose a publication and write a note of at most 800 characters.');
    const scope = pending.get(client) || new Map();
    pending.set(client, scope);
    const signature = canonical([kind, target, revision, note.trim()]);
    let attempt = scope.get(workspaceId);
    if (attempt && attempt.signature !== signature)
        return failure('uncertain', 'Retry the previous withdrawal before starting another.', { uncertain: true, blockedByPending: true });
    if (!attempt) {
        let key;
        try { key = keyFactory(); } catch { key = ''; }
        if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(key))
            return failure('unavailable', 'A secure retry identifier is unavailable. Reload from the secure site before withdrawing.');
        attempt = { signature, uncertain: false, body: { action: 'publication.withdraw', revision, request_key: key, payload: { kind, target, note: note.trim() } } };
        scope.set(workspaceId, attempt);
    }
    try {
        const result = await client.send(path(workspaceId), { method: 'POST', body: attempt.body, requestKey: null, cache: 'no-store' });
        if (!result || result.id !== target || result.workspace !== workspaceId || result.action !== 'publication.withdraw' || result.kind !== kind ||
            result.revision !== revision + 1 || !text(result.status, 30) || typeof result.replayed !== 'boolean')
            throw Object.assign(new Error('Incomplete withdrawal response'), { reason: 'invalid_receipt' });
        scope.delete(workspaceId);
        return { ok: true, result, replayed: result.replayed };
    } catch (error) {
        const reason = reasonFor(error);
        // A later denial cannot prove whether the earlier uncertain write committed.
        if (reason === 'uncertain') attempt.uncertain = true;
        else if (!attempt.uncertain) scope.delete(workspaceId);
        return failure(reason, error?.response?.message || (reason === 'uncertain' ?
            'Could not confirm this withdrawal. Retry it to recover the saved result before making another change.' :
            reason === 'conflict' ? 'This publication changed. Reload before withdrawing.' :
                reason === 'forbidden' ? 'Only a workspace owner or administrator can withdraw guild publications.' :
                    'Withdrawal is unavailable. Reload the history or ask the operator to install the matching backend.'), { uncertain: attempt.uncertain });
    }
}
