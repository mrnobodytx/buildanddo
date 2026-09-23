// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/CareerProfileContext.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-CAREER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CAREER-001
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
    const scope = useRef(accountId); scope.current = accountId;
    const [value, setValue] = useState(SIGNED_OUT);
    const reload = useCallback(async () => {
        if (!accountId) { setValue(demo && isAuthed ? { ...SIGNED_OUT, status: 'demo' } : SIGNED_OUT); return; }
        setValue({ status: 'loading', profile: null, issuedAt: '' });
        const client = createCareerProfileClient({ client: pb, accountId, isCurrent: () => scope.current === accountId });
        const result = await client.load();
        if (scope.current !== accountId || result.reason === 'scope_changed') return;
        setValue(result.ok ? { status: result.state, profile: result.profile, issuedAt: result.issuedAt }
            : { status: result.reason, profile: null, issuedAt: '' });
    }, [accountId, demo, isAuthed]);
    useEffect(() => { reload(); }, [reload]);
    const context = useMemo(() => ({ ...value, reload }), [value, reload]);
    return <CareerProfileContext.Provider value={context}>{children}</CareerProfileContext.Provider>;
}

export const useCareerProfile = () => useContext(CareerProfileContext);
