// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/usePrivateDossier.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/usePrivateDossier.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/usePrivateDossier.js
// DAG Node:    none
// Intent:      Verify private view cleanup, stale-request fencing, StrictMode remounts and uncertain save recovery across account boundaries.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import { usePrivateDossier } from '@/hooks/usePrivateDossier';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: vi.fn((_name, _verb, operation) => operation()) }));
let account;
const response = (owner = account, page = 1) => ({ owner, encrypted_storage: true, dossier: { owner, id: '', revision: 0, about: '' },
    entity_count: 0, total: 0, items: [], page, has_more: false });
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
function Wrapper({ children }) {
    return <React.StrictMode><AuthContext.Provider value={{ user: account ? { id: account } : null, isAuthed: Boolean(account) }}>{children}</AuthContext.Provider></React.StrictMode>;
}
beforeEach(() => {
    act(() => setDemoMode(false)); account = 'editor'; pb.authStore.record = { id: account }; pb.send.mockReset();
    pb.send.mockImplementation(async (_path, options) => response(account, options.body.page || 1));
});
afterEach(() => { act(() => setDemoMode(false)); vi.restoreAllMocks(); });

it('survives StrictMode remounts and rejects late responses after an account change', async () => {
    const old = deferred(); pb.send.mockImplementationOnce(() => old.promise);
    const view = renderHook(() => usePrivateDossier(), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.data?.owner).toBe('editor'));
    account = 'admin'; pb.authStore.record = { id: account }; view.rerender();
    expect(view.result.current.data).toBeNull();
    await waitFor(() => expect(view.result.current.data?.owner).toBe('admin'));
    await act(async () => old.resolve(response('editor')));
    expect(view.result.current.data.owner).toBe('admin');
});

it('discards a slow earlier recall when a different query finishes first', async () => {
    let query = ''; const view = renderHook(() => usePrivateDossier(query), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.data).not.toBeNull());
    const first = deferred(); pb.send.mockImplementationOnce(() => first.promise); query = 'older'; view.rerender();
    query = 'current'; view.rerender(); await waitFor(() => expect(view.result.current.loading).toBe(false));
    await act(async () => first.resolve({ ...response(), dossier: { ...response().dossier, about: 'stale private content' } }));
    expect(view.result.current.data.dossier.about).toBe('');
});

it('keeps uncertain writes retryable and refreshes the current result page', async () => {
    let page = 1; const view = renderHook(() => usePrivateDossier('', page), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.data).not.toBeNull());
    pb.send.mockRejectedValueOnce(new Error('lost reply'));
    await act(async () => view.result.current.command('dossier.update', { about: 'Private goals.' }, 0));
    expect(view.result.current.uncertain).toBe(true);
    const key = pb.send.mock.calls.at(-1)[1].body.request_key;
    page = 2; view.rerender(); await waitFor(() => expect(view.result.current.data?.page).toBe(2));
    pb.send.mockImplementationOnce(async () => ({ owner: 'editor', dossier_id: 'dossier1', id: 'dossier1', action: 'dossier.update', revision: 1, replayed: true }));
    await act(async () => view.result.current.retry());
    expect(view.result.current.uncertain).toBe(false); expect(view.result.current.data.page).toBe(2);
    expect(pb.send.mock.calls.filter(([path]) => !path.endsWith('/read')).at(-1)[1].body.request_key).toBe(key);
    expect(observeMutation).toHaveBeenCalledTimes(2);
    expect(observeMutation).toHaveBeenCalledWith('private_dossiers', 'dossier.update', expect.any(Function));
});

it('hides late save receipts and discards pending content on account changes and unmount', async () => {
    const view = renderHook(() => usePrivateDossier(), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.data).not.toBeNull());
    const saved = deferred(); pb.send.mockImplementationOnce(() => saved.promise);
    let operation; act(() => { operation = view.result.current.command('dossier.update', { about: 'My context.' }, 0); });
    expect(view.result.current.saving).toBe(true);
    account = 'admin'; pb.authStore.record = { id: account }; view.rerender();
    await act(async () => { saved.resolve({ owner: 'editor', dossier_id: 'dossier1', id: 'dossier1', action: 'dossier.update', revision: 1, replayed: false }); await operation; });
    expect(view.result.current.saved).toBeNull(); expect(view.result.current.saving).toBe(false);
    view.unmount();
});

it('anonymous and demonstration views issue no private reads', async () => {
    account = ''; pb.authStore.record = null;
    const view = renderHook(() => usePrivateDossier(), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.loading).toBe(false)); expect(pb.send).not.toHaveBeenCalled();
    account = 'editor'; pb.authStore.record = { id: account }; act(() => setDemoMode(true)); view.rerender();
    expect(view.result.current.data).toBeNull(); expect(view.result.current.error).toMatch(/demonstration/);
    expect(pb.send).not.toHaveBeenCalled();
});
