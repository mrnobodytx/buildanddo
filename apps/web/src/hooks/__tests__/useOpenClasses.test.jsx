// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/__tests__/useOpenClasses.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-CLASSROOM-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/hooks/useOpenClasses.js, apps/web/src/lib/classrooms.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/hooks/useOpenClasses.js
// DAG Node:    none
// Intent:      Classes across every readable workspace are found without switching workspaces; ended
//              rooms are left out; an unreadable workspace is named, not dropped; a stale answer from a
//              previous workspace set never populates the current view. Responses carry the exact shape
//              the classroom client validates, so the test exercises the real read path.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { orderOpenClasses, useOpenClasses } from '@/hooks/useOpenClasses';
import pb from '@/lib/pocketbaseClient';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'owner' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ demo: false }) }));

const room = (workspace, id, status, title, host_name, starts_at = '') => ({
    id, workspace, revision: 1, section: 0, title, description: '', host: 'host1', host_name, tutorial: '',
    status, starts_at, started_at: '', ended_at: '', created: '2026-09-24T00:00:00Z', can_manage: false,
});
const ROOMS = {
    ws1: [room('ws1', 'r1', 'live', 'Deploy my first website', 'Forge'), room('ws1', 'r0', 'ended', 'Old class', 'Forge')],
    ws2: [room('ws2', 'r2', 'scheduled', 'Evidence workshop', 'Scholar', '2026-10-01T10:00:00Z')],
};
let workspaces;
function Wrapper({ children }) {
    return <AuthContext.Provider value={{ user: { id: 'owner' }, isAuthed: true }}>
        <WorkspaceContext.Provider value={{ workspaces, active: workspaces[0] || null, setActive: () => {} }}>{children}</WorkspaceContext.Provider>
    </AuthContext.Provider>;
}
function answer(path) {
    const workspace = path.split('/')[4];
    if (workspace === 'ws3') throw { status: 403, response: { message: 'Current workspace membership is required.' } };
    return { workspace, role: 'viewer', can_host: false, items: ROOMS[workspace] || [], page: 1, has_more: false, lessons: { items: [], has_more: false } };
}
beforeEach(() => {
    workspaces = [{ id: 'ws1', name: 'My business' }, { id: 'ws2', name: 'Guild Hall' }, { id: 'ws3', name: 'Locked' }];
    pb.authStore.record = { id: 'owner' };
    pb.send.mockReset(); pb.send.mockImplementation(async (path) => answer(path));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('open classes across workspaces', () => {
    it('lists live and scheduled rooms from every readable workspace, live first, and names the unreadable one', async () => {
        const view = renderHook(() => useOpenClasses(), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.loading).toBe(false));
        const { items, unavailable } = view.result.current;
        expect(items.map((entry) => `${entry.workspace.id}:${entry.room.id}:${entry.room.status}`)).toEqual(['ws1:r1:live', 'ws2:r2:scheduled']);
        expect(items.find((entry) => entry.room.id === 'r0')).toBeUndefined();
        expect(unavailable).toEqual([{ id: 'ws3', name: 'Locked' }]);
        expect(pb.send).toHaveBeenCalledTimes(3);
    });

    it('asks each workspace through its own classroom route', async () => {
        const view = renderHook(() => useOpenClasses(), { wrapper: Wrapper });
        await waitFor(() => expect(view.result.current.loading).toBe(false));
        const paths = pb.send.mock.calls.map(([path]) => path);
        for (const id of ['ws1', 'ws2', 'ws3']) expect(paths.some((path) => path.includes(`/workspaces/${id}/classrooms`))).toBe(true);
    });

    it('never populates the current view with an answer for a previous workspace set', async () => {
        let release;
        pb.send.mockImplementation((path) => new Promise((resolve, reject) => {
            if (path.includes('/ws1/')) { release = () => resolve(answer(path)); return; }
            try { resolve(answer(path)); } catch (error) { reject(error); }
        }));
        const view = renderHook(() => useOpenClasses(), { wrapper: Wrapper });
        workspaces = [{ id: 'ws2', name: 'Guild Hall' }];
        view.rerender();
        await waitFor(() => expect(view.result.current.loading).toBe(false));
        release();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(view.result.current.items.map((entry) => entry.workspace.id)).toEqual(['ws2']);
    });

    it('orders live before scheduled, then by planned start', () => {
        const ordered = orderOpenClasses([
            { workspace: { id: 'a', name: 'a' }, room: { status: 'scheduled', starts_at: '2026-10-02', title: 'b' } },
            { workspace: { id: 'a', name: 'a' }, room: { status: 'scheduled', starts_at: '2026-10-01', title: 'a' } },
            { workspace: { id: 'a', name: 'a' }, room: { status: 'live', starts_at: '', title: 'c' } },
        ]);
        expect(ordered.map((entry) => `${entry.room.status}:${entry.room.title}`)).toEqual(['live:c', 'scheduled:a', 'scheduled:b']);
    });
});
