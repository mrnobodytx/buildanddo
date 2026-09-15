// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/TutorialCatalog.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/workspace/TutorialCatalog.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/TutorialCatalog.jsx
// DAG Node:    none
// Intent:      Exercise shared lesson progress across pages without anonymous reads, demo writes or duplicate retries.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
import DocsPage from '@/pages/DocsPage';
import TutorialsPage from '@/pages/workspace/TutorialsPage';
import AuthContext from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import {
    createAuthValue,
    mockPocketBaseError,
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
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
vi.mock('@/components/workspace/ComponentCatalog', () => ({
    default: () => <p>Component reference</p>,
}));

const lesson = {
    id: 'lesson1',
    title: 'Inspect evidence',
    summary: 'Keep the source with an observation.',
    category: 'Evidence',
    effort_minutes: 8,
};
beforeEach(() => {
    pb.__reset();
    setDemoMode(false);
    pb.__setRecords('tutorials', [lesson]);
});
afterEach(() => vi.restoreAllMocks());

describe('shared Field Manual', () => {
    it('shows a true empty catalogue after a successful read', async () => {
        pb.__setRecords('tutorials', []);
        renderWithProviders(<TutorialCatalog />);
        expect(screen.getByRole('status')).toHaveTextContent('Loading lessons');
        expect(await screen.findByText('No lessons available yet.')).toBeVisible();
        expect(screen.getByText('0 of 0 lessons completed')).toBeVisible();
    });

    it('retries a catalogue failure without silently treating it as an empty list', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        pb.__setError('tutorials');
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText('The lesson catalogue is unavailable.')).toBeVisible();
        expect(screen.queryByText('No lessons available yet.')).not.toBeInTheDocument();
        pb.__clearError('tutorials');
        await setupUser().click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByRole('heading', { name: lesson.title })).toBeVisible();
        pb.__setRecords('tutorials', [{ ...lesson, title: 'Updated catalogue entry' }]);
        await setupUser().click(screen.getByRole('button', { name: 'Refresh lessons' }));
        expect(
            await screen.findByRole('heading', { name: 'Updated catalogue entry' }),
        ).toBeVisible();
    });

    it('can reopen a completed lesson using its existing progress record', async () => {
        pb.__setRecords('tutorials', [{ ...lesson, prerequisites: 'A recorded observation' }]);
        pb.__setRecords('tutorial_progress', [
            { id: 'saved-progress', tutorial: lesson.id, status: 'completed', progress: 100 },
        ]);
        renderWithProviders(<TutorialCatalog />);
        const review = await screen.findByRole('button', { name: 'Review Inspect evidence' });
        expect(screen.getByText('Prerequisite: A recorded observation')).toBeVisible();
        await setupUser().click(review);
        expect(await screen.findByText('0 of 1 lessons completed')).toBeVisible();
        expect(pb.__collection('tutorial_progress').update).toHaveBeenCalledWith('saved-progress', {
            status: 'in_progress',
            progress: 50,
        });
        expect(pb.__collection('tutorial_progress').create).not.toHaveBeenCalled();
    });

    it('does not request the catalogue or progress before authentication', () => {
        renderWithProviders(<TutorialCatalog />, { auth: { isAuthed: false, user: null } });
        expect(screen.getByRole('link', { name: 'Sign in for lessons' })).toBeVisible();
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('persists a start from Docs and reuses that progress in the workspace Field Manual', async () => {
        const user = setupUser();
        const docs = renderWithProviders(<DocsPage />, { route: '/docs' });
        const start = await screen.findByRole('button', { name: 'Start Inspect evidence' });
        await waitFor(() => expect(start).toBeEnabled());
        await user.click(start);
        expect(await screen.findByText('Progress saved for Inspect evidence.')).toBeVisible();
        expect(pb.__collection('tutorial_progress').create).toHaveBeenCalledWith({
            tutorial: 'lesson1',
            owner: 'user_test',
            status: 'in_progress',
            progress: 50,
        });
        docs.unmount();
        renderWithProviders(<TutorialsPage />, { route: '/app/tutorials' });
        await user.click(screen.getByRole('tab', { name: 'Lessons' }));
        const next = await screen.findByRole('button', { name: 'Continue Inspect evidence' });
        expect(next).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Mark Inspect evidence complete' }));
        expect(await screen.findByText('1 of 1 lessons completed')).toBeVisible();
        expect(pb.__collection('tutorial_progress').create).toHaveBeenCalledTimes(1);
        expect(pb.__collection('tutorial_progress').update).toHaveBeenCalledWith(
            expect.any(String),
            { status: 'completed', progress: 100 },
        );
    });

    it('retains the catalogue when progress is unavailable and blocks duplicate creation until recovery', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        pb.__setError('tutorial_progress');
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByRole('heading', { name: lesson.title })).toBeVisible();
        expect(
            await screen.findByText(
                'Your saved progress is unavailable. Retry before updating a lesson.',
            ),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Start Inspect evidence' })).toBeDisabled();
        pb.__clearError('tutorial_progress');
        pb.__setRecords('tutorial_progress', [
            { id: 'saved-progress', tutorial: lesson.id, status: 'in_progress', progress: 50 },
        ]);
        await setupUser().click(screen.getByRole('button', { name: 'Try again' }));
        expect(
            await screen.findByRole('button', { name: 'Continue Inspect evidence' }),
        ).toBeEnabled();
        expect(pb.__collection('tutorial_progress').create).not.toHaveBeenCalled();
    });

    it('keeps failed writes recoverable and only reports success after PocketBase accepts them', async () => {
        renderWithProviders(<TutorialCatalog />);
        const start = await screen.findByRole('button', { name: 'Start Inspect evidence' });
        await waitFor(() => expect(start).toBeEnabled());
        pb.__collection('tutorial_progress').create.mockRejectedValueOnce(
            mockPocketBaseError('Could not save progress', 500),
        );
        const user = setupUser();
        await user.click(start);
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not save progress');
        expect(screen.queryByText('Progress saved for Inspect evidence.')).not.toBeInTheDocument();
        await user.click(start);
        expect(await screen.findByText('Progress saved for Inspect evidence.')).toBeVisible();
    });

    it('does not count orphaned progress and preserves completion when a preview hides a lesson', async () => {
        pb.__setRecords('tutorials', [
            lesson,
            { ...lesson, id: 'lesson2', title: 'Inspect a mission' },
        ]);
        pb.__setRecords('tutorial_progress', [
            { id: 'p1', tutorial: 'lesson2', status: 'completed' },
            { id: 'orphan', tutorial: 'removed-lesson', status: 'completed' },
        ]);
        renderWithProviders(<TutorialCatalog limit={1} />);
        expect(await screen.findByText('1 of 2 lessons completed')).toBeVisible();
        expect(
            screen.queryByRole('heading', { name: 'Inspect a mission' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View all lessons' })).toHaveAttribute(
            'href',
            '/docs#workspace-lessons',
        );
    });

    it('makes no backend calls in demo mode', () => {
        setDemoMode(true);
        renderWithProviders(<TutorialCatalog />);
        expect(screen.getByText('Demonstration data.')).toBeVisible();
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('clears saved progress when the signed-in account changes', async () => {
        const first = createAuthValue();
        pb.__setRecords('tutorial_progress', [
            { id: 'first-progress', tutorial: lesson.id, status: 'completed' },
        ]);
        const view = renderWithProviders(
            <AuthContext.Provider value={first}>
                <TutorialCatalog />
            </AuthContext.Provider>,
        );
        expect(await screen.findByText('1 of 1 lessons completed')).toBeVisible();
        const second = createAuthValue({ user: { id: 'second-user' } });
        pb.__setAuth({ record: second.user, isValid: true });
        pb.__setRecords('tutorial_progress', []);
        view.rerender(
            <AuthContext.Provider value={second}>
                <TutorialCatalog />
            </AuthContext.Provider>,
        );
        expect(screen.queryByText('1 of 1 lessons completed')).not.toBeInTheDocument();
        expect(await screen.findByText('0 of 1 lessons completed')).toBeVisible();
    });

    it('does not refresh or show a pending save after logout', async () => {
        const auth = createAuthValue();
        const view = renderWithProviders(
            <AuthContext.Provider value={auth}>
                <TutorialCatalog />
            </AuthContext.Provider>,
        );
        const start = await screen.findByRole('button', { name: 'Start Inspect evidence' });
        await waitFor(() => expect(start).toBeEnabled());
        let resolveSave;
        pb.__collection('tutorial_progress').create.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveSave = resolve;
                }),
        );
        await setupUser().click(start);
        const reads = pb.__collection('tutorial_progress').getFullList.mock.calls.length;
        pb.authStore.clear();
        view.rerender(
            <AuthContext.Provider value={createAuthValue({ user: null, isAuthed: false })}>
                <TutorialCatalog />
            </AuthContext.Provider>,
        );
        await act(async () => {
            resolveSave({ id: 'saved-progress' });
        });
        expect(screen.queryByText('Progress saved for Inspect evidence.')).not.toBeInTheDocument();
        expect(pb.__collection('tutorial_progress').getFullList).toHaveBeenCalledTimes(reads);
    });
});
