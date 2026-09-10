// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/workHistory.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/pocketbaseClient.js, apps/web/src/lib/seatComms.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES seat_events; CONSUMES evidence; VERIFIED_BY apps/web/src/pages/workspace/MissionsPage.jsx
// Intent:      Answer "has anyone already worked this" before a seat spends effort rediscovering it.
// ───────────────────────────────────────────────────────────────

import pb from '@/lib/pocketbaseClient';

/** Subject types the lookup understands. Anything else reads seat events only. */
const EVIDENCE_LINKED_SUBJECTS = new Set(['mission']);

const EMPTY_HISTORY = Object.freeze({
    hasHistory: false,
    state: 'not_started',
    seats: [],
    events: [],
    evidence: [],
    prLinks: [],
    firstAt: null,
    lastAt: null,
    partial: false,
});

/**
 * Collapses a seat event list into a single state.
 *
 * The most recent event wins, with one exception: a `completed` anywhere in the
 * history keeps the subject completed, because later chatter on finished work
 * is commentary rather than a reopening. Reopening is an explicit new mission.
 *
 * @param {object[]} events Seat events, newest first.
 * @returns {string} `not_started`, `in_progress`, `blocked`, `handed_off`, or
 *   `completed` — the same keys as `WORK_STATE` in workspaceHelpers.
 */
function deriveWorkState(events) {
    if (!events.length) return 'not_started';
    if (events.some((e) => e.event === 'completed')) return 'completed';
    const latest = events[0];
    if (latest.event === 'blocked') return 'blocked';
    if (latest.event === 'handoff') return 'handed_off';
    return 'in_progress';
}

/**
 * Groups seat events by seat, newest activity first.
 *
 * @param {object[]} events Seat events, newest first.
 * @returns {object[]} One entry per seat with its event count and last action.
 */
function summariseSeats(events) {
    const bySeat = new Map();
    for (const event of events) {
        const existing = bySeat.get(event.seat);
        if (existing) {
            existing.eventCount += 1;
            continue;
        }
        bySeat.set(event.seat, {
            seat: event.seat,
            actorType: event.actorType || 'human',
            lastEvent: event.event,
            lastSummary: event.summary,
            lastAt: event.createdAt,
            eventCount: 1,
        });
    }
    return [...bySeat.values()];
}

/**
 * Normalises a `seat_events` record for history consumers.
 *
 * Kept local rather than imported from seatComms so a history read does not
 * drag the realtime module — and its module-level connection state — into a
 * page that only wants to display the past.
 *
 * @param {object} record Raw PocketBase record.
 * @returns {object} Flat history event.
 */
function toHistoryEvent(record) {
    return {
        id: record.id,
        event: record.event,
        seat: record.seat,
        actorType: record.actor_type,
        summary: record.summary,
        prUrl: record.pr_url || null,
        handoffTo: record.handoff_to || null,
        createdAt: record.created,
    };
}

/**
 * Looks up everything already recorded against one mission, workflow, or page.
 *
 * Two sources are consulted. `seat_events` is the coordination record — who
 * picked it up, how far they got, whether they handed it off. `evidence` is the
 * outcome record, and only missions carry an evidence relation, so a workflow
 * lookup returns `partial: true` to say the second source did not apply rather
 * than implying there was nothing to find.
 *
 * Failures degrade to an empty result: a page must still render when the
 * history read fails, and an empty "previous work" panel is less wrong than a
 * broken one.
 *
 * @param {object} input Lookup input.
 * @param {string} input.workspaceId Workspace record id.
 * @param {string} input.subjectType `mission`, `workflow`, `page`, `issue`, `pull_request`, `other`.
 * @param {string} input.subject Record id, or repository path for a page.
 * @param {{ limit?: number }} [options] Read options.
 * @returns {Promise<object>} History summary; `hasHistory` is false when nothing was found.
 */
