// CGRF: SRS=SRS-BUILDANDDO-MISSION-CHAIN-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/missionChain.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-MISSION-CHAIN-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-12
// Depends:     (none — pure derivation over records the page already read)
// EnumType:    Adapter
// EnumEdges:   CONSUMES missions; CONSUMES mission_events; CONSUMES operations;
//              CONSUMES operation_runs; CONSUMES evidence;
//              CONSUMED_BY apps/web/src/components/workspace/MissionChain.jsx;
//              CONSUMED_BY apps/web/src/pages/workspace/MissionsPage.jsx
// Intent:      Reconstruct challenge → event → mission → bounded action →
//              verification → replay from stored receipts only, so a stage with
//              no receipt reads UNMEASURED instead of borrowing proof from a
//              later one.
// ───────────────────────────────────────────────────────────────

/**
 * The chain has exactly two states. There is no "in progress", no "partial",
 * and no "probably": either a receipt for the stage is in hand or the stage is
 * unmeasured. A third state is where a demo starts lying.
 */
export const CHAIN_STATE = Object.freeze({
    COMPLETE: 'COMPLETE',
    UNMEASURED: 'UNMEASURED',
});

/**
 * The six stages, in the order they occur. Index order is load-bearing: the
 * current stage is the first unmeasured one, and the replay trace breaks ties
 * on this order.
 */
export const STAGES = Object.freeze([
    'challenge',
    'event',
    'mission',
    'bounded_action',
    'verification',
    'replay',
]);

export const STAGE_LABELS = Object.freeze({
    challenge: 'Challenge',
    event: 'Event',
    mission: 'Mission',
    bounded_action: 'Bounded action',
    verification: 'Verification',
    replay: 'Replay',
});

/** What each stage accepts as a receipt. Rendered under the stage. */
export const STAGE_RECEIPT_RULE = Object.freeze({
    challenge: 'A stored origin: which channel the request arrived on and which request it was.',
    event: 'A mission_events row recording the arrival — a channel, or the arrival entry of the stage log — and the time it was observed.',
    mission: 'A stored missions row. The row is intent, not proof the work happened.',
    bounded_action: 'An operation_runs row. A runbook with no run is a plan, not a receipt.',
    verification: 'An evidence row of type "verified" carrying the source of the proof.',
    replay: 'Every earlier receipt present and timed, so the chain can be re-walked in order.',
});

/** Channels a challenge can arrive on. `sprint` is an internal obligation. */
export const ORIGIN_CHANNELS = Object.freeze(['wiki', 'forum', 'reddit', 'discord', 'sprint']);

const EMPTY_ORIGIN = Object.freeze({
    channel: null,
    ref: null,
    at: null,
    source: null,
    measured: false,
});

/**
 * @param {*} value Candidate value.
 * @returns {string|null} Trimmed non-empty string, or null.
 */
function text(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * First candidate that parses as a date.
 *
 * @param {...*} candidates Timestamp candidates, most specific first.
 * @returns {string|null} The candidate as stored, or null when none parse.
 */
function stamp(...candidates) {
    for (const candidate of candidates) {
        const value = text(candidate);
        if (value && !Number.isNaN(new Date(value).getTime())) return value;
    }
    return null;
}

/**
 * True when a PocketBase relation field points at `id`.
 *
 * Handles both shapes: a single-select relation is a string, a multi-select
 * relation is an array.
 *
 * @param {*} value Relation field value.
 * @param {string} id Record id to match.
 * @returns {boolean} Whether the relation includes the id.
 */
function relatesTo(value, id) {
    if (!id) return false;
    if (Array.isArray(value)) return value.includes(id);
    return value === id;
}

/**
 * True when a relation field points at any id in the set.
 *
 * @param {*} value Relation field value.
 * @param {Set<string>} ids Record ids to match.
 * @returns {boolean} Whether the relation hits the set.
 */
function relatesToAny(value, ids) {
    if (!ids.size) return false;
    if (Array.isArray(value)) return value.some((entry) => ids.has(entry));
    return typeof value === 'string' && ids.has(value);
}

/**
 * Arrival time of a recorded event.
 *
 * `observed_at` is when the request actually arrived; `created` is when the row
 * was written. The second is a real timestamp, not a guess, so it stands in
 * when the first was never filled — but it is the fallback, never the preference.
 *
 * @param {object} event A `mission_events` record.
 * @returns {string|null} Timestamp, or null.
 */
function eventAt(event) {
    return stamp(event.observed_at, event.created);
}

/**
 * Pointer back to the request an event recorded.
 *
 * @param {object} event A `mission_events` record.
 * @returns {string|null} Reference, or null.
 */
function eventRef(event) {
    return text(event.reference) || text(event.ref);
}

/**
 * True when a `mission_events` row records the arrival itself.
 *
 * Two stored shapes are accepted, because two exist. A row carrying `channel`
 * names the public-record channel the request came in on. A row carrying
 * `stage: 'event'` is the arrival entry of the stage-transition log the
 * migration writes, which has no channel column at all — read strictly for a
 * channel, every stored arrival reads UNMEASURED and the replay can never be
 * walked.
 *
 * Nothing else counts. A row logging a later stage is that stage's business,
 * and completing the arrival from it would be exactly the backward inference
 * this module refuses.
 *
 * @param {object} event A `mission_events` record.
 * @returns {boolean} Whether the row is an arrival receipt.
 */
function isArrival(event) {
    // A recorded stage governs whenever one is stored, so a row that logs a
    // later step cannot become an arrival by also naming a channel.
    const stage = text(event.stage);
    if (stage) return stage === 'event';
    return Boolean(text(event.channel));
}

/**
 * Time a bounded action ran.
 *
 * @param {object} run An `operation_runs` record.
 * @returns {string|null} Timestamp, or null.
 */
function runAt(run) {
    return stamp(run.started_at, run.created);
}

/**
 * Orders two timestamps oldest first.
 *
 * An undated receipt cannot be placed on the timeline at all, so it sinks to
 * the end rather than silently sorting as the epoch and claiming to be first.
 *
 * @param {string|null} a Timestamp.
 * @param {string|null} b Timestamp.
 * @returns {number} Comparator result; 0 when neither can be placed.
 */
function compareStamps(a, b) {
    if (a && b) return new Date(a).getTime() - new Date(b).getTime();
    if (Boolean(a) !== Boolean(b)) return a ? -1 : 1;
    return 0;
}

/**
 * Orders replay rows oldest first, breaking ties on stage order.
 *
 * @param {object} a Trace row.
 * @param {object} b Trace row.
 * @returns {number} Comparator result.
 */
function compareTrace(a, b) {
    return compareStamps(a.at, b.at) || STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage);
}

