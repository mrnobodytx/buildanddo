// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/hooks/useLearningSummary.js
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-BUDDI-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-BUDDI-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/lib/tutorialLearning.js, apps/web/src/contexts/AuthContext.jsx, apps/web/src/hooks/useDemoMode.js
// EnumType:    Hook
// EnumEdges:   CONSUMES apps/web/src/lib/tutorialLearning.js
// DAG Node:    none
// Intent:      Read the signed-in person's server-issued learning summary for display only.
// ───────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createTutorialLearningClient } from '@/lib/tutorialLearning';

/** @returns {{data: object|null, loading: boolean}} The learning summary, or null when absent, demo or unreadable. */
export function useLearningSummary() {
    const { user } = useAuth() || {};
    const { demo } = useDemoMode();
    const userId = user?.id || '';
    const [state, setState] = useState({ data: null, loading: Boolean(userId && !demo) });
    useEffect(() => {
        if (!userId || demo) { setState({ data: null, loading: false }); return undefined; }
        let alive = true;
        setState({ data: null, loading: true });
        const client = createTutorialLearningClient({ client: pb, accountId: userId, isCurrent: () => alive });
        client.read('', 1)
            .then((result) => { if (alive) setState({ data: result.ok ? result.data : null, loading: false }); })
            .catch(() => { if (alive) setState({ data: null, loading: false }); });
        return () => { alive = false; };
    }, [userId, demo]);
    return state;
}
