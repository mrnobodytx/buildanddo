// CGRF: SRS=SRS-BUILDANDDO-LIVE-UTILIZATION-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/auth/__tests__/LoginPage.ocn.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-LIVE-UTILIZATION-001
// CAPS:        B
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/pages/LoginPage.jsx, apps/web/src/lib/ocnLogin.js,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/LoginPage.jsx;
//              CONSUMES apps/web/src/lib/ocnLogin.js
// Intent:      The Citadel seat affordance is invisible to ordinary users, renders
//              only on ?ocn=1 or a runtime-supplied header, and a 200 from
//              /api/ocn/login lands the seat in the app with the session saved.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase({ authRecord: null, isValid: false });
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import LoginPage from '@/pages/LoginPage';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

const HEADER = 'eyJzZWF0X2lkIjoicmlnMSJ9';

const renderLogin = (route) =>
    renderWithProviders(
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app" element={<p>App shell</p>} />
        </Routes>,
        { route, auth: { isAuthed: false, user: null } },
    );

describe('LoginPage — Citadel seat sign-in (OCN)', () => {
    let fetchMock;

    beforeEach(() => {
        pb.__reset();
        pb.authStore.save.mockClear();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        delete window.__BND_OCN_HEADER__;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        delete window.__BND_OCN_HEADER__;
    });

    it('does not render the affordance for an ordinary visit', () => {
        renderLogin('/login');
        expect(screen.queryByTestId('ocn-login')).not.toBeInTheDocument();
    });

    it('renders on ?ocn=1 but stays disabled when the runtime supplied no header', () => {
        renderLogin('/login?ocn=1');

        expect(screen.getByTestId('ocn-login')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Sign in with CitadelKey/ })).toBeDisabled();
        expect(screen.getByRole('status')).toHaveTextContent('__BND_OCN_HEADER__ is absent');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('renders without the query flag when the runtime injected a header', () => {
        window.__BND_OCN_HEADER__ = HEADER;
        renderLogin('/login');

        expect(screen.getByRole('button', { name: /Sign in with CitadelKey/ })).toBeEnabled();
    });

    it('exchanges the header for a session and lands the seat in the app', async () => {
        window.__BND_OCN_HEADER__ = HEADER;
        const record = { id: 'seat_rig1', email: 'rig1@ocn.buildanddo.invalid', name: 'OCN seat: rig1' };
        fetchMock.mockResolvedValue({ status: 200, ok: true, json: async () => ({ token: 'tok', record }) });
        const user = setupUser();
        renderLogin('/login?ocn=1');

        await user.click(screen.getByRole('button', { name: /Sign in with CitadelKey/ }));

        expect(await screen.findByText('App shell')).toBeInTheDocument();
        expect(pb.authStore.save).toHaveBeenCalledWith('tok', record);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toMatch(/\/api\/ocn\/login$/);
        expect(init.headers['X-Citadel-Key']).toBe(HEADER);
        // The page never puts the header anywhere a later reader could find it.
        expect(window.localStorage.length).toBe(0);
        expect(window.sessionStorage.length).toBe(0);
    });

    it('shows the refusal and saves nothing on 403 seat_not_provisioned', async () => {
        window.__BND_OCN_HEADER__ = HEADER;
        fetchMock.mockResolvedValue({ status: 403, ok: false, json: async () => ({ message: 'seat_not_provisioned' }) });
        const user = setupUser();
        renderLogin('/login?ocn=1');

        await user.click(screen.getByRole('button', { name: /Sign in with CitadelKey/ }));

        expect(await screen.findByRole('alert')).toHaveTextContent('seat_not_provisioned');
        await waitFor(() => expect(screen.getByRole('button', { name: /Sign in with CitadelKey/ })).toBeEnabled());
        expect(pb.authStore.save).not.toHaveBeenCalled();
        expect(screen.queryByText('App shell')).not.toBeInTheDocument();
    });
});
