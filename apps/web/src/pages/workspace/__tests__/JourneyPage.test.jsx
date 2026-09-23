// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/JourneyPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-JOURNEY-001, SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/workspace/JourneyPage.jsx, apps/web/src/components/workspace/WorkspaceLayout.jsx, apps/web/src/contexts/AuthContext.jsx, apps/web/src/components/ProtectedRoute.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/JourneyPage.jsx; VALIDATES apps/web/src/components/workspace/WorkspaceLayout.jsx; VALIDATES apps/web/src/contexts/AuthContext.jsx; VALIDATES apps/web/src/components/ProtectedRoute.jsx
// DAG Node:    none
// Intent:      Prove the journey compiles and saves only a proposed draft, hands answers to the assistant unsent, and that navigation opens only the current category.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';
import JourneyPage, { ASSISTANT_DRAFT_EVENT } from '@/pages/workspace/JourneyPage';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import pb from '@/lib/pocketbaseClient';
import { act, renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';
import { setDemoMode } from '@/lib/demoWorkspace';

const records = { create: vi.fn(async (data) => ({ ok: true, record: { id: 'm1', ...data } })), demo: false, degraded: false, loading: false };
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: () => records }));
const permissions = vi.hoisted(() => ({ data: { role: 'editor', can_write: true }, loading: false, error: '' }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({
    WorkspaceAccessProvider: ({ children }) => children,
    useWorkspaceAccess: () => permissions,
}));
vi.mock('@/components/workspace/WorkspaceAssistant', () => ({ default: () => null }));
vi.mock('@/lib/observability/runtime', () => ({ trackAuthIdentity: vi.fn() }));
vi.mock('@/lib/pocketbaseClient', () => {
    const listeners = new Set();
    const authStore = { record: null, token: '', isValid: false,
        save(token, record) { Object.assign(this, { token, record, isValid: true }); listeners.forEach((listener) => listener(token, record)); },
        clear() { Object.assign(this, { token: '', record: null, isValid: false }); listeners.forEach((listener) => listener('', null)); },
        onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
    return { default: { authStore, send: vi.fn() } };
});

function JourneyRoutes() {
    return <Routes><Route path="/app" element={<WorkspaceLayout />}>
        <Route path="journey" element={<JourneyPage />} />
        <Route path="tutorials" element={<><h1>Selected lesson</h1><Link to="/app/journey">Return to your journey</Link></>} />
    </Route></Routes>;
}

beforeEach(() => {
    records.create.mockReset().mockImplementation(async (data) => ({ ok: true, record: { id: 'm1', ...data } }));
    records.demo = false; records.degraded = false; records.loading = false;
    permissions.data = { role: 'editor', can_write: true }; permissions.loading = false; permissions.error = '';
    setDemoMode(false);
    pb.authStore.save('synthetic-session', { id: 'editor' });
    pb.send.mockReset().mockImplementation(async () => ({ record: { id: 'editor', name: 'Refreshed record' }, token: 'synthetic-refreshed-session' }));
});
afterEach(() => { act(() => setDemoMode(false)); });

function NativeSessionJourney() {
    const { refreshSession } = useAuth();
    return <><button onClick={refreshSession}>Refresh native session</button><ProtectedRoute><JourneyRoutes /></ProtectedRoute></>;
}

async function answer(user) {
    for (const name of ['I want to do', 'Software and delivery', 'I have done some', 'A day', 'Someone else will review it'])
        await user.click(screen.getByRole('button', { name: new RegExp(name) }));
}

describe('journey', () => {
    it('preserves the real protected journey through the auth controller token and record refresh', async () => {
        const user = setupUser();
        renderWithProviders(<AuthProvider><NativeSessionJourney /></AuthProvider>, { route: '/app/journey' });
        await screen.findByText('Question 1 of 5'); await answer(user);
        let release;
        pb.send.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        await user.click(screen.getByRole('button', { name: 'Refresh native session' }));
        expect(screen.getByRole('heading', { name: 'Do: your first mission' })).toBeVisible();
        await act(async () => { release({ record: { id: 'editor', name: 'Next native record' }, token: 'synthetic-next-token' }); });
        expect(screen.getByRole('heading', { name: 'Do: your first mission' })).toBeVisible();
        expect(records.create).not.toHaveBeenCalled();
        expect(pb.authStore.token).toBe('synthetic-next-token');
    });

    it('fences the real protected journey across a same-account session replacement', async () => {
        const user = setupUser();
        renderWithProviders(<AuthProvider><NativeSessionJourney /></AuthProvider>, { route: '/app/journey' });
        await screen.findByText('Question 1 of 5'); await answer(user);
        let release;
        pb.send.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        act(() => pb.authStore.save('synthetic-new-login', { id: 'editor' }));
        expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
        expect(screen.queryByRole('button', { name: 'Save mission draft' })).not.toBeInTheDocument();
        await act(async () => { release({ record: { id: 'editor' }, token: 'synthetic-new-login-checked' }); });
        await waitFor(() => expect(screen.getByText('Question 1 of 5')).toBeVisible());
        expect(records.create).not.toHaveBeenCalled();
    });

    it('clears drafts when logout and same-account login are batched into one ready render', async () => {
        const user = setupUser();
        renderWithProviders(<AuthProvider><NativeSessionJourney /></AuthProvider>, { route: '/app/journey' });
        await screen.findByText('Question 1 of 5'); await answer(user);
        await act(async () => {
            pb.authStore.clear();
            pb.authStore.save('synthetic-next-login', { id: 'editor' });
        });
        expect(await screen.findByText('Question 1 of 5')).toBeVisible();
        expect(screen.queryByRole('heading', { name: 'Do: your first mission' })).not.toBeInTheDocument();
        expect(records.create).not.toHaveBeenCalled();
    });

    it('compiles one lesson and saves a proposed draft that still needs a baseline and target', async () => {
        const user = setupUser(); renderWithProviders(<JourneyRoutes />, { route: '/app/journey' });
        expect(screen.getByText('Question 1 of 5')).toBeVisible();
        await answer(user);
        expect(screen.getByRole('link', { name: 'Open the lesson' })).toHaveAttribute('href', '/app/tutorials?lesson=designing-tevv');
        expect(screen.getByText('Baseline')).toBeVisible();
        expect(screen.getByText('Success criterion')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Save mission draft' }));
        const saved = records.create.mock.calls[0][0];
        expect(saved.status).toBe('proposed');
        expect(saved.mission_plan).toMatchObject({ baseline: '', target: '', independent_review: true });
        expect(await screen.findByRole('link', { name: 'Finish the plan on the Challenge Desk' })).toHaveAttribute('href', '/app/missions?mission=m1');
    });

    it('hands the answers to the assistant without sending them', async () => {
        const user = setupUser(); const heard = vi.fn();
        window.addEventListener(ASSISTANT_DRAFT_EVENT, heard);
        renderWithProviders(<JourneyRoutes />, { route: '/app/journey' }); await answer(user);
        await user.click(screen.getByRole('button', { name: 'Talk it through with the Guildmaster' }));
        expect(heard.mock.calls[0][0].detail.message).toMatch(/baseline I can measure/);
        window.removeEventListener(ASSISTANT_DRAFT_EVENT, heard);
    });

    it('retains the draft across a lesson visit without saving it automatically', async () => {
        const user = setupUser(); renderWithProviders(<JourneyRoutes />, { route: '/app/journey' });
        await answer(user);
        await user.click(screen.getByRole('link', { name: 'Open the lesson' }));
        expect(await screen.findByRole('heading', { name: 'Selected lesson' })).toBeVisible();
        expect(records.create).not.toHaveBeenCalled();
        await user.click(screen.getByRole('link', { name: 'Return to your journey' }));
        expect(await screen.findByRole('heading', { name: 'Do: your first mission' })).toBeVisible();
        expect(screen.getByRole('link', { name: 'Open the lesson' })).toHaveAttribute('href', '/app/tutorials?lesson=designing-tevv');
        await user.click(screen.getByRole('button', { name: 'Save mission draft' }));
        await screen.findByRole('link', { name: 'Finish the plan on the Challenge Desk' });
        await user.click(screen.getByRole('link', { name: 'Open the lesson' }));
        await user.click(screen.getByRole('link', { name: 'Return to your journey' }));
        expect(await screen.findByRole('button', { name: 'Save mission draft' })).toBeDisabled();
        expect(records.create).toHaveBeenCalledTimes(1);
    });

    it('keeps an ambiguous save visible instead of enabling a blind retry after a lesson visit', async () => {
        const user = setupUser(); records.create.mockRejectedValueOnce(new Error('lost response'));
        renderWithProviders(<JourneyRoutes />, { route: '/app/journey' }); await answer(user);
        await user.click(screen.getByRole('button', { name: 'Save mission draft' }));
        await screen.findByText(/previous save may have succeeded/);
        await user.click(screen.getByRole('link', { name: 'Open the lesson' }));
        await user.click(screen.getByRole('link', { name: 'Return to your journey' }));
        expect(await screen.findByRole('button', { name: 'Save mission draft' })).toBeDisabled();
        expect(records.create).toHaveBeenCalledTimes(1);
    });

    it('clears the in-memory draft when the account or workspace changes', async () => {
        const user = setupUser();
        const view = renderWithProviders(<JourneyRoutes />, { route: '/app/journey' });
        await answer(user);
        const original = view.workspace.active;
        view.workspace.active = { ...original, id: 'another-workspace' };
        view.rerender(<JourneyRoutes />);
        expect(screen.getByText('Question 1 of 5')).toBeVisible();
        view.workspace.active = original;
        view.rerender(<JourneyRoutes />);
        expect(screen.getByText('Question 1 of 5')).toBeVisible();
        await answer(user);
        view.auth.user = { id: 'another-user' };
        view.rerender(<JourneyRoutes />);
        expect(screen.getByText('Question 1 of 5')).toBeVisible();
        expect(records.create).not.toHaveBeenCalled();
    });

    it('retains answers across fresh auth/workspace objects and permission polls but pauses saving', async () => {
        const user = setupUser(); const view = renderWithProviders(<JourneyRoutes />, { route: '/app/journey', auth: { sessionEpoch: 1 } });
        await answer(user);
        view.auth.user = { ...view.auth.user, name: 'Refreshed native record' };
        view.workspace.active = { ...view.workspace.active };
        permissions.loading = true; view.rerender(<JourneyRoutes />);
        expect(screen.getByRole('heading', { name: 'Do: your first mission' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Save mission draft' })).toBeDisabled();
        permissions.loading = false; permissions.data = { role: 'editor', can_write: true }; view.rerender(<JourneyRoutes />);
        expect(screen.getByRole('heading', { name: 'Do: your first mission' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Save mission draft' })).toBeEnabled();
        expect(records.create).not.toHaveBeenCalled();
    });

    it.each(['account', 'workspace', 'session', 'demo', 'revoke', 'role'])('clears draft work and fences a late save after a %s boundary', async (boundary) => {
        const user = setupUser(); let release;
        records.create.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
        const view = renderWithProviders(<JourneyRoutes />, { route: '/app/journey', auth: { sessionEpoch: 1 } });
        await answer(user); await user.click(screen.getByRole('button', { name: 'Save mission draft' }));
        if (boundary === 'account') view.auth.user = { id: 'other-account' };
        if (boundary === 'workspace') view.workspace.active = { id: 'other-workspace' };
        if (boundary === 'session') view.auth.sessionEpoch = 2;
        if (boundary === 'demo') act(() => setDemoMode(true));
        if (boundary === 'revoke') { permissions.data = null; permissions.error = 'Membership revoked'; }
        if (boundary === 'role') permissions.data = { role: 'viewer', can_write: false };
        view.rerender(<JourneyRoutes />);
        expect(screen.getByText('Question 1 of 5')).toBeVisible();
        if (['revoke', 'role'].includes(boundary)) {
            permissions.data = { role: 'editor', can_write: true }; permissions.error = '';
            view.rerender(<JourneyRoutes />);
            await answer(user);
        }
        await act(async () => { release({ ok: true, record: { id: 'old-session-mission' } }); });
        expect(screen.queryByRole('link', { name: 'Finish the plan on the Challenge Desk' })).not.toBeInTheDocument();
        if (['revoke', 'role'].includes(boundary)) expect(screen.getByRole('button', { name: 'Save mission draft' })).toBeEnabled();
        expect(records.create).toHaveBeenCalledTimes(1);
    });
});

describe('Build and Do navigation', () => {
    it('opens only the category holding the current page and keeps the journey pinned', async () => {
        const user = setupUser();
        renderWithProviders(<Routes><Route path="/app" element={<WorkspaceLayout />}><Route path="missions" element={<h1>Desk</h1>} /></Route></Routes>,
            { route: '/app/missions' });
        const nav = within(screen.getByRole('navigation', { name: 'Workspace' }));
        expect(nav.getByRole('link', { name: 'Start a journey' })).toHaveAttribute('href', '/app/journey');
        expect(nav.getByRole('link', { name: 'Challenge Desk' })).toBeVisible();
        expect(nav.queryByRole('link', { name: 'Field Manual' })).not.toBeInTheDocument();
        await user.click(nav.getByRole('button', { name: /Build/ }));
        expect(nav.getByRole('link', { name: 'Field Manual' })).toBeVisible();
    });
});
