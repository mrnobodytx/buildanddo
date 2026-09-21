// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/signalSync.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-20
// Depends:     apps/web/src/lib/signalSync.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/signalSync.js
// Intent:      Prove the sync cannot double-write, cannot resurrect a dismissed signal, and refuses
//              to plan against a feed it could not read.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';

import { applySignalSync, existingKeys, planSignalSync, toRecord } from '../signalSync';

const mission = (over = {}) => ({ id: 'm1', title: 'Ship the edition', status: 'failed', ...over });

describe('signal sync planning', () => {
    it('plans a create for a derived signal that has no row yet', () => {
        const plan = planSignalSync([mission()], []);
        expect(plan.state).toBe('available');
        expect(plan.create).toHaveLength(1);
        expect(plan.create[0].key).toBe('mission:m1:failed');
        expect(plan.present).toEqual([]);
    });

    it('DOES NOT double-write: a second sync over the same input plans nothing', () => {
        // The database cannot stop this - `signals` has no unique index - so the guard is here.
        const first = planSignalSync([mission()], []);
        const persisted = first.create.map((s) => ({ source: s.source, state: 'new' }));
        const second = planSignalSync([mission()], persisted);
        expect(second.create).toEqual([]);
        expect(second.present).toEqual(['mission:m1:failed']);
    });

    it('never resurrects a signal the person acknowledged or dismissed', () => {
        // Their triage decision outranks our derivation. A sync that undoes a dismissal is one
        // nobody will leave switched on.
        for (const state of ['acknowledged', 'dismissed']) {
            const persisted = [{ source: 'mission:m1:failed', state }];
            expect(planSignalSync([mission()], persisted).create).toEqual([]);
        }
    });

    it('treats a later state as genuinely new, because it is a different fact', () => {
        const persisted = [{ source: 'mission:m1:needs_attention', state: 'acknowledged' }];
        const plan = planSignalSync([mission({ status: 'failed' })], persisted);
        expect(plan.create.map((s) => s.key)).toEqual(['mission:m1:failed']);
    });

    it('REFUSES to plan when the existing feed was not loaded', () => {
        // THE CONTROL that matters most. An unread feed looks identical to an empty one, and
        // planning against it would insert every signal a second time.
        const plan = planSignalSync([mission()], null);
        expect(plan.state).toBe('unavailable');
        expect(plan.create).toEqual([]);
        expect(plan.reason).toContain('unread');
        // ...whereas a genuinely empty feed is a real reading and DOES plan writes.
        expect(planSignalSync([mission()], []).state).toBe('available');
    });

    it('is unavailable when the missions themselves could not be read', () => {
        expect(planSignalSync(null, []).state).toBe('unavailable');
    });

    it('reads keys only from a persisted source, ignoring rows without one', () => {
        expect(existingKeys([{ source: 'a' }, { source: '  ' }, {}, null])).toEqual(new Set(['a']));
        expect(existingKeys(undefined)).toEqual(new Set());
    });
});

describe('signal sync record shape', () => {
    it('omits workspace and owner so the hook supplies them', () => {
        // A stale client must not be able to name a workspace the person has since left.
        const record = toRecord({ key: 'k', source: 'k', title: 't', type: 'fact', severity: 'high' });
        expect(record).not.toHaveProperty('workspace');
        expect(record).not.toHaveProperty('owner');
        expect(record).toMatchObject({ source: 'k', type: 'fact', severity: 'high', state: 'new' });
    });

    it('clamps to the column limits rather than letting the write be rejected', () => {
        const record = toRecord({ key: 'k', source: 'k', title: 'x'.repeat(500),
            description: 'y'.repeat(2000), type: 'fact', severity: 'info' });
        expect(record.title).toHaveLength(200);
        expect(record.description).toHaveLength(1000);
    });
});

describe('applying a sync', () => {
    it('writes each planned signal once and reports the count', async () => {
        const create = vi.fn().mockResolvedValue({});
        const plan = planSignalSync([mission(), mission({ id: 'm2', status: 'needs_attention' })], []);
        const result = await applySignalSync(plan, create);
        expect(create).toHaveBeenCalledTimes(2);
        expect(result).toMatchObject({ state: 'available', written: 2, failed: [] });
    });

    it('COLLECTS failures instead of abandoning the rest', async () => {
        // One rejected row must not lose the others, and the caller has to be able to say
        // "1 of 2 written" rather than surface an exception.
        const create = vi.fn()
            .mockRejectedValueOnce(new Error('rate limited'))
            .mockResolvedValueOnce({});
        const plan = planSignalSync([mission(), mission({ id: 'm2', status: 'needs_attention' })], []);
        const result = await applySignalSync(plan, create);
        expect(result.written).toBe(1);
        expect(result.failed).toHaveLength(1);
        expect(result.failed[0].reason).toContain('rate limited');
    });

    it('writes nothing when the plan is unavailable', async () => {
        const create = vi.fn();
        const result = await applySignalSync(planSignalSync([mission()], null), create);
        expect(create).not.toHaveBeenCalled();
        expect(result).toMatchObject({ state: 'unavailable', written: 0 });
    });

    it('writes nothing when no create function is supplied', async () => {
        const result = await applySignalSync(planSignalSync([mission()], []), undefined);
        expect(result).toMatchObject({ state: 'unavailable', written: 0 });
    });
});
