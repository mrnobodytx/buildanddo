// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/lib/observability/__tests__/mutations.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/lib/observability/mutations.js
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/lib/observability/mutations.js
// DAG Node:    none
// Intent:      Verify one outcome and duration per real mutation without content leakage or changed errors.
// ───────────────────────────────────────────────────────────────

import { afterEach, describe, expect, it, vi } from 'vitest';
import { observeMutation, workspaceCollection } from '@/lib/observability/mutations';
import { reportAction, reportMetric } from '@/lib/observability/runtime';
import { trackEvent } from '@/lib/telemetry';
import pb from '@/lib/pocketbaseClient';

vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    return { default: createMockPocketBase() };
});
afterEach(() => {
    vi.restoreAllMocks();
    reportAction.mockReset();
    reportMetric.mockReset();
    trackEvent.mockReset();
    pb.__reset();
    window.history.replaceState(null, '', '/');
});

describe('workspace mutation telemetry', () => {
    it('attributes challenge intake without sending the submitted problem', async () => {
        await observeMutation('challenge_submissions', 'create', async () => ({
            id: 'receipt', problem: 'Private customer detail',
        }));
        expect(reportAction).toHaveBeenCalledWith('workspace.challenge.create', {
            collection: 'challenge_submissions', operation: 'create', outcome: 'success',
            reason: 'confirmed', status_class: 'unknown', section: expect.any(String),
        });
        expect(JSON.stringify(reportAction.mock.calls)).not.toContain('Private customer detail');
        expect(JSON.stringify(reportMetric.mock.calls)).not.toContain('Private customer detail');
    });
    it.each(['create', 'update', 'delete'])(
        'reports one %s outcome after the real operation settles',
        async (verb) => {
            let finish;
            const operation = vi.fn(
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    }),
            );
            vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(142);
            const pending = observeMutation('missions', verb, operation);
            expect(reportAction).not.toHaveBeenCalled();
            const record = { id: 'record', title: 'Private record contents' };
            finish(record);
            expect(await pending).toBe(record);
            expect(operation).toHaveBeenCalledTimes(1);
            expect(reportAction).toHaveBeenCalledTimes(1);
            expect(reportAction).toHaveBeenCalledWith(`workspace.mission.${verb}`, {
                collection: 'missions',
                operation: verb,
                outcome: 'success',
                reason: 'confirmed', status_class: 'unknown', section: expect.any(String),
            });
            expect(reportMetric).toHaveBeenCalledWith(
                'workspace.mutation.duration',
                42,
                expect.objectContaining({
                    unit: 'millisecond',
                    tags: expect.objectContaining({ outcome: 'success' }),
                }),
            );
            expect(JSON.stringify(reportAction.mock.calls)).not.toContain(record.title);
            expect(trackEvent).toHaveBeenCalledTimes(1);
        },
    );

    it('retains the original rejection without claiming an unknown write was confirmed', async () => {
        const failure = new Error('write rejected');
        await expect(
            observeMutation('signals', 'update', () => Promise.reject(failure)),
        ).rejects.toBe(failure);
        expect(reportAction).toHaveBeenCalledWith(
            'workspace.signal.update',
            expect.objectContaining({ outcome: 'uncertain', reason: 'unconfirmed' }),
        );
        expect(reportMetric).toHaveBeenCalledTimes(1);
    });

    it.each([
        [{ ok: false, reason: 'uncertain' }, 'uncertain'],
        [{ ok: false, reason: 'upload_uncertain' }, 'uncertain'],
        [{ ok: false, reason: 'invalid_receipt' }, 'uncertain'],
        [{ ok: false, reason: 'conflict' }, 'conflict'],
        [{ ok: false, reason: 'forbidden', uncertain: true }, 'forbidden'],
        [{ ok: false, reason: 'scope_changed' }, 'scope_changed'],
        [{ ok: false, stale: true }, 'scope_changed'],
        [{ ok: false, reason: 'cancelled' }, 'cancelled'],
        [{ ok: false, reason: 'invalid' }, 'failure'],
        [{ ok: false, reason: 'unavailable' }, 'failure'],
        [{ ok: false, reason: 'busy' }, 'failure'],
        [{ ok: false, reason: 'write_failed' }, 'failure'],
        [{ ok: false, reason: 'Private response detail' }, 'failure'],
        [{ ok: true, stale: true }, 'success'],
    ])('classifies structured result %j without changing it', async (result, outcome) => {
        expect(await observeMutation('missions', 'create', () => result)).toBe(result);
        expect(reportAction).toHaveBeenCalledWith('workspace.mission.create', expect.objectContaining({ outcome }));
        expect(JSON.stringify(reportAction.mock.calls)).not.toContain('Private response detail');
    });

    it.each([
        [401, 'forbidden', '4xx'], [403, 'forbidden', '4xx'], [409, 'conflict', '4xx'],
        [0, 'uncertain', 'network'], [503, 'uncertain', '5xx'], [400, 'failure', '4xx'], [429, 'failure', '4xx'],
    ])('classifies HTTP status %s without exporting its error message', async (status, outcome, status_class) => {
        const error = Object.assign(new Error('Private response detail'), { status });
        await expect(observeMutation('missions', 'update', () => { throw error; })).rejects.toBe(error);
        expect(reportAction).toHaveBeenCalledWith('workspace.mission.update', expect.objectContaining({ outcome, status_class }));
        expect(JSON.stringify(reportAction.mock.calls)).not.toContain(error.message);
    });

    it.each(['unavailable', 'pending', 'ready'])('keeps a %s chat receipt distinct from inference success', async (status) => {
        const result = { ok: true, data: { status, message: 'Private response detail' } };
        expect(await observeMutation('assistant_sessions', 'chat', () => result)).toBe(result);
        expect(reportAction).toHaveBeenCalledWith('workspace.assistant.chat', expect.objectContaining({
            outcome: status === 'ready' ? 'success' : status === 'pending' ? 'uncertain' : 'failure',
        }));
        expect(JSON.stringify(trackEvent.mock.calls)).not.toContain(result.data.message);
    });

    it('freezes a canonical starting section instead of a later route or private room identifier', async () => {
        window.history.replaceState(null, '', '/app/classrooms/private-room?content=private');
        let finish;
        const result = observeMutation('classroom_rooms', 'update', () => new Promise((resolve) => { finish = resolve; }));
        window.history.replaceState(null, '', '/app/career'); finish({ ok: true }); await result;
        expect(reportAction.mock.calls[0][1].section).toBe('/app/classrooms/:room');
        expect(JSON.stringify([reportAction.mock.calls, trackEvent.mock.calls, reportMetric.mock.calls])).not.toContain('private');
    });

    it('handles aborts, opaque result access and missing timing without changing application outcomes', async () => {
        vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('Missing clock'); });
        const error = Object.assign(new Error('Cancelled'), { isAbort: true, status: 0 });
        await expect(observeMutation('missions', 'create', () => Promise.reject(error))).rejects.toBe(error);
        expect(reportAction.mock.calls[0][1].outcome).toBe('cancelled');
        const result = Object.defineProperty({}, 'ok', { get() { throw new Error('Private result'); } });
        expect(await observeMutation('missions', 'create', () => result)).toBe(result);
        expect(reportAction.mock.calls[1][1].outcome).toBe('uncertain');
        expect(trackEvent).toHaveBeenCalledTimes(2); expect(reportMetric).not.toHaveBeenCalled();
    });

    it('isolates independent telemetry failures from successful and failed writes', async () => {
        reportAction.mockImplementation(() => {
            throw new Error('collector');
        });
        reportMetric.mockImplementation(() => {
            throw new Error('metric collector');
        });
        trackEvent.mockImplementation(() => {
            throw new Error('analytics');
        });
        await expect(
            observeMutation('domains', 'update', () => Promise.resolve('saved')),
        ).resolves.toBe('saved');
        const failure = new Error('original rejection');
        await expect(
            observeMutation('domains', 'update', () => Promise.reject(failure)),
        ).rejects.toBe(failure);
    });

    it('handles rejected sink promises without retrying a completed operation', async () => {
        for (const sink of [reportAction, trackEvent, reportMetric]) sink.mockRejectedValue(new Error('Unavailable sink'));
        const operation = vi.fn(async () => ({ ok: true }));
        expect((await observeMutation('missions', 'create', operation)).ok).toBe(true);
        await Promise.resolve();
        expect(operation).toHaveBeenCalledTimes(1);
        for (const sink of [reportAction, trackEvent, reportMetric]) expect(sink).toHaveBeenCalledTimes(1);
    });

    it('measures operation time before either action collector runs', async () => {
        let time = 0;
        vi.spyOn(performance, 'now').mockImplementation(() => time);
        reportAction.mockImplementation(() => { time = 5000; });
        await observeMutation('missions', 'create', () => { time = 42; return { ok: true }; });
        expect(reportMetric).toHaveBeenCalledWith('workspace.mutation.duration', 42, expect.any(Object));
    });

    it('keeps unsupported names out of the action vocabulary', async () => {
        await expect(
            observeMutation('private-record-id', 'create', () => Promise.resolve('ok')),
        ).resolves.toBe('ok');
        await expect(
            observeMutation('missions', 'invented', () => Promise.resolve('ok')),
        ).resolves.toBe('ok');
        for (const [collection, verb] of [['__proto__', 'toString'], ['missions', 'constructor'], ['constructor', 'create']])
            expect(await observeMutation(collection, verb, () => 'ok')).toBe('ok');
        expect(reportAction).not.toHaveBeenCalled();
        expect(reportMetric).not.toHaveBeenCalled();
    });

    it.each([
        ['domains', 'domain'],
        ['services', 'service'],
    ])(
        'instruments direct %s writes with their original arguments and result',
        async (collection, entity) => {
            const client = workspaceCollection(collection);
            const record = await client.create({ domain: 'example.com' });
            expect(pb.collection(collection).create).toHaveBeenCalledWith({
                domain: 'example.com',
            });
            await client.update(record.id, { status: 'verified' });
            await client.delete(record.id);
            expect(reportAction.mock.calls.map(([name]) => name)).toEqual([
                `workspace.${entity}.create`,
                `workspace.${entity}.update`,
                `workspace.${entity}.delete`,
            ]);
        },
    );
});
