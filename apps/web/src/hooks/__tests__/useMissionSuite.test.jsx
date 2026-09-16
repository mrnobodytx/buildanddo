// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/useMissionSuite.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/hooks/useMissionSuite.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useMissionSuite.js
// DAG Node:    none
// Intent:      Prevent late suite results and pending writes crossing mission, workspace, account or demo boundaries.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { useMissionSuite } from '@/hooks/useMissionSuite';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
let account; let workspace; let mission;
const response = (scope = 'ws1', selected = 'mission1', page = 1) => ({ workspace: scope, mission: selected, role: 'editor', items: [], page, has_more: false,
    configured: true, control: { revision: 1, state_revision: 0, observations: 0, enabled: true, rights: [], parameters: {}, active_run: '' } });
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
function Wrapper({ children }) { return <AuthContext.Provider value={{ user: { id: account }, isAuthed: Boolean(account) }}><WorkspaceContext.Provider value={{ active: { id: workspace } }}>{children}</WorkspaceContext.Provider></AuthContext.Provider>; }
beforeEach(() => { account = 'editor'; workspace = 'ws1'; mission = 'mission1'; pb.authStore.record = { id: account }; pb.send.mockReset(); pb.send.mockImplementation(async (path, options) => response(path.split('/')[4], options.body.mission, options.body.payload.page)); });
afterEach(() => { act(() => setDemoMode(false)); vi.restoreAllMocks(); });

it('drops late responses after a mission or account changes', async () => {
    const old = deferred(); pb.send.mockImplementationOnce(() => old.promise);
    const view = renderHook(() => useMissionSuite(mission), { wrapper: Wrapper });
    mission = 'mission2'; account = 'newuser'; workspace = 'ws2'; pb.authStore.record = { id: account }; view.rerender();
    expect(view.result.current.data).toBeNull();
    await waitFor(() => expect(view.result.current.data?.mission).toBe('mission2'));
    await act(async () => old.resolve(response())); expect(view.result.current.data.workspace).toBe('ws2');
});

it('recovers an uncertain save without clearing its identity during status refresh', async () => {
    const view = renderHook(() => useMissionSuite(mission), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.data).not.toBeNull());
    pb.send.mockRejectedValueOnce(new Error('lost'));
    await act(async () => view.result.current.mutate('enqueue', { suite: 'maritime', input: {} }, 0));
    expect(view.result.current.uncertain).toBe(true); const body = pb.send.mock.calls.at(-1)[1].body;
    await act(async () => view.result.current.refresh()); expect(view.result.current.uncertain).toBe(true);
    pb.send.mockImplementationOnce(async () => ({ workspace: 'ws1', mission: 'mission1', action: 'enqueue', id: 'run1', revision: 1, replayed: true }));
    await act(async () => view.result.current.retry()); expect(view.result.current.uncertain).toBe(false);
    expect(pb.send.mock.calls.filter(([, options]) => options.body.action === 'enqueue').at(-1)[1].body).toEqual(body);
});

it('demo mode clears real data and issues no API calls', async () => {
    const view = renderHook(() => useMissionSuite(mission), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.data).not.toBeNull()); const count = pb.send.mock.calls.length;
    act(() => setDemoMode(true)); await waitFor(() => expect(view.result.current.demo).toBe(true));
    expect(view.result.current.data).toBeNull(); expect(pb.send.mock.calls.length).toBe(count);
});
