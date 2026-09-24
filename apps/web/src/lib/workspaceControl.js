// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workspaceControl.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/pocketbase/pb_hooks/administration.pb.js, apps/pocketbase/pb_hooks/government.pb.js, apps/web/src/lib/workspaceClaims.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/administration.pb.js; CONSUMES apps/pocketbase/pb_hooks/government.pb.js; CONSUMES apps/web/src/lib/workspaceClaims.js
// DAG Node:    none
// Intent:      Keep administration and community requests bound to one account/workspace with stable recovery after uncertain saves.
// ───────────────────────────────────────────────────────────────

import { CLAIM_ACTIONS } from './workspaceClaims.js';

const ROLES = ['owner', 'admin', 'editor', 'viewer'];
const ACTIONS = ['settings.save', 'member.set', 'member.remove', 'integration.save', 'integration.check',
    'wiki.save', 'wiki.transition', 'forum.create', 'forum.reply', 'forum.moderate'];
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });
const validId = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
const stable = (value) => value && typeof value === 'object' ? JSON.stringify(value, Object.keys(value).sort()) : JSON.stringify(value);
const revision = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const strings = (value, names) => names.every((name) => typeof value?.[name] === 'string');
const page = (value) => Array.isArray(value?.items) && value.items.length <= 20 && revision(value.page, 1) && typeof value.has_more === 'boolean';
const PROVIDERS = ['discord', 'reddit', 'datadog', 'posthog', 'firecrawl', 'n8n', 'supabase', 'mautic', 'twenty'];

/** Key private UI work by identity and granted capabilities, not polling activity.
 * This is a retention boundary, never permission to read or write while loading.
 * @param {object} scope Current identity, session lifetime and optional workspace access.
 * @returns {string} React lifecycle key.
 */
export function workspaceLifecycleKey({ accountId = '', workspaceId = '', demo = false, sessionEpoch = 0, access } = {}) {
    const data = access?.error ? null : access?.data;
    return JSON.stringify([accountId, workspaceId, demo, sessionEpoch, access ? [access.accessEpoch || 0, Boolean(data), data?.role || '',
        data?.can_write === true, data?.can_admin === true, data?.can_grant_admin === true, data?.government?.allowed === true] : null]);
}

/** Coalesce access reads through publication, so a later poll cannot hide a denial.
 * @returns {{load: Function, invalidate: Function}} One flight per current scope.
 */
export function createWorkspaceAccessLoader() {
    let pending = null;
    return {
        load(key, operation) {
            if (pending?.key === key) return pending.promise;
            const job = { key, promise: null };
            pending = job;
            job.promise = (async () => {
                try { return await operation(); }
                finally { if (pending === job) pending = null; }
            })();
            return job.promise;
        },
        invalidate() { pending = null; },
    };
}

function contribution(item, workspace, kind) {
    return item && validId(item.id) && item.workspace === workspace && validId(item.owner) && revision(item.revision, 1) &&
        strings(item, ['body', 'created', 'updated']) &&
        (kind === 'wiki' ? strings(item, ['title', 'slug', 'published_by', 'published_at']) && ['draft', 'published', 'archived'].includes(item.status) :
            strings(item, ['title', 'topic', 'moderation_note', 'moderated_by', 'moderated_at']) &&
            (kind === 'reply' ? ['pending', 'visible', 'hidden'] : ['pending', 'open', 'locked', 'hidden']).includes(item.status));
}

function integration(item) {
    if (!item || !PROVIDERS.includes(item.provider) || !strings(item, ['label', 'requested_at']) ||
        !['sink', 'extension', 'community'].includes(item.kind) || typeof item.desired_enabled !== 'boolean' ||
        !(item.id === '' ? item.revision === 0 : validId(item.id) && revision(item.revision, 1))) return false;
    const { fields, modes, configuration, observation } = item;
    return Array.isArray(fields) && fields.length > 0 && fields.every((name) => ['guild_id', 'channel_id', 'subreddit', 'binding'].includes(name)) &&
        new Set(fields).size === fields.length && Array.isArray(modes) && modes.length > 0 &&
        modes.every((mode) => ['read', 'reviewed_publish', 'telemetry', 'reviewed_run'].includes(mode)) &&
        configuration && strings(configuration, ['mode', ...fields]) && modes.includes(configuration.mode) &&
        Object.keys(configuration).length === fields.length + 1 &&
        observation && ['unknown', 'disabled', 'healthy', 'degraded', 'failed'].includes(observation.state) &&
        strings(observation, ['at', 'receipt_ref']) && typeof observation.current === 'boolean' && typeof observation.check_pending === 'boolean';
}

