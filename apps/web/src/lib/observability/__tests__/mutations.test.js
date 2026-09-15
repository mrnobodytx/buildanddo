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
});

describe('workspace mutation telemetry', () => {
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

    it('retains the original rejection and measures its failed outcome', async () => {
        const failure = new Error('write rejected');
        await expect(
            observeMutation('signals', 'update', () => Promise.reject(failure)),
        ).rejects.toBe(failure);
        expect(reportAction).toHaveBeenCalledWith(
            'workspace.signal.update',
            expect.objectContaining({ outcome: 'failure' }),
        );
        expect(reportMetric).toHaveBeenCalledTimes(1);
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

    it('keeps unsupported names out of the action vocabulary', async () => {
        await expect(
            observeMutation('private-record-id', 'create', () => Promise.resolve('ok')),
        ).resolves.toBe('ok');
        await expect(
            observeMutation('missions', 'invented', () => Promise.resolve('ok')),
        ).resolves.toBe('ok');
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
