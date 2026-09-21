// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/signalDerivation.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/components/workspace/workspaceHelpers.jsx
// EnumType:    Library
// EnumEdges:   PRODUCES workspace.signal.derived; VALIDATES apps/web/src/pages/workspace/SignalsPage.jsx
// DAG Node:    none
// Intent:      Turn mission state the workspace already records into signals, deterministically,
//              so the signals feed has a source other than a human typing into it.
// ───────────────────────────────────────────────────────────────

/**
 * WHY THIS EXISTS. The `signals` collection, its triage schema (severity / state /
 * acknowledged_at) and SignalsPage were all built. Nothing ever wrote to it except a person, which
 * is why the front page reads "SIGNALS TODAY - No source - not connected". The collection offers
 * three types - fact, inference, user - and only `user` had a producer.
 *
 * This derives the `fact` ones: states the workspace has already recorded and which a person needs
 * to see. It invents nothing. Every signal points back at the record that caused it.
 *
 * DETERMINISTIC BY CONSTRUCTION. Same input, same output, same keys, no clock and no randomness in
 * the key. That matters because derivation runs repeatedly: without a stable key each refresh would
 * append near-duplicates until the feed is unreadable, which is the failure mode the triage schema
 * was added to fix in the first place.
 *
 * WHAT IT DELIBERATELY WILL NOT DO. It does not score importance from content, guess a severity for
 * a state it does not know, or emit `inference`. An inference needs a model and a confidence that
 * can be defended; a mission that is `failed` is a fact and needs neither.
 */

/** Mission states that are worth a person's attention, and what they are worth.
 *
 *  The vocabulary is mission-policy.js's own transition table:
 *  proposed -> approved -> running -> needs_attention | verified | failed.
 *  Only terminal-or-stuck states produce a signal. `running` is not a signal; it is work in
 *  progress, and a feed that reports progress as events is a feed nobody reads. */
const MISSION_SIGNALS = {
    failed: {
        severity: 'high',
        summary: 'stopped without completing',
        // NOT `critical`. Critical should mean the workspace cannot continue at all; a single
        // failed mission usually means one thing needs a retry or a decision. Reserving the top of
        // the scale keeps it meaningful when something really does warrant it.
    },
    needs_attention: {
        severity: 'medium',
        summary: 'is waiting on a decision',
    },
    verified: {
        severity: 'info',
        summary: 'completed and was verified',
        // Recorded because "nothing happened" and "it finished" look identical in an empty feed.
    },
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

/** A stable identity for a derived signal.
 *
 *  Keyed on the mission and the state that produced it, NOT on a timestamp. A mission that stays
 *  `needs_attention` for a week is one signal that is a week old, not seven signals. If the same
 *  mission later fails, that is a different state and therefore a different signal - the earlier
 *  one is not overwritten, because the fact that it was waiting first is part of the history. */
export function signalKey(mission) {
    const id = String(mission?.id ?? '').trim();
    const status = String(mission?.status ?? '').trim();
    if (!id || !status) return '';
    return `mission:${id}:${status}`;
}

/** One mission -> at most one signal, or null when the state is not worth surfacing. */
export function deriveMissionSignal(mission) {
    const key = signalKey(mission);
    if (!key) return null;
    const status = String(mission.status).trim();
    const rule = MISSION_SIGNALS[status];
    if (!rule) return null;

    const title = String(mission.title ?? '').trim();
    return {
        key,
        // A signal with no title is unreadable in the feed, so an untitled mission is named by what
        // it is rather than left blank or silently dropped. Dropping it would hide a failure.
        title: title ? `${title} ${rule.summary}` : `An untitled mission ${rule.summary}`,
        description: String(mission.description ?? '').trim().slice(0, 1000),
        // source CARRIES THE KEY, it is not just provenance. `signals` has no dedicated key column
        // and no unique index, so the only way a later sync can tell "already derived" from "new"
        // is to store the full key in a persisted field. An earlier cut wrote `mission:<id>` here,
        // which drops the status - and a mission that waited and then failed would have collapsed
        // into one indistinguishable row, losing the half that says it was waiting first.
        source: key,
        type: 'fact',
        severity: rule.severity,
        state: 'new',
        observed_status: status,
    };
}

/** Derive the full set for a workspace, newest-relevant first.
 *
 *  Returns `{ state, signals, considered }`. `considered` is the denominator: how many missions
 *  were looked at to produce this many signals. A feed of 2 signals means something very different
 *  from 2 missions than from 200, and the caller should be able to say which without guessing.
 *
 *  An empty input returns state 'unavailable', NOT an empty success. "No missions were provided"
 *  and "your missions produced no signals" are different answers, and only the second one means
 *  the workspace is quiet. */
export function deriveSignals(missions) {
    if (!Array.isArray(missions)) {
        return { state: 'unavailable', reason: 'no mission records supplied', signals: [], considered: 0 };
    }
    const seen = new Set();
    const signals = [];
    for (const mission of missions) {
        const signal = deriveMissionSignal(mission);
        if (!signal || seen.has(signal.key)) continue;
        seen.add(signal.key);
        signals.push(signal);
    }
    signals.sort((a, b) => {
        const bySeverity = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
        // Ties break on key so the order is total and stable. Two runs over the same input must
        // produce the same array, or a diff of the feed is meaningless.
        return bySeverity !== 0 ? bySeverity : a.key.localeCompare(b.key);
    });
    return { state: 'available', signals, considered: missions.length };
}

/** What the front-page "SIGNALS TODAY" tile should show.
 *
 *  Counts only what a person still has to act on. An acknowledged or dismissed signal is not
 *  pending, and counting it would make the tile grow forever and mean nothing. */
export function pendingCount(signals) {
    if (!Array.isArray(signals)) return null;   // null is "unmeasured", never 0
    return signals.filter((s) => String(s?.state ?? 'new') === 'new').length;
}

export const SIGNAL_DERIVATION_SOURCES = Object.freeze(['missions']);
