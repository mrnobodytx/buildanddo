// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/useWorkspaceRecords.test.js
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/hooks/useWorkspaceRecords.js,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useWorkspaceRecords.js;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Prove the read path every workspace page depends on: workspace
//              scoping, error surfacing and loading transitions.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import { useRecords, useWorkspaceRecords } from '@/hooks/useWorkspaceRecords';
import {
    createMockMission,
    createMockWorkspace,
    mockPocketBaseError,
    workspaceWrapper,
} from '@/test/utils';

describe('useWorkspaceRecords', () => {
    beforeEach(() => {
        pb.__reset();
    });

    it('returns the active workspace records once loading settles', async () => {
        const missions = [
            createMockMission({ title: 'Reduce no-shows' }),
            createMockMission({ title: 'Chase unpaid invoices' }),
        ];
        pb.__setRecords('missions', missions);

        const { result } = renderHook(() => useWorkspaceRecords('missions'), {
            wrapper: workspaceWrapper(),
        });

        expect(result.current.loading).toBe(true);

        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.records.map((r) => r.title)).toEqual([
            'Reduce no-shows',
            'Chase unpaid invoices',
        ]);
        expect(result.current.error).toBe('');
    });

    it('scopes the query to the active workspace id', async () => {
        pb.__setRecords('signals', [createMockMission()]);

        const { result } = renderHook(() => useWorkspaceRecords('signals'), {
            wrapper: workspaceWrapper({
                active: createMockWorkspace({ id: 'ws_other' }),
            }),
        });

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(pb.filter).toHaveBeenCalledWith('workspace = {:ws}', { ws: 'ws_other' });
        expect(pb.__collection('signals').getFullList).toHaveBeenCalledWith(
            expect.objectContaining({ filter: 'workspace = "ws_other"' }),
        );
    });

    it('forwards sort and expand options to PocketBase', async () => {
        pb.__setRecords('evidence', []);

        const { result } = renderHook(
            () => useWorkspaceRecords('evidence', { sort: 'created', expand: 'mission' }),
            { wrapper: workspaceWrapper() },
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(pb.__collection('evidence').getFullList).toHaveBeenCalledWith(
            expect.objectContaining({ sort: 'created', expand: 'mission' }),
        );
    });

    it('ands an extra filter onto the workspace scope', async () => {
        pb.__setRecords('evidence', []);

        const { result } = renderHook(
            () => useWorkspaceRecords('evidence', { extraFilter: 'type = "verified"' }),
            { wrapper: workspaceWrapper() },
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(pb.__collection('evidence').getFullList).toHaveBeenCalledWith(
            expect.objectContaining({
                filter: 'workspace = "ws_test" && type = "verified"',
            }),
        );
    });

    it('surfaces a readable error and drops stale records when the request fails', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        pb.__setError('missions', mockPocketBaseError('Something went wrong.', 500));

        const { result } = renderHook(() => useWorkspaceRecords('missions'), {
            wrapper: workspaceWrapper(),
        });

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toMatch(/^Could not load this data right now\./);
        expect(result.current.records).toEqual([]);
        expect(consoleError).toHaveBeenCalled();
    });

    it('does not query at all when no workspace is active', async () => {
        const { result } = renderHook(() => useWorkspaceRecords('missions'), {
            wrapper: workspaceWrapper({ active: null }),
        });

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.records).toEqual([]);
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('does not query while disabled', async () => {
        pb.__setRecords('missions', [createMockMission()]);

        const { result } = renderHook(
            () => useWorkspaceRecords('missions', { enabled: false }),
            { wrapper: workspaceWrapper() },
        );

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.records).toEqual([]);
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('refresh picks up records created after the first load', async () => {
        pb.__setRecords('missions', [createMockMission({ title: 'First' })]);

        const { result } = renderHook(() => useWorkspaceRecords('missions'), {
            wrapper: workspaceWrapper(),
        });

        await waitFor(() => expect(result.current.records).toHaveLength(1));

        pb.__setRecords('missions', [
            createMockMission({ title: 'Second' }),
            createMockMission({ title: 'First' }),
        ]);
        result.current.refresh();

        await waitFor(() => expect(result.current.records).toHaveLength(2));
        expect(result.current.records[0].title).toBe('Second');
    });

    it('recovers after a failing collection starts succeeding again', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        pb.__setError('missions');

        const { result } = renderHook(() => useWorkspaceRecords('missions'), {
            wrapper: workspaceWrapper(),
        });

        await waitFor(() => expect(result.current.error).not.toBe(''));

        pb.__clearError('missions');
        pb.__setRecords('missions', [createMockMission({ title: 'Recovered' })]);
        result.current.refresh();

        await waitFor(() => expect(result.current.error).toBe(''));
        expect(result.current.records[0].title).toBe('Recovered');
    });
});

describe('useRecords', () => {
    beforeEach(() => {
        pb.__reset();
    });

    it('loads a shared collection without workspace scoping', async () => {
        pb.__setRecords('tutorials', [{ id: 'tut_1', title: 'The verify loop' }]);

        const { result } = renderHook(() => useRecords('tutorials'), {
            wrapper: workspaceWrapper(),
        });

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.records).toHaveLength(1);
        expect(pb.filter).not.toHaveBeenCalled();

        const [queryOptions] = pb.__collection('tutorials').getFullList.mock.calls[0];
        expect(queryOptions.filter).toBeUndefined();
    });

    it('reports load failures the same way as the scoped hook', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        pb.__setError('tutorials');

        const { result } = renderHook(() => useRecords('tutorials'), {
            wrapper: workspaceWrapper(),
        });

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.error).toMatch(/^Could not load this data right now\./);
    });
});
