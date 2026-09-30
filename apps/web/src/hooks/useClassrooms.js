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
// Depends:     apps/web/src/lib/classrooms.js, apps/web/src/contexts/WorkspaceContext.jsx, apps/web/src/contexts/AuthContext.jsx
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/classrooms.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx; CONSUMES apps/web/src/contexts/AuthContext.jsx
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
    const { user, isAuthed, sessionEpoch, isSessionCurrent } = useAuth();
    const { active } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : '';
    const workspaceId = active?.id || '';
    const scopeKey = JSON.stringify([accountId, workspaceId, demo, roomId, sessionEpoch]);
    const live = useRef(null);
    if (live.current?.key !== scopeKey) live.current = { key: scopeKey };
    const scope = live.current;
    const key = useMemo(() => ({ scope, page, status }), [scope, page, status]);
    const currentKey = useRef(key); currentKey.current = key;
    const sessionCurrent = useRef(isSessionCurrent); sessionCurrent.current = isSessionCurrent;
    const owner = useRef(null), request = useRef(null), reading = useRef(null);
    const [snapshot, setSnapshot] = useState({ key: null, data: null, loading: true, error: '' });
    const [write, setWrite] = useState({ scope, saving: false, error: '', uncertain: false, saved: null });
    const [presence, setPresence] = useState({ scope, error: '' });
    const authorized = useCallback(() => Boolean(!demo && accountId && workspaceId &&
        pb.authStore.record?.id === accountId && sessionCurrent.current?.(sessionEpoch)), [demo, accountId, workspaceId, sessionEpoch]);
    const isCurrent = useCallback((lifetime) => Boolean(lifetime && owner.current === lifetime &&
        lifetime.scope === scope && live.current === scope && authorized()), [scope, authorized]);

    // An effect owns the client, including its pending receipt. A new room or
    // native session gets a new owner; a page change or token refresh does not.
    // Creating it here also gives StrictMode effect replay a usable fresh client.
    useEffect(() => {
        const lifetime = { scope, api: null, writing: false };
        lifetime.api = createClassroomClient({ client: pb, accountId, workspaceId, demo,
            isCurrent: () => isCurrent(lifetime), observe: observeMutation });
        owner.current = lifetime;
        return () => { lifetime.api.dispose(); if (owner.current === lifetime) owner.current = null; };
    }, [scope, accountId, workspaceId, demo, isCurrent]);

    const load = useCallback(async (quiet = false) => {
        const lifetime = owner.current;
        if (!lifetime || lifetime.scope !== scope || live.current !== scope || currentKey.current !== key) return false;
        if (!authorized()) {
            setSnapshot({ key, loading: false, data: null, error: demo ? 'Turn off demonstration mode to join a real classroom.' : 'Sign in and select a workspace.' });
            return false;
        }
        if (quiet && reading.current?.key === key && reading.current.lifetime === lifetime) return false;
        const attempt = { key, lifetime }; request.current = attempt; reading.current = attempt;
        setSnapshot((old) => old.key === key ? old : { key, loading: true, data: null, error: '' });
        const result = await lifetime.api.read(roomId, page, status);
        if (reading.current === attempt) reading.current = null;
        if (!isCurrent(lifetime) || currentKey.current !== key || attempt !== request.current) return false;
        // Only a transport interruption can retain a disabled last-known view.
        // Permission, malformed-response and missing-record failures hide it.
        setSnapshot((old) => ({ key, lifetime, loading: false, data: result.ok ? result.data :
            result.reason === 'connection' && old.key === key ? old.data : null, error: result.error || '' }));
        return result.ok;
    }, [scope, key, roomId, page, status, demo, authorized, isCurrent]);
    const reload = useRef(load); reload.current = load;
    useEffect(() => {
        void load();
        const timer = setInterval(() => load(true), 5000);
        return () => { clearInterval(timer); if (request.current?.key === key) request.current = null; };
    }, [load, key]);
    const data = snapshot.key === key && snapshot.lifetime === owner.current && authorized() ? snapshot.data : null;
    const membership = data?.membership;
    const activeMember = Boolean(membership?.active && !snapshot.error);
    useEffect(() => {
        const lifetime = owner.current;
        setPresence({ scope, lifetime, error: '' });
        if (!activeMember) return undefined;
        let cancelled = false;
        const beat = async () => {
            if (cancelled || !isCurrent(lifetime)) return;
            const result = await lifetime.api.heartbeat(roomId, { id: membership.id, revision: membership.revision });
            if (cancelled || !isCurrent(lifetime) || result.reason === 'busy') return;
            setPresence({ scope, lifetime, error: result.error || '' });
            if (!result.ok) reload.current(true);
        };
        const timer = setInterval(beat, 20000);
        return () => { cancelled = true; clearInterval(timer); };
    }, [isCurrent, scope, roomId, membership?.id, membership?.revision, activeMember]);
    const perform = useCallback(async (operation) => {
        const lifetime = owner.current;
        if (!isCurrent(lifetime) || lifetime.writing) return { ok: false };
        lifetime.writing = true;
        setWrite({ scope, lifetime, saving: true, error: '', uncertain: false, saved: null });
        const result = await operation(lifetime.api);
        lifetime.writing = false;
        if (!isCurrent(lifetime)) return { ok: false };
        setWrite({ scope, lifetime, saving: false, error: result.error || '', uncertain: result.reason === 'uncertain', saved: result.ok ? result.result : null });
        if (result.ok || ['conflict', 'forbidden'].includes(result.reason)) await reload.current();
        return isCurrent(lifetime) ? result : { ok: false };
    }, [scope, isCurrent]);
    const readRecord = useCallback(() => isCurrent(owner.current) ? owner.current.api.record(roomId) : Promise.resolve({ ok: false }), [isCurrent, roomId]);
    const current = snapshot.key === key;
    const progress = write.scope === scope && write.lifetime === owner.current && authorized() ? write : { saving: false, error: '', uncertain: false, saved: null };
    return { data, loading: !current || snapshot.loading, error: current ? snapshot.error : '', demo, scope: scopeKey,
        connected: current && Boolean(data) && !snapshot.error,
        presenceError: presence.scope === scope && presence.lifetime === owner.current && authorized() ? presence.error : '',
        saving: progress.saving, writeError: progress.error, uncertain: progress.uncertain, saved: progress.saved,
        refresh: () => load(), readRecord,
        mutate: (action, payload, revision) => perform((api) => api.command(action, payload, revision)),
        retry: () => perform((api) => api.retry()) };
}
