// ─── CGRF Header ───────────────────────────────────────────────
// File:         apps/web/src/hooks/useBusinessExecution.js
// Stage:        07_BUILD
// SRS:          SRS-BUILDANDDO-UPGRADE-001
// CAPS:         pending
// CK:           pending
// Dispatch:     VCC-BUILDANDDO-UPGRADE-001
// Seat:         BITS-CODEGEN
// Owner:        Citadel Nexus Inc.
// Created:      2026-09-20
// Depends:      apps/web/src/lib/businessExecution.js
// EnumType:     Adapter
// EnumEdges:    DEPENDS_ON apps/web/src/lib/businessExecution.js
// DAG Node:     none
// Intent:       Discard execution responses after an account, workspace or demonstration-mode change.
// ───────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useDemoMode } from '@/hooks/useDemoMode';
import pb from '@/lib/pocketbaseClient';
import { createBusinessClient } from '@/lib/businessExecution';
/** Bind execution operations to a live account and selected workspace. */
export function useBusinessExecution() {
    const { user } = useAuth(), { active } = useWorkspace(), { demo } = useDemoMode();
    const scope = `${user?.id}:${active?.id}:${demo}`, current = useRef(scope);
    current.current = scope;
    useEffect(() => { current.current = scope; return () => { if (current.current === scope) current.current = ''; }; }, [scope]);
    const api = useMemo(() => createBusinessClient({ client: pb, workspaceId: active?.id, accountId: user?.id,
        isCurrent: () => current.current === scope && !demo }), [scope, active?.id, user?.id, demo]);
    return { api, scope, demo };
}
