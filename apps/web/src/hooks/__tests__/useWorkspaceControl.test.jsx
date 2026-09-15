// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/useWorkspaceControl.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceControl.js, apps/web/src/contexts/WorkspaceAccessContext.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useWorkspaceControl.js; VALIDATES apps/web/src/contexts/WorkspaceAccessContext.jsx
// DAG Node:    none
// Intent:      Verify response isolation, capability refresh and retry recovery across account, workspace, query and demonstration changes.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { WorkspaceAccessProvider, useWorkspaceAccess } from '@/contexts/WorkspaceAccessContext';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'owner' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
const response = (workspace = 'ws1', role = 'owner', description = '') => ({ workspace, role,
    settings: { revision: 0, description, wiki_enabled: true, forum_enabled: true, forum_moderation: true },
    can_admin: ['owner', 'admin'].includes(role), can_write: role !== 'viewer', can_grant_admin: role === 'owner' });
const receipt = { workspace: 'ws1', id: 'ws1', revision: 1, action: 'settings.save', replayed: false };
const pending = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
let account; let workspace; let authenticated;
function Wrapper({ children }) {
    return <AuthContext.Provider value={{ user: account ? { id: account } : null, isAuthed: authenticated }}>
        <WorkspaceContext.Provider value={{ active: workspace ? { id: workspace, owner: account } : null }}>{children}</WorkspaceContext.Provider>
    </AuthContext.Provider>;
}
beforeEach(() => {
    account = 'owner'; workspace = 'ws1'; authenticated = true; pb.authStore.record = { id: account }; pb.send.mockReset();
    pb.send.mockImplementation(async (path, options) => options.method === 'POST' ? receipt : response(path.split('/')[4]));
});
afterEach(() => { act(() => setDemoMode(false)); vi.restoreAllMocks(); });

