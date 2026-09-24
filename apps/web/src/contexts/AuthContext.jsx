// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/contexts/AuthContext.jsx
// Stage:       07_BUILD
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-21
// Depends:     apps/web/src/lib/authSession.js, apps/web/src/lib/pocketbaseClient.js
// EnumType:    Adapter
// EnumEdges:   CONSUMES apps/web/src/lib/authSession.js; CONSUMES apps/web/src/lib/pocketbaseClient.js
// Intent:      Expose native session readiness and recovery while excluding stale account responses.
// ───────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import pb from '@/lib/pocketbaseClient';
import { trackAuthIdentity } from '@/lib/observability/runtime';
import { identifyAnalyticsUser } from '@/lib/telemetry';
import { createAuthSession } from '@/lib/authSession';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState({ user: null, status: 'checking', error: '', sessionEpoch: 0 });
    const controller = useMemo(() => createAuthSession(pb, setSession), []);
    const user = session.status === 'ready' ? session.user : null;
    useEffect(() => {
        controller.start();
        const refresh = () => { if (document.visibilityState === 'visible') controller.refresh(); };
        window.addEventListener('focus', refresh);
        const timer = window.setInterval(refresh, 60_000);
        return () => { controller.stop(); window.removeEventListener('focus', refresh); window.clearInterval(timer); };
    }, [controller]);

    useEffect(() => { trackAuthIdentity(user); identifyAnalyticsUser(user); }, [user]);

    const value = useMemo(
        () => ({
            user,
            sessionEpoch: session.sessionEpoch,
            isSessionCurrent: controller.isCurrent,
            isAuthed: session.status === 'ready' && pb.authStore.isValid && user?.id === pb.authStore.record?.id,
            loading: session.status === 'checking',
            sessionError: session.error,
            refreshSession: controller.refresh,
            login: async (email, password) => {
                const result = await pb.collection('users').authWithPassword(email, password);
                await controller.refresh();
                return result;
            },
            signup: async (email, password, extraFields = {}) => {
                await pb.collection('users').create({ email, password, passwordConfirm: password, ...extraFields });

                const result = await pb.collection('users').authWithPassword(email, password);
                await controller.refresh();
                return result;
            },
            logout: () => pb.authStore.clear(),
        }),
        [user, session.status, session.error, session.sessionEpoch, controller],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
