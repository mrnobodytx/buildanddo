// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/auth/__tests__/LoginPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/pages/LoginPage.jsx,
//              apps/web/src/components/auth/AuthLayout.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/LoginPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Cover the sign-in form's client validation and both post-login
//              destinations, so a routing regression cannot strand a new user.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import LoginPage from '@/pages/LoginPage';
import {
    createMockWorkspace,
    mockPocketBaseError,
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
} from '@/test/utils';

/**
 * Renders the login route inside the real router so the destination is proved
 * by what gets mounted, not by a spy on `useNavigate`.
 */
const renderLogin = (options = {}) =>
    renderWithProviders(
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app" element={<p>App shell</p>} />
            <Route path="/onboarding" element={<p>Onboarding wizard</p>} />
        </Routes>,
        { route: '/login', auth: { isAuthed: false, user: null }, ...options },
    );

describe('LoginPage', () => {
    beforeEach(() => {
        pb.__reset();
        pb.__setRecords('workspaces', []);
    });

    it('renders the sign-in form', () => {
        renderLogin();

        expect(screen.getByLabelText('Email address')).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sign in/ })).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Create an account' }),
        ).toHaveAttribute('href', '/signup');
    });

    it('asks for both fields before calling the auth API', async () => {
        const user = setupUser();
        const { auth } = renderLogin();

        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        const alerts = await screen.findAllByRole('alert');
        expect(alerts.map((a) => a.textContent)).toEqual([
            'Enter your email address.',
            'Enter your password.',
        ]);
        expect(auth.login).not.toHaveBeenCalled();
    });

    it('rejects a malformed email address', async () => {
        const user = setupUser();
        const { auth } = renderLogin();

        await user.type(screen.getByLabelText('Email address'), 'not-an-email');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'That email address doesn\u2019t look right.',
        );
        expect(screen.getByLabelText('Email address')).toHaveAttribute(
            'aria-invalid',
            'true',
        );
        expect(auth.login).not.toHaveBeenCalled();
    });

    it('clears a field error as soon as the user corrects it', async () => {
        const user = setupUser();
        renderLogin();

        await user.click(screen.getByRole('button', { name: /Sign in/ }));
        expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');

        expect(screen.queryByText('Enter your email address.')).not.toBeInTheDocument();
    });

    it('signs in an existing workspace owner and lands them in the app', async () => {
        const user = setupUser();
        pb.__setRecords('workspaces', [createMockWorkspace()]);
        const { auth } = renderLogin();

        await user.type(screen.getByLabelText('Email address'), '  owner@example.com  ');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        // The email is trimmed before it reaches PocketBase.
        await waitFor(() =>
            expect(auth.login).toHaveBeenCalledWith('owner@example.com', 'correct-horse'),
        );
        expect(await screen.findByText('App shell')).toBeInTheDocument();
    });

    it('sends a brand-new account to onboarding instead of an empty app', async () => {
        const user = setupUser();
        pb.__setRecords('workspaces', []);
        renderLogin();

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        expect(await screen.findByText('Onboarding wizard')).toBeInTheDocument();
    });

    it('falls back to onboarding when the workspace lookup itself fails', async () => {
        // Documents current behaviour: the swallowed lookup error leaves
        // `hasWorkspace` false, so the user is routed to onboarding. The inline
        // comment in LoginPage.jsx claims the opposite ("default to app") —
        // reported alongside this change rather than altered here.
        const user = setupUser();
        pb.__setError('workspaces');
        renderLogin();

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        expect(await screen.findByText('Onboarding wizard')).toBeInTheDocument();
    });

    it('surfaces the server message when the credentials are rejected', async () => {
        const user = setupUser();
        renderLogin({
            auth: {
                isAuthed: false,
                user: null,
                login: vi.fn(() =>
                    Promise.reject(mockPocketBaseError('Failed to authenticate.')),
                ),
            },
        });

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'wrong-password');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Failed to authenticate.',
        );
        expect(screen.queryByText('App shell')).not.toBeInTheDocument();
    });

    it('falls back to a plain-language error when the server sends none', async () => {
        const user = setupUser();
        renderLogin({
            auth: {
                isAuthed: false,
                user: null,
                login: vi.fn(() => Promise.reject(new Error('network down'))),
            },
        });

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'We couldn\u2019t sign you in.',
        );
    });

    it('disables the submit button while the request is in flight', async () => {
        const user = setupUser();
        renderLogin({
            auth: {
                isAuthed: false,
                user: null,
                login: vi.fn(() => new Promise(() => {})),
            },
        });

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        const submit = await screen.findByRole('button', { name: /Signing in/ });
        expect(submit).toBeDisabled();
    });
});