describe('scoped workspace controls', () => {
    it('hides late reads after switching workspace and account', async () => {
        const old = pending(); pb.send.mockImplementationOnce(() => old.promise);
        const view = renderHook(() => useWorkspaceControl('access'), { wrapper: Wrapper });
        expect(view.result.current.loading).toBe(true);
        account = 'newuser'; workspace = 'ws2'; pb.authStore.record = { id: account }; view.rerender();
        expect(view.result.current.data).toBeNull();
        await waitFor(() => expect(view.result.current.data?.workspace).toBe('ws2'));
        await act(async () => old.resolve(response('ws1')));
        expect(view.result.current.data.workspace).toBe('ws2');
        expect(pb.send.mock.calls.every(([, options]) => options.requestKey === null)).toBe(true);
    });

    it('finishes an in-flight save without reloading an obsolete query or leaving controls busy', async () => {
        const saved = pending(); let page = 1;
        pb.send.mockImplementation(async (_path, options) => options.method === 'POST' ? saved.promise : response('ws1', 'owner', `Page ${options.query.page}`));
        const view = renderHook(() => useWorkspaceControl('access', { page }), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.data?.settings.description).toBe('Page 1'));
        let operation; act(() => { operation = view.result.current.mutate('settings.save', { name: 'Current team' }, 0); });
        expect(view.result.current.saving).toBe(true);
        page = 2; view.rerender();
        await waitFor(() => expect(view.result.current.data?.settings.description).toBe('Page 2'));
        await act(async () => { saved.resolve(receipt); await operation; });
        expect(view.result.current.saving).toBe(false); expect(view.result.current.data.settings.description).toBe('Page 2');
        expect(pb.send.mock.calls.at(-1)[1].query.page).toBe(2);
    });

    it('does not show success or refresh a new account after an earlier account saves', async () => {
        const saved = pending(); pb.send.mockImplementation(async (path, options) => options.method === 'POST' ? saved.promise : response(path.split('/')[4]));
        const view = renderHook(() => useWorkspaceControl('access'), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.data).not.toBeNull());
        let operation; act(() => { operation = view.result.current.mutate('settings.save', { name: 'Old team' }, 0); });
        account = 'newuser'; workspace = 'ws2'; pb.authStore.record = { id: account }; view.rerender();
        await waitFor(() => expect(view.result.current.data?.workspace).toBe('ws2'));
        const reads = pb.send.mock.calls.length;
        await act(async () => { saved.resolve(receipt); await operation; });
        expect(view.result.current.saved).toBeNull(); expect(view.result.current.saving).toBe(false);
        expect(pb.send).toHaveBeenCalledTimes(reads);
    });

    it('keeps failed reads separate from failed saves and retries an uncertain command with the same key', async () => {
        const view = renderHook(() => useWorkspaceControl('access'), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.data).not.toBeNull());
        pb.send.mockRejectedValueOnce({ status: 409, response: { message: 'Reload before saving.' } });
        await act(async () => view.result.current.mutate('settings.save', { name: 'Current team' }, 0));
        expect(view.result.current.writeError).toBe('Reload before saving.'); expect(view.result.current.data).not.toBeNull();
        pb.send.mockRejectedValueOnce(new Error('Response lost'));
        await act(async () => view.result.current.mutate('settings.save', { name: 'Current team' }, 0));
        expect(view.result.current.uncertain).toBe(true);
        const key = pb.send.mock.calls.at(-1)[1].body.request_key;
        await act(async () => view.result.current.retry());
        expect(pb.send.mock.calls.filter(([, options]) => options.method === 'POST').at(-1)[1].body.request_key).toBe(key);
        expect(view.result.current.saved).toEqual(receipt); expect(view.result.current.uncertain).toBe(false);
        pb.send.mockRejectedValueOnce(new Error('Read unavailable'));
        await act(async () => view.result.current.refresh());
        expect(view.result.current.data).toBeNull(); expect(view.result.current.error).toMatch(/unavailable/);
        await act(async () => view.result.current.refresh()); expect(view.result.current.data).not.toBeNull();
    });

    it('makes no private request in demo, signed-out or workspace-less states', async () => {
        act(() => setDemoMode(true));
        const view = renderHook(() => useWorkspaceControl('access'), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.loading).toBe(false));
        expect(view.result.current.error).toMatch(/demonstration/);
        await act(async () => view.result.current.mutate('settings.save', {}, 0)); expect(pb.send).not.toHaveBeenCalled();
        act(() => setDemoMode(false)); await waitFor(() => expect(view.result.current.data).not.toBeNull());
        pb.send.mockClear(); authenticated = false; account = ''; pb.authStore.record = null; view.rerender();
        await waitFor(() => expect(view.result.current.error).toMatch(/Sign in/)); expect(view.result.current.data).toBeNull();
        authenticated = true; account = 'owner'; workspace = ''; pb.authStore.record = { id: account }; view.rerender();
        await waitFor(() => expect(view.result.current.loading).toBe(false)); expect(pb.send).not.toHaveBeenCalled();
    });
});

describe('workspace capability context', () => {
    it('denies capabilities without a provider and refreshes observed role changes on focus', async () => {
        const empty = renderHook(() => useWorkspaceAccess()); expect(empty.result.current.data).toBeNull();
        expect(await empty.result.current.refresh()).toBe(false); empty.unmount();
        function AccessWrapper({ children }) { return <Wrapper><WorkspaceAccessProvider>{children}</WorkspaceAccessProvider></Wrapper>; }
        const view = renderHook(() => useWorkspaceAccess(), { wrapper: AccessWrapper });
        await waitFor(() => expect(view.result.current.data?.can_admin).toBe(true));
        pb.send.mockResolvedValue(response('ws1', 'viewer'));
        act(() => window.dispatchEvent(new Event('focus')));
        await waitFor(() => expect(view.result.current.data?.can_admin).toBe(false));
        const calls = pb.send.mock.calls.length; view.unmount();
        act(() => window.dispatchEvent(new Event('focus'))); expect(pb.send).toHaveBeenCalledTimes(calls);
    });
});
