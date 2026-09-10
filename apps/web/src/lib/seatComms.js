// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/seatComms.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/pocketbaseClient.js,
//              apps/web/src/lib/observability/runtime.js,
//              apps/pocketbase/pb_migrations/1788940000_create_community_contributor_collections.js
// EnumType:    Adapter
// EnumEdges:   PRODUCES seat_events; CONSUMES apps/web/src/lib/pocketbaseClient.js
// Intent:      Let several seats working one workspace see each other's work instead of colliding.
// ───────────────────────────────────────────────────────────────

import pb from '@/lib/pocketbaseClient';
import { reportAction } from '@/lib/observability/runtime';

/**
 * The seat event vocabulary. The wire values stored in PocketBase are the bare
 * verbs (`joined`, `progress`, ...) because they are a `select` field; the
 * dotted names are what subscribers match on and what RUM sees.
 */
export const SEAT_EVENTS = {
    joined: 'seat.joined',
    progress: 'seat.progress',
    completed: 'seat.completed',
    blocked: 'seat.blocked',
    handoff: 'seat.handoff',
};

const WIRE_TO_NAME = SEAT_EVENTS;
const VALID_VERBS = Object.keys(SEAT_EVENTS);
const COLLECTION = 'seat_events';

/** Local subscribers, keyed by nothing — order of registration is irrelevant. */
const subscribers = new Set();

/** Realtime connection state. One workspace at a time; a second connect swaps it. */
let connectedWorkspaceId = null;
let unsubscribeRealtime = null;

/**
 * Normalises a PocketBase `seat_events` record into the shape subscribers see.
 *
 * @param {object} record Raw PocketBase record.
 * @returns {object} Seat event with a dotted `name` and camelCase fields.
 */
function toSeatEvent(record) {
    return {
        id: record.id,
        name: WIRE_TO_NAME[record.event] || `seat.${record.event}`,
        event: record.event,
        seat: record.seat,
        actorType: record.actor_type,
        subjectType: record.subject_type || null,
        subject: record.subject || null,
        summary: record.summary,
        detail: record.detail || null,
        prUrl: record.pr_url || null,
        handoffTo: record.handoff_to || null,
        workspaceId: record.workspace,
        createdAt: record.created,
    };
}

/**
 * Fans an event out to local subscribers. A throwing subscriber must not stop
 * the others, and must not surface as an unhandled rejection in the page.
 *
 * @param {object} seatEvent Normalised seat event.
 * @returns {void}
 */
function fanOut(seatEvent) {
    for (const handler of subscribers) {
        try {
            handler(seatEvent);
        } catch (err) {
            console.error('seat subscriber failed', err);
        }
    }
}

/**
 * Registers a local subscriber for seat events.
 *
 * Subscribing does not open a connection — call `connectSeatComms` for that.
 * A subscriber registered while disconnected simply receives nothing, which is
 * the honest outcome rather than a silent buffer.
 *
 * @param {(seatEvent: object) => void} handler Called once per event.
 * @param {{ events?: string[], seat?: string }} [filter] Optional client-side filter.
 * @returns {() => void} Unsubscribe function.
 */
export function subscribeSeatEvents(handler, filter = {}) {
    if (typeof handler !== 'function') return () => {};
    const wrapped = (seatEvent) => {
        if (filter.events && !filter.events.includes(seatEvent.name)) return;
        if (filter.seat && seatEvent.seat !== filter.seat) return;
        handler(seatEvent);
    };
    subscribers.add(wrapped);
    return () => {
        subscribers.delete(wrapped);
    };
}

/**
 * Opens the PocketBase realtime subscription for one workspace.
 *
 * Realtime delivery is the only path events reach subscribers, including
 * events this client published — so a publisher and an observer see the same
 * ordering, and a failed write never shows up as local activity.
 *
 * @param {string} workspaceId Workspace record id.
 * @returns {Promise<() => void>} Resolves to a disconnect function.
 */
export async function connectSeatComms(workspaceId) {
    if (!workspaceId) return () => {};
    if (connectedWorkspaceId === workspaceId && unsubscribeRealtime) {
        return disconnectSeatComms;
    }
    await disconnectSeatComms();

    try {
        const unsubscribe = await pb.collection(COLLECTION).subscribe(
            '*',
            (payload) => {
                if (payload.action !== 'create') return;
                if (payload.record?.workspace !== workspaceId) return;
                fanOut(toSeatEvent(payload.record));
            },
            { filter: pb.filter('workspace = {:ws}', { ws: workspaceId }) },
        );
        connectedWorkspaceId = workspaceId;
        unsubscribeRealtime = unsubscribe;
    } catch (err) {
        // Realtime is a convenience, not a correctness requirement: the hub and
        // the activity feed both also read the collection directly.
        console.error('seat comms subscribe failed', err);
        connectedWorkspaceId = null;
        unsubscribeRealtime = null;
    }
    return disconnectSeatComms;
}

