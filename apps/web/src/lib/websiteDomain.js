// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/websiteDomain.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-SITE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-SITE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/pocketbase/pb_hooks/domains.pb.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/domains.pb.js
// DAG Node:    none
// Intent:      Read the workspace domain and request DNS ownership proof, accepting only server responses of the documented shape.
// ───────────────────────────────────────────────────────────────

const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const STATUSES = ['selected', 'analyzing', 'verified', 'needs_attention'];
const RESULTS = ['not_found', 'mismatch', 'lookup_failed', 'verified'];
const wait = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 3600;
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });

/** @param {unknown} value Domain name as typed. @returns {string} Lowercase bare host name, or '' when it is not one. */
export function domainInput(value) {
    const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const labels = name.split('.');
    return name.length <= 253 && labels.length >= 2 && labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
        /[a-z]/.test(labels.at(-1)) && labels.at(-1).length >= 2 ? name : '';
}
function challengeShape(value, domain) {
    return value && value.record_name === `_buildanddo-verify.${domain}` && value.record_type === 'TXT' &&
        typeof value.record_value === 'string' && /^buildanddo-verify=[A-Za-z0-9]{32,128}$/.test(value.record_value) && text(value.requested_at, 50);
}
function viewShape(value, workspace) {
    if (!value || value.workspace !== workspace || typeof value.can_manage !== 'boolean' || !text(value.domain, 253) ||
        (value.domain ? !STATUSES.includes(value.status) : value.status !== '')) return false;
    const base = ['workspace', 'domain', 'status', 'can_manage'];
    // Editors and viewers see the name and status only; any extra key is treated as a broken read.
    if (!value.can_manage || !value.domain) return Object.keys(value).every((key) => base.includes(key));
    return Object.keys(value).every((key) => [...base, 'result', 'checked_at', 'verified_at', 'retry_after', 'challenge', 'changed'].includes(key)) &&
        (value.result === '' || RESULTS.includes(value.result)) && text(value.checked_at, 50) && text(value.verified_at, 50) &&
        wait(value.retry_after) && (value.challenge === null || challengeShape(value.challenge, value.domain)) &&
        (value.changed === undefined || typeof value.changed === 'boolean');
}
function checkShape(value) {
    return value && STATUSES.includes(value.status) && RESULTS.includes(value.result) && text(value.checked_at, 50) &&
        Object.keys(value).every((key) => ['status', 'result', 'checked_at'].includes(key));
}

/** @param {object} options Native PocketBase client, scoped identity and liveness. @returns {object} Domain read, save, challenge and check operations. */
export function createWebsiteDomainClient({ client, workspaceId, accountId, isCurrent }) {
    let busy = false;
    const current = () => id(workspaceId) && id(accountId) && isCurrent() && client.authStore.record?.id === accountId;
    const prefix = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId || '')}/domain`;
    const failure = (error, writing) => {
        const retry = error?.response?.retry_after ?? error?.response?.data?.retry_after;
        if (error?.status === 429 && wait(retry) && retry > 0) return { ok: false, reason: 'rate_limited', retry_after: retry, error: `Check again in ${retry} seconds.` };
        return { ok: false,
            reason: [401, 403].includes(error?.status) ? 'forbidden' : !error?.status || error.status >= 500 ? 'connection' : 'invalid',
            error: text(error?.response?.message, 300) && error.response.message ? error.response.message :
                writing ? 'Could not confirm the change. Reload the domain panel and try again.' : 'The website domain is unavailable. Retry shortly.' };
    };
    const request = async (path, method, body, shape) => {
        if (!current()) return stale();
        if (method === 'POST') { if (busy) return { ok: false, reason: 'busy', error: '' }; busy = true; }
        try {
            const data = await client.send(path, { method, ...(body ? { body } : {}), requestKey: null, cache: 'no-store' });
            if (!current()) return stale();
            return shape(data) ? { ok: true, data } : failure(null, method === 'POST');
        } catch (error) { return current() ? failure(error, method === 'POST') : stale(); }
        finally { if (method === 'POST') busy = false; }
    };
    return {
        read: () => request(prefix, 'GET', null, (data) => viewShape(data, workspaceId)),
        save(domain) {
            const name = domainInput(domain);
            if (!name) return Promise.resolve({ ok: false, reason: 'invalid', error: 'Enter a domain name such as example.com, without https:// or a path.' });
            return request(prefix, 'POST', { domain: name }, (data) => viewShape(data, workspaceId) && data.can_manage && data.domain === name);
        },
        challenge: (domain) => request(`${prefix}/challenge`, 'POST', {}, (data) => challengeShape(data, domain)),
        check: () => request(`${prefix}/verify`, 'POST', {}, checkShape),
    };
}
