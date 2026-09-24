// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/lib/workspaceClaims.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/pocketbase/pb_hooks/workspace-claims.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/workspace-claims.pb.js
// Intent:      Keep existing claim buttons compatible with revision-bound native commands and recover uncertain writes without raw CRUD fallback.
// ----------------------------------------------------------------

const ACTIONS = { support_sources: 'support.request', corrections: 'correction.save', daily_editions: 'edition.save',
    specialist_desks: 'desk.save', social_content: 'content.save', social_channels: 'channel.request', seat_events: 'seat.report' };
export const CLAIM_COLLECTIONS = Object.freeze(Object.keys(ACTIONS));
export const CLAIM_ACTIONS = Object.freeze([...Object.values(ACTIONS), 'edition.publish']);
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ?
    `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const failure = (reason, error) => ({ ok: false, reason, error });
const stale = () => ({ ...failure('scope_changed', 'The account or workspace changed. Reload before continuing.'), stale: true });

/** Adapt only the seven locked collections; retain the exact command until confirmed.
 * @param {object} options Native client, scope, optional visit lifetime and deferred confirmation.
 * @returns {{write: Function, retry: Function, confirm: Function}} Writes, recovery and optional caller acknowledgement.
 */
export function createWorkspaceClaimClient({ client, collection, workspaceId, accountId, isCurrent,
    keyFactory = () => globalThis.crypto.randomUUID(), observe = (_name, _operation, action) => action(),
    getLifetime = () => undefined, deferConfirmation = false }) {
    let pending = null, busy = false;
    const current = () => Boolean(id(accountId) && id(workspaceId) && isCurrent() && client.authStore.record?.id === accountId);
    const decline = (result, action = pending?.body.action || ACTIONS[collection]) => observe(collection, action, () => result);
    const send = async () => {
        if (!current()) return decline(stale());
        if (busy) return decline(failure('busy', 'Wait for the current save to finish.'));
        if (!pending) return failure('invalid', 'There is no uncertain save to retry.');
        const lifetime = getLifetime();
        busy = true;
        pending.confirmed = false;
        try {
            const { body, owner } = pending;
            const response = await observe(collection, body.action, async () => {
                try {
                    const result = await client.send(`/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}/claims`,
                        { method: 'POST', body, requestKey: null, cache: 'no-store' });
                    if (!current() || getLifetime() !== lifetime) return stale();
                    if (!result || result.workspace !== workspaceId || result.action !== body.action || !id(result.id) ||
                        result.record?.id !== result.id || result.record?.workspace !== workspaceId || result.record?.owner !== owner ||
                        result.revision !== body.revision + 1 || result.record?.claim_revision !== result.revision || typeof result.replayed !== 'boolean')
                        throw Object.assign(new Error('Incomplete command response'), { reason: 'invalid_receipt' });
                    return { ok: true, record: result.record, result, replayed: result.replayed };
                } catch (error) {
                    if (!current() || getLifetime() !== lifetime) return stale();
                    throw error;
                }
            });
            if (!current() || getLifetime() !== lifetime || !response.ok) { pending.uncertain = true; return stale(); }
            // A multi-await publisher must accept the result in its own visit
            // before losing the key needed to replay an unobserved commit.
            if (deferConfirmation) { pending.confirmed = true; pending.uncertain = true; }
            else pending = null;
            return response;
        } catch (error) {
            if (!current() || getLifetime() !== lifetime) { pending.uncertain = true; return stale(); }
            const reason = error?.status === 409 ? 'conflict' : error?.status === 403 || error?.status === 401 ? 'forbidden' :
                !error?.status || error.status >= 500 ? 'uncertain' : 'unavailable';
            // A later denial cannot prove whether the earlier uncertain write
            // committed. Keep its identity until that exact request is confirmed.
            if (reason === 'uncertain') pending.uncertain = true;
            else if (!pending.uncertain) pending = null;
            return { ...failure(reason, error?.response?.message || (reason === 'uncertain' ?
                'Could not confirm this save. Retry the previous save to recover its result before making another change.' :
                'Workspace claim commands are unavailable. Reload the records or ask the operator to install the matching backend.')),
                uncertain: pending?.uncertain === true };
        } finally { busy = false; }
    };
    return {
        async write(operation, recordId, data = {}, saved) {
            if (!current()) return decline(stale());
            if (busy) return decline(failure('busy', 'Wait for the current save to finish.'));
            if (pending) {
                let same = false;
                try { same = canonical([operation, recordId, data]) === pending.signature; } catch { /* Keep the original unresolved request. */ }
                // Routing the publisher to its retained request is not another attempt.
                return same ? send() : { ...failure('uncertain', 'Retry the previous save before starting a different change.'), blockedByPending: true };
            }
            if (!CLAIM_COLLECTIONS.includes(collection) || !['create', 'update'].includes(operation) ||
                collection === 'seat_events' && operation !== 'create')
                return decline(failure('invalid', 'These reports are retained. Use a supported draft command or append a new report.'));
            if (!data || typeof data !== 'object' || Array.isArray(data) || ['owner', 'workspace', 'claim_revision'].some((key) => Object.hasOwn(data, key)))
                return decline(failure('invalid', 'Record authorship, scope and revisions are assigned by the native command.'));
            let signature;
            try { signature = canonical([operation, recordId, data]); }
            catch { return decline(failure('invalid', 'Use a bounded JSON request.')); }
            if (operation === 'update' && (!saved || !id(recordId) || saved.id !== recordId || saved.workspace !== workspaceId || !id(saved.owner)))
                return decline(failure('invalid', 'Reload and select the saved record from this workspace before editing.'));
            const revision = operation === 'create' ? 0 : saved.claim_revision ?? 0;
            if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
                return decline(failure('invalid', 'Reload a valid saved revision before editing.'));
            let values;
            try { values = JSON.parse(JSON.stringify(data)); }
            catch { return decline(failure('invalid', 'Use a bounded JSON request.')); }
            let action = ACTIONS[collection];
            if (collection === 'daily_editions' && values.status === 'published') {
                if (operation !== 'update' || Object.keys(values).length !== 1)
                    return decline(failure('invalid', 'Save the draft first; publish only its saved version.'), 'edition.publish');
                action = 'edition.publish';
            } else if (['daily_editions', 'corrections', 'support_sources', 'social_channels'].includes(collection) && Object.hasOwn(values, 'status')) {
                if (values.status !== (collection === 'daily_editions' ? 'draft' : 'pending'))
                    return decline(failure('invalid', 'This command cannot promote verification or provider health.'));
                delete values.status;
            }
            if (collection === 'support_sources') values.provider ??= saved?.provider;
            if (collection === 'social_channels') values.platform ??= saved?.platform;
            const payload = action === 'edition.publish' ? { id: recordId } : { id: operation === 'create' ? '' : recordId, values };
            try {
                const key = keyFactory();
                if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(key)) throw new Error('Invalid retry identifier');
                const body = { action, revision, request_key: key, payload };
                if (new TextEncoder().encode(JSON.stringify(body)).length > 30000)
                    return decline(failure('invalid', 'Keep this request within 30000 UTF-8 bytes.'), action);
                pending = { body, signature, operation, owner: operation === 'create' ? accountId : saved.owner };
            } catch { return decline(failure('unavailable', 'A secure retry identifier is unavailable. Reload from the secure site before saving.'), action); }
            return send();
        },
        retry: send,
        confirm() {
            if (!current() || busy || !pending?.confirmed) return false;
            pending = null;
            return true;
        },
    };
}
