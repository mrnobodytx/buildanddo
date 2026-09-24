// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useOpenClasses.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CLASSROOM-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/lib/classrooms.js, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Hook
// EnumEdges:   CONSUMES apps/web/src/lib/classrooms.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx
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
// WHAT IT READS. The same per-workspace classroom route the desk uses, once per readable workspace,
// through the same client (so the same authorization, receipt and telemetry rules apply). Nothing
// new is exposed by the backend; this hook only asks the questions the desk could already ask.
// A workspace whose read fails is reported as unavailable, never dropped silently, and a stale
// answer from a previous account or workspace set can never populate the current view.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { createClassroomClient } from '@/lib/classrooms';

export const OPEN_CLASSES_POLL_MS = 30000;
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
    const { user, isAuthed } = useAuth(); const { workspaces } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : '';
    const ids = (workspaces || []).map((workspace) => workspace.id).join(',');
    const scope = `${accountId}:${ids}:${demo}`;
    const live = useRef({ scope, mounted: true }); live.current.scope = scope;
    const latest = useRef(workspaces || []); latest.current = workspaces || [];
    const [state, setState] = useState({ scope, loading: true, items: [], unavailable: [] });
    const load = useCallback(async () => {
        const current = latest.current;
        if (demo || !accountId || !current.length) {
            setState({ scope, loading: false, items: [], unavailable: [] });
            return;
        }
        const results = await Promise.all(current.map(async (workspace) => {
            const api = createClassroomClient({ client: pb, accountId, workspaceId: workspace.id, demo,
                isCurrent: () => live.current.mounted && live.current.scope === scope, observe: observeMutation });
            try { return { workspace, result: await api.read('', 1, 'all') }; }
            catch (error) { return { workspace, result: { ok: false, error: String(error?.message || error) } }; }
        }));
        if (!live.current.mounted || live.current.scope !== scope) return;
        const items = []; const unavailable = [];
        for (const { workspace, result } of results) {
            const brief = { id: workspace.id, name: workspace.name || '' };
            if (!result?.ok || !Array.isArray(result.data?.items)) { unavailable.push(brief); continue; }
            for (const room of result.data.items) if (room.status === 'live' || room.status === 'scheduled') items.push({ workspace: brief, room });
        }
        setState({ scope, loading: false, items: orderOpenClasses(items), unavailable });
    }, [accountId, demo, scope]);
    useEffect(() => {
        live.current.mounted = true; load();
        const timer = setInterval(load, OPEN_CLASSES_POLL_MS);
        return () => { clearInterval(timer); live.current.mounted = false; };
    }, [load]);
    return state.scope === scope ? state : { scope, loading: true, items: [], unavailable: [] };
}
