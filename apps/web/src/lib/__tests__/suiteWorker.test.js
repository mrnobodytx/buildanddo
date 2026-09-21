// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/suiteWorker.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/lib/suiteWorker.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/suiteWorker.js
// Intent:      Hold the worker to the server's own preconditions, so it never claims work it
//              cannot complete and never burns an attempt it cannot bank.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';

import {
    LEASE_MS,
    MAX_ATTEMPTS,
    claimable,
    exhausted,
    leaseExpired,
    leaseRemaining,
    planCompletion,
    selectClaimable,
    shouldAbandon,
} from '../suiteWorker';

const NOW = Date.parse('2026-09-20T12:00:00.000Z');
const at = (offsetMs) => new Date(NOW + offsetMs).toISOString();
const run = (over = {}) => ({ id: 'r1', status: 'queued', attempt: 0, created: '2026-09-20 11:00:00.000Z', ...over });

describe('claim eligibility mirrors the server', () => {
    it('claims a queued run', () => {
        expect(claimable(run(), NOW, 'r1').ok).toBe(true);
    });

    it('refuses a status the server will not accept', () => {
        for (const status of ['ready', 'failed', 'blocked', '']) {
            expect(claimable(run({ status }), NOW, 'r1').ok).toBe(false);
        }
    });

    it('refuses a processing run whose lease is still LIVE', () => {
        // Claiming a live lease hands the same work to two workers, and the second loses at
        // `complete` anyway - after burning an attempt.
        const held = run({ status: 'processing', lease_until: at(30000) });
        const verdict = claimable(held, NOW, 'r1');
        expect(verdict.ok).toBe(false);
        expect(verdict.reason).toContain('live lease');
    });

    it('DOES claim a processing run once the lease has lapsed', () => {
        // This is the recovery path for a worker that died mid-run.
        expect(claimable(run({ status: 'processing', lease_until: at(-1) }), NOW, 'r1').ok).toBe(true);
    });

    it('refuses at the attempt cap', () => {
        expect(claimable(run({ attempt: MAX_ATTEMPTS }), NOW, 'r1').ok).toBe(false);
        expect(claimable(run({ attempt: MAX_ATTEMPTS - 1 }), NOW, 'r1').ok).toBe(true);
    });

    it('refuses a run the control has not made active', () => {
        // Asking anyway is a wasted round trip that still risks an attempt.
        expect(claimable(run({ id: 'other' }), NOW, 'r1').ok).toBe(false);
    });

    it('always explains itself, so an idle queue is diagnosable', () => {
        expect(claimable(run({ status: 'ready' }), NOW, 'r1').reason).toBeTruthy();
    });
});

describe('lease arithmetic', () => {
    it('parses the space-separated timestamp the server stores', () => {
        // The hook itself normalises ' ' to 'T'; a worker that does not gets NaN and treats every
        // lease as expired, which is the worst possible direction to be wrong in.
        expect(leaseExpired({ lease_until: '2026-09-20 12:00:30.000Z' }, NOW)).toBe(false);
        expect(leaseExpired({ lease_until: '2026-09-20 11:59:30.000Z' }, NOW)).toBe(true);
    });

    it('treats a missing lease as expired', () => {
        expect(leaseExpired({}, NOW)).toBe(true);
        expect(leaseExpired({ lease_until: 'not a date' }, NOW)).toBe(true);
    });

    it('stops before the lease runs out rather than after', () => {
        // Work finished at second 121 of a 120s lease is work thrown away AND an attempt spent.
        expect(shouldAbandon({ lease_until: at(30000) }, NOW)).toBe(false);
        expect(shouldAbandon({ lease_until: at(3000) }, NOW)).toBe(true);
        expect(leaseRemaining({ lease_until: at(LEASE_MS) }, NOW)).toBe(LEASE_MS);
        expect(leaseRemaining({ lease_until: at(-5000) }, NOW)).toBe(0);
    });
});

describe('selection', () => {
    it('drains oldest-first so nothing starves', () => {
        const picked = selectClaimable([
            run({ id: 'new', created: '2026-09-20 11:30:00.000Z' }),
            run({ id: 'old', created: '2026-09-20 10:00:00.000Z' }),
        ], NOW, null);
        expect(picked.run.id).toBe('old');
        expect(picked.eligible).toBe(2);
    });

    it('returns null WITH reasons when a full queue yields nothing', () => {
        const picked = selectClaimable([
            run({ id: 'a', status: 'ready' }),
            run({ id: 'b', attempt: MAX_ATTEMPTS }),
        ], NOW, null);
        expect(picked.run).toBeNull();
        expect(picked.reasons).toHaveLength(2);
        expect(picked.reasons.join(' ')).toContain('attempt cap');
    });

    it('distinguishes an unread queue from an empty one', () => {
        expect(selectClaimable(null, NOW, null).state).toBe('unavailable');
        expect(selectClaimable([], NOW, null).state).toBe('available');
    });
});

describe('completion payload', () => {
    const claimed = { id: 'r1', attempt: 1, source_sha256: 'abc123' };

    it('submits the POST-claim attempt, which is the only value the server accepts', () => {
        // Using the pre-claim attempt is the easiest mistake here and is rejected every time.
        const plan = planCompletion(claimed, { result_canonical: '{"ok":true}' });
        expect(plan.ok).toBe(true);
        expect(plan.payload).toMatchObject({ id: 'r1', attempt: 1, source_sha256: 'abc123' });
    });

    it('refuses without an attempt or a source binding', () => {
        expect(planCompletion({ id: 'r1', source_sha256: 'abc' }, {}).ok).toBe(false);
        expect(planCompletion({ id: 'r1', attempt: 1 }, {}).ok).toBe(false);
        expect(planCompletion({ id: 'r1', attempt: 1, source_sha256: '  ' }, {}).reason)
            .toContain('binding');
    });

    it('never sends a result AND a failure together', () => {
        // The server reads `failure` to choose between failed and ready, so sending both would
        // record a success that carries a reason it failed.
        const plan = planCompletion(claimed, { result_canonical: '{"ok":true}', failure: 'timeout' });
        expect(plan.payload.failure).toBe('timeout');
        expect(plan.payload.result_canonical).toBe('');
    });
});

describe('stuck work is not idle work', () => {
    it('reports runs that exhausted their attempts', () => {
        // A queue that is stuck must not read the same as a queue that is empty.
        const stuck = exhausted([
            run({ id: 'a', attempt: MAX_ATTEMPTS, status: 'processing' }),
            run({ id: 'b', attempt: MAX_ATTEMPTS, status: 'ready' }),
            run({ id: 'c', attempt: 1 }),
        ]);
        expect(stuck.map((r) => r.id)).toEqual(['a']);
        expect(exhausted(null)).toEqual([]);
    });
});
