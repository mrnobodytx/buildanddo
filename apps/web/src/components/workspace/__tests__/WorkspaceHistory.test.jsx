// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/WorkspaceHistory.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/usePreviousWork.js, apps/web/src/components/workspace/PreviousWorkNote.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/usePreviousWork.js; VALIDATES apps/web/src/components/workspace/PreviousWorkNote.jsx
// DAG Node:    none
// Intent:      Verify that receipt history is visible, unavailable history is actionable, and private results cannot cross workspace, account or demo boundaries.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PreviousWorkNote from '@/components/workspace/PreviousWorkNote';
import { usePreviousWork } from '@/hooks/usePreviousWork';
import { lookupPreviousWorkBatch } from '@/lib/workHistory';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { createMockWorkspace, renderWithProviders, screen, setupUser, waitFor, workspaceWrapper } from '@/test/utils';

vi.mock('@/lib/workHistory', () => ({ lookupPreviousWorkBatch: vi.fn() }));
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const history = { hasHistory: true, partial: false, events: [], seats: [], prLinks: [], state: 'not_started',
    evidence: [{ id: 'receipt1' }], runs: [], sources: { evidence: 'complete' } };
beforeEach(() => { pb.__reset(); lookupPreviousWorkBatch.mockReset().mockResolvedValue({ mission1: history }); setDemoMode(false); });
afterEach(() => setDemoMode(false));

it('shows mission evidence and recorded workflow runs without implying a seat completed the work', () => {
    const view = renderWithProviders(<PreviousWorkNote history={history} />);
    expect(screen.getByText(/1 evidence record/)).toBeVisible();
    expect(screen.queryByText('Not started')).not.toBeInTheDocument();
    view.rerender(<PreviousWorkNote history={{ ...history, evidence: [], runs: [{ id: 'run1', status: 'completed' }] }} />);
    expect(screen.getByText(/1 recorded workflow run/)).toHaveTextContent('Latest run: Completed');
    expect(screen.queryByText('Not started')).not.toBeInTheDocument();
});

it('shows unavailable history even with no receipts and provides retry; a confirmed empty history stays hidden', async () => {
    const retry = vi.fn();
    const view = renderWithProviders(<PreviousWorkNote history={{ ...history, hasHistory: false, evidence: [], partial: true }} onRetry={retry} />);
    expect(screen.getByText(/History is incomplete/)).toBeVisible();
    await setupUser().click(screen.getByRole('button', { name: 'Retry history' }));
    expect(retry).toHaveBeenCalledTimes(1);
    view.rerender(<PreviousWorkNote history={{ ...history, hasHistory: false, evidence: [] }} />);
    expect(screen.queryByText('Previous work')).not.toBeInTheDocument();
});

it('keeps matching reported seat labels distinct by submitting account without a verified badge', () => {
    renderWithProviders(<PreviousWorkNote history={{ ...history, state: 'completed', events: [{ id: 'report1' }], seats: [
        { seat: 'Claimed agent', actorType: 'agent', owner: 'account1', lastEvent: 'completed', eventCount: 1 },
        { seat: 'Claimed agent', actorType: 'agent', owner: 'account2', lastEvent: 'progress', eventCount: 1 },
    ] }} />);
    expect(screen.getByText(/^reported$/i)).toBeVisible();
    expect(screen.getByText('Reported state: Completed')).toBeVisible();
    expect(screen.getByText(/submitting account: account1/)).toBeVisible();
    expect(screen.getByText(/submitting account: account2/)).toBeVisible();
    expect(screen.queryByText(/^verified$/i)).not.toBeInTheDocument();
});

it('clears loaded history immediately when the workspace changes and ignores an older refresh', async () => {
    const wrapper = workspaceWrapper();
    const { result, rerender } = renderHook(() => usePreviousWork('mission', ['mission1']), { wrapper });
    await waitFor(() => expect(result.current.history.mission1).toEqual(history));
    const old = deferred(); const next = deferred();
    lookupPreviousWorkBatch.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => next.promise);
    act(() => { result.current.refresh(); });
    wrapper.value.active = createMockWorkspace({ id: 'ws_next' });
    rerender();
    expect(result.current.history).toEqual({});
    expect(result.current.loading).toBe(true);
    await act(async () => old.resolve({ mission1: { ...history, privateMarker: 'old workspace' } }));
    expect(result.current.history).toEqual({});
    await act(async () => next.resolve({ mission1: { ...history, evidence: [{ id: 'next-receipt' }] } }));
    expect(result.current.history.mission1.evidence).toEqual([{ id: 'next-receipt' }]);
    expect(lookupPreviousWorkBatch).toHaveBeenLastCalledWith({ workspaceId: 'ws_next', subjectType: 'mission', subjects: ['mission1'] });
});

it('hides the previous account history before a new read completes in the same workspace', async () => {
    const { result, rerender } = renderHook(() => usePreviousWork('mission', ['mission1']), { wrapper: workspaceWrapper() });
    await waitFor(() => expect(result.current.history.mission1).toEqual(history));
    const next = deferred(); lookupPreviousWorkBatch.mockImplementationOnce(() => next.promise);
    pb.__setAuth({ record: { id: 'new-account' }, isValid: true });
    rerender();
    expect(result.current.history).toEqual({});
    await act(async () => next.resolve({}));
    expect(result.current.history).toEqual({});
    expect(result.current.loading).toBe(false);
});

it('demo mode and unmount discard pending private history and never start another read', async () => {
    const pending = deferred(); lookupPreviousWorkBatch.mockImplementationOnce(() => pending.promise);
    const { result, unmount } = renderHook(() => usePreviousWork('mission', ['mission1']), { wrapper: workspaceWrapper() });
    act(() => setDemoMode(true));
    expect(result.current.history).toEqual({});
    expect(result.current.loading).toBe(false);
    await act(async () => pending.resolve({ mission1: history }));
    expect(result.current.history).toEqual({});
    expect(lookupPreviousWorkBatch).toHaveBeenCalledTimes(1);
    const refresh = result.current.refresh;
    unmount();
    await refresh();
    expect(lookupPreviousWorkBatch).toHaveBeenCalledTimes(1);
});

it('no account, workspace or subjects makes no history request', () => {
    const first = renderHook(() => usePreviousWork('mission', []), { wrapper: workspaceWrapper() });
    first.unmount();
    const second = renderHook(() => usePreviousWork('mission', ['mission1']), { wrapper: workspaceWrapper({ active: null }) });
    second.unmount();
    pb.authStore.clear();
    renderHook(() => usePreviousWork('mission', ['mission1']), { wrapper: workspaceWrapper() });
    expect(lookupPreviousWorkBatch).not.toHaveBeenCalled();
});
