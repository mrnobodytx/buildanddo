// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/GovernmentPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-22
// Depends:     apps/web/src/pages/workspace/GovernmentPage.jsx, apps/web/src/components/workspace/GovernmentGate.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/GovernmentPage.jsx; VALIDATES apps/web/src/components/workspace/GovernmentGate.jsx
// Intent:      Keep protected research out of denied or expired views and preserve explicit proposal-only mission creation.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import GovernmentPage from '@/pages/workspace/GovernmentPage';
import GovernmentGate from '@/components/workspace/GovernmentGate';
import plan from '../../../../../pocketbase/pb_migrations/data/research-sprint.json';
import curriculum from '../../../../../pocketbase/pb_migrations/data/government-submissions.json';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

const state = vi.hoisted(() => ({ access: {}, control: {}, read: vi.fn(), create: vi.fn() }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => state.access }));
vi.mock('@/hooks/useWorkspaceControl', () => ({ useWorkspaceControl: (name) => { state.read(name); return state.control; } }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: () => ({ create: state.create }) }));
vi.mock('@/components/workspace/TutorialCatalog', () => ({ GovernmentTutorialCatalog: () => <p>Protected lessons</p> }));

const membership = () => ({ tier: 'government', amount_cents: 10000, currency: 'USD', interval: 'month', allowed: true, expires_at: '2099-01-01T00:00:00Z' });
beforeEach(() => {
    state.read.mockReset(); state.create.mockReset().mockResolvedValue({ ok: true });
    state.access = { data: { government: membership() }, loading: false, error: '', refresh: vi.fn() };
    state.control = { data: { plan, starter: curriculum.mission, lessons: [], can_write: true }, loading: false, error: '', refresh: vi.fn() };
});

it('shows the paywall without mounting or loading protected content', () => {
    state.access.data.government.allowed = false;
    renderWithProviders(<GovernmentPage />, { route: '/app/government?paid=true&amount=100' });
    expect(screen.getByRole('heading', { name: 'Government research membership' })).toBeVisible();
    expect(screen.getByText('$100/month · approval required')).toBeVisible();
    expect(state.read).not.toHaveBeenCalled();
    expect(screen.queryByText('Protected lessons')).not.toBeInTheDocument();
});

it('does not disclose research while membership is unknown or unavailable', () => {
    state.access = { data: null, loading: true, error: '', refresh: vi.fn() };
    const view = renderWithProviders(<GovernmentPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking government membership');
    state.access = { data: null, loading: false, error: 'Unavailable', refresh: vi.fn() };
    view.rerender(<GovernmentPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Membership could not be checked');
    expect(state.read).not.toHaveBeenCalled();
});

it('rejects expired membership and inconsistent prices even when allowed is true', () => {
    state.access.data.government.expires_at = '2020-01-01T00:00:00Z';
    const view = renderWithProviders(<GovernmentGate><p>Protected child</p></GovernmentGate>);
    expect(screen.queryByText('Protected child')).not.toBeInTheDocument();
    state.access.data.government = { ...membership(), amount_cents: 1 };
    view.rerender(<GovernmentGate><p>Protected child</p></GovernmentGate>);
    expect(screen.queryByText('Protected child')).not.toBeInTheDocument();
});

it('renders distinct lanes and an unverified ten-day plan for approved members', () => {
    renderWithProviders(<GovernmentPage />);
    expect(screen.getByRole('heading', { name: 'Army decision packages' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'DARPA market experiments' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'FHERMA polynomial experiment' })).toBeVisible();
    expect(screen.getByText(plan.source_note)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Day 10: Gate continuation' })).toBeVisible();
    expect(state.read).toHaveBeenCalledWith('government');
});

it('removes previously visible plans immediately when membership is revoked', () => {
    const view = renderWithProviders(<GovernmentPage />);
    expect(screen.getByText('Protected lessons')).toBeVisible();
    state.access.data.government.allowed = false;
    view.rerender(<GovernmentPage />);
    expect(screen.queryByText('Protected lessons')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Army decision packages' })).not.toBeInTheDocument();
});

it('keeps paid viewer access separate from mission write permission', () => {
    state.control.data.can_write = false;
    renderWithProviders(<GovernmentPage />);
    expect(screen.getByRole('button', { name: 'Prepare government mission' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Government submission learning' })).toBeVisible();
});

it('saves a reviewed government starter as proposed without approval or execution', async () => {
    const user = setupUser(); renderWithProviders(<GovernmentPage />);
    await user.click(screen.getByRole('button', { name: 'Prepare government mission' }));
    await user.click(screen.getByRole('button', { name: 'Use government submission starter' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(state.create).toHaveBeenCalledTimes(1));
    expect(state.create.mock.calls[0][0].status).toBe('proposed');
    expect(state.create.mock.calls[0][0].mission_approved_by).toBeUndefined();
    expect(screen.getByRole('status')).toHaveTextContent('Mission saved as proposed');
});

it('preserves a rejected draft and its recovery message', async () => {
    state.create.mockResolvedValue({ ok: false, error: 'Workspace permission changed.' });
    const user = setupUser(); renderWithProviders(<GovernmentPage />);
    await user.click(screen.getByRole('button', { name: 'Prepare government mission' }));
    await user.click(screen.getByRole('button', { name: 'Use government submission starter' }));
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Workspace permission changed.')).toBeVisible();
    expect(screen.getByLabelText('Goal')).toHaveValue(curriculum.mission.title);
});
