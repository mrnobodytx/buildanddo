// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/__tests__/HomePage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/pages/HomePage.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/HomePage.jsx
// DAG Node:    none
// Intent:      Verify real home records, submission recovery, demo isolation and clearing on workspace or account changes.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from '@/pages/HomePage';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import {
    createAuthValue,
    createWorkspaceValue,
    createMockWorkspace,
    createMockEvidence,
    createMockSignal,
    createMockMission,
    mockPocketBaseError,
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
    within,
} from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({
    reportAction: vi.fn(),
    reportMetric: vi.fn(),
    trackAuthIdentity: vi.fn(),
}));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));

const section = (id) => within(document.getElementById(id));
const now = () => new Date().toISOString();
const privateCollections = [
    'signals',
    'missions',
    'evidence',
    'services',
    'daily_editions',
    'corrections',
    'support_sources',
    'challenge_submissions',
];
function Scene({ auth, workspace }) {
    return (
        <AuthContext.Provider value={auth}>
            <WorkspaceContext.Provider value={workspace}>
                <HomePage />
            </WorkspaceContext.Provider>
        </AuthContext.Provider>
    );
}

beforeEach(() => {
    pb.__reset();
    setDemoMode(false);
});
afterEach(() => vi.restoreAllMocks());

describe('home workspace edition', () => {
    it('shows account setup while leaving shared lessons accessible without a workspace', async () => {
        renderWithProviders(<HomePage />, { workspace: { active: null, hasWorkspaces: false } });
        expect(screen.getByRole('link', { name: 'Set up workspace' })).toBeVisible();
        expect(await screen.findByText(/Apply the tutorial catalogue migration/)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Read Welcome to BuildAndDo' })).toBeVisible();
        for (const name of privateCollections)
            expect(pb.__collection(name).getFullList).not.toHaveBeenCalled();
    });

    it('keeps missing workspace data behind loading and retry states', () => {
        const refresh = vi.fn();
        const view = renderWithProviders(
            <Scene auth={createAuthValue()} workspace={createWorkspaceValue({ loading: true })} />,
        );
        expect(screen.getByText('Loading your workspaces…')).toBeVisible();
        view.rerender(
            <Scene
                auth={createAuthValue()}
                workspace={createWorkspaceValue({
                    active: null,
                    error: 'Workspace access is unavailable',
                    refresh,
                })}
            />,
        );
        expect(screen.getByText('Workspace access is unavailable')).toBeVisible();
        expect(screen.queryByRole('link', { name: 'Set up workspace' })).not.toBeInTheDocument();
        for (const name of privateCollections)
            expect(pb.__collection(name).getFullList).not.toHaveBeenCalled();
    });
    it('does not query or reveal workspace data on an anonymous visit, even with a stale active workspace', () => {
        pb.__setAuth({ record: null, isValid: false });
        pb.__setRecords('evidence', [createMockEvidence({ title: 'Private receipt' })]);
        renderWithProviders(<HomePage />, { auth: { isAuthed: false, user: null } });
        expect(screen.getByText('Sign in to submit a challenge to your workspace.')).toBeVisible();
        expect(screen.getByRole('link', { name: 'Sign in for lessons' })).toBeVisible();
        expect(screen.queryByText('Private receipt')).not.toBeInTheDocument();
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('renders the same records and workspace scope as the authenticated desks', async () => {
        pb.__setRecords('signals', [createMockSignal()]);
        pb.__setRecords('missions', [createMockMission({ status: 'running' })]);
        pb.__setRecords('evidence', [createMockEvidence({ title: 'Reminder receipt' })]);
        pb.__setRecords('challenge_submissions', [
            { id: 'project', workspace: 'ws_test', problem: 'Build a shared project website', status: 'submitted', created: now() },
        ]);
        pb.__setRecords('daily_editions', [
            {
                id: 'draft',
                workspace: 'ws_test',
                status: 'draft',
                title: 'Draft must stay off the front page',
                created: now(),
                workspace: 'ws_test',
            },
            {
                id: 'edition',
                workspace: 'ws_test',
                status: 'published',
                title: 'Friday appointment report',
                summary: 'Measured reminders',
                body: 'Source-backed report body.',
                created: now(),
                workspace: 'ws_test',
                published_at: now(),
                published_by: 'user_test',
                claim_revision: 2,
            },
            { id: 'legacy', status: 'published', title: 'Unbound historical edition', workspace: 'ws_test', created: now() },
        ]);
        pb.__setRecords('corrections', [
            {
                id: 'c1',
                workspace: 'ws_test',
                status: 'verified',
                prior_prediction: 'Expected four misses',
                observed_result: 'Observed one miss',
                created: now(),
                workspace: 'ws_test',
            },
            {
                id: 'c2',
                workspace: 'ws_test',
                status: 'pending',
                prior_prediction: 'Pending prediction',
                observed_result: 'Unverified result',
                created: now(),
                workspace: 'ws_test',
            },
        ]);
        pb.__setRecords('support_sources', [
            {
                id: 'usd',
                workspace: 'ws_test',
                provider: 'patreon',
                status: 'healthy',
                last_sync: now(),
                gross: 25,
                currency: 'USD',
                workspace: 'ws_test',
            },
            {
                id: 'eur',
                workspace: 'ws_test',
                provider: 'kofi',
                status: 'healthy',
                last_sync: now(),
                gross: 10,
                currency: 'EUR',
                workspace: 'ws_test',
            },
            { id: 'pending', workspace: 'ws_test', provider: 'gofundme', status: 'pending', gross: 900, currency: 'USD' },
        ]);
        renderWithProviders(<HomePage />);
        expect(
            await section('evidence-ledger').findByRole('heading', { name: 'Reminder receipt' }),
        ).toBeVisible();
        expect(
            await section('daily-edition').findByRole('heading', {
                name: 'Friday appointment report',
            }),
        ).toBeVisible();
        expect(screen.queryByText('Draft must stay off the front page')).not.toBeInTheDocument();
        expect(section('corrections').queryByText('Observed one miss')).not.toBeInTheDocument();
        expect(screen.queryByText('Unbound historical edition')).not.toBeInTheDocument();
        expect(screen.queryByText('Unverified result')).not.toBeInTheDocument();
        const challengeMetric = section('glance').getByRole('heading', { name: 'Saved challenges' }).closest('.p-5');
        expect(within(challengeMetric).getByText('1', { exact: true })).toBeVisible();
        expect(within(challengeMetric).getByRole('link', { name: /Open desk/ })).toHaveAttribute('href', '#challenge-desk');
        expect(section('support-revenue').queryByText('USD 25.00')).not.toBeInTheDocument();
        expect(section('support-revenue').queryByText('EUR 10.00')).not.toBeInTheDocument();
        expect(section('support-revenue').getAllByText(/No provider-confirmed revenue is available/)).toHaveLength(3);
        expect(screen.queryByText('USD 900.00')).not.toBeInTheDocument();
        for (const name of privateCollections) {
            expect(pb.__collection(name).getFullList).toHaveBeenCalledWith(
                expect.objectContaining({ filter: 'workspace = "ws_test"' }),
            );
        }
    });

    it('keeps pending reads distinct from empty results and retries a failed section', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        pb.__setError('evidence');
        renderWithProviders(<HomePage />);
        const ledger = section('evidence-ledger');
        expect(ledger.getByRole('status')).toHaveTextContent('Loading evidence ledger records');
        expect(await ledger.findByText('This list could not be loaded')).toBeVisible();
        expect(ledger.queryByText('No evidence ledger records yet.')).not.toBeInTheDocument();
        pb.__clearError('evidence');
        pb.__setRecords('evidence', [createMockEvidence({ title: 'Recovered receipt' })]);
        await setupUser().click(ledger.getByRole('button', { name: 'Try again' }));
        expect(await ledger.findByRole('heading', { name: 'Recovered receipt' })).toBeVisible();
    });

    it('retains a rejected challenge for retry and shows the persisted status and history after saving', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const user = setupUser();
        renderWithProviders(<HomePage />);
        const desk = section('challenge-desk');
        const input = desk.getByRole('textbox', { name: 'Your challenge' });
        await user.type(input, 'Reduce Friday appointment no-shows');
        pb.__collection('challenge_submissions').create.mockRejectedValueOnce(
            mockPocketBaseError('Permission temporarily unavailable', 403),
        );
        await user.click(desk.getByRole('button', { name: 'Submit challenge' }));
        expect(await desk.findByRole('alert')).toHaveTextContent(
            'Permission temporarily unavailable',
        );
        expect(input).toHaveValue('Reduce Friday appointment no-shows');
        expect(desk.queryByText(/Challenge saved/)).not.toBeInTheDocument();
        await user.click(desk.getByRole('button', { name: 'Submit challenge' }));
        await waitFor(() => expect(desk.getByRole('status')).toHaveTextContent('Challenge saved.'));
        expect(desk.getByRole('status')).toHaveTextContent('submitted');
        expect(desk.getByRole('status')).not.toHaveTextContent('processing');
        expect(input).toHaveValue('');
        expect(pb.__collection('challenge_submissions').create).toHaveBeenLastCalledWith({
            problem: 'Reduce Friday appointment no-shows',
            status: 'submitted',
            workspace: 'ws_test',
            owner: 'user_test',
        });
        const summary = document.querySelector('#challenge-desk details summary');
        expect(summary).toHaveTextContent('Reduce Friday appointment no-shows');
        await user.click(summary);
        expect(summary.parentElement).toHaveAttribute('open');
    });

    it('never reads private data or permits challenge and lesson writes in demonstration mode', () => {
        setDemoMode(true);
        renderWithProviders(<HomePage />);
        expect(screen.getAllByText('Demonstration data.').length).toBeGreaterThan(0);
        expect(
            section('challenge-desk').getByRole('textbox', { name: 'Your challenge' }),
        ).toBeDisabled();
        expect(
            section('challenge-desk').getByRole('button', { name: 'Submit challenge' }),
        ).toBeDisabled();
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('clears records and unsent drafts when the active workspace changes', async () => {
        const auth = createAuthValue();
        const oldWorkspace = createWorkspaceValue();
        pb.__setRecords('evidence', [createMockEvidence({ title: 'Old workspace receipt' })]);
        const view = renderWithProviders(<Scene auth={auth} workspace={oldWorkspace} />);
        expect(await screen.findByRole('heading', { name: 'Old workspace receipt' })).toBeVisible();
        await setupUser().type(
            screen.getByLabelText('Your challenge'),
            'Unsent old workspace problem',
        );
        pb.__setRecords('evidence', [
            createMockEvidence({ title: 'New workspace receipt', workspace: 'ws_new' }),
        ]);
        const next = createWorkspaceValue({ active: createMockWorkspace({ id: 'ws_new' }) });
        view.rerender(<Scene auth={auth} workspace={next} />);
        expect(screen.queryByText('Old workspace receipt')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Your challenge')).toHaveValue('');
        expect(await screen.findByRole('heading', { name: 'New workspace receipt' })).toBeVisible();
        expect(pb.__collection('evidence').getFullList).toHaveBeenLastCalledWith(
            expect.objectContaining({ filter: 'workspace = "ws_new"' }),
        );
    });

    it('discards a late response from a previous workspace', async () => {
        let resolveOld;
        const auth = createAuthValue();
        pb.__collection('evidence').getFullList.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveOld = resolve;
                }),
        );
        const view = renderWithProviders(<Scene auth={auth} workspace={createWorkspaceValue()} />);
        pb.__setRecords('evidence', [
            createMockEvidence({ title: 'Current receipt', workspace: 'ws_new' }),
        ]);
        view.rerender(
            <Scene
                auth={auth}
                workspace={createWorkspaceValue({ active: createMockWorkspace({ id: 'ws_new' }) })}
            />,
        );
        expect(await screen.findByRole('heading', { name: 'Current receipt' })).toBeVisible();
        await act(async () => {
            resolveOld([createMockEvidence({ title: 'Late old receipt' })]);
        });
        expect(screen.queryByText('Late old receipt')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Current receipt' })).toBeVisible();
    });

    it('removes records on logout without another private read', async () => {
        const workspace = createWorkspaceValue();
        pb.__setRecords('evidence', [createMockEvidence({ title: 'Signed-in receipt' })]);
        const view = renderWithProviders(<Scene auth={createAuthValue()} workspace={workspace} />);
        expect(await screen.findByRole('heading', { name: 'Signed-in receipt' })).toBeVisible();
        const reads = pb.__collection('evidence').getFullList.mock.calls.length;
        pb.authStore.clear();
        view.rerender(
            <Scene auth={createAuthValue({ isAuthed: false, user: null })} workspace={workspace} />,
        );
        expect(screen.queryByText('Signed-in receipt')).not.toBeInTheDocument();
        expect(pb.__collection('evidence').getFullList).toHaveBeenCalledTimes(reads);
    });
});