/**
 * Where the challenge came from.
 *
 * The mission's own origin fields are the declaration; the earliest recorded
 * event is the observation. Both are reported, and `source` says which one this
 * descriptor came from, because "the operator typed wiki" and "an arrival from
 * the wiki was recorded" are different claims.
 *
 * @param {object|null} mission The `missions` record.
 * @param {object[]} events Events for this mission, oldest first.
 * @returns {{channel: string|null, ref: string|null, at: string|null,
 *   source: 'mission'|'event'|null, measured: boolean}} Origin descriptor.
 */
function deriveOrigin(mission, events) {
    const channel = text(mission && mission.origin_channel);
    const ref = text(mission && mission.origin_ref);
    const at = stamp(mission && mission.origin_observed_at);

    if (channel || ref) {
        return { channel, ref, at, source: 'mission', measured: Boolean(channel) };
    }

    const arrival = events.find((event) => text(event.channel));
    if (arrival) {
        return {
            channel: text(arrival.channel),
            ref: eventRef(arrival),
            at: eventAt(arrival),
            source: 'event',
            measured: true,
        };
    }

    return { ...EMPTY_ORIGIN };
}

/**
 * Rebuilds one mission's chain from the receipts stored against it.
 *
 * Every stage is judged on its own receipt and nothing else. A verified
 * evidence row does not complete the bounded action that was never recorded; a
 * mission sitting in `verified` does not complete anything at all, because the
 * status field is what somebody set, not what happened.
 *
 * Trace rows are projected field by field — no record is spread into the
 * output — so a column added to a collection later cannot leak into the UI
 * without someone deciding to render it.
 *
 * @param {object} input Chain input.
 * @param {object|null} input.mission The `missions` record.
 * @param {object[]} [input.events] `mission_events` rows (any mission).
 * @param {object[]} [input.operations] `operations` rows (any mission).
 * @param {object[]} [input.runs] `operation_runs` rows (any operation).
 * @param {object[]} [input.evidence] `evidence` rows (any mission).
 * @returns {{missionId: string|null, stages: object[], stageState: object,
 *   current: string, complete: boolean, origin: object, trace: object[],
 *   counts: object}} The derived chain.
 */
