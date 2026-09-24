// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/usePrivateDossier.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/lib/privateDossier.js, apps/web/src/contexts/AuthContext.jsx, apps/web/src/lib/observability/mutations.js,
//              apps/web/src/lib/observability/runtime.js, apps/web/src/lib/navigationIntent.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/privateDossier.js; CONSUMES apps/web/src/contexts/AuthContext.jsx; CONSUMES apps/web/src/lib/observability/mutations.js;
//              CONSUMES apps/web/src/lib/observability/runtime.js; CONSUMES apps/web/src/lib/navigationIntent.js
// DAG Node:    none
// Intent:      Clear decrypted dossier views across account changes and preserve only recoverable in-memory write intent.
// ───────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { observeMutation } from '@/lib/observability/mutations';
import { readFailed } from '@/lib/observability/runtime';
import { telemetrySection } from '@/lib/navigationIntent';
import { createDossierClient } from '@/lib/privateDossier';

/** Load private personal entities independently of the selected workspace.
 * @param {string} query Explicitly submitted search text.
 * @param {number} page Requested bounded result page.
 * @returns {object} Current account data, writes and recovery state.
 */
export function usePrivateDossier(query = '', page = 1) {
    const { user, isAuthed } = useAuth(); const { demo } = useDemoMode();
    const accountId = isAuthed ? user?.id || '' : ''; const scope = `${accountId}:${demo}`;
    const key = JSON.stringify([scope, query, page]);
    const live = useRef({ scope, key, mounted: true }); Object.assign(live.current, { scope, key });
    const request = useRef(0);
    const api = useMemo(() => createDossierClient({ client: pb, accountId, demo,
        isCurrent: () => live.current.mounted && live.current.scope === scope, observe: observeMutation }), [accountId, demo, scope]);
    const [snapshot, setSnapshot] = useState({ key: '', data: null, loading: true, error: '' });
    const [write, setWrite] = useState({ scope, saving: false, uncertain: false, error: '', saved: null });
    const refresh = useCallback(async () => {
        const attempt = ++request.current;
        setSnapshot({ key, data: null, loading: true, error: '' });
        const pathname = globalThis.window?.location?.pathname;
        const section = telemetrySection(pathname);
        const result = !accountId || demo ? { ok: false, error: 'Sign in and turn off demonstration mode to use your private dossier.' } : await api.recall(query, page);
        if (!live.current.mounted || live.current.key !== key || request.current !== attempt) return;
        if (accountId && !demo && !result.ok && !['invalid', 'scope_changed', 'cancelled'].includes(result.reason) && pathname === globalThis.window?.location?.pathname)
            readFailed(section, 'dossier', result.reason);
        setSnapshot({ key, data: result.ok ? result.data : null, loading: false, error: result.error || '' });
    }, [accountId, demo, api, query, page, key]);
    const reload = useRef(refresh); reload.current = refresh;
    useEffect(() => {
        live.current.mounted = true;
        return () => { live.current.mounted = false; request.current++; api.dispose(); };
    }, [api]);
    useEffect(() => { refresh(); }, [refresh]);
    const perform = async (operation) => {
        if (write.scope === scope && write.saving) return { ok: false, reason: 'busy' };
        setWrite({ scope, saving: true, uncertain: false, error: '', saved: null });
        const result = await operation();
        if (!live.current.mounted || live.current.scope !== scope) return { ok: false };
        if (result.reason === 'busy') return result;
        setWrite({ scope, saving: false, uncertain: result.reason === 'uncertain', error: result.error || '', saved: result.ok ? result.result : null });
        if (result.ok) await reload.current();
        return result;
    };
    const visible = snapshot.key === key; const writing = write.scope === scope ? write : {};
    return { scope, user, demo, data: visible ? snapshot.data : null, loading: !visible || snapshot.loading,
        error: visible ? snapshot.error : '', refresh, saving: Boolean(writing.saving), uncertain: Boolean(writing.uncertain),
        writeError: writing.error || '', saved: writing.saved || null,
        command: (action, payload, revision) => perform(() => api.command(action, payload, revision)),
        retry: () => perform(() => api.retry()), detail: api.detail, history: api.history };
}
