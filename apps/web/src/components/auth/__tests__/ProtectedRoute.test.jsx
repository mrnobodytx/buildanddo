// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/auth/__tests__/ProtectedRoute.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/components/ProtectedRoute.jsx, apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/ProtectedRoute.jsx; CONSUMES apps/web/src/test/utils.jsx
// Intent:      The redirect is the only thing standing between an anonymous visitor and the workspace shell; assert it, do not assume it.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import { renderWithProviders, screen, setupUser } from '@/test/utils';

const WORKSPACE_TEXT = 'Workspace shell';

const renderGuarded = ({ isAuthed, redirectTo }) =>
    renderWithProviders(
        <Routes>
            <Route path="/login" element={<p>Sign-in screen</p>} />
            <Route path="/" element={<p>Marketing home</p>} />
            <Route
                path="/app"
                element={
                    <ProtectedRoute {...(redirectTo ? { redirectTo } : {})}>
                        <p>{WORKSPACE_TEXT}</p>
                    </ProtectedRoute>
                }
            />
        </Routes>,
        { route: '/app', auth: { isAuthed } },
    );

describe('ProtectedRoute', () => {
    it('withholds private children while a persisted session is being revalidated', () => {
        renderWithProviders(<ProtectedRoute><p>{WORKSPACE_TEXT}</p></ProtectedRoute>, { auth: { loading: true } });
        expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
        expect(screen.queryByText(WORKSPACE_TEXT)).not.toBeInTheDocument();
    });
    it('keeps unavailable sessions explicit and lets the user retry or sign out', async () => {
        const user = setupUser(), refreshSession = vi.fn(), logout = vi.fn();
        renderWithProviders(<ProtectedRoute><p>{WORKSPACE_TEXT}</p></ProtectedRoute>, {
            auth: { isAuthed: false, loading: false, sessionError: 'Session service unavailable', refreshSession, logout },
        });
        expect(screen.getByRole('alert')).toHaveTextContent('Session service unavailable');
        expect(screen.queryByText(WORKSPACE_TEXT)).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Retry session check' }));
        expect(refreshSession).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(logout).toHaveBeenCalledTimes(1);
    });
    it('retains the local classroom and workspace through the sign-in redirect', () => {
        function Destination() { return <p>{useLocation().state?.returnTo}</p>; }
        renderWithProviders(<Routes><Route path="/login" element={<Destination />} />
            <Route path="/app/classrooms/:roomId" element={<ProtectedRoute><p>Private class</p></ProtectedRoute>} /></Routes>,
        { route: '/app/classrooms/roomalpha?workspace=ws_test', auth: { isAuthed: false } });
        expect(screen.getByText('/app/classrooms/roomalpha?workspace=ws_test')).toBeInTheDocument();
        expect(screen.queryByText('Private class')).not.toBeInTheDocument();
    });
    it('sends an anonymous visitor to the sign-in screen', () => {
        renderGuarded({ isAuthed: false });

        expect(screen.getByText('Sign-in screen')).toBeInTheDocument();
        expect(screen.queryByText(WORKSPACE_TEXT)).not.toBeInTheDocument();
    });

    it('renders the guarded tree for a signed-in user', () => {
        renderGuarded({ isAuthed: true });

        expect(screen.getByText(WORKSPACE_TEXT)).toBeInTheDocument();
        expect(screen.queryByText('Sign-in screen')).not.toBeInTheDocument();
    });

    it('honours a custom redirect target', () => {
        renderGuarded({ isAuthed: false, redirectTo: '/' });

        expect(screen.getByText('Marketing home')).toBeInTheDocument();
        expect(screen.queryByText('Sign-in screen')).not.toBeInTheDocument();
    });
});
