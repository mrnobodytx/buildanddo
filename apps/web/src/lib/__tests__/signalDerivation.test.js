// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/signalDerivation.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/lib/signalDerivation.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/signalDerivation.js
// Intent:      Hold the derivation to its contract: idempotent keys, no invented severity, and
//              absence that reads as unmeasured rather than as calm.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';

import {
    deriveMissionSignal,
    deriveSignals,
    pendingCount,
    signalKey,
} from '../signalDerivation';

const mission = (over = {}) => ({ id: 'm1', title: 'Ship the edition', status: 'failed', ...over });

describe('signal derivation', () => {
    it('turns a failed mission into a fact signal that points back at its source', () => {
        const signal = deriveMissionSignal(mission());
        expect(signal).toMatchObject({
            key: 'mission:m1:failed',
            type: 'fact',
            severity: 'high',
            state: 'new',
            source: 'mission:m1:failed',
            observed_status: 'failed',
        });
        // source must equal the key: it is the only persisted field a later sync can dedupe on.
        expect(signal.source).toBe(signal.key);
        expect(signal.title).toContain('Ship the edition');
    });

    it('is IDEMPOTENT: the same mission derives the same key every time', () => {
        // The whole point of the key. Without this, every refresh appends a near-duplicate until
        // the feed is unreadable - the exact problem the triage schema was added to solve.
        const a = deriveMissionSignal(mission());
        const b = deriveMissionSignal(mission());
        expect(a.key).toBe(b.key);
        expect(deriveSignals([mission(), mission(), mission()]).signals).toHaveLength(1);
    });

    it('treats a later state as a DIFFERENT signal, not an overwrite', () => {
        // A mission that waited and then failed is two facts. Collapsing them would erase that it
        // was waiting first, which is usually the more useful half.
        expect(signalKey(mission({ status: 'needs_attention' })))
            .not.toBe(signalKey(mission({ status: 'failed' })));
    });

    it('emits NOTHING for states that are merely progress', () => {
        for (const status of ['proposed', 'approved', 'running']) {
            expect(deriveMissionSignal(mission({ status }))).toBeNull();
        }
    });

    it('refuses to invent a severity for a state it does not know', () => {
        // A guessed severity is worse than no signal: it looks like a measurement.
        expect(deriveMissionSignal(mission({ status: 'teleported' }))).toBeNull();
    });

    it('never drops an untitled mission silently', () => {
        // Dropping it would hide a failure. It gets named for what it is instead.
        const signal = deriveMissionSignal(mission({ title: '' }));
        expect(signal).not.toBeNull();
        expect(signal.title).toBe('An untitled mission stopped without completing');
    });

    it('sorts by severity and breaks ties stably, so two runs agree', () => {
        const input = [
            mission({ id: 'b', status: 'verified' }),
            mission({ id: 'a', status: 'failed' }),
            mission({ id: 'c', status: 'needs_attention' }),
            mission({ id: 'a2', status: 'failed' }),
        ];
        const first = deriveSignals(input).signals.map((s) => s.key);
        const again = deriveSignals([...input].reverse()).signals.map((s) => s.key);
        expect(first).toEqual(['mission:a:failed', 'mission:a2:failed',
            'mission:c:needs_attention', 'mission:b:verified']);
        expect(again).toEqual(first);   // order of the input must not change the output
    });

    it('reports the denominator, because 2 signals from 2 missions is not 2 from 200', () => {
        const out = deriveSignals([mission(), mission({ id: 'm2', status: 'running' })]);
        expect(out).toMatchObject({ state: 'available', considered: 2 });
        expect(out.signals).toHaveLength(1);
    });

    it('distinguishes "no records supplied" from "records produced nothing"', () => {
        // THE CONTROL. Absence must not render as calm - that is the failure this estate keeps
        // rediscovering. No input is unavailable; input that yields nothing is available-and-quiet.
        // null/undefined = nothing was supplied, or the fetch failed -> UNAVAILABLE.
        expect(deriveSignals(null)).toMatchObject({ state: 'unavailable', signals: [] });
        expect(deriveSignals(undefined).state).toBe('unavailable');
        // [] = the fetch SUCCEEDED and the workspace has no missions -> AVAILABLE and genuinely
        // quiet. Calling this unavailable would be the mirror error: reporting a real measurement
        // as a failure to measure.
        expect(deriveSignals([])).toMatchObject({ state: 'available', considered: 0, signals: [] });
        expect(deriveSignals([mission({ status: 'running' })]))
            .toMatchObject({ state: 'available', considered: 1, signals: [] });
    });

    it('counts only what still needs acting on, and returns null when unmeasured', () => {
        expect(pendingCount(null)).toBeNull();          // null, never 0
        expect(pendingCount([])).toBe(0);
        expect(pendingCount([{ state: 'new' }, { state: 'acknowledged' }, { state: 'dismissed' }]))
            .toBe(1);
        expect(pendingCount([{}])).toBe(1);             // absent state defaults to new
    });
});
