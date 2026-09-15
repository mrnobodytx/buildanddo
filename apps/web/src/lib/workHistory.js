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
// EnumEdges:   CONSUMES seat_events; CONSUMES evidence; CONSUMES workflow_runs;
//              VERIFIED_BY apps/web/src/pages/workspace/MissionsPage.jsx
// Intent:      Answer "has anyone already worked this" before a seat spends effort rediscovering it.
// ───────────────────────────────────────────────────────────────

import pb from '@/lib/pocketbaseClient';

const EMPTY_HISTORY = Object.freeze({
    hasHistory: false,
    state: 'not_started',
    seats: [],
    events: [],
    evidence: [],
    runs: [],
    prLinks: [],
    firstAt: null,
    lastAt: null,
    partial: false,
    sources: {},
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

/** Read one bounded source while retaining the difference between missing and unreadable work. */
async function readSource(name, field, { workspaceId, subjectType, ids, limit }) {
    const params = { ws: workspaceId, type: subjectType };
    ids.forEach((id, index) => { params[`s${index}`] = id; });
    const clause = ids.map((_, index) => `${field} = {:s${index}}`).join(' || ');
    const scope = name === 'seat_events' ? ' && subject_type = {:type}' : '';
    try {
        const page = await pb.collection(name).getList(1, limit, {
            filter: pb.filter(`workspace = {:ws}${scope} && (${clause})`, params),
            sort: name === 'workflow_runs' ? '-started_at,-id' : '-created,-id',
            // Different panels can read the same collection concurrently.
            // Scope checks below, and the hook's sequence, discard stale results.
            requestKey: null,
        });
        if (!Array.isArray(page.items) || !Number.isInteger(page.totalItems) || page.totalItems < page.items.length ||
            page.items.some((row) => !row || row.workspace !== workspaceId || !ids.includes(row[field]) ||
                (name === 'seat_events' && row.subject_type !== subjectType))) {
            return { name, field, rows: [], state: 'unavailable' };
        }
        return { name, field, rows: page.items, state: page.totalItems > page.items.length ? 'truncated' : 'complete' };
    } catch {
        return { name, field, rows: [], state: 'unavailable' };
    }
}

function summariseHistory(id, sources) {
    const rows = (name) => {
        const source = sources.find((item) => item.name === name);
        return source ? source.rows.filter((row) => row[source.field] === id) : [];
    };
    const events = rows('seat_events').map(toHistoryEvent);
    const evidence = rows('evidence').map((record) => ({ id: record.id, type: record.type,
        content: record.content, source: record.source || null, createdAt: record.created }));
    const runs = rows('workflow_runs').map((record) => ({ id: record.id, status: record.status,
        startedAt: record.started_at, finishedAt: record.finished_at || null, updatedAt: record.updated || null }));
    const timestamps = [...events.map((item) => item.createdAt), ...evidence.map((item) => item.createdAt),
        ...runs.flatMap((item) => [item.startedAt, item.finishedAt, item.updatedAt])]
        .filter((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))
        .sort((a, b) => Date.parse(a) - Date.parse(b));
    return {
        hasHistory: events.length + evidence.length + runs.length > 0,
        state: deriveWorkState(events),
        seats: summariseSeats(events),
        events, evidence, runs,
        prLinks: [...new Set(events.map((item) => item.prUrl).filter(Boolean))],
        firstAt: timestamps[0] || null,
        lastAt: timestamps[timestamps.length - 1] || null,
        partial: sources.some((source) => source.state !== 'complete'),
        sources: Object.fromEntries(sources.map((source) => [source.name, source.state])),
    };
}

/**
 * Read seat activity and the receipts applicable to one subject.
 *
 * @param {object} input Workspace id, subject type and subject id.
 * @param {{limit?: number}} [options] Maximum rows per source, capped at 200.
 * @returns {Promise<object>} History with explicit incomplete-source state.
 */
export async function lookupPreviousWork({ workspaceId, subjectType, subject }, options = {}) {
    const history = await lookupPreviousWorkBatch({ workspaceId, subjectType, subjects: [subject] },
        { limit: options.limit ?? 25 });
    return Object.hasOwn(history, subject) ? history[subject] : EMPTY_HISTORY;
}

/**
 * Read history for a list without issuing a request per row.
 *
 * Queries use groups of 40 subjects and at most 200 rows per source. A truncated
 * source marks every subject in that group incomplete, including missing rows.
 * Evidence and run receipts remain distinct from the seat communication state.
 *
 * @param {object} input Workspace id, subject type and subject ids.
 * @param {{limit?: number}} [options] Maximum rows per source, capped at 200.
 * @returns {Promise<Record<string, object>>} Scoped history keyed by subject id.
 */
export async function lookupPreviousWorkBatch({ workspaceId, subjectType, subjects }, options = {}) {
    const ids = [...new Set((Array.isArray(subjects) ? subjects : []).filter((id) => typeof id === 'string' && id.length > 0))];
    const accountId = pb.authStore.record?.id;
    if (!workspaceId || !subjectType || !ids.length || !accountId) return {};
    const limit = Number.isInteger(options.limit) && options.limit > 0 ? Math.min(options.limit, 200) : 200;
    const bySubject = new Map();
    for (let offset = 0; offset < ids.length; offset += 40) {
        if (pb.authStore.record?.id !== accountId) return {};
        const batch = ids.slice(offset, offset + 40);
        const query = { workspaceId, subjectType, ids: batch, limit };
        const pending = [readSource('seat_events', 'subject', query)];
        if (subjectType === 'mission') pending.push(readSource('evidence', 'mission', query));
        if (subjectType === 'workflow') pending.push(readSource('workflow_runs', 'workflow', query));
        const sources = await Promise.all(pending);
        if (pb.authStore.record?.id !== accountId) return {};
        for (const id of batch) bySubject.set(id, summariseHistory(id, sources));
    }
    return Object.fromEntries(bySubject);
}
