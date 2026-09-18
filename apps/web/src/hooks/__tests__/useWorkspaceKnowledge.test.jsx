// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/useWorkspaceKnowledge.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/hooks/useWorkspaceKnowledge.js, tests/upgrade/knowledge-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useWorkspaceKnowledge.js; CONSUMES tests/upgrade/knowledge-fixture.mjs
// DAG Node:    none
// Intent:      Verify context polling, cancellation and response isolation across account, query, workspace and visibility changes.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { useWorkspaceKnowledge } from '@/hooks/useWorkspaceKnowledge';
import { setDemoMode } from '@/lib/demoWorkspace';
import pb from '@/lib/pocketbaseClient';
import { knowledgeFixture } from '../../../../../tests/upgrade/knowledge-fixture.mjs';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'editor' } }, send: vi.fn() } }));
let account; let workspace; let backend;
function Wrapper({ children }) {
    return <AuthContext.Provider value={{ user: { id: account }, isAuthed: Boolean(account) }}><WorkspaceContext.Provider value={{ active: { id: workspace } }}>{children}</WorkspaceContext.Provider></AuthContext.Provider>;
}
const advance = (time) => act(async () => { await vi.advanceTimersByTimeAsync(time); });
beforeEach(() => {
    vi.useFakeTimers(); account = 'editor'; workspace = 'ws1'; backend = knowledgeFixture();
    pb.authStore.record = { id: account }; pb.send.mockReset(); setDemoMode(false);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    pb.send.mockImplementation(async (path, options) => backend.assemble(options.body, pb.authStore.record.id, path.split('/')[4]));
});
afterEach(() => { act(() => setDemoMode(false)); vi.useRealTimers(); vi.restoreAllMocks(); });

it('debounces query edits and refreshes only while visible without overlapping requests', async () => {
    let query = ''; const view = renderHook(() => useWorkspaceKnowledge({ query }), { wrapper: Wrapper });
    query = 'book'; view.rerender(); await advance(100); query = 'bookings'; view.rerender();
    await advance(250); expect(pb.send).toHaveBeenCalledTimes(1); expect(view.result.current.data.context.query).toBe('bookings');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await advance(30000); expect(pb.send).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    let resolve; pb.send.mockImplementationOnce((_path, options) => new Promise((done) => { resolve = () => done(backend.assemble(options.body)); }));
    act(() => window.dispatchEvent(new Event('focus'))); act(() => window.dispatchEvent(new Event('focus')));
    expect(pb.send).toHaveBeenCalledTimes(2); await act(async () => resolve());
    const count = pb.send.mock.calls.length; view.unmount(); await advance(30000); expect(pb.send).toHaveBeenCalledTimes(count);
});

it('hides and aborts old scope data before a late response can arrive', async () => {
    let resolve; pb.send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = renderHook(() => useWorkspaceKnowledge(), { wrapper: Wrapper }); await advance(250);
    const signal = pb.send.mock.calls[0][1].signal;
    account = 'otherowner'; workspace = 'ws2'; pb.authStore.record = { id: account }; view.rerender();
    expect(signal.aborted).toBe(true); expect(view.result.current.data).toBeNull();
    await advance(250); expect(view.result.current.data.workspace).toBe('ws2');
    await act(async () => resolve(backend.assemble())); expect(view.result.current.data.workspace).toBe('ws2');
});

it('aborts stalled reads at the deadline and clears private data in demonstration mode', async () => {
    pb.send.mockImplementationOnce((_path, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')))));
    const view = renderHook(() => useWorkspaceKnowledge(), { wrapper: Wrapper }); await advance(15250);
    expect(view.result.current.loading).toBe(false); expect(view.result.current.data).toBeNull(); expect(view.result.current.error).toMatch(/unavailable/);
    await act(async () => view.result.current.refresh()); expect(view.result.current.data.workspace).toBe('ws1');
    act(() => setDemoMode(true)); expect(view.result.current.data).toBeNull();
    const count = pb.send.mock.calls.length; await advance(30250); expect(pb.send.mock.calls.length).toBe(count);
});
