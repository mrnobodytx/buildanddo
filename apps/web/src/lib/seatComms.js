// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/seatComms.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/pocketbaseClient.js,
//              apps/web/src/lib/observability/runtime.js,
//              apps/pocketbase/pb_migrations/1788940000_create_community_contributor_collections.js, apps/web/src/lib/workspaceClaims.js
// EnumType:    Adapter
// EnumEdges:   PRODUCES seat_events; CONSUMES apps/web/src/lib/pocketbaseClient.js; CONSUMES apps/web/src/lib/workspaceClaims.js
// Intent:      Let several seats working one workspace see each other's work instead of colliding.
// ───────────────────────────────────────────────────────────────

import pb from '@/lib/pocketbaseClient';
import { reportAction } from '@/lib/observability/runtime';
import { createWorkspaceClaimClient } from './workspaceClaims.js';

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
let publisher = null;
let publisherAccountId = null;
const pendingPublishers = new Map();
const MAX_PENDING_WORKSPACES = 32;

function syncPublisherAccount() {
    const accountId = pb.authStore.record?.id || null;
    if (publisherAccountId === accountId) return;
    publisherAccountId = accountId;
    publisher = null;
    pendingPublishers.clear();
}
pb.authStore.onChange(syncPublisherAccount);

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
        owner: record.owner || null,
        attribution: 'reported',
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
 * The optional configured label is a claim, not authenticated agent identity.
 * The native command separately stamps the actual submitting account.
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
 * Reconciles an unresolved prior report using its original key before sending
 * a different report. Workspace visits retain unresolved keys within the current
 * account session; old-visit responses cannot settle a new visit.
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
    };
    if (subjectType) payload.subject_type = subjectType;
    if (subject) payload.subject = subject;
    if (detail) payload.detail = detail;
    if (prUrl) payload.pr_url = prUrl;
    if (handoffTo) payload.handoff_to = handoffTo;

    try {
        syncPublisherAccount();
        const accountId = pb.authStore.record.id;
        const scope = `${accountId}:${workspaceId}`;
        if (publisher?.scope !== scope) {
            let current = pendingPublishers.get(scope);
            if (!current) {
                if (pendingPublishers.size >= MAX_PENDING_WORKSPACES) {
                    publisher = null;
                    console.error('publish seat report failed', 'Recover an unresolved workspace report before starting another.');
                    return null;
                }
                current = { scope, lifetime: 0 };
                current.api = createWorkspaceClaimClient({ client: pb, collection: COLLECTION, accountId, workspaceId,
                    isCurrent: () => publisher === current, getLifetime: () => current.lifetime, deferConfirmation: true });
            }
            current.lifetime += 1;
            publisher = current;
        }
        const current = publisher;
        if (current.publishing) { console.error('publish seat report failed', 'Wait for the current report to finish.'); return null; }
        const lifetime = current.lifetime;
        const sameVisit = () => publisher === current && current.lifetime === lifetime && pb.authStore.record?.id === accountId;
        current.publishing = true;
        current.pending = true;
        pendingPublishers.set(scope, current);
        try {
            let result = await current.api.write('create', '', payload);
            if (!sameVisit()) return null;
            if (result.blockedByPending) {
                // Reconcile only the original key. Same-report retries are already
                // handled by write and must not be submitted a second time.
                const recovered = await current.api.retry();
                if (!sameVisit()) return null;
                if (recovered.ok && !current.api.confirm()) return null;
                result = recovered.ok ? await current.api.write('create', '', payload) : recovered;
            }
            if (!sameVisit()) return null;
            if (!result.ok) {
                current.pending = Boolean(result.uncertain || result.stale || result.blockedByPending);
                console.error('publish seat report failed', result.error);
                return null;
            }
            if (!current.api.confirm()) return null;
            current.pending = false;
            reportAction(SEAT_EVENTS[event], {
                seat: payload.seat,
                actor_type: actorType,
                subject_type: subjectType || 'none',
            });
            return result.record;
        } finally {
            current.publishing = false;
            if (!current.pending && pendingPublishers.get(scope) === current) pendingPublishers.delete(scope);
        }
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