export async function lookupPreviousWork({ workspaceId, subjectType, subject }, options = {}) {
    if (!workspaceId || !subjectType || !subject || !pb.authStore.record) {
        return EMPTY_HISTORY;
    }
    const limit = options.limit || 25;
    const checksEvidence = EVIDENCE_LINKED_SUBJECTS.has(subjectType);

    let events = [];
    let evidence = [];

    try {
        const page = await pb.collection('seat_events').getList(1, limit, {
            filter: pb.filter(
                'workspace = {:ws} && subject_type = {:type} && subject = {:subject}',
                { ws: workspaceId, type: subjectType, subject },
            ),
            sort: '-created',
        });
        events = page.items.map(toHistoryEvent);
    } catch (err) {
        console.error('previous work: seat event read failed', err);
    }

    if (checksEvidence) {
        try {
            const page = await pb.collection('evidence').getList(1, limit, {
                filter: pb.filter('workspace = {:ws} && mission = {:subject}', {
                    ws: workspaceId,
                    subject,
                }),
                sort: '-created',
            });
            evidence = page.items.map((record) => ({
                id: record.id,
                type: record.type,
                content: record.content,
                source: record.source || null,
                createdAt: record.created,
            }));
        } catch (err) {
            console.error('previous work: evidence read failed', err);
        }
    }

    const timestamps = [
        ...events.map((e) => e.createdAt),
        ...evidence.map((e) => e.createdAt),
    ]
        .filter(Boolean)
        .sort();

    return {
        hasHistory: events.length > 0 || evidence.length > 0,
        state: deriveWorkState(events),
        seats: summariseSeats(events),
        events,
        evidence,
        prLinks: [...new Set(events.map((e) => e.prUrl).filter(Boolean))],
        firstAt: timestamps[0] || null,
        lastAt: timestamps[timestamps.length - 1] || null,
        partial: !checksEvidence,
    };
}

/**
 * Looks up previous work for several subjects in one pass.
 *
 * Used by list pages that want a "previous work" marker per row without firing
 * one request per row on every render.
 *
 * @param {object} input Lookup input.
 * @param {string} input.workspaceId Workspace record id.
 * @param {string} input.subjectType Subject type shared by every id.
 * @param {string[]} input.subjects Record ids.
 * @returns {Promise<Record<string, object>>} Map of subject id to history summary.
 */
export async function lookupPreviousWorkBatch({ workspaceId, subjectType, subjects }) {
    const ids = [...new Set((subjects || []).filter(Boolean))];
    if (!workspaceId || !subjectType || ids.length === 0 || !pb.authStore.record) {
        return {};
    }

    const bySubject = {};
    for (const id of ids) bySubject[id] = { ...EMPTY_HISTORY, events: [], seats: [] };

    try {
        const clause = ids.map((_, i) => `subject = {:s${i}}`).join(' || ');
        const params = { ws: workspaceId, type: subjectType };
        ids.forEach((id, i) => {
            params[`s${i}`] = id;
        });
        const page = await pb.collection('seat_events').getList(1, 200, {
            filter: pb.filter(
                `workspace = {:ws} && subject_type = {:type} && (${clause})`,
                params,
            ),
            sort: '-created',
        });
        const grouped = new Map(ids.map((id) => [id, []]));
        for (const record of page.items) {
            const bucket = grouped.get(record.subject);
            if (bucket) bucket.push(toHistoryEvent(record));
        }
        for (const [id, events] of grouped) {
            bySubject[id] = {
                hasHistory: events.length > 0,
                state: deriveWorkState(events),
                seats: summariseSeats(events),
                events,
                evidence: [],
                prLinks: [...new Set(events.map((e) => e.prUrl).filter(Boolean))],
                firstAt: events.length ? events[events.length - 1].createdAt : null,
                lastAt: events.length ? events[0].createdAt : null,
                partial: true,
            };
        }
    } catch (err) {
        console.error('previous work batch read failed', err);
    }

    return bySubject;
}
