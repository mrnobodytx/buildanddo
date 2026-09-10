// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/auth/__tests__/ProtectedRoute.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/components/ProtectedRoute.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/ProtectedRoute.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      The redirect is the only thing standing between an anonymous
//              visitor and the workspace shell; assert it, do not assume it.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/ProtectedRoute';
import { renderWithProviders, screen } from '@/test/utils';

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
