// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/useMissionResearch.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useMissionResearch.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useMissionResearch.js
// DAG Node:    none
// Intent:      Reject late research data and receipts across account, workspace and demonstration changes.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { useMissionResearch } from '@/hooks/useMissionResearch';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
let account; let workspace;
const response = (id = 'ws1', page = 1) => ({ workspace: id, role: 'editor', capabilities: { enabled: false, kinds: [] }, items: [], page, has_more: false });
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
function Wrapper({ children }) { return <AuthContext.Provider value={{ user: { id: account }, isAuthed: Boolean(account) }}><WorkspaceContext.Provider value={{ active: { id: workspace } }}>{children}</WorkspaceContext.Provider></AuthContext.Provider>; }
beforeEach(() => { account = 'editor'; workspace = 'ws1'; pb.authStore.record = { id: account }; pb.send.mockReset(); pb.send.mockImplementation(async (path, options) => response(path.split('/')[4], options.query?.page || 1)); });
afterEach(() => { act(() => setDemoMode(false)); vi.restoreAllMocks(); });

it('hides old responses immediately when the account or workspace changes', async () => {
    const old = deferred(); pb.send.mockImplementationOnce(() => old.promise);
    const view = renderHook(() => useMissionResearch(), { wrapper: Wrapper });
    account = 'newuser'; workspace = 'ws2'; pb.authStore.record = { id: account }; view.rerender();
    expect(view.result.current.data).toBeNull();
    await waitFor(() => expect(view.result.current.data?.workspace).toBe('ws2'));
    await act(async () => old.resolve(response('ws1')));
    expect(view.result.current.data.workspace).toBe('ws2');
});

it('finishes a save using the current page and hides its receipt from another account', async () => {
    let page = 1; const saved = deferred();
    pb.send.mockImplementation(async (path, options) => options.method === 'POST' ? saved.promise : response(path.split('/')[4], options.query.page));
    const view = renderHook(() => useMissionResearch({ page }), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.data).not.toBeNull());
    let operation; act(() => { operation = view.result.current.mutate('submit', {}, 0); });
    page = 2; view.rerender(); await waitFor(() => expect(view.result.current.data?.page).toBe(2));
    await act(async () => { saved.resolve({ workspace: 'ws1', id: 'source1', action: 'submit', status: 'queued', revision: 1, evidence: '', replayed: false }); await operation; });
    expect(view.result.current.saving).toBe(false); expect(view.result.current.data.page).toBe(2);
    account = 'newuser'; pb.authStore.record = { id: account }; view.rerender();
    expect(view.result.current.saved).toBeUndefined();
});

it('keeps uncertain writes retryable while demo and anonymous views make no requests', async () => {
    const view = renderHook(() => useMissionResearch(), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.data).not.toBeNull());
    pb.send.mockRejectedValueOnce(new Error('lost response'));
    await act(async () => view.result.current.mutate('submit', {}, 0));
    expect(view.result.current.uncertain).toBe(true);
    const key = pb.send.mock.calls.at(-1)[1].body.request_key;
    pb.send.mockImplementationOnce(async () => ({ workspace: 'ws1', id: 'source1', action: 'submit', status: 'queued', revision: 1, evidence: '', replayed: true }));
    await act(async () => view.result.current.retry());
    expect(pb.send.mock.calls.filter(([, options]) => options.method === 'POST').at(-1)[1].body.request_key).toBe(key);
    const reads = pb.send.mock.calls.length; act(() => setDemoMode(true));
    await waitFor(() => expect(view.result.current.demo).toBe(true));
    expect(view.result.current.data).toBeNull(); expect(pb.send.mock.calls.length).toBe(reads);
});
