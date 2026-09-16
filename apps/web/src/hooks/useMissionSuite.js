// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useMissionSuite.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/lib/missionSuite.js, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/missionSuite.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx
// DAG Node:    none
// Intent:      Reconcile suite runs and recoverable writes without retaining another account or mission's private state.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { createSuiteClient } from '@/lib/missionSuite';
import { observeMutation } from '@/lib/observability/mutations';
import pb from '@/lib/pocketbaseClient';

/** @param {string} missionId Selected mission. @param {number} page History page. @returns {object} Scoped suite state and mutations. */
export function useMissionSuite(missionId, page = 1) {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : ''; const scope = `${accountId}:${active?.id || ''}:${missionId}:${demo}`; const key = `${scope}:${page}`;
    const live = useRef({ mounted: true, scope, key }); Object.assign(live.current, { scope, key });
    const sequence = useRef(0); const latch = useRef(false);
    const api = useMemo(() => createSuiteClient({ client: pb, workspaceId: active?.id, missionId, accountId, demo,
        isCurrent: () => live.current.mounted && live.current.scope === scope, observe: observeMutation }), [active?.id, missionId, accountId, demo, scope]);
    const [snapshot, setSnapshot] = useState({ key: '', data: null, loading: true, error: '' });
    const [write, setWrite] = useState({ scope, saving: false, error: '', uncertain: false, saved: null });
    const refresh = useCallback(async () => {
        const attempt = ++sequence.current;
        setSnapshot((old) => ({ key, data: old.key === key ? old.data : null, loading: true, error: '' }));
        const result = !missionId || !accountId || !active?.id || demo ? { ok: false, error: 'Choose a saved mission in an authenticated workspace to use the suite.' } : await api.read(page);
        if (!live.current.mounted || live.current.key !== key || sequence.current !== attempt) return;
        setSnapshot({ key, loading: false, data: result.ok ? result.data : null, error: result.error || '' });
    }, [api, key, page, missionId, accountId, active?.id, demo]);
    const reload = useRef(refresh); reload.current = refresh;
    useEffect(() => { live.current.mounted = true; refresh(); return () => { live.current.mounted = false; sequence.current++; }; }, [refresh]);
    useEffect(() => {
        const refetch = () => { if (document.visibilityState !== 'hidden') void refresh(); };
        window.addEventListener('focus', refetch);
        return () => window.removeEventListener('focus', refetch);
    }, [refresh]);
    const perform = async (operation) => {
        if (latch.current) return { ok: false, reason: 'busy' };
        latch.current = true; setWrite({ scope, saving: true, error: '', uncertain: false, saved: null });
        try {
            const result = await operation();
            if (!live.current.mounted || live.current.scope !== scope) return { ok: false };
            setWrite({ scope, saving: false, error: result.error || '', uncertain: result.reason === 'uncertain', saved: result.ok ? result.result : null });
            if (result.ok) await reload.current();
            return result;
        } finally { latch.current = false; }
    };
    const visible = snapshot.key === key; const writing = write.scope === scope ? write : {};
    return { scope, demo, data: visible ? snapshot.data : null, loading: !visible || snapshot.loading, error: visible ? snapshot.error : '', refresh,
        saving: Boolean(writing.saving), writeError: writing.error || '', uncertain: Boolean(writing.uncertain), saved: writing.saved,
        mutate: (action, payload, revision) => perform(() => api.command(action, payload, revision)), retry: () => perform(api.retry), detail: api.detail };
}
