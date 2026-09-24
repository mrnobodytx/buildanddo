// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useWorkspaceControl.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/workspaceControl.js, apps/web/src/contexts/WorkspaceContext.jsx
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/workspaceControl.js; CONSUMES apps/web/src/contexts/WorkspaceContext.jsx
// DAG Node:    none
// Intent:      Discard stale control responses and preserve failed form state while coordinating versioned saves and refreshed views.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { createWorkspaceControlClient } from '@/lib/workspaceControl';

// Sentences a surface shows beside a control it has switched off. They live
// here, next to the state that produces them, so two pages cannot describe the
// same access outcome differently.
const ACCESS_CHECKING = 'Checking what you are allowed to do here.';
const ACCESS_READ_ONLY = 'Your role in this workspace is read-only, so you cannot change records here.';
const ACCESS_UNKNOWN = 'We could not confirm what you are allowed to do here, so these controls stay off.';

/** Load a command-backed view for the current account and workspace.
 * @param {string} section Supported endpoint suffix.
 * @param {object} query Bounded pagination arguments.
 * @returns {object} Data, errors, loading, commands and retry controls.
 */
export function useWorkspaceControl(section, query = {}) {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : '';
    const scope = `${accountId}:${active?.id || ''}:${demo}`;
    const queryKey = JSON.stringify(query);
    const key = `${scope}:${section}:${queryKey}`;
    const live = useRef({ scope, key, mounted: true }); live.current.scope = scope; live.current.key = key;
    const request = useRef(0);
    const [snapshot, setSnapshot] = useState({ key: '', loading: true, data: null, error: '' });
    const [write, setWrite] = useState({ scope, saving: false, error: '', uncertain: false, saved: null });
    const api = useMemo(() => createWorkspaceControlClient({ client: pb, accountId, workspaceId: active?.id,
        demo, isCurrent: () => live.current.mounted && live.current.scope === scope, observe: observeMutation }), [accountId, active?.id, demo, scope]);
    const load = useCallback(async () => {
        const attempt = ++request.current;
        if (demo || !accountId || !active?.id) {
            setSnapshot({ key, loading: false, data: null, error: demo ? 'Turn off demonstration mode to use workspace controls.' : 'Sign in and select a workspace.' });
            return false;
        }
        setSnapshot({ key, loading: true, data: null, error: '' });
        const result = await api.read(section, JSON.parse(queryKey));
        if (!live.current.mounted || live.current.key !== key || attempt !== request.current) return false;
        setSnapshot({ key, loading: false, data: result.ok ? result.data : null, error: result.error || '' });
        return result.ok;
    }, [api, section, queryKey, key, demo, accountId, active?.id]);
    const reload = useRef(load); reload.current = load;
    useEffect(() => { live.current.mounted = true; load(); return () => { live.current.mounted = false; request.current++; }; }, [load]);
    const perform = useCallback(async (operation) => {
        if (!live.current.mounted || live.current.key !== key) return { ok: false };
        setWrite({ scope, saving: true, error: '', uncertain: false, saved: null });
        const result = await operation();
        if (!live.current.mounted || live.current.scope !== scope) return { ok: false };
        if (result.reason === 'busy') return result;
        setWrite({ scope, saving: false, error: result.error || '', uncertain: result.reason === 'uncertain', saved: result.ok ? result.result : null });
        if (result.ok) await reload.current();
        return result;
    }, [scope, key]);
    const current = snapshot.key === key;
    const writing = write.scope === scope ? write : { saving: false, error: '', uncertain: false, saved: null };
    const data = current ? snapshot.data : null;
    const loading = !current || snapshot.loading;
    const error = current ? snapshot.error : '';
    // `data: null` answered two different questions - the read is still out,
    // and the read came back with nothing - and a response discarded as out of
    // scope carries no error text at all, so a caller saw "not loading, no
    // data, no reason" and had nothing to put on screen. Name the settled
    // no-answer case and always carry a reason for it. Additive: every field
    // above keeps its previous meaning.
    const unavailableReason = loading || data ? '' : error || 'The request did not return an answer.';
    return { data, loading, error, unavailableReason,
        demo, scope, refresh: load, saving: writing.saving, writeError: writing.error, uncertain: writing.uncertain, saved: writing.saved,
        mutate: (action, payload, revision) => perform(() => api.command(action, payload, revision)),
        retry: () => perform(() => api.retry()) };
}

/** Say in one sentence why an access-gated control is switched off.
 *
 * Three facts used to render as the same nothing: the check is still out, the
 * check said no, and the check never answered. A greyed-out control with no
 * text beside it reads as the second one every time, which is the failure this
 * exists to prevent - so each state names itself, and none of them is guessed.
 *
 * @param {object} access Value from useWorkspaceControl('access') or its context.
 * @returns {string} The sentence, or '' when the control is usable.
 */
export function describeAccess(access) {
    if (access?.loading) return ACCESS_CHECKING;
    if (access?.data) return access.data.can_write ? '' : ACCESS_READ_ONLY;
    const reason = access?.unavailableReason || access?.error || '';
    return reason ? `${ACCESS_UNKNOWN} ${reason}` : ACCESS_UNKNOWN;
}