function readShape(value, workspace, section) {
    if (!value || value.workspace !== workspace || !ROLES.includes(value.role) || !revision(value.settings?.revision) ||
        !strings(value.settings, ['description']) || !['wiki_enabled', 'forum_enabled', 'forum_moderation'].every((key) => typeof value.settings[key] === 'boolean')) return false;
    const admin = ['owner', 'admin'].includes(value.role);
    if (section === 'admin') return admin && strings(value, ['name']) && validId(value.owner) && page(value.members) && page(value.audit) &&
        value.members.items.every((item) => validId(item.id) && validId(item.user) && ROLES.includes(item.role) && strings(item, ['invited_by', 'created'])) &&
        value.audit.items.every((item) => validId(item.id) && validId(item.actor) && validId(item.target) &&
            (ACTIONS.includes(item.action) || CLAIM_ACTIONS.includes(item.action)) && revision(item.revision, 1) && strings(item, ['created']));
    if (value.can_admin !== admin || value.can_write !== (value.role !== 'viewer') || value.can_grant_admin !== (value.role === 'owner')) return false;
    if (section === 'access') return true;
    if (section === 'government') return value.government?.allowed === true && value.government?.tier === 'government' &&
        value.plan?.schema_version === 'buildanddo.research-sprint/v1' && Array.isArray(value.plan.lanes) && Array.isArray(value.plan.days) &&
        Array.isArray(value.lessons) && value.lessons.every((item) => validId(item.id) && item.category === 'Government submissions') &&
        Boolean(value.starter?.mission_plan);
    if (section === 'integrations') return Array.isArray(value.items) && value.items.length === PROVIDERS.length &&
        new Set(value.items.map((item) => item?.provider)).size === PROVIDERS.length && value.items.every(integration);
    if (!page(value)) return false;
    if (section === 'wiki' || section === 'forums') return typeof value.enabled === 'boolean' &&
        value.enabled === value.settings[section === 'wiki' ? 'wiki_enabled' : 'forum_enabled'] &&
        value.items.every((item) => contribution(item, workspace, section === 'wiki' ? 'wiki' : 'topic'));
    return contribution(value.topic, workspace, 'topic') && value.topic.id === section.slice(7) &&
        value.items.every((item) => contribution(item, workspace, 'reply') && item.topic === value.topic.id);
}

/** Create scoped operations for the authenticated PocketBase command endpoints.
 * @param {object} options Client, account/workspace, demo/liveness and telemetry adapter.
 * @returns {{read: Function, command: Function, retry: Function}} Bounded operations.
 */
export function createWorkspaceControlClient({ client, workspaceId, accountId, demo = false, isCurrent,
    keyFactory = () => globalThis.crypto.randomUUID(), observe = (_name, _verb, operation) => operation() }) {
    let busy = false;
    let pending = null;
    const current = () => Boolean(!demo && validId(workspaceId) && accountId && isCurrent() && client.authStore.record?.id === accountId);
    const prefix = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId)}`;
    const message = (error, writing = false) => ({ ok: false,
        reason: error?.status === 409 ? 'conflict' : error?.status === 403 ? 'forbidden' : writing && (!error?.status || error.status >= 500) ? 'uncertain' : 'unavailable',
        error: error?.response?.message || (writing ? 'Could not confirm the save. Retry the previous save to recover its result.' :
            'Workspace controls are unavailable. The backend upgrade may not be installed. Retry or contact the workspace operator.') });
    const send = async (body) => {
        if (!current()) return stale();
        if (busy) return { ok: false, reason: 'busy', error: '' };
        busy = true;
        try {
            const section = body.action.startsWith('wiki.') || body.action.startsWith('forum.') ? 'community' : 'admin';
            const name = section === 'admin' ? 'workspace_controls' : body.action.startsWith('wiki.') ? 'wiki_pages' : body.action === 'forum.reply' || body.payload.kind === 'reply' ? 'forum_replies' : 'forum_topics';
            const result = await observe(name, 'update', async () => {
                const value = await client.send(`${prefix}/${section}`, { method: 'POST', body, requestKey: null, cache: 'no-store' });
                if (!value || value.workspace !== workspaceId || value.action !== body.action || !validId(value.id) ||
                    !Number.isSafeInteger(value.revision) || value.revision < 1 || typeof value.replayed !== 'boolean')
                    throw new Error('Incomplete command response');
                return value;
            });
            if (!current()) return stale();
            pending = null;
            return { ok: true, result };
        } catch (error) {
            if (!current()) return stale();
            const failure = message(error, true);
            if (failure.reason !== 'uncertain') pending = null;
            return failure;
        } finally { busy = false; }
    };
    return {
        async read(section, query = {}) {
            if (!current()) return stale();
            if (!['access', 'admin', 'integrations', 'wiki', 'forums', 'government'].includes(section) &&
                !(section.startsWith('forums/') && validId(section.slice(7)))) return { ok: false, reason: 'invalid', error: 'Choose a supported workspace view.' };
            try {
                const data = await client.send(`${prefix}/${section}`, { method: 'GET', query, requestKey: null, cache: 'no-store' });
                if (!current()) return stale();
                return readShape(data, workspaceId, section) && (section !== 'government' || data.account_id === accountId) ? { ok: true, data } : message(null);
            } catch (error) { return current() ? message(error) : stale(); }
        },
        async command(action, payload, revision) {
            if (!current()) return stale();
            if (!ACTIONS.includes(action) || !Number.isSafeInteger(revision) || revision < 0 || !payload || typeof payload !== 'object' || Array.isArray(payload))
                return { ok: false, reason: 'invalid', error: 'Reload the current record before saving.' };
            // Payloads are flat except integration configuration. Normalize both
            // levels so field rendering order cannot change retry identity.
            const signature = JSON.stringify([action, revision, stable({ ...payload, ...(payload.configuration ? { configuration: stable(payload.configuration) } : {}) })]);
            if (pending && signature !== pending.signature)
                return { ok: false, reason: 'uncertain', error: 'Retry the previous save before starting a different change.' };
            if (!pending) {
                try {
                    const requestKey = keyFactory();
                    if (typeof requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestKey)) throw new Error('Invalid retry key');
                    pending = { signature, body: { action, payload: JSON.parse(JSON.stringify(payload)), revision, request_key: requestKey } };
                } catch {
                    return { ok: false, reason: 'unavailable', error: 'A secure retry identifier is unavailable. Reload this page from the secure site before saving.' };
                }
            }
            return send(pending.body);
        },
        retry: () => pending ? send(pending.body) : Promise.resolve({ ok: false, reason: 'invalid', error: 'There is no unresolved save.' }),
    };
}
