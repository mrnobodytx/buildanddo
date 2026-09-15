// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/usePreviousWork.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-COMMUNITY-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/lib/workHistory.js, apps/web/src/contexts/WorkspaceContext.jsx,
//              apps/web/src/hooks/useDemoMode.js, apps/web/src/lib/pocketbaseClient.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/workHistory.js; CONSUMES apps/web/src/hooks/useDemoMode.js;
//              CONSUMES apps/web/src/lib/pocketbaseClient.js
// Intent:      Load seat and receipt history for the current scope without per-row requests or stale account results.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import { lookupPreviousWorkBatch } from '@/lib/workHistory';
import pb from '@/lib/pocketbaseClient';

/**
 * Loads previous-work summaries for a list of subjects in the active workspace.
 *
 * List pages call this once with every visible record id rather than firing a
 * lookup per row. `subjects` is serialized into a stable key so passing a freshly
 * built array on each render does not re-trigger the read.
 *
 * @param {string} subjectType `mission`, `workflow`, `page`, `issue`, `pull_request`, `other`.
 * @param {string[]} subjects Record ids to look up.
 * @returns {{ history: Record<string, object>, loading: boolean, refresh: () => void }}
 */
export function usePreviousWork(subjectType, subjects) {
    const { active } = useWorkspace();
    const { demo } = useDemoMode();
    const accountId = pb.authStore.record?.id || '';
    const workspaceId = active?.id || '';
    const key = JSON.stringify((subjects || []).filter(Boolean));
    const scope = JSON.stringify([accountId, workspaceId, subjectType, key, demo]);
    const enabled = Boolean(accountId && workspaceId && subjectType && key !== '[]' && !demo);
    const [snapshot, setSnapshot] = useState({ scope: '', history: {}, loading: false });
    const requestRef = useRef(0);
    const mountedRef = useRef(false);
    const scopeRef = useRef(scope);
    scopeRef.current = scope;

    const load = useCallback(async () => {
        if (!mountedRef.current || scopeRef.current !== scope) return;
        const request = ++requestRef.current;
        if (!enabled) {
            setSnapshot({ scope, history: {}, loading: false });
            return;
        }
        setSnapshot((before) => ({ scope, history: before.scope === scope ? before.history : {}, loading: true }));
        const result = await lookupPreviousWorkBatch({
            workspaceId,
            subjectType,
            subjects: JSON.parse(key),
        });
        if (mountedRef.current && request === requestRef.current && scopeRef.current === scope &&
            pb.authStore.record?.id === accountId) setSnapshot({ scope, history: result, loading: false });
    }, [accountId, enabled, scope, workspaceId, subjectType, key]);

    useEffect(() => {
        mountedRef.current = true;
        load();
        return () => { mountedRef.current = false; requestRef.current += 1; };
    }, [load]);

    return {
        history: enabled && snapshot.scope === scope ? snapshot.history : {},
        loading: enabled && (snapshot.scope !== scope || snapshot.loading),
        refresh: load,
    };
}

export default usePreviousWork;
