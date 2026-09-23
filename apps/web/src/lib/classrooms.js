// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/classrooms.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/pocketbase/pb_hooks/classrooms.pb.js, apps/web/src/lib/tutorialCurriculum.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/pocketbase/pb_hooks/classrooms.pb.js; CONSUMES apps/web/src/lib/tutorialCurriculum.js
// DAG Node:    none
// Intent:      Bind classroom interactions to one account and workspace while recovering uncertain saves and rejecting foreign responses.
// ───────────────────────────────────────────────────────────────

import { validLesson } from './tutorialCurriculum.js';

const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const integer = (value, min = 0) => Number.isSafeInteger(value) && value >= min;
const text = (value, max) => typeof value === 'string' && value.length <= max;
const ROLES = ['owner', 'admin', 'editor', 'viewer'];
const STATUSES = ['scheduled', 'live', 'ended'];
const ACTIONS = ['room.create', 'room.update', 'room.start', 'room.end', 'room.lesson', 'room.join', 'room.leave', 'room.message'];
const stale = () => ({ ok: false, reason: 'scope_changed', error: '' });
const pageShape = (value, page) => value?.page === page && Array.isArray(value.items) && value.items.length <= 20 &&
    typeof value.has_more === 'boolean' && new Set(value.items.map((item) => item?.id)).size === value.items.length;
const lessonsShape = (value) => Array.isArray(value?.items) && value.items.length <= 200 && typeof value.has_more === 'boolean' &&
    value.items.every((item) => id(item?.id) && text(item.title, 300) && text(item.category, 300));

function roomShape(value, workspace, account, role) {
    return value && id(value.id) && value.workspace === workspace && integer(value.revision, 1) &&
        integer(value.section) && value.section < 20 && text(value.title, 160) && value.title.trim() && text(value.description, 2000) &&
        (id(value.host) || value.host === '') && text(value.host_name, 120) && (id(value.tutorial) || value.tutorial === '') &&
        STATUSES.includes(value.status) && ['starts_at', 'started_at', 'ended_at', 'created'].every((name) => text(value[name], 50)) &&
        value.can_manage === (['owner', 'admin'].includes(role) || (role === 'editor' && value.host === account));
}
// Media availability is a server fact: a boolean, offered only while live, with at
// most a short reason. Any other key (a token, a session id) is refused outright.
function mediaShape(media, status) {
    if (!media || typeof media.available !== 'boolean') return false;
    if (!Object.keys(media).every((key) => key === 'available' || key === 'reason')) return false;
    if (media.reason !== undefined && !text(media.reason, 200)) return false;
    return !media.available || status === 'live';
}
function readShape(value, workspace, account, roomId, page) {
    if (!value || value.workspace !== workspace || !ROLES.includes(value.role) || !lessonsShape(value.lessons)) return false;
    if (!roomId) return value.can_host === (value.role !== 'viewer') && pageShape(value, page) &&
        value.items.every((item) => roomShape(item, workspace, account, value.role));
    const { room, membership, lesson, participants, messages, media } = value;
    return roomShape(room, workspace, account, value.role) && room.id === roomId &&
        membership && typeof membership.active === 'boolean' && integer(membership.revision) &&
        (membership.id === '' ? membership.revision === 0 && !membership.active : id(membership.id) && membership.revision >= 1) &&
        (!membership.active || room.status === 'live') &&
        (lesson === null || (lesson?.id === room.tutorial && text(lesson.title, 300) && text(lesson.summary, 5000) && text(lesson.category, 300) && validLesson(lesson.lesson))) &&
        Array.isArray(participants) && participants.length <= 100 && participants.every((item) => id(item?.id) && text(item.name, 120) && typeof item.is_host === 'boolean') &&
        new Set(participants.map((item) => item.id)).size === participants.length && pageShape(messages, page) &&
        messages.items.every((item) => id(item?.id) && item.room === roomId && text(item.name, 120) && text(item.body, 2000) &&
            text(item.created, 50) && typeof item.own === 'boolean') && mediaShape(media, room.status);
}

// The class record is aggregate by contract: counts per hour and totals, never
// an identity. Anything else in the response is treated as a broken read.
function recordShape(value, roomId) {
    if (!value || value.room !== roomId || !STATUSES.includes(value.status) || typeof value.installed !== 'boolean') return false;
    if (!['started_at', 'ended_at'].every((name) => text(value[name], 50))) return false;
    const base = ['room', 'status', 'started_at', 'ended_at', 'installed'];
    if (!value.installed) return Object.keys(value).every((key) => base.includes(key));
    return Object.keys(value).every((key) => [...base, 'attendees', 'minutes', 'hours', 'truncated'].includes(key)) &&
        integer(value.attendees) && integer(value.minutes) && typeof value.truncated === 'boolean' &&
        Array.isArray(value.hours) && value.hours.length <= 48 &&
        value.hours.every((hour) => hour && Object.keys(hour).length === 2 && text(hour.t, 40) && Number.isFinite(Date.parse(hour.t)) && integer(hour.people));
}

/** @param {string} roomId Saved room. @param {string} workspaceId Current workspace. @returns {string} Local shareable classroom path. */
export function classroomHref(roomId, workspaceId) {
    return id(roomId) && id(workspaceId) ? `/app/classrooms/${encodeURIComponent(roomId)}?workspace=${encodeURIComponent(workspaceId)}` : '/app/classrooms';
}

