// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/ProtectedRoute.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/contexts/AuthContext.jsx, apps/web/src/lib/navigationIntent.js
// EnumType:    Widget
// EnumEdges:   CONSUMES apps/web/src/contexts/AuthContext.jsx; CONSUMES apps/web/src/lib/navigationIntent.js
// Intent:      Keep private routes closed until the native session is checked and retain the intended local destination.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { workspaceDestination } from '@/lib/navigationIntent';

const ProtectedRoute = ({ children, redirectTo = '/login' }) => {
    const { isAuthed, loading, sessionError, refreshSession, logout } = useAuth();
    const location = useLocation();

    if (loading) return <main className="p-8" role="status">Checking your session…</main>;
    if (sessionError) return <main className="space-y-4 p-8"><p role="alert">{sessionError}</p>
        <button type="button" className="min-h-11 border border-border px-4" onClick={refreshSession}>Retry session check</button>
        <button type="button" className="ml-3 min-h-11 border border-border px-4" onClick={logout}>Sign out</button></main>;
    if (!isAuthed) return <Navigate to={redirectTo} state={{ returnTo: workspaceDestination(`${location.pathname}${location.search}${location.hash}`) }} replace />;

    return children;
}

export default ProtectedRoute;

export { ProtectedRoute };
