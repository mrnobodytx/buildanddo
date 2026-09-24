// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/PasswordReset.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/ForgotPasswordPage.jsx, apps/web/src/pages/ResetPasswordPage.jsx, apps/web/src/lib/authErrors.js, apps/web/src/lib/navigationIntent.js, apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/ForgotPasswordPage.jsx; VALIDATES apps/web/src/pages/ResetPasswordPage.jsx; VALIDATES apps/web/src/lib/authErrors.js; VALIDATES apps/web/src/lib/navigationIntent.js; CONSUMES apps/web/src/test/utils.jsx
// DAG Node:    none
// Intent:      Prove reset requests stay neutral about account existence yet report real failures, and the reset page completes honestly.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

const users = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() }));
vi.mock('@/lib/pocketbaseClient', () => ({ default: { collection: vi.fn(() => users) } }));

import pb from '@/lib/pocketbaseClient';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import { authFailureKind } from '@/lib/authErrors';
import { classroomTelemetryLocation } from '@/lib/navigationIntent';
import { mockPocketBaseError, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

const TOKEN = 'reset.token.value';
const networkError = () => Object.assign(new Error('Failed to fetch'), { status: 0, isAbort: false });

const renderAt = (route) =>
    renderWithProviders(
        <Routes>
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password/:token?" element={<ResetPasswordPage />} />
            <Route path="/login" element={<p>Sign-in page</p>} />
        </Routes>,
        { route },
    );

beforeEach(() => {
    users.requestPasswordReset.mockReset().mockResolvedValue(true);
    users.confirmPasswordReset.mockReset().mockResolvedValue(true);
    pb.collection.mockClear();
});

async function requestReset(email = 'member@example.com') {
    const user = setupUser();
    renderAt('/forgot-password');
    await user.type(screen.getByLabelText('Email address'), email);
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    return user;
}

describe('forgot password', () => {
    it('confirms a sent link without claiming the address exists', async () => {
        await requestReset();
        expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
        expect(users.requestPasswordReset).toHaveBeenCalledWith('member@example.com');
        expect(screen.getByText(/belongs to an account/)).toBeInTheDocument();
    });

    it.each([400, 404])('reads a %i exactly like success so addresses are not revealed', async (status) => {
        users.requestPasswordReset.mockRejectedValue(mockPocketBaseError('Something went wrong.', status));
        await requestReset('nobody@example.com');
        expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each([
        ['a network failure', networkError(), /couldn.t reach BuildAndDo, so no link was sent/],
        ['a rate limit', mockPocketBaseError('Too many requests.', 429), /Too many reset requests/],
        ['a server error', mockPocketBaseError('Internal error.', 500), /couldn.t send the reset link right now/],
        ['a bad gateway', mockPocketBaseError('Bad gateway.', 502), /couldn.t send the reset link right now/],
    ])('reports %s honestly instead of claiming success', async (_label, error, message) => {
        users.requestPasswordReset.mockRejectedValue(error);
        await requestReset();
        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(screen.queryByRole('heading', { name: 'Check your email' })).not.toBeInTheDocument();
    });
});

describe('reset password', () => {
    it('sets the new password and links to sign in', async () => {
        const user = setupUser();
        renderAt(`/reset-password/${TOKEN}`);
        await user.type(screen.getByLabelText('New password'), 'Correct-Horse-9');
        await user.type(screen.getByLabelText('Confirm new password'), 'Correct-Horse-9');
        await user.click(screen.getByRole('button', { name: /save new password/i }));
        expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
        expect(users.confirmPasswordReset).toHaveBeenCalledWith(TOKEN, 'Correct-Horse-9', 'Correct-Horse-9');
        expect(pb.collection).toHaveBeenCalledWith('users');
        await user.click(screen.getByRole('link', { name: /sign in/i }));
        expect(await screen.findByText('Sign-in page')).toBeInTheDocument();
    });

    it('validates length and confirmation before calling the server', async () => {
        const user = setupUser();
        renderAt(`/reset-password/${TOKEN}`);
        await user.type(screen.getByLabelText('New password'), 'short');
        await user.click(screen.getByRole('button', { name: /save new password/i }));
        expect(await screen.findByText('Use at least 10 characters.')).toBeInTheDocument();
        await user.clear(screen.getByLabelText('New password'));
        await user.type(screen.getByLabelText('New password'), 'Correct-Horse-9');
        await user.type(screen.getByLabelText('Confirm new password'), 'Correct-Horse-8');
        await user.click(screen.getByRole('button', { name: /save new password/i }));
        expect(await screen.findByText(/passwords don.t match/)).toBeInTheDocument();
        expect(users.confirmPasswordReset).not.toHaveBeenCalled();
    });

    it.each([
        ['an expired token', mockPocketBaseError('Invalid or expired token.', 400), /invalid or has expired/],
        ['a network failure', networkError(), /couldn.t reach BuildAndDo/],
        ['a rate limit', mockPocketBaseError('Too many requests.', 429), /Too many attempts/],
        ['a server error', mockPocketBaseError('Internal error.', 503), /couldn.t reset your password right now/],
    ])('reports %s without claiming success', async (_label, error, message) => {
        users.confirmPasswordReset.mockRejectedValue(error);
        const user = setupUser();
        renderAt(`/reset-password/${TOKEN}`);
        await user.type(screen.getByLabelText('New password'), 'Correct-Horse-9');
        await user.type(screen.getByLabelText('Confirm new password'), 'Correct-Horse-9');
        await user.click(screen.getByRole('button', { name: /save new password/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(screen.queryByRole('heading', { name: 'Password updated' })).not.toBeInTheDocument();
    });

    it('asks for a fresh link when the token is missing', async () => {
        renderAt('/reset-password');
        expect(await screen.findByRole('heading', { name: 'Reset link incomplete' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /request a new reset link/i })).toHaveAttribute('href', '/forgot-password');
        expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
    });

    it('never writes the token to the console', async () => {
        const spies = ['log', 'info', 'warn', 'error', 'debug'].map((name) => vi.spyOn(console, name));
        users.confirmPasswordReset.mockRejectedValue(mockPocketBaseError('Invalid or expired token.', 400));
        const user = setupUser();
        renderAt(`/reset-password/${TOKEN}`);
        await user.type(screen.getByLabelText('New password'), 'Correct-Horse-9');
        await user.type(screen.getByLabelText('Confirm new password'), 'Correct-Horse-9');
        await user.click(screen.getByRole('button', { name: /save new password/i }));
        await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
        for (const spy of spies) {
            expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
            spy.mockRestore();
        }
    });
});

describe('recovery support', () => {
    it('classifies failures by transport, rate limit and status', () => {
        expect(authFailureKind(networkError())).toBe('network');
        expect(authFailureKind(new Error('boom'))).toBe('network');
        expect(authFailureKind({ status: 400, isAbort: true })).toBe('network');
        expect(authFailureKind({ status: 429 })).toBe('rate_limited');
        expect(authFailureKind({ status: 500 })).toBe('server');
        expect(authFailureKind({ status: 404 })).toBe('not_found');
        expect(authFailureKind({ status: 400 })).toBe('rejected');
    });

    it('keeps the reset token out of telemetry locations', () => {
        expect(classroomTelemetryLocation(`/reset-password/${TOKEN}`)).toBe('/reset-password/:token');
        expect(classroomTelemetryLocation(`https://buildanddo.com/reset-password/${TOKEN}?x=1`))
            .toBe('https://buildanddo.com/reset-password/:token');
        expect(classroomTelemetryLocation('/reset-password')).toBe('/reset-password');
        expect(classroomTelemetryLocation('/forgot-password')).toBe('/forgot-password');
    });
});
