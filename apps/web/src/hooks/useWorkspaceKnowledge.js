// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useWorkspaceKnowledge.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-18
// Depends:     apps/web/src/lib/workspaceKnowledge.js,
//              apps/web/src/lib/observability/runtime.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/workspaceKnowledge.js;
//              CONSUMES apps/web/src/lib/observability/runtime.js; CONSUMES apps/web/src/lib/navigationIntent.js
// DAG Node:    none
// Intent:      Assemble context automatically on query and scope changes while bounding visible polling and clearing stale private results.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createKnowledgeClient } from '@/lib/workspaceKnowledge';
import { readFailed } from '@/lib/observability/runtime';
import { telemetrySection } from '@/lib/navigationIntent';

/** Assemble current context after input settles and refresh while the page is visible. */
export function useWorkspaceKnowledge(options = {}) {
    const { user, isAuthed } = useAuth(); const { active } = useWorkspace(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : ''; const workspaceId = active?.id || '';
    const scope = `${accountId}:${workspaceId}:${demo}`;
    const optionsKey = JSON.stringify(options); const key = scope + optionsKey;
    const live = useRef({ mounted: true, scope, key }); Object.assign(live.current, { scope, key });
    const request = useRef({ sequence: 0, controller: null, running: false });
    const api = useMemo(() => createKnowledgeClient({ client: pb, accountId, workspaceId, demo,
        isCurrent: () => live.current.mounted && live.current.scope === scope }), [accountId, workspaceId, demo, scope]);
    const [state, setState] = useState({ key: '', data: null, loading: true, error: '' });
    const refresh = useCallback(async () => {
        if (request.current.running) return;
        const sequence = ++request.current.sequence;
        const controller = new AbortController(); request.current.controller = controller; request.current.running = true;
        setState({ key, data: null, loading: true, error: '' });
        const pathname = globalThis.window?.location?.pathname;
        const section = telemetrySection(pathname);
        let timedOut = false;
        const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 15000);
        try {
            const result = !accountId || !workspaceId || demo ? { ok: false, error: 'Sign in and select a workspace outside demonstration mode to assemble knowledge.' } :
                await api.assemble(JSON.parse(optionsKey), controller.signal);
            if (live.current.mounted && live.current.key === key && request.current.sequence === sequence) {
                const readFailure = timedOut && result.readFailure?.reason === 'cancelled' ? { reason: 'network', status: 0 } : result.readFailure;
                if (readFailure && pathname === globalThis.window?.location?.pathname)
                    readFailed(section, 'knowledge', readFailure.reason, readFailure.status);
                setState({ key, data: result.ok ? result.data : null, loading: false, error: result.error || '', readFailure });
            }
        } finally {
            clearTimeout(timeout);
            if (request.current.sequence === sequence) { request.current.running = false; request.current.controller = null; }
        }
    }, [api, accountId, workspaceId, demo, key, optionsKey]);
    useEffect(() => {
        live.current.mounted = true;
        const visible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
        const initial = setTimeout(visible, 250);
        const interval = accountId && workspaceId && !demo ? setInterval(visible, 30000) : null;
        window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
        return () => {
            live.current.mounted = false; request.current.sequence++; request.current.controller?.abort(); request.current.running = false;
            clearTimeout(initial); clearInterval(interval);
            window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible);
        };
    }, [refresh, accountId, workspaceId, demo]);
    const current = state.key === key;
    return { scope, demo, data: current ? state.data : null, error: current ? state.error : '', loading: !current || state.loading, refresh,
        readFailure: current && !state.loading ? state.readFailure : undefined };
}
