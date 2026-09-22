// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/WorkspaceContext.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/contexts/AuthContext.jsx, apps/web/src/lib/pocketbaseClient.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/contexts/AuthContext.jsx; CONSUMES apps/web/src/lib/pocketbaseClient.js
// DAG Node:    none
// Intent:      Bind loaded workspaces to the current account so late requests cannot retain another account selection.
// ───────────────────────────────────────────────────────────────

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import pb from '@/lib/pocketbaseClient';
import { useAuth } from '@/contexts/AuthContext';

const WorkspaceContext = createContext(null);
const ACTIVE_KEY = 'bad_active_ws';

export const WorkspaceProvider = ({ children }) => {
    const { isAuthed, user } = useAuth();
    const accountId = isAuthed ? user?.id || '' : '';
    const [snapshot, setSnapshot] = useState({
        accountId: '',
        records: [],
        loading: false,
        error: '',
    });
    const [selection, setSelection] = useState({ accountId: '', id: null });
    const requestRef = useRef(0);

    const load = useCallback(async (preferredId = '') => {
        const request = ++requestRef.current;
        if (!accountId) {
            setSnapshot({ accountId: '', records: [], loading: false, error: '' });
            return;
        }
        setSnapshot({ accountId, records: [], loading: true, error: '' });
        try {
            const list = await pb.collection('workspaces').getFullList({
                sort: '-created',
                expand: 'domain',
                requestKey: null,
            });
            if (request !== requestRef.current) return;
            if (preferredId && list.some((record) => record.id === preferredId))
                setSelection({ accountId, id: preferredId });
            setSnapshot({ accountId, records: list, loading: false, error: '' });
            return list;
        } catch {
            if (request !== requestRef.current) return;
            setSnapshot({
                accountId,
                records: [],
                loading: false,
                error: 'Could not load your workspaces. Try again.',
            });
        }
    }, [accountId]);

    useEffect(() => {
        load();
        return () => {
            requestRef.current += 1;
        };
    }, [load]);

    // Hide the previous account during render, before the next effect starts.
    const current = snapshot.accountId === accountId;
    const workspaces = accountId && current ? snapshot.records : [];
    const loading = Boolean(accountId && (!current || snapshot.loading));
    const error = accountId && current ? snapshot.error : '';
    let storedId = null;
    try { storedId = localStorage.getItem(`${ACTIVE_KEY}:${accountId}`); } catch { /* Storage is optional. */ }
    const activeId = selection.accountId === accountId ? selection.id : storedId;
    const active = workspaces.find((w) => w.id === activeId) || workspaces[0] || null;

    useEffect(() => {
        try { if (active && accountId) localStorage.setItem(`${ACTIVE_KEY}:${accountId}`, active.id); } catch { /* Storage is optional. */ }
    }, [active, accountId]);

    const setActive = (id) => { if (workspaces.some((record) => record.id === id)) setSelection({ accountId, id }); };

    return (
        <WorkspaceContext.Provider
            value={{
                workspaces,
                active,
                setActive,
                loading,
                error,
                hasWorkspaces: workspaces.length > 0,
                refresh: load,
            }}
        >
            {children}
        </WorkspaceContext.Provider>
    );
};

export const useWorkspace = () => useContext(WorkspaceContext);

export default WorkspaceContext;
