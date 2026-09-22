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
import { act, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import curriculum from '../../../../../pocketbase/pb_migrations/data/starter-tutorials.json';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
import TutorialsPage from '@/pages/workspace/TutorialsPage';
import DocsPage from '@/pages/DocsPage';
import AuthContext from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { createAuthValue, mockPocketBaseError, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn(), trackAuthIdentity: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('@/components/workspace/ComponentCatalog', () => ({ default: () => <p>Component reference</p> }));
const lesson = curriculum.lessons[0];
it('opens the saved lesson linked by a classroom and keeps personal progress separate', async () => {
    const user = setupUser();
    renderWithProviders(<TutorialsPage />, { route: `/app/tutorials?lesson=${lesson.id}` });
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('heading', { name: lesson.title })).toBeVisible();
    expect(pb.collection('tutorial_progress').create).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    // Escape closes the dialog through a state update React still has to flush, so this is a
    // WAIT, not a synchronous read. Asserting it directly passed only because userEvent's
    // default delay of 0 awaited a macrotask first - the race was hidden, never removed.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Refresh lessons' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh lessons' })).not.toBeDisabled());
    // Refreshing the catalogue must not reopen a dismissed deep link.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
beforeEach(() => { pb.__reset(); setDemoMode(false); pb.__setRecords('tutorials', curriculum.lessons); });
afterEach(() => vi.restoreAllMocks());
const read = async (prefix = 'Read') => {
    const user = setupUser();
    const opener = await screen.findByRole('button', { name: `${prefix} ${lesson.title}` });
    await user.click(opener);
    return { user, opener, reader: within(screen.getByRole('dialog')) };
};

describe('complete Field Manual lessons', () => {
    it('opens the government learning path directly and reads a substantive lesson', async () => {
        renderWithProviders(<TutorialsPage />, { route: '/app/tutorials?path=government' });
        const user = setupUser();
        expect(await screen.findByLabelText('Learning path')).toHaveValue('Government submissions');
        expect(screen.getAllByRole('button', { name: /^Read / })).toHaveLength(8);
        await user.click(screen.getByRole('button', { name: 'Read Read the opportunity and freeze its rules' }));
        const reader = within(screen.getByRole('dialog'));
        expect(reader.getByRole('heading', { name: 'Create a source-backed matrix' })).toBeVisible();
        expect(reader.getByText(/15 slides OR a paper of up to 10 pages/)).toBeVisible();
        expect(reader.getByRole('button', { name: 'Save reading progress' })).toBeDisabled();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('shows 33 readable previews when the backend has not installed the seed', async () => {
        pb.__setRecords('tutorials', []);
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/Apply the tutorial catalogue migration/)).toBeVisible();
        expect(screen.getByText('0 of 33 lessons completed')).toBeVisible();
        const { reader } = await read();
        expect(reader.getByRole('heading', { name: 'Why this matters' })).toBeVisible();
        expect(reader.getByRole('heading', { name: 'Worked example — illustrative data' })).toBeVisible();
        expect(reader.getByRole('button', { name: 'Save reading progress' })).toBeDisabled();
        expect(pb.__collection('tutorial_progress').create).not.toHaveBeenCalled();
    });

    it('lets anonymous and demo readers explore without requesting any private collection', async () => {
        const view = renderWithProviders(<TutorialCatalog />, { auth: { isAuthed: false, user: null } });
        expect(screen.getByText('33 lessons to explore')).toBeVisible();
        const { reader, user } = await read();
        expect(reader.getByRole('button', { name: 'Save reading progress' })).toBeDisabled();
        await user.click(reader.getByRole('button', { name: 'Close lesson' }));
        expect(pb.collection).not.toHaveBeenCalled();
        view.unmount(); setDemoMode(true);
        renderWithProviders(<TutorialCatalog />);
        expect(screen.getByText(/Demo mode: read the starter lessons/)).toBeVisible();
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('filters the real curriculum by path and search without claiming missing content is an empty backend', async () => {
        renderWithProviders(<TutorialCatalog />);
        await screen.findByRole('button', { name: `Read ${lesson.title}` });
        const user = setupUser();
        await user.selectOptions(screen.getByLabelText('Learning path'), 'Content production');
        expect(screen.getAllByRole('button', { name: /^Read / })).toHaveLength(5);
        await user.type(screen.getByLabelText('Search lessons'), 'social');
        await waitFor(() =>
            expect(screen.getAllByRole('button', { name: /^Read / })).toHaveLength(1),
        );
        await user.clear(screen.getByLabelText('Search lessons'));
        await user.type(screen.getByLabelText('Search lessons'), 'no-matching-lesson');
        expect(screen.getByText('No lessons match these filters.')).toBeVisible();
    });

    it('keeps a completed lesson completed when reviewing and returns keyboard focus to its opener', async () => {
        pb.__setRecords('tutorial_progress', [{ id: 'saved-progress', tutorial: lesson.id, status: 'completed', progress: 100 }]);
        renderWithProviders(<TutorialCatalog />);
        const { user, reader, opener } = await read('Review');
        expect(reader.getByText('Completed. Reviewing keeps your saved completion.')).toBeVisible();
        expect(reader.queryByRole('button', { name: 'Mark lesson complete' })).not.toBeInTheDocument();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(opener).toHaveFocus();
        expect(pb.__collection('tutorial_progress').update).not.toHaveBeenCalled();
        expect(screen.getByText('1 of 33 lessons completed')).toBeVisible();
    });

    it('shares saved progress between Docs and the default Field Manual lesson tab', async () => {
        const docs = renderWithProviders(<DocsPage />, { route: '/docs' });
        let { reader, user } = await read();
        await user.click(reader.getByRole('button', { name: 'Save reading progress' }));
        expect(await reader.findByText(`Progress saved for ${lesson.title}.`)).toBeVisible();
        expect(pb.__collection('tutorial_progress').create).toHaveBeenCalledWith({ tutorial: lesson.id, owner: 'user_test', status: 'in_progress', progress: 50 });
        docs.unmount();
        renderWithProviders(<TutorialsPage />, { route: '/app/tutorials' });
        ({ reader, user } = await read('Continue'));
        expect(reader.getByRole('button', { name: 'Mark lesson complete' })).toBeDisabled();
        await user.click(reader.getByRole('radio', { name: lesson.lesson.check.choices[0] }));
        await user.click(reader.getByRole('button', { name: 'Check answer' }));
        expect(reader.getByText('Try another answer.')).toBeVisible();
        await user.click(reader.getByRole('radio', { name: lesson.lesson.check.choices[lesson.lesson.check.answer] }));
        await user.click(reader.getByRole('button', { name: 'Check answer' }));
        expect(reader.getByText('That’s right.')).toBeVisible();
        await user.click(reader.getByRole('checkbox', { name: /I worked through the exercise/ }));
        await user.click(reader.getByRole('button', { name: 'Mark lesson complete' }));
        expect(await reader.findByText('Completed. Reviewing keeps your saved completion.')).toBeVisible();
        expect(pb.__collection('tutorial_progress').create).toHaveBeenCalledTimes(1);
        expect(pb.__collection('tutorial_progress').update).toHaveBeenCalledWith(expect.any(String), { status: 'completed', progress: 100 });
    });

    it('allows reading during catalogue failure and recovers persistent progress only after successful reads', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {}); pb.__setError('tutorials');
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/The lesson catalogue is unavailable/)).toBeVisible();
        const { user, reader } = await read();
        expect(reader.getByRole('button', { name: 'Save reading progress' })).toBeDisabled();
        await user.click(reader.getByRole('button', { name: 'Close lesson' }));
        pb.__clearError('tutorials');
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(screen.queryByText(/The lesson catalogue is unavailable/)).not.toBeInTheDocument());
        expect(screen.getByText('0 of 33 lessons completed')).toBeVisible();
    });

    it('blocks progress writes during a failed progress read while keeping the lesson readable', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {}); pb.__setError('tutorial_progress');
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/Your saved progress is unavailable/)).toBeVisible();
        const { reader } = await read();
        expect(reader.getByRole('heading', { name: 'Practice' })).toBeVisible();
        expect(reader.getByRole('button', { name: 'Save reading progress' })).toBeDisabled();
        expect(pb.__collection('tutorial_progress').create).not.toHaveBeenCalled();
    });

    it('reconciles a lost create response and reuses the saved progress on retry', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        renderWithProviders(<TutorialCatalog />);
        const { reader, user } = await read();
        pb.__collection('tutorial_progress').create.mockImplementationOnce(async (fields) => {
            pb.__setRecords('tutorial_progress', [{ id: 'uncertain-progress', ...fields }]);
            throw mockPocketBaseError('Response was lost', 500);
        });
        await user.click(reader.getByRole('button', { name: 'Save reading progress' }));
        expect(await reader.findByRole('alert')).toHaveTextContent('Response was lost');
        await waitFor(() => expect(reader.getByRole('button', { name: 'Save reading progress' })).toBeEnabled());
        await user.click(reader.getByRole('button', { name: 'Save reading progress' }));
        expect(await reader.findByText(`Progress saved for ${lesson.title}.`)).toBeVisible();
        expect(pb.__collection('tutorial_progress').create).toHaveBeenCalledTimes(1);
        expect(pb.__collection('tutorial_progress').update).toHaveBeenCalledWith('uncertain-progress', { status: 'in_progress', progress: 50 });
    });

    it('does not count orphaned progress and keeps completed counts outside a limited preview', async () => {
        pb.__setRecords('tutorial_progress', [{ id: 'hidden', tutorial: curriculum.lessons[1].id, status: 'completed' }, { id: 'orphan', tutorial: 'missing', status: 'completed' }]);
        renderWithProviders(<TutorialCatalog limit={1} />);
        expect(await screen.findByText('1 of 33 lessons completed')).toBeVisible();
        expect(screen.queryByRole('heading', { name: curriculum.lessons[1].title })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View all lessons' })).toHaveAttribute('href', '/docs#workspace-lessons');
    });

    it('keeps malformed custom bodies visible as unavailable without enabling completion', async () => {
        pb.__setRecords('tutorials', [{ ...lesson, lesson: { schema_version: 99 } }]);
        renderWithProviders(<TutorialCatalog />);
        const { reader } = await read();
        expect(reader.getByText(/lesson body is unavailable or uses an unsupported format/)).toBeVisible();
        expect(reader.getByRole('button', { name: 'Save reading progress' })).toBeDisabled();
    });

    it('discards an open reader and a pending save when the account logs out', async () => {
        const auth = createAuthValue();
        const view = renderWithProviders(<AuthContext.Provider value={auth}><TutorialCatalog /></AuthContext.Provider>);
        const { reader, user } = await read();
        let resolveSave;
        pb.__collection('tutorial_progress').create.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
        await user.click(reader.getByRole('button', { name: 'Save reading progress' }));
        const reads = pb.__collection('tutorial_progress').getFullList.mock.calls.length;
        pb.authStore.clear();
        view.rerender(<AuthContext.Provider value={createAuthValue({ user: null, isAuthed: false })}><TutorialCatalog /></AuthContext.Provider>);
        await act(async () => { resolveSave({ id: 'saved-progress' }); });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText(`Progress saved for ${lesson.title}.`)).not.toBeInTheDocument();
        expect(pb.__collection('tutorial_progress').getFullList).toHaveBeenCalledTimes(reads);
    });
});
