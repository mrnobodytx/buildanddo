// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useOpenClasses.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-CLASSROOM-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN, C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/classrooms.js, apps/web/src/contexts/WorkspaceContext.jsx, apps/web/src/contexts/AuthContext.jsx
// EnumType:    Hook
// EnumEdges:   CONSUMES apps/web/src/lib/classrooms.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx; CONSUMES apps/web/src/contexts/AuthContext.jsx
// DAG Node:    none
// Intent:      List the live and scheduled classes across EVERY workspace the account can read, so a
//              person does not have to know which workspace a class lives in to find it.
// ───────────────────────────────────────────────────────────────
//
// WHY. The classroom desk lists the ACTIVE workspace only. Measured 2026-09-24: the operator's
// account owned a workspace with no rooms while every guildmaster class lived in a workspace the
// account had just been seated in, so the desk said "No classes here yet" until the workspace was
// switched by hand. A class a person can join should be visible wherever they land.
//
// WHAT IT READS. The same per-workspace classroom route the desk uses, paged by open status,
// through the same client (so the same authorization, receipt and telemetry rules apply). Nothing
// new is exposed by the backend; this hook only asks the questions the desk could already ask.
// A workspace whose read fails is reported as unavailable, never dropped silently, and a stale
// answer from a previous account or workspace set can never populate the current view.

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { createClassroomClient } from '@/lib/classrooms';

export const OPEN_CLASSES_POLL_MS = 30000;
const WORKSPACE_CONCURRENCY = 4;
const MAX_PAGES_PER_STATUS = 100;
const ORDER = { live: 0, scheduled: 1 };

/** Live first, then scheduled by planned start, then by title: a stable, readable order. */
export function orderOpenClasses(entries) {
    return [...entries].sort((a, b) => (ORDER[a.room.status] ?? 9) - (ORDER[b.room.status] ?? 9)
        || String(a.room.starts_at || '').localeCompare(String(b.room.starts_at || ''))
        || String(a.room.title || '').localeCompare(String(b.room.title || '')));
}

/**
 * @returns {{loading: boolean, items: Array<{workspace: {id: string, name: string}, room: object}>,
 *            unavailable: Array<{id: string, name: string}>}}
 * Open classes across the account's readable workspaces; `unavailable` names workspaces whose
 * classroom read failed so the caller can say so instead of showing a shorter list as complete.
 */
export function useOpenClasses() {
    const { user, isAuthed, sessionEpoch, isSessionCurrent } = useAuth();
    const { workspaces } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : '';
    const key = JSON.stringify([accountId, (workspaces || []).map(({ id, name }) => [id, name || '']), demo, sessionEpoch]);
    const live = useRef(null);
    if (live.current?.key !== key) live.current = { key };
    const scope = live.current;
    const sessionCurrent = useRef(isSessionCurrent); sessionCurrent.current = isSessionCurrent;
    const latest = useRef(workspaces || []); latest.current = workspaces || [];
    const [state, setState] = useState({ scope, loading: true, items: [], unavailable: [] });
    useEffect(() => {
        const current = latest.current;
        if (demo || !accountId || !current.length) {
            setState({ scope, loading: false, items: [], unavailable: [] });
            return undefined;
        }
        let cancelled = false, reading = false;
        const clients = new Set();
        const isCurrent = () => !cancelled && live.current === scope && pb.authStore.record?.id === accountId &&
            Boolean(sessionCurrent.current?.(sessionEpoch));
        const readWorkspace = async (workspace) => {
            const api = createClassroomClient({ client: pb, accountId, workspaceId: workspace.id, demo, isCurrent, observe: observeMutation });
            clients.add(api);
            try {
                const rooms = new Map();
                for (const status of ['live', 'scheduled']) {
                    for (let page = 1; page <= MAX_PAGES_PER_STATUS; page++) {
                        if (!isCurrent()) return null;
                        const result = await api.read('', page, status);
                        if (!result.ok) return null;
                        for (const room of result.data.items) if (room.status === 'live' || room.status === 'scheduled') rooms.set(room.id, room);
                        if (!result.data.has_more) break;
                        // ACL filtering can leave an empty page with more records.
                        // Follow has_more, but never poll unbounded history.
                        if (page === MAX_PAGES_PER_STATUS) return null;
                    }
                }
                return [...rooms.values()];
            } finally { api.dispose(); clients.delete(api); }
        };
        const load = async () => {
            if (reading || !isCurrent()) return;
            reading = true;
            try {
                let next = 0;
                const results = [];
                await Promise.all(Array.from({ length: Math.min(WORKSPACE_CONCURRENCY, current.length) }, async () => {
                    while (isCurrent() && next < current.length) {
                        const index = next++;
                        results[index] = await readWorkspace(current[index]);
                    }
                }));
                if (!isCurrent()) return;
                const items = [], unavailable = [];
                current.forEach((workspace, index) => {
                    const brief = { id: workspace.id, name: workspace.name || '' };
                    if (results[index] === null) unavailable.push(brief);
                    else for (const room of results[index]) items.push({ workspace: brief, room });
                });
                setState({ scope, loading: false, items: orderOpenClasses(items), unavailable });
            } finally { reading = false; }
        };
        void load();
        const timer = setInterval(load, OPEN_CLASSES_POLL_MS);
        return () => { cancelled = true; clearInterval(timer); for (const api of clients) api.dispose(); };
    }, [accountId, demo, scope, sessionEpoch]);
    const authorized = !demo && accountId && pb.authStore.record?.id === accountId && sessionCurrent.current?.(sessionEpoch);
    return state.scope === scope && (authorized || !accountId || demo) ? state : { scope, loading: Boolean(authorized), items: [], unavailable: [] };
}
