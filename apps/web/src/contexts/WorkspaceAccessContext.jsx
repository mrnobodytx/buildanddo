// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/WorkspaceAccessContext.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/hooks/useWorkspaceControl.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/hooks/useWorkspaceControl.js
// DAG Node:    none
// Intent:      Share observed workspace capabilities across navigation and settings without treating the browser as an authorization authority.
// ───────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect } from 'react';
import { useWorkspaceControl } from '@/hooks/useWorkspaceControl';

const WorkspaceAccessContext = createContext({ data: null, loading: false, error: '', refresh: async () => false });

export function WorkspaceAccessProvider({ children }) {
    const state = useWorkspaceControl('access');
    useEffect(() => {
        const refresh = () => { if (document.visibilityState === 'visible') state.refresh(); };
        window.addEventListener('focus', refresh);
        return () => window.removeEventListener('focus', refresh);
    }, [state.refresh]);
    return <WorkspaceAccessContext.Provider value={state}>{children}</WorkspaceAccessContext.Provider>;
}

export const useWorkspaceAccess = () => useContext(WorkspaceAccessContext);
export default WorkspaceAccessContext;
