// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/pages/workspace/__tests__/WorkspaceClaimsPages.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/workspace/SupportRevenuePage.jsx, apps/web/src/pages/workspace/CorrectionsPage.jsx, apps/web/src/pages/workspace/SpecialistWorkPage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/SupportRevenuePage.jsx; VALIDATES apps/web/src/pages/workspace/CorrectionsPage.jsx; VALIDATES apps/web/src/pages/workspace/SpecialistWorkPage.jsx
// Intent:      Keep reported claims, author permissions and saved revisions visible in the actual workspace pages.
// ----------------------------------------------------------------

import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import SupportRevenuePage from '@/pages/workspace/SupportRevenuePage';
import CorrectionsPage from '@/pages/workspace/CorrectionsPage';
import SpecialistWorkPage from '@/pages/workspace/SpecialistWorkPage';

const state = vi.hoisted(() => ({ sources: {}, account: 'account1', workspace: 'workspace1', access: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: state.account }, isAuthed: true }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ active: { id: state.workspace } }) }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => state.access }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: (name) => state.sources[name] }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ demo: false }) }));
vi.mock('@/components/motion/MotionPrimitives', () => ({ MotionEntrance: ({ children }) => children,
    MotionList: ({ as: Element = 'div', children }) => <Element>{children}</Element>, MotionValue: ({ value }) => <span>{value}</span> }));

beforeEach(() => {
    state.account = 'account1'; state.workspace = 'workspace1';
    state.access = { data: { role: 'admin', can_write: true, can_admin: true }, loading: false, error: '' };
    for (const name of ['support_sources', 'corrections', 'specialist_desks', 'missions']) state.sources[name] = {
        records: [], loading: false, degraded: false, saving: false, demo: false, uncertain: false, writeError: '',
        create: vi.fn().mockResolvedValue({ ok: true }), update: vi.fn().mockResolvedValue({ ok: true }),
        retry: vi.fn().mockResolvedValue({ ok: true }), clearWriteError: vi.fn(), refresh: vi.fn(),
    };
});
const page = (Component) => <MemoryRouter><Component /></MemoryRouter>;

it('shows historical support values as reports, and editors cannot request a connection', () => {
    state.access.data = { role: 'editor', can_write: true, can_admin: false };
    state.sources.support_sources.records = [{ id: 'legacy', provider: 'stripe', status: 'healthy', gross: 200, currency: 'USD', last_sync: '2026-09-01', owner: 'account1' }];
    render(page(SupportRevenuePage));
    expect(screen.getByText('USD 200.00')).toBeVisible();
    expect(screen.getByText(/Historical \/ self-reported values/)).toBeVisible();
    expect(screen.getByText(/No trusted payment ingestor is installed/)).toBeVisible();
    expect(screen.queryByText(/^healthy$/i)).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'Request connection' })) expect(button).toBeDisabled();
});

it('uses the request-only wrapper and exposes uncertain support recovery', async () => {
    const view = render(page(SupportRevenuePage));
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Request connection' })[0]));
    expect(state.sources.support_sources.create).toHaveBeenCalledWith({ provider: 'patreon' });
    state.sources.support_sources.uncertain = true;
    state.sources.support_sources.writeError = 'Could not confirm the request.';
    view.rerender(page(SupportRevenuePage));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not confirm the request');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry previous request' })));
    expect(state.sources.support_sources.retry).toHaveBeenCalledTimes(1);
});

it('keeps failed support reads distinct from no payments', () => {
    state.sources.support_sources.degraded = true;
    render(page(SupportRevenuePage));
    expect(screen.getByRole('status')).toHaveTextContent('This list could not be loaded');
    expect(screen.queryByRole('button', { name: 'Request connection' })).not.toBeInTheDocument();
});

it('submits both comparison halves without a status selector and keeps legacy verification reported', async () => {
    state.sources.corrections.records = [{ id: 'legacy', prior_prediction: 'Old prediction', observed_result: 'Old report', status: 'verified', owner: 'account1' }];
    render(page(CorrectionsPage));
    expect(screen.getByText('Reported status: verified. No independent review is bound.')).toBeVisible();
    expect(screen.queryByText(/^verified$/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record correction' }));
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Prior prediction'), { target: { value: 'Expected four' } });
    fireEvent.change(screen.getByLabelText('Observed result'), { target: { value: 'Reported two' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save correction' })));
    expect(state.sources.corrections.create).toHaveBeenCalledWith({ prior_prediction: 'Expected four', observed_result: 'Reported two', reference: '' });
});

it('removes unsaved comparisons when current authority is revoked and disables viewer writes', () => {
    const view = render(page(CorrectionsPage));
    fireEvent.click(screen.getByRole('button', { name: 'Record correction' }));
    fireEvent.change(screen.getByLabelText('Prior prediction'), { target: { value: 'Private pending comparison' } });
    state.access.data = { role: 'viewer', can_write: false, can_admin: false };
    view.rerender(page(CorrectionsPage));
    expect(screen.queryByDisplayValue('Private pending comparison')).not.toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: /Record (a )?correction/ })) expect(button).toBeDisabled();
});

it('prevents a second editor from changing another author desk', () => {
    state.access.data = { role: 'editor', can_write: true, can_admin: false };
    state.sources.specialist_desks.records = [{ id: 'desk1', desk: 'research', owner: 'another-author', scope: 'Retained scope', status: 'active', claim_revision: 1 }];
    render(page(SpecialistWorkPage));
    const card = screen.getByRole('heading', { name: 'Research', level: 2 }).closest('.p-4');
    expect(within(card).getByRole('button', { name: 'Edit scope' })).toBeDisabled();
    expect(screen.getByText(/Desk status is an operator record, not a claim of an active agent/)).toBeVisible();
});

it('passes the opened desk revision even when the displayed list receives a newer row', async () => {
    const saved = { id: 'desk1', desk: 'research', workspace: 'workspace1', owner: 'account1', scope: 'Old scope', status: 'idle', claim_revision: 2 };
    state.sources.specialist_desks.records = [saved];
    const view = render(page(SpecialistWorkPage));
    fireEvent.click(within(screen.getByRole('heading', { name: 'Research', level: 2 }).closest('.p-4')).getByRole('button', { name: 'Edit scope' }));
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'My edit' } });
    state.sources.specialist_desks.records = [{ ...saved, scope: 'Concurrent edit', claim_revision: 3 }];
    view.rerender(page(SpecialistWorkPage));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save scope' })));
    expect(state.sources.specialist_desks.update).toHaveBeenCalledWith('desk1', { scope: 'My edit', status: 'idle' }, saved);
});
