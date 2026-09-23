// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/__tests__/careerProfile.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-CAREER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CAREER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/careerProfile.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/lib/careerProfile.js
// DAG Node:    none
// Intent:      Prove the browser accepts a career profile only for the signed-in account and in the expected shape.
// ───────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { createCareerProfileClient } from '@/lib/careerProfile';

const PROFILE = Object.freeze({
    person_id: 'human.test', as_of: '2026-09-23T00:00:00+00:00', digest: `sha256:${'a'.repeat(64)}`,
    capabilities: [{ capability_id: 'python', label: 'Python', claim_verb: 'Passed an assessment in', claim_participation: 'ASSESSED',
        state: 'VERIFIED', verified: true, records: 1, participation_counts: { ASSESSED: 1 },
        first_seen: '2026-09-03', last_seen: '2026-09-03', confidence: 0.63 }],
    sources: [{ kind: 'git', authored: 2 }], limits: [], card: '# Career Passport',
});
const ready = (subject = 'u1', profile = PROFILE) => ({ state: 'ready', subject_id: subject, issued_at: '2026-09-23T00:00:00Z', profile });
const client = (send, id = 'u1') => ({ authStore: { record: { id } }, send });

describe('createCareerProfileClient', () => {
    it('requests the profile with no-store and returns it for the current account', async () => {
        const send = vi.fn().mockResolvedValue(ready());
        const result = await createCareerProfileClient({ client: client(send), accountId: 'u1', isCurrent: () => true }).load();
        expect(result).toEqual({ ok: true, state: 'ready', profile: PROFILE, issuedAt: '2026-09-23T00:00:00Z' });
        expect(send).toHaveBeenCalledWith('/api/buildanddo/career/profile', { method: 'GET', requestKey: null, cache: 'no-store' });
    });

    it('passes through not_configured and no_profile without a profile', async () => {
        for (const state of ['not_configured', 'no_profile']) {
            const send = vi.fn().mockResolvedValue({ state, subject_id: 'u1' });
            const result = await createCareerProfileClient({ client: client(send), accountId: 'u1', isCurrent: () => true }).load();
            expect(result).toEqual({ ok: true, state, profile: null, issuedAt: '' });
        }
    });

    it('rejects another account, malformed profiles and errors', async () => {
        const bad = [ready('u2'), { state: 'weird', subject_id: 'u1' }, ready('u1', { ...PROFILE, digest: 'x' }),
            ready('u1', { ...PROFILE, capabilities: [{ ...PROFILE.capabilities[0], verified: false }] }),
            { ...ready(), issued_at: 5 }];
        for (const body of bad) {
            const send = vi.fn().mockResolvedValue(body);
            expect(await createCareerProfileClient({ client: client(send), accountId: 'u1', isCurrent: () => true }).load())
                .toEqual({ ok: false, reason: 'unavailable' });
        }
        const denied = vi.fn().mockRejectedValue({ status: 401 });
        expect((await createCareerProfileClient({ client: client(denied), accountId: 'u1', isCurrent: () => true }).load()).reason).toBe('forbidden');
        const down = vi.fn().mockRejectedValue(new Error('offline'));
        expect((await createCareerProfileClient({ client: client(down), accountId: 'u1', isCurrent: () => true }).load()).reason).toBe('unavailable');
    });

    it('drops the result when the account changes or no one is signed in', async () => {
        let current = true;
        const send = vi.fn().mockImplementation(async () => { current = false; return ready(); });
        expect(await createCareerProfileClient({ client: client(send), accountId: 'u1', isCurrent: () => current }).load())
            .toEqual({ ok: false, reason: 'scope_changed' });
        const failing = vi.fn().mockImplementation(async () => { current = false; throw new Error('late'); });
        current = true;
        expect((await createCareerProfileClient({ client: client(failing), accountId: 'u1', isCurrent: () => current }).load()).reason)
            .toBe('scope_changed');
        const never = vi.fn();
        expect((await createCareerProfileClient({ client: client(never, 'u2'), accountId: 'u1', isCurrent: () => true }).load()).reason)
            .toBe('scope_changed');
        expect(never).not.toHaveBeenCalled();
    });
});
