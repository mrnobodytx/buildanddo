// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useMissionResearch.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/missionResearch.js, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/missionResearch.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx
// DAG Node:    none
// Intent:      Clear research views on scope changes and preserve uncertain commands until their saved receipts are recovered.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { createResearchClient } from '@/lib/missionResearch';

/** Load research records and guard in-flight requests across account changes.
 * @param {object} query Mission and pagination filters.
 * @returns {object} Scoped reads, writes and recovery state.
 */
export function useMissionResearch(query = {}) {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : ''; const scope = `${accountId}:${active?.id || ''}:${demo}`;
    const queryKey = JSON.stringify(query); const key = scope + queryKey;
    const live = useRef({ scope, mounted: true, key }); Object.assign(live.current, { scope, key });
    const request = useRef(0);
    const api = useMemo(() => createResearchClient({ client: pb, workspaceId: active?.id, accountId, demo,
        isCurrent: () => live.current.mounted && live.current.scope === scope, observe: observeMutation }), [active?.id, accountId, demo, scope]);
    const [snapshot, setSnapshot] = useState({ key: '', loading: true, data: null, error: '' });
    const [write, setWrite] = useState({ scope, saving: false, error: '', uncertain: false, saved: null });
    const refresh = useCallback(async () => {
        const attempt = ++request.current;
        setSnapshot({ key, loading: true, data: null, error: '' });
        const result = demo || !accountId || !active?.id ? { ok: false, error: 'Sign in, select a workspace and turn off demonstration mode to use research.' } : await api.read(JSON.parse(queryKey));
        if (!live.current.mounted || live.current.key !== key || request.current !== attempt) return;
        setSnapshot({ key, loading: false, data: result.ok ? result.data : null, error: result.error || '' });
    }, [api, key, queryKey, demo, accountId, active?.id]);
    const reload = useRef(refresh); reload.current = refresh;
    useEffect(() => { live.current.mounted = true; refresh(); return () => { live.current.mounted = false; request.current++; }; }, [refresh]);
    useEffect(() => {
        const visible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
        window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
        return () => { window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
    }, [refresh]);
    const perform = async (operation) => {
        setWrite({ scope, saving: true, error: '', uncertain: false, saved: null });
        const result = await operation();
        if (!live.current.mounted || live.current.scope !== scope) return { ok: false };
        if (result.reason === 'busy') return result;
        setWrite({ scope, saving: false, error: result.error || '', uncertain: result.reason === 'uncertain', saved: result.ok ? result.result : null });
        if (result.ok) await reload.current();
        return result;
    };
    const visible = snapshot.key === key; const writing = write.scope === scope ? write : {};
    return { scope, demo, data: visible ? snapshot.data : null, loading: !visible || snapshot.loading, error: visible ? snapshot.error : '', refresh,
        saving: Boolean(writing.saving), writeError: writing.error || '', uncertain: Boolean(writing.uncertain), saved: writing.saved,
        mutate: (action, payload, revision) => perform(() => api.command(action, payload, revision)), retry: () => perform(() => api.retry()),
        upload: (file) => perform(() => api.upload(file)), uploads: api.uploads, detail: api.detail, original: api.original };
}
