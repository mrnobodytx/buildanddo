// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useClassrooms.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-16
// Depends:     apps/web/src/lib/classrooms.js, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/classrooms.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx
// DAG Node:    none
// Intent:      Keep shared lessons current and attendance expiring while discarding responses and drafts from an earlier account or room.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { createClassroomClient } from '@/lib/classrooms';

/** @param {string} roomId Optional saved room. @param {number} page Result page. @param {string} status Room filter. @returns {object} Current room, connection and save controls. */
export function useClassrooms(roomId = '', page = 1, status = 'all') {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : '';
    const scope = `${accountId}:${active?.id || ''}:${demo}:${roomId}`;
    const key = `${scope}:${page}:${status}`;
    const live = useRef({ scope, key, mounted: true }); live.current.scope = scope; live.current.key = key;
    const request = useRef(0); const reading = useRef(''); const writing = useRef('');
    const [snapshot, setSnapshot] = useState({ key: '', data: null, loading: true, error: '' });
    const [write, setWrite] = useState({ scope, saving: false, error: '', uncertain: false, saved: null });
    const [presence, setPresence] = useState({ scope, error: '' });
    const api = useMemo(() => createClassroomClient({ client: pb, accountId, workspaceId: active?.id, demo,
        isCurrent: () => live.current.mounted && live.current.scope === scope, observe: observeMutation }), [accountId, active?.id, demo, scope]);
    const load = useCallback(async (quiet = false) => {
        if (quiet && reading.current === key) return false;
        const attempt = ++request.current; reading.current = key;
        if (demo || !accountId || !active?.id) {
            setSnapshot({ key, loading: false, data: null, error: demo ? 'Turn off demonstration mode to join a real classroom.' : 'Sign in and select a workspace.' });
            reading.current = '';
            return false;
        }
        setSnapshot((old) => old.key === key ? old : { key, loading: true, data: null, error: '' });
        const result = await api.read(roomId, page, status);
        if (!live.current.mounted || live.current.key !== key || attempt !== request.current) return false;
        reading.current = '';
        // Only a transport interruption can retain a disabled last-known view.
        // Permission, malformed-response and missing-record failures hide it.
        setSnapshot((old) => ({ key, loading: false, data: result.ok ? result.data :
            result.reason === 'connection' && old.key === key ? old.data : null, error: result.error || '' }));
        return result.ok;
    }, [api, key, roomId, page, status, demo, accountId, active?.id]);
    const reload = useRef(load); reload.current = load;
    useEffect(() => {
        live.current.mounted = true; load();
        const timer = setInterval(() => load(true), 5000);
        return () => { clearInterval(timer); live.current.mounted = false; request.current++; reading.current = ''; };
    }, [load]);
    const data = snapshot.key === key ? snapshot.data : null;
    const membership = data?.membership;
    const activeMember = Boolean(membership?.active && !snapshot.error);
    useEffect(() => {
        setPresence({ scope, error: '' });
        if (!activeMember) return undefined;
        let cancelled = false;
        const beat = async () => {
            const result = await api.heartbeat(roomId, { id: membership.id, revision: membership.revision });
            if (cancelled || !live.current.mounted || live.current.scope !== scope || result.reason === 'busy') return;
            setPresence({ scope, error: result.error || '' });
            if (!result.ok) reload.current(true);
        };
        const timer = setInterval(beat, 20000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [api, scope, roomId, membership?.id, membership?.revision, activeMember]);
    const perform = useCallback(async (operation) => {
        if (!live.current.mounted || live.current.scope !== scope || writing.current === scope) return { ok: false };
        writing.current = scope;
        setWrite({ scope, saving: true, error: '', uncertain: false, saved: null });
        const result = await operation();
        if (writing.current === scope) writing.current = '';
        if (!live.current.mounted || live.current.scope !== scope) return { ok: false };
        setWrite({ scope, saving: false, error: result.error || '', uncertain: result.reason === 'uncertain', saved: result.ok ? result.result : null });
        if (result.ok || ['conflict', 'forbidden'].includes(result.reason)) await reload.current();
        return result;
    }, [scope]);
    const current = snapshot.key === key;
    const progress = write.scope === scope ? write : { saving: false, error: '', uncertain: false, saved: null };
    return { data, loading: !current || snapshot.loading, error: current ? snapshot.error : '', demo, scope,
        connected: current && Boolean(data) && !snapshot.error,
        presenceError: presence.scope === scope ? presence.error : '',
        saving: progress.saving, writeError: progress.error, uncertain: progress.uncertain, saved: progress.saved,
        refresh: () => load(), mutate: (action, payload, revision) => perform(() => api.command(action, payload, revision)),
        retry: () => perform(() => api.retry()) };
}
