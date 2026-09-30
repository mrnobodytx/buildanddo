// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/useClassrooms.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/hooks/useClassrooms.js, tests/upgrade/classroom-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useClassrooms.js; CONSUMES tests/upgrade/classroom-fixture.mjs
// DAG Node:    none
// Intent:      Verify classroom polling, attendance timers, cleanup and late-response isolation under the real React hook lifecycle.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classroomFixture } from '../../../../../tests/upgrade/classroom-fixture.mjs';
import { plain } from '../../../../../tests/upgrade/admin-fixture.mjs';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { useClassrooms } from '@/hooks/useClassrooms';
import pb from '@/lib/pocketbaseClient';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'owner' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
let backend, account, workspace, sessionEpoch;
function Wrapper({ children }) {
    return <AuthContext.Provider value={{ user: { id: account }, isAuthed: true, sessionEpoch,
        isSessionCurrent: (epoch) => epoch === sessionEpoch }}><WorkspaceContext.Provider value={{ active: { id: workspace } }}>{children}</WorkspaceContext.Provider></AuthContext.Provider>;
}
function sourceSend(path, options) {
    const parts = path.split('/'); const e = backend.event(account, options.body || {}, { workspace: parts[4], id: parts[6], query: options.query });
    try { return plain(options.method === 'POST' ? path.endsWith('/presence') ? backend.service.heartbeat(e) : backend.service.command(e) : parts[6] ? backend.service.detail(e) : backend.service.list(e)); }
    catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
}
beforeEach(() => { backend = classroomFixture(); account = 'owner'; workspace = 'ws1'; sessionEpoch = 1; pb.authStore.record = { id: account }; pb.send.mockReset(); pb.send.mockImplementation(async (...args) => sourceSend(...args)); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('classroom synchronization', () => {
    it('polls shared sections, renews only joined attendance and stops both timers on unmount', async () => {
        const room = backend.create(); backend.command('room.start', { id: room.id });
        const view = renderHook(() => useClassrooms(room.id), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.data?.membership.active).toBe(true));
        // Preserve the browser's timer APIs but invoke their registered callbacks
        // deterministically; native date behavior has its separate acceptance.
        view.unmount();
        const timers = new Map(); let number = 0;
        const realSetInterval = globalThis.setInterval;
        const realClearInterval = globalThis.clearInterval;
        // Intercept ONLY the hook's own intervals. waitFor polls with setInterval as
        // well, so replacing it wholesale meant no later assertion was ever re-checked
        // and every wait after this point failed on its first look. Fake ids are offset
        // so they cannot collide with a real timer id.
        vi.spyOn(globalThis, 'setInterval').mockImplementation((fn, delay) => {
            if (delay !== 5000 && delay !== 20000) return realSetInterval(fn, delay);
            const id = 1000000 + (++number); timers.set(id, { fn, delay }); return id;
        });
        vi.spyOn(globalThis, 'clearInterval').mockImplementation((id) => {
            if (timers.has(id)) timers.delete(id); else realClearInterval(id);
        });
        const next = renderHook(() => useClassrooms(room.id), { wrapper: Wrapper });
        await waitFor(() => expect(next.result.current.data?.membership.active).toBe(true));
        backend.command('room.lesson', { id: room.id, tutorial: backend.lessons[0].id, section: 1 });
        await act(async () => { await [...timers.values()].find((timer) => timer.delay === 5000).fn(); });
        expect(next.result.current.data.room.section).toBe(1);
        await act(async () => { await [...timers.values()].find((timer) => timer.delay === 20000).fn(); });
        expect(pb.send.mock.calls.some(([path]) => path.endsWith('/presence'))).toBe(true);
        next.unmount(); expect(timers.size).toBe(0);
    });

    it('hides a previous account during render and discards its late room result', async () => {
        const room = backend.create(); let resolve;
        const old = backend.detail(room.id);
        pb.send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
        const view = renderHook(() => useClassrooms(room.id), { wrapper: Wrapper });
        account = 'otherowner'; workspace = 'ws2'; pb.authStore.record = { id: account }; view.rerender();
        expect(view.result.current.data).toBeNull();
        await waitFor(() => expect(view.result.current.loading).toBe(false));
        await act(async () => { resolve(old); });
        expect(view.result.current.data).toBeNull(); expect(view.result.current.error).toMatch(/unavailable/);
    });

    it('does not keep attending after a leave, expiry or failed presence generation', async () => {
        const room = backend.create(); backend.command('room.start', { id: room.id });
        const timers = new Map(); let number = 0;
        const realSetInterval = globalThis.setInterval;
        const realClearInterval = globalThis.clearInterval;
        // Intercept ONLY the hook's own intervals. waitFor polls with setInterval as
        // well, so replacing it wholesale meant no later assertion was ever re-checked
        // and every wait after this point failed on its first look. Fake ids are offset
        // so they cannot collide with a real timer id.
        vi.spyOn(globalThis, 'setInterval').mockImplementation((fn, delay) => {
            if (delay !== 5000 && delay !== 20000) return realSetInterval(fn, delay);
            const id = 1000000 + (++number); timers.set(id, { fn, delay }); return id;
        });
        vi.spyOn(globalThis, 'clearInterval').mockImplementation((id) => {
            if (timers.has(id)) timers.delete(id); else realClearInterval(id);
        });
        const view = renderHook(() => useClassrooms(room.id), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.data?.membership.active).toBe(true));
        const membership = view.result.current.data.membership;
        backend.command('room.leave', { id: room.id, membership_revision: membership.revision });
        await act(async () => { await [...timers.values()].find((timer) => timer.delay === 20000).fn(); });
        await waitFor(() => expect(view.result.current.data.membership.active).toBe(false));
        expect([...timers.values()].some((timer) => timer.delay === 20000)).toBe(false);
        expect([...timers.values()].some((timer) => timer.delay === 5000)).toBe(true);
    });

    it('hides a replaced same-account session and rejects its late save', async () => {
        const room = backend.create(); backend.command('room.start', { id: room.id });
        const view = renderHook(() => useClassrooms(room.id), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.connected).toBe(true));
        let release, saving;
        pb.send.mockImplementation(async (path, options) => {
            const result = sourceSend(path, options);
            if (options.method === 'POST') await new Promise((resolve) => { release = resolve; });
            return result;
        });
        act(() => { saving = view.result.current.mutate('room.message', { id: room.id, body: 'Earlier session' }, view.result.current.data.room.revision); });
        expect(view.result.current.saving).toBe(true);
        sessionEpoch++; view.rerender();
        expect(view.result.current.data).toBeNull(); expect(view.result.current.saving).toBe(false);
        await waitFor(() => expect(view.result.current.connected).toBe(true));
        await act(async () => { release(); expect((await saving).ok).toBe(false); });
        expect(view.result.current.saved).toBeNull(); expect(backend.data.classroom_messages).toHaveLength(1);
    });

    it('allows a new save after leaving and returning while the old room save is pending', async () => {
        const room = backend.create(), other = backend.create(); backend.command('room.start', { id: room.id });
        const view = renderHook(({ id }) => useClassrooms(id), { initialProps: { id: room.id }, wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.connected).toBe(true));
        let release, saving, first = true;
        pb.send.mockImplementation(async (path, options) => {
            const result = sourceSend(path, options);
            if (options.method === 'POST' && first) { first = false; await new Promise((resolve) => { release = resolve; }); }
            return result;
        });
        act(() => { saving = view.result.current.mutate('room.message', { id: room.id, body: 'Earlier visit' }, view.result.current.data.room.revision); });
        view.rerender({ id: other.id }); await waitFor(() => expect(view.result.current.data?.room.id).toBe(other.id));
        view.rerender({ id: room.id }); await waitFor(() => expect(view.result.current.data?.room.id).toBe(room.id));
        expect(view.result.current.saving).toBe(false);
        await act(async () => { expect((await view.result.current.mutate('room.message', { id: room.id, body: 'Current visit' }, view.result.current.data.room.revision)).ok).toBe(true); });
        const saved = view.result.current.saved;
        await act(async () => { release(); expect((await saving).ok).toBe(false); });
        expect(view.result.current.saved).toBe(saved); expect(backend.data.classroom_messages).toHaveLength(2);
    });

    it('keeps uncertain-save recovery across a native refresh and a page change', async () => {
        const view = renderHook(({ page }) => useClassrooms('', page), { initialProps: { page: 1 }, wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.connected).toBe(true));
        let lost = true;
        pb.send.mockImplementation(async (path, options) => {
            const result = sourceSend(path, options);
            if (options.method === 'POST' && lost) { lost = false; throw new Error('Response lost'); }
            return result;
        });
        await act(async () => { await view.result.current.mutate('room.create', { title: 'Retry once', description: '', tutorial: backend.lessons[0].id, starts_at: '' }, 0); });
        expect(view.result.current.uncertain).toBe(true);
        pb.authStore.token = 'synthetic-native-refresh'; view.rerender({ page: 2 });
        await waitFor(() => expect(view.result.current.connected).toBe(true));
        await act(async () => { expect((await view.result.current.retry()).result.replayed).toBe(true); });
        expect(view.result.current.uncertain).toBe(false); expect(backend.data.classroom_rooms).toHaveLength(1);
    });

    it('creates a usable client after StrictMode replays effects', async () => {
        const room = backend.create();
        const view = renderHook(() => useClassrooms(room.id), { wrapper: ({ children }) => <React.StrictMode><Wrapper>{children}</Wrapper></React.StrictMode> });
        await waitFor(() => expect(view.result.current.connected).toBe(true));
        await act(async () => { expect((await view.result.current.mutate('room.start', { id: room.id }, view.result.current.data.room.revision)).ok).toBe(true); });
        expect(view.result.current.data.membership.active).toBe(true);
    });
});