/**
 * Closes the realtime subscription. Safe to call when never connected.
 *
 * @returns {Promise<void>}
 */
export async function disconnectSeatComms() {
    const unsubscribe = unsubscribeRealtime;
    connectedWorkspaceId = null;
    unsubscribeRealtime = null;
    if (!unsubscribe) return;
    try {
        await unsubscribe();
    } catch (err) {
        console.error('seat comms unsubscribe failed', err);
    }
}

/**
 * Reports whether realtime seat delivery is currently live.
 *
 * @returns {boolean} True when a realtime subscription is open.
 */
export function isSeatCommsConnected() {
    return Boolean(unsubscribeRealtime);
}

/**
 * Best-effort seat label for the signed-in actor.
 *
 * A human contributor's seat is their account handle. An agent seat overrides
 * it with `VITE_BUILDANDDO_SEAT` so its events are attributable to the seat
 * identity rather than to whichever account it authenticated as.
 *
 * @returns {string} Seat label, never empty.
 */
function currentSeat() {
    const configured = import.meta.env.VITE_BUILDANDDO_SEAT;
    if (configured) return String(configured);
    const record = pb.authStore.record;
    return record?.username || record?.email || 'unknown-seat';
}

/**
 * Publishes a seat event.
 *
 * @param {object} input Event input.
 * @param {string} input.event One of `joined`, `progress`, `completed`, `blocked`, `handoff`.
 * @param {string} input.workspaceId Workspace record id.
 * @param {string} input.summary One-line human description; required.
 * @param {string} [input.seat] Seat label; defaults to `currentSeat()`.
 * @param {('human'|'agent'|'mixed')} [input.actorType] Defaults to `human`.
 * @param {string} [input.subjectType] `mission`, `workflow`, `page`, `issue`, `pull_request`, `other`.
 * @param {string} [input.subject] Record id or repository path the event is about.
 * @param {object} [input.detail] Arbitrary structured detail.
 * @param {string} [input.prUrl] Pull request URL, when one exists.
 * @param {string} [input.handoffTo] Target seat, required in spirit for `handoff`.
 * @returns {Promise<object|null>} The created record, or null when the write failed.
 */
export async function publishSeatEvent({
    event,
    workspaceId,
    summary,
    seat,
    actorType = 'human',
    subjectType,
    subject,
    detail,
    prUrl,
    handoffTo,
}) {
    if (!VALID_VERBS.includes(event)) {
        console.error('unknown seat event', event);
        return null;
    }
    if (!workspaceId || !summary || !pb.authStore.record) return null;

    const payload = {
        event,
        seat: seat || currentSeat(),
        actor_type: actorType,
        summary,
        workspace: workspaceId,
        owner: pb.authStore.record.id,
    };
    if (subjectType) payload.subject_type = subjectType;
    if (subject) payload.subject = subject;
    if (detail) payload.detail = detail;
    if (prUrl) payload.pr_url = prUrl;
    if (handoffTo) payload.handoff_to = handoffTo;

    try {
        const record = await pb.collection(COLLECTION).create(payload);
        reportAction(SEAT_EVENTS[event], {
            seat: payload.seat,
            actor_type: actorType,
            subject_type: subjectType || 'none',
        });
        return record;
    } catch (err) {
        console.error('publish seat event failed', err);
        return null;
    }
}

/**
 * Reads recent seat events for a workspace.
 *
 * @param {string} workspaceId Workspace record id.
 * @param {{ limit?: number }} [options] Read options.
 * @returns {Promise<object[]>} Newest first; empty on failure or when unauthenticated.
 */
export async function recentSeatEvents(workspaceId, { limit = 20 } = {}) {
    if (!workspaceId || !pb.authStore.record) return [];
    try {
        const page = await pb.collection(COLLECTION).getList(1, limit, {
            filter: pb.filter('workspace = {:ws}', { ws: workspaceId }),
            sort: '-created',
        });
        return page.items.map(toSeatEvent);
    } catch (err) {
        console.error('read seat events failed', err);
        return [];
    }
}
