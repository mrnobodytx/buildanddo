// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/__tests__/CareerProfileContext.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-CAREER-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/contexts/CareerProfileContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/contexts/CareerProfileContext.jsx
// DAG Node:    none
// Intent:      Prove the career profile loads when a user signs in and is cleared on sign-out, account change and demo mode.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import { CareerProfileProvider, useCareerProfile } from '@/contexts/CareerProfileContext';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: null }, send: vi.fn() } }));
let account;
const PROFILE = { as_of: '2026-09-23T00:00:00+00:00', digest: `sha256:${'a'.repeat(64)}`, capabilities: [], sources: [], limits: [], card: '' };
const ready = (subject) => ({ state: 'ready', subject_id: subject, issued_at: '2026-09-23T00:00:00Z', profile: { ...PROFILE, person_id: subject } });
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
function Wrapper({ children }) {
    return <React.StrictMode><AuthContext.Provider value={{ user: account ? { id: account } : null, isAuthed: Boolean(account) }}>
        <CareerProfileProvider>{children}</CareerProfileProvider></AuthContext.Provider></React.StrictMode>;
}
const signIn = (id) => { account = id; pb.authStore.record = id ? { id } : null; };
beforeEach(() => { act(() => setDemoMode(false)); signIn(null); pb.send.mockReset(); pb.send.mockImplementation(async () => ready(account)); });
afterEach(() => { act(() => setDemoMode(false)); vi.restoreAllMocks(); });

it('loads nothing while signed out, then loads the profile on sign-in', async () => {
    const view = renderHook(() => useCareerProfile(), { wrapper: Wrapper });
    expect(view.result.current.status).toBe('signed_out');
    expect(pb.send).not.toHaveBeenCalled();
    signIn('u1'); view.rerender();
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(view.result.current.profile.person_id).toBe('u1');
});

it('clears on sign-out and never shows a late profile from the previous account', async () => {
    signIn('u1'); const slow = deferred(); pb.send.mockImplementation(() => slow.promise);
    const view = renderHook(() => useCareerProfile(), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('loading'));
    pb.send.mockImplementation(async () => ready(account)); signIn('u2'); view.rerender();
    await waitFor(() => expect(view.result.current.profile?.person_id).toBe('u2'));
    await act(async () => slow.resolve(ready('u1')));
    expect(view.result.current.profile.person_id).toBe('u2');
    signIn(null); view.rerender();
    await waitFor(() => expect(view.result.current.status).toBe('signed_out'));
    expect(view.result.current.profile).toBeNull();
});

it('reports not_configured and unavailable without blocking, and skips demo mode', async () => {
    signIn('u1'); pb.send.mockImplementation(async () => ({ state: 'not_configured', subject_id: 'u1' }));
    const view = renderHook(() => useCareerProfile(), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('not_configured'));
    pb.send.mockRejectedValue(new Error('offline'));
    await act(async () => view.result.current.reload());
    expect(view.result.current.status).toBe('unavailable');
    pb.send.mockClear(); act(() => setDemoMode(true));
    await waitFor(() => expect(view.result.current.status).toBe('demo'));
    expect(pb.send).not.toHaveBeenCalled();
});

it('keeps the newest same-account result when refreshes finish out of order', async () => {
    signIn('u1');
    const view = renderHook(() => useCareerProfile(), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    const older = deferred(); pb.send.mockImplementationOnce(() => older.promise);
    let waiting;
    act(() => { waiting = view.result.current.reload(); });
    pb.send.mockResolvedValue({ state: 'no_profile', subject_id: 'u1' });
    await act(async () => view.result.current.reload());
    expect(view.result.current.status).toBe('no_profile');
    await act(async () => { older.resolve(ready('u1')); await waiting; });
    expect(view.result.current.status).toBe('no_profile');
    expect(view.result.current.profile).toBeNull();
});

it.each(['logout', 'account', 'demo'])('does not restore a prior profile after a %s round-trip', async (transition) => {
    signIn('u1'); const older = deferred(); pb.send.mockImplementation(() => older.promise);
    const view = renderHook(() => useCareerProfile(), { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.status).toBe('loading'));
    if (transition === 'demo') act(() => setDemoMode(true));
    else { signIn(transition === 'account' ? 'u2' : null); view.rerender(); }
    expect(view.result.current.profile).toBeNull();
    pb.send.mockResolvedValue({ state: 'no_profile', subject_id: 'u1' });
    if (transition === 'demo') act(() => setDemoMode(false));
    else { signIn('u1'); view.rerender(); }
    await waitFor(() => expect(view.result.current.status).toBe('no_profile'));
    await act(async () => older.resolve(ready('u1')));
    expect(view.result.current.status).toBe('no_profile');
    expect(view.result.current.profile).toBeNull();
});
