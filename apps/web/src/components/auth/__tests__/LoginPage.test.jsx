// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/auth/__tests__/LoginPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/pages/LoginPage.jsx,
//              apps/web/src/components/auth/AuthLayout.jsx,
//              apps/web/src/pages/SignupPage.jsx,
//              apps/web/src/pages/ForgotPasswordPage.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/LoginPage.jsx;
//              VALIDATES apps/web/src/components/auth/AuthLayout.jsx;
//              VALIDATES apps/web/src/pages/SignupPage.jsx;
//              VALIDATES apps/web/src/pages/ForgotPasswordPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Keep validation, password visibility and failed-login recovery
//              accessible while preserving classroom destinations through account access.
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
import SignupPage from '@/pages/SignupPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
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
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/app" element={<p>App shell</p>} />
            <Route path="/app/classrooms/:roomId" element={<p>Requested classroom</p>} />
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

        expect(screen.getByRole('heading', { level: 1, name: 'Welcome back.' })).toBeInTheDocument();
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
        expect(screen.getByLabelText('Email address')).toHaveFocus();
        expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
            'Use your account email, not your display name. Enter your email address.',
        );
        expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    });

    it('focuses the password when only that field is missing', async () => {
        const user = setupUser();
        const { auth } = renderLogin();

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.keyboard('{Enter}');

        expect(await screen.findByRole('alert')).toHaveTextContent('Enter your password.');
        expect(screen.getByLabelText('Password')).toHaveFocus();
        expect(auth.login).not.toHaveBeenCalled();
    });

    it('reveals and hides the same password without submitting the form', async () => {
        const user = setupUser();
        const { auth } = renderLogin();
        const password = screen.getByLabelText('Password');

        await user.type(password, 'correct-horse');
        expect(password).toHaveAttribute('type', 'password');
        await user.click(screen.getByRole('button', { name: 'Show password' }));
        expect(password).toHaveAttribute('type', 'text');
        expect(password).toHaveValue('correct-horse');
        const hide = screen.getByRole('button', { name: 'Hide password' });
        expect(hide).toHaveAttribute('aria-controls', password.id);
        expect(hide).toHaveAttribute('aria-pressed', 'true');
        await user.click(hide);
        expect(password).toHaveAttribute('type', 'password');
        expect(password).toHaveValue('correct-horse');
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
        expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription(
            'Use your account email, not your display name.',
        );
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

    it('lets the workspace gate handle a brand-new account after authentication', async () => {
        const user = setupUser();
        pb.__setRecords('workspaces', []);
        renderLogin();

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        expect(await screen.findByText('App shell')).toBeInTheDocument();
    });

    it('preserves a classroom destination instead of treating a workspace lookup failure as an empty account', async () => {
        const user = setupUser();
        pb.__setError('workspaces');
        renderLogin({ route: { pathname: '/login', state: { returnTo: '/app/classrooms/roomalpha?workspace=ws_test' } } });

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: /Sign in/ }));

        expect(await screen.findByText('Requested classroom')).toBeInTheDocument();
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

    it('allows a failed sign-in to be corrected and retried', async () => {
        const user = setupUser();
        const login = vi.fn()
            .mockRejectedValueOnce(mockPocketBaseError('Failed to authenticate.'))
            .mockResolvedValueOnce({});
        renderLogin({ auth: { isAuthed: false, user: null, login } });

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'wrong-password');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Failed to authenticate.');
        expect(screen.getByRole('form', { name: 'Sign in' })).toHaveAttribute('aria-busy', 'false');

        await user.clear(screen.getByLabelText('Password'));
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        await user.keyboard('{Enter}');
        expect(await screen.findByText('App shell')).toBeInTheDocument();
        expect(login).toHaveBeenCalledTimes(2);
        expect(login).toHaveBeenLastCalledWith('owner@example.com', 'correct-horse');
    });

    it('preserves the requested classroom through the signup and sign-in links', async () => {
        const user = setupUser();
        renderLogin({ route: { pathname: '/login', state: { returnTo: '/app/classrooms/roomalpha?workspace=ws_test' } } });

        await user.click(screen.getByRole('link', { name: 'Create an account' }));
        expect(await screen.findByRole('heading', { level: 1, name: 'Create your BuildAndDo account' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'BuildAndDo home' })).toHaveAttribute('href', '/');
        await user.click(screen.getByRole('link', { name: 'Sign in' }));
        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByText('Requested classroom')).toBeInTheDocument();
    });

    it('keeps password recovery reachable through the shared auth layout', async () => {
        const user = setupUser();
        renderLogin();

        await user.click(screen.getByRole('link', { name: 'Forgot password?' }));
        expect(await screen.findByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument();
        expect(screen.getByLabelText('Email address')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
        await user.click(screen.getByRole('link', { name: 'Sign in' }));
        expect(await screen.findByRole('heading', { level: 1, name: 'Welcome back.' })).toBeInTheDocument();
    });

    it('uses the workspace gate when a return destination points off-site', async () => {
        const user = setupUser();
        renderLogin({ route: { pathname: '/login', state: { returnTo: 'https://example.com/collect' } } });

        await user.type(screen.getByLabelText('Email address'), 'owner@example.com');
        await user.type(screen.getByLabelText('Password'), 'correct-horse');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByText('App shell')).toBeInTheDocument();
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
        const { auth } = renderLogin({
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
        expect(screen.getByLabelText('Email address')).toBeDisabled();
        expect(screen.getByLabelText('Password')).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled();
        expect(screen.getByRole('form', { name: 'Sign in' })).toHaveAttribute('aria-busy', 'true');
        await user.click(submit);
        expect(auth.login).toHaveBeenCalledTimes(1);
    });
});
