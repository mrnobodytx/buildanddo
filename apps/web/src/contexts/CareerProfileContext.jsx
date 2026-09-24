// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/CareerProfileContext.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CAREER-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/careerProfile.js, apps/web/src/contexts/AuthContext.jsx, apps/web/src/hooks/useDemoMode.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/careerProfile.js; CONSUMES apps/web/src/contexts/AuthContext.jsx
// DAG Node:    none
// Intent:      Load the user's career profile from Citadel Nexus as soon as they sign in, and drop it the moment they sign out or switch account.
// ───────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createCareerProfileClient } from '@/lib/careerProfile';

const SIGNED_OUT = Object.freeze({ status: 'signed_out', profile: null, issuedAt: '' });
const CareerProfileContext = createContext({ ...SIGNED_OUT, reload: async () => {} });

/** Provide the signed-in user's career profile; it never blocks sign-in and is held in memory only. */
export function CareerProfileProvider({ children }) {
    const { user, isAuthed } = useAuth(); const { demo } = useDemoMode();
    const accountId = isAuthed && !demo ? user?.id || '' : '';
    const live = useRef({ accountId, mounted: true }); live.current.accountId = accountId;
    const api = useMemo(() => createCareerProfileClient({ client: pb, accountId,
        isCurrent: () => live.current.mounted && live.current.accountId === accountId }), [accountId]);
    const [value, setValue] = useState({ ...SIGNED_OUT, accountId: '' });
    const reload = useCallback(async () => {
        if (!live.current.mounted || live.current.accountId !== accountId) return;
        if (!accountId) { setValue({ ...SIGNED_OUT, accountId: '' }); return; }
        setValue({ accountId, status: 'loading', profile: null, issuedAt: '' });
        const result = await api.load();
        if (!live.current.mounted || live.current.accountId !== accountId || result.reason === 'scope_changed') return;
        setValue(result.ok ? { accountId, status: result.state, profile: result.profile, issuedAt: result.issuedAt }
            : { accountId, status: result.reason, profile: null, issuedAt: '' });
    }, [accountId, api]);
    useEffect(() => {
        live.current.mounted = true; api.activate(); void reload();
        return () => { live.current.mounted = false; api.dispose(); };
    }, [api, reload]);
    // Hide the previous account during render, before effect cleanup can run.
    const visible = !accountId ? { ...SIGNED_OUT, status: demo && isAuthed ? 'demo' : 'signed_out' }
        : value.accountId === accountId ? value : { ...SIGNED_OUT, status: 'loading' };
    const context = { ...visible, reload };
    return <CareerProfileContext.Provider value={context}>{children}</CareerProfileContext.Provider>;
}

export const useCareerProfile = () => useContext(CareerProfileContext);
