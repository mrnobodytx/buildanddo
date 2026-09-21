// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/signalSync.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/lib/signalDerivation.js
// EnumType:    Library
// EnumEdges:   CONSUMES apps/web/src/lib/signalDerivation.js; PRODUCES workspace.signal.create
// DAG Node:    none
// Intent:      Decide which derived signals are genuinely new, so deriving twice does not write twice.
// ───────────────────────────────────────────────────────────────

import { deriveSignals } from './signalDerivation';

/**
 * WHY A SEPARATE, PURE PLANNER. Writing is the dangerous half: `signals` has no unique index, so
 * nothing in the database stops a second sync inserting the same fact again. The guard has to live
 * in code, and code that decides what to write must be testable without writing anything. So this
 * returns a PLAN and performs no I/O; the caller does the creates.
 *
 * NO BACKEND CHANGE IS NEEDED. `signals` already allows an authenticated owner to create their own
 * rows (createRule: @request.auth.id = @request.body.owner), and useWorkspaceRecords.create()
 * already injects workspace and owner. So derived facts are written AS THE USER, under the same
 * row-level rules as anything they type by hand. A pb_hook would have been a second, untestable
 * authority doing what the existing one already does correctly.
 *
 * WHAT IT WILL NOT DO. It never updates or deletes an existing signal. A signal the person has
 * acknowledged or dismissed is THEIR triage decision; re-deriving must not quietly resurrect it,
 * and a sync that "corrects" a human's dismissal is a sync nobody will leave switched on.
 */

/** The set of keys already present, read from the persisted `source` column. */
export function existingKeys(signals) {
    const keys = new Set();
    for (const signal of Array.isArray(signals) ? signals : []) {
        const source = String(signal?.source ?? '').trim();
        if (source) keys.add(source);
    }
    return keys;
}

/**
 * Plan a sync. Performs no I/O.
 *
 * Returns `{ state, create, present, considered }`:
 *   create    - derived signals with no matching row yet, in derivation order
 *   present   - keys that already exist, so the caller can say "nothing new" honestly
 *   considered- how many missions were examined
 *
 * `state` is 'unavailable' when either side could not be read. Planning a write from a half-read
 * view is how duplicates get created: an empty `existing` list that merely failed to load looks
 * exactly like a workspace with no signals yet, and the sync would insert everything a second time.
 * So a missing existing-list is refused rather than treated as empty.
 */
export function planSignalSync(missions, existing) {
    const derived = deriveSignals(missions);
    if (derived.state !== 'available') {
        return { state: 'unavailable', reason: derived.reason ?? 'missions unavailable',
            create: [], present: [], considered: derived.considered };
    }
    if (!Array.isArray(existing)) {
        return { state: 'unavailable', reason: 'existing signals not loaded; refusing to plan a '
            + 'write against an unread feed', create: [], present: [], considered: derived.considered };
    }
    const have = existingKeys(existing);
    const create = [];
    const present = [];
    for (const signal of derived.signals) {
        if (have.has(signal.key)) present.push(signal.key);
        else create.push(signal);
    }
    return { state: 'available', create, present, considered: derived.considered };
}

/** The record body to hand to useWorkspaceRecords.create().
 *
 *  Deliberately omits workspace and owner: the hook injects those from the active workspace and
 *  the authenticated account. Passing our own would let a stale client write into a workspace the
 *  person has since left. */
export function toRecord(signal) {
    return {
        title: String(signal.title ?? '').slice(0, 200),
        description: String(signal.description ?? '').slice(0, 1000),
        source: String(signal.source ?? signal.key ?? '').slice(0, 120),
        type: signal.type,
        severity: signal.severity,
        state: 'new',
    };
}

/** Apply a plan with a caller-supplied create function.
 *
 *  `create` is injected rather than imported so this stays testable and so the caller keeps control
 *  of authority. Failures are COLLECTED, not thrown: one rejected row must not abandon the rest,
 *  and the caller needs to be able to report "4 of 6 written" rather than an exception. */
export async function applySignalSync(plan, create) {
    if (!plan || plan.state !== 'available') {
        return { state: 'unavailable', written: 0, failed: [], reason: plan?.reason ?? 'no plan' };
    }
    if (typeof create !== 'function') {
        return { state: 'unavailable', written: 0, failed: [], reason: 'no create function supplied' };
    }
    let written = 0;
    const failed = [];
    for (const signal of plan.create) {
        try {
            await create(toRecord(signal));
            written += 1;
        } catch (error) {
            failed.push({ key: signal.key, reason: String(error?.message ?? error).slice(0, 200) });
        }
    }
    return { state: 'available', written, failed, skipped: plan.present.length };
}