export function deriveMissionChain(input = {}) {
    const mission = input.mission || null;
    const missionId = text(mission && mission.id);

    const events = (input.events || [])
        .filter((record) => relatesTo(record.mission, missionId))
        .sort((a, b) => compareStamps(eventAt(a), eventAt(b)));
    const operations = (input.operations || []).filter((record) =>
        relatesTo(record.mission, missionId),
    );
    const operationIds = new Set(operations.map((record) => record.id).filter(Boolean));
    const runs = (input.runs || []).filter((record) => relatesToAny(record.operation, operationIds));
    const evidence = (input.evidence || []).filter((record) =>
        relatesTo(record.mission, missionId),
    );

    const operationById = new Map(operations.map((record) => [record.id, record]));
    const origin = deriveOrigin(mission, events);

    // ── Receipts. Each list is the evidence for exactly one stage. ──────────
    const challengeReceipt = Boolean(
        text(mission && mission.origin_channel) && text(mission && mission.origin_ref),
    );
    const eventReceipts = events.filter((record) => isArrival(record) && eventAt(record));
    const missionReceipt = Boolean(missionId && stamp(mission.created));
    const runReceipts = runs.filter((record) => runAt(record));
    const verifiedReceipts = evidence.filter(
        (record) => record.type === 'verified' && stamp(record.created),
    );

    // ── Trace: one row per receipt, ordered by when it happened. ────────────
    const trace = [];

    if (challengeReceipt) {
        trace.push({
            stage: 'challenge',
            at: origin.at,
            actor: origin.channel,
            summary: text(mission.origin_summary),
            ref: origin.ref,
        });
    }

    for (const record of eventReceipts) {
        trace.push({
            stage: 'event',
            at: eventAt(record),
            actor: text(record.actor) || text(record.channel),
            summary: text(record.summary),
            ref: eventRef(record),
        });
    }

    if (missionReceipt) {
        trace.push({
            stage: 'mission',
            at: stamp(mission.created),
            actor: text(mission.owner),
            summary: text(mission.title),
            ref: missionId,
        });
    }

    for (const record of runReceipts) {
        const operation = operationById.get(
            Array.isArray(record.operation) ? record.operation[0] : record.operation,
        );
        trace.push({
            stage: 'bounded_action',
            at: runAt(record),
            actor: text(record.actor) || text(operation && operation.name),
            summary: text(record.notes) || text(record.result),
            ref: text(operation && operation.name),
        });
    }

    for (const record of verifiedReceipts) {
        trace.push({
            stage: 'verification',
            at: stamp(record.created),
            actor: text(record.source),
            summary: text(record.content),
            ref: text(record.source),
        });
    }

    trace.sort(compareTrace);

    // Replay is the only stage derived from the others, and deliberately so:
    // replaying means walking every earlier receipt in order, which is
    // impossible while one is missing or undated.
    const earlier = [challengeReceipt, eventReceipts.length > 0, missionReceipt, runReceipts.length > 0, verifiedReceipts.length > 0];
    const replayReceipt =
        earlier.every(Boolean) && trace.length > 0 && trace.every((row) => Boolean(row.at));

    const receipts = {
        challenge: challengeReceipt ? 1 : 0,
        event: eventReceipts.length,
        mission: missionReceipt ? 1 : 0,
        bounded_action: runReceipts.length,
        verification: verifiedReceipts.length,
        replay: replayReceipt ? trace.length : 0,
    };

    const stageState = {};
    for (const id of STAGES) {
        stageState[id] = receipts[id] > 0 ? CHAIN_STATE.COMPLETE : CHAIN_STATE.UNMEASURED;
    }

    const stages = STAGES.map((id) => ({
        id,
        label: STAGE_LABELS[id],
        state: stageState[id],
        receipts: receipts[id],
        rule: STAGE_RECEIPT_RULE[id],
    }));

    return {
        missionId,
        stages,
        stageState,
        current: STAGES.find((id) => stageState[id] === CHAIN_STATE.UNMEASURED) || STAGES[STAGES.length - 1],
        complete: STAGES.every((id) => stageState[id] === CHAIN_STATE.COMPLETE),
        origin,
        trace,
        counts: {
            events: events.length,
            operations: operations.length,
            runs: runs.length,
            evidence: evidence.length,
            verified: verifiedReceipts.length,
        },
    };
}

/**
 * Groups rows by the record id a relation field points at.
 *
 * @param {object[]} rows Records to group.
 * @param {string} key Relation field name.
 * @returns {Map<string, object[]>} Rows per related id.
 */
function indexByRelation(rows, key) {
    const index = new Map();
    for (const row of rows || []) {
        const value = row[key];
        for (const id of Array.isArray(value) ? value : [value]) {
            const clean = text(id);
            if (!clean) continue;
            const bucket = index.get(clean) || [];
            bucket.push(row);
            index.set(clean, bucket);
        }
    }
    return index;
}

/**
 * Derives a chain for every mission in one pass.
 *
 * A list page needs the current stage of every row, and filtering four record
 * lists per mission turns that into quadratic work on a busy workspace. The
 * grouping is done once here instead.
 *
 * @param {object[]} missions `missions` rows.
 * @param {{events?: object[], operations?: object[], runs?: object[], evidence?: object[]}} [sources] Records.
 * @returns {Record<string, object>} Chain per mission id.
 */
export function buildMissionChains(missions = [], sources = {}) {
    const eventsByMission = indexByRelation(sources.events, 'mission');
    const operationsByMission = indexByRelation(sources.operations, 'mission');
    const runsByOperation = indexByRelation(sources.runs, 'operation');
    const evidenceByMission = indexByRelation(sources.evidence, 'mission');

    const chains = {};
    for (const mission of missions) {
        if (!mission || !mission.id) continue;
        const operations = operationsByMission.get(mission.id) || [];
        const runs = operations.flatMap((operation) => runsByOperation.get(operation.id) || []);
        chains[mission.id] = deriveMissionChain({
            mission,
            events: eventsByMission.get(mission.id) || [],
            operations,
            runs,
            evidence: evidenceByMission.get(mission.id) || [],
        });
    }
    return chains;
}