/** @param {object} options Native PocketBase client, scoped identity and liveness. @returns {object} Private reads, commands and presence operations. */
export function createClassroomClient({ client, workspaceId, accountId, demo = false, isCurrent,
    keyFactory = () => globalThis.crypto.randomUUID(), observe = (_name, _verb, operation) => operation() }) {
    let disposed = false, busy = false, beating = false, pending = null;
    const current = () => !disposed && !demo && id(workspaceId) && id(accountId) && isCurrent() && client.authStore.record?.id === accountId;
    const prefix = `/api/buildanddo/workspaces/${encodeURIComponent(workspaceId || '')}/classrooms`;
    const failure = (error, writing = false) => ({ ok: false,
        reason: error?.status === 409 ? 'conflict' : [401, 403].includes(error?.status) ? 'forbidden' :
            writing && (!error?.status || error.status >= 500) ? 'uncertain' : error && (!error.status || error.status >= 500) ? 'connection' : 'unavailable',
        error: text(error?.response?.message, 300) ? error.response.message : writing ?
            'Could not confirm the change. Retry the previous save to recover its result.' : 'Classrooms are unavailable. Retry or contact your workspace operator.' });
    const send = async (body) => {
        if (!current()) { pending = null; return stale(); }
        if (busy) return { ok: false, reason: 'busy', error: '' };
        busy = true;
        try {
            const result = await observe(body.action === 'room.message' ? 'classroom_messages' : 'classroom_rooms', body.action === 'room.create' || body.action === 'room.message' ? 'create' : 'update', async () => {
                const value = await client.send(prefix, { method: 'POST', body, requestKey: null, cache: 'no-store' });
                if (!value || value.workspace !== workspaceId || value.action !== body.action || !id(value.id) ||
                    (body.action !== 'room.create' && value.id !== body.payload.id) || !integer(value.revision, 1) || typeof value.replayed !== 'boolean')
                    throw new Error('Incomplete classroom receipt');
                return value;
            });
            if (!current()) { pending = null; return stale(); }
            pending = null;
            return { ok: true, result };
        } catch (error) {
            if (!current()) { pending = null; return stale(); }
            const result = failure(error, true);
            if (result.reason !== 'uncertain') pending = null;
            return result;
        } finally { busy = false; }
    };
    return {
        async read(roomId = '', page = 1, status = 'all') {
            if (!current()) return stale();
            if ((roomId !== '' && !id(roomId)) || !integer(page, 1) || page > 9999 || !['all', ...STATUSES].includes(status))
                return { ok: false, reason: 'invalid', error: 'Choose a valid classroom page.' };
            try {
                const data = await client.send(roomId ? `${prefix}/${encodeURIComponent(roomId)}` : prefix, {
                    method: 'GET', query: roomId ? { page } : { page, status }, requestKey: null, cache: 'no-store',
                });
                if (!current()) return stale();
                return readShape(data, workspaceId, accountId, roomId, page) ? { ok: true, data } : failure(null);
            } catch (error) { return current() ? failure(error) : stale(); }
        },
        async record(roomId) {
            if (!current()) return stale();
            if (!id(roomId)) return { ok: false, reason: 'invalid', error: 'Choose a classroom.' };
            try {
                const data = await client.send(`${prefix}/${encodeURIComponent(roomId)}/record`, { method: 'GET', requestKey: null, cache: 'no-store' });
                if (!current()) return stale();
                return recordShape(data, roomId) ? { ok: true, data } : failure(null);
            } catch (error) { return current() ? failure(error) : stale(); }
        },
        async command(action, payload, revision) {
            if (!current()) { pending = null; return stale(); }
            if (busy) return { ok: false, reason: 'busy', error: '' };
            if (!ACTIONS.includes(action) || !integer(revision) || !payload || typeof payload !== 'object' || Array.isArray(payload) ||
                Object.values(payload).some((value) => !['string', 'number'].includes(typeof value)))
                return { ok: false, reason: 'invalid', error: 'Use the classroom controls to make this change.' };
            const signature = JSON.stringify([action, revision, Object.keys(payload).sort().map((key) => [key, payload[key]])]);
            if (pending && pending.signature !== signature)
                return { ok: false, reason: 'uncertain', error: 'Recover the previous save before making a different change.' };
            if (!pending) {
                try {
                    const key = keyFactory();
                    if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(key)) throw new Error('Retry identifier unavailable');
                    pending = { signature, body: { action, payload: JSON.parse(JSON.stringify(payload)), revision, request_key: key } };
                } catch { return { ok: false, reason: 'unavailable', error: 'A secure retry identifier is unavailable. Reload the secure site before saving.' }; }
            }
            return send(pending.body);
        },
        retry: () => pending ? send(pending.body) : Promise.resolve({ ok: false, reason: 'invalid', error: 'There is no unresolved classroom save.' }),
        async heartbeat(roomId, membership) {
            if (!current()) return stale();
            if (beating) return { ok: false, reason: 'busy', error: '' };
            if (!id(roomId) || !id(membership?.id) || !integer(membership.revision, 1))
                return { ok: false, reason: 'invalid', error: 'Rejoin this class to restore your connection.' };
            beating = true;
            try {
                const value = await client.send(`${prefix}/${encodeURIComponent(roomId)}/presence`, { method: 'POST',
                    body: { membership: membership.id, revision: membership.revision }, requestKey: null, cache: 'no-store' });
                if (!current()) return stale();
                return value?.workspace === workspaceId && value.room === roomId && value.membership === membership.id && value.revision === membership.revision ?
                    { ok: true } : failure(null);
            } catch (error) { return current() ? failure(error) : stale(); }
            finally { beating = false; }
        },
        dispose() { disposed = true; pending = null; },
    };
}
