// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/TutorialCatalog.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
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
import broadcastCurriculum from '../../../../../pocketbase/pb_migrations/data/broadcast-classroom-lessons.json';
import authorityCurriculum from '../../../../../pocketbase/pb_migrations/data/authority-repairs-lessons.json';
import { learningFixture } from '../../../../../../tests/upgrade/tutorial-learning-fixture.mjs';
import { installGovernment } from '../../../../../../tests/upgrade/government-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import publicStarter from '../../../../../pocketbase/pb_migrations/data/starter-tutorials.json?public-lessons';
import publicBroadcast from '../../../../../pocketbase/pb_migrations/data/broadcast-classroom-lessons.json?public-lessons';
import publicAuthority from '../../../../../pocketbase/pb_migrations/data/authority-repairs-lessons.json?public-lessons';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
import TutorialsPage from '@/pages/workspace/TutorialsPage';
import DocsPage from '@/pages/DocsPage';
import AuthContext from '@/contexts/AuthContext';
import pb from '@/lib/pocketbaseClient';
import { setDemoMode } from '@/lib/demoWorkspace';
import { createAuthValue, renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
vi.mock('@/lib/observability/runtime', () => ({ reportAction: vi.fn(), reportMetric: vi.fn(), trackAuthIdentity: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ trackEvent: vi.fn() }));
vi.mock('@/components/workspace/ComponentCatalog', () => ({ default: () => <p>Component reference</p> }));
const lesson = curriculum.lessons[0];
const broadcastLesson = broadcastCurriculum.lessons[0];
const authorityLesson = authorityCurriculum.lessons[0];
const sourceCases = [broadcastCurriculum, authorityCurriculum];
const publicLessonCount = curriculum.lessons.length + broadcastCurriculum.lessons.length + authorityCurriculum.lessons.length;
it('opens the saved lesson linked by a classroom and keeps personal progress separate', async () => {
    const user = setupUser();
    renderWithProviders(<TutorialsPage />, { route: `/app/tutorials?lesson=${lesson.id}` });
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByRole('heading', { name: lesson.title })).toBeVisible();
    expect(pb.collection('tutorial_progress').create).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh lessons' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh lessons' })).not.toBeDisabled());
    // Refreshing the catalogue must not reopen a dismissed deep link.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
let backend, transport;
beforeEach(() => {
    pb.__reset(); setDemoMode(false); pb.__setRecords('tutorials', curriculum.lessons);
    backend = learningFixture(); backend.seed('users', { id: 'user_test', name: 'Test Owner' });
    transport = { failStatePage: 0, wait: null };
    pb.send = vi.fn(async (path, request) => {
        const id = path.replace('/api/buildanddo/learning', '').slice(1);
        if (id === 'states' && transport.failStatePage === request.query.page)
            throw { status: 503, response: { message: 'Guided progress page unavailable.' } };
        const event = backend.event(pb.authStore.record.id, request.body || {}, { id, query: request.query || {} });
        let result;
        try { result = plain(request.method === 'POST' ? backend.service.command(event) :
            id === 'states' ? backend.service.states(event) : id ? backend.service.detail(event) : backend.service.list(event)); }
        catch (error) { throw error.status ? { status: error.status, response: { message: error.message } } : error; }
        if (id === 'states' && transport.wait) await transport.wait;
        return result;
    });
});
afterEach(() => vi.restoreAllMocks());
const read = async (prefix = 'Read') => {
    const user = setupUser();
    const opener = await screen.findByRole('button', { name: `${prefix} ${lesson.title}` });
    await user.click(opener);
    return { user, opener, reader: within(screen.getByRole('dialog')) };
};

describe('complete Field Manual lessons', () => {
    it('bundles the curriculum the catalogue imports without any knowledge-check answer or explanation', () => {
        const shipped = [...publicStarter.lessons, ...publicBroadcast.lessons, ...publicAuthority.lessons];
        expect(shipped).toHaveLength(publicLessonCount);
        for (const item of shipped) {
            expect(Object.keys(item.lesson.check).sort()).toEqual(['choices', 'question']);
            expect(JSON.stringify(item)).not.toMatch(/"answer"|"explanation"/);
        }
    });

    it('withholds government lessons from public and demo previews', async () => {
        renderWithProviders(<TutorialCatalog />, { auth: { isAuthed: false, user: null } });
        expect(screen.getByText(`${publicLessonCount} lessons to explore`)).toBeVisible();
        expect(screen.queryByRole('option', { name: 'Government submissions' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Read Read the opportunity and freeze its rules' })).not.toBeInTheDocument();
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('shows starter and source-case previews when the backend has not installed the seeds', async () => {
        pb.__setRecords('tutorials', []);
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/Apply the tutorial catalogue migration/)).toBeVisible();
        expect(await screen.findByText(`0 of ${publicLessonCount} guided tutorials completed`)).toBeVisible();
        const { reader } = await read();
        expect(reader.getByRole('heading', { name: 'Why this matters' })).toBeVisible();
        expect(reader.getByRole('heading', { name: 'Worked example — illustrative data' })).toBeVisible();
        expect(reader.queryByRole('button', { name: 'Save reading progress' })).not.toBeInTheDocument();
        expect(pb.__collection('tutorial_progress').create).not.toHaveBeenCalled();
    });

    it('lets anonymous and demo readers explore without requesting any private collection', async () => {
        const view = renderWithProviders(<TutorialCatalog />, { auth: { isAuthed: false, user: null } });
        expect(screen.getByText(`${publicLessonCount} lessons to explore`)).toBeVisible();
        const { reader, user } = await read();
        expect(reader.queryByRole('button', { name: 'Save reading progress' })).not.toBeInTheDocument();
        expect(reader.getByText('Sign in and open the interactive tutorial to answer this knowledge check.')).toBeVisible();
        expect(JSON.stringify(screen.getByRole('dialog').textContent)).not.toContain(lesson.lesson.check.explanation);
        await user.click(reader.getByRole('button', { name: 'Close lesson' }));
        expect(pb.collection).not.toHaveBeenCalled();
        view.unmount(); setDemoMode(true);
        renderWithProviders(<TutorialCatalog />);
        expect(screen.getByText(/Demo mode: read the bundled lessons/)).toBeVisible();
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it('filters the real curriculum by path and search without claiming missing content is an empty backend', async () => {
        renderWithProviders(<TutorialCatalog />);
        await screen.findByRole('button', { name: `Read ${lesson.title}` });
        const user = setupUser();
        await user.selectOptions(screen.getByLabelText('Learning path'), 'Content production');
        expect(screen.getAllByRole('button', { name: /^Read / })).toHaveLength(5);
        await user.type(screen.getByLabelText('Search lessons'), 'social');
        expect(screen.getAllByRole('button', { name: /^Read / })).toHaveLength(1);
        await user.clear(screen.getByLabelText('Search lessons'));
        await user.type(screen.getByLabelText('Search lessons'), 'no-matching-lesson');
        expect(screen.getByText('No lessons match these filters.')).toBeVisible();
    });

    it('keeps a completed lesson completed when reviewing and returns keyboard focus to its opener', async () => {
        backend.finish({ actor: 'user_test' });
        renderWithProviders(<TutorialCatalog />);
        const { user, reader, opener } = await read('Review');
        expect(reader.getByText('Guided tutorial completed. Reading practice does not change your saved completion.')).toBeVisible();
        expect(reader.queryByRole('button', { name: 'Mark lesson complete' })).not.toBeInTheDocument();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(opener).toHaveFocus();
        expect(pb.__collection('tutorial_progress').update).not.toHaveBeenCalled();
        expect(screen.getByText(`1 of ${publicLessonCount} guided tutorials completed`)).toBeVisible();
    });

    it('shares canonical progress between Docs and the Field Manual while the public quiz stays read-only', async () => {
        backend.command('start', {}, { actor: 'user_test' });
        const docs = renderWithProviders(<DocsPage />, { route: '/docs' });
        await read('Continue');
        docs.unmount();
        renderWithProviders(<TutorialsPage />, { route: '/app/tutorials' });
        const { reader } = await read('Continue');
        // Completion of an interactive lesson belongs to its server-issued certificate.
        expect(reader.queryByRole('button', { name: 'Mark lesson complete' })).not.toBeInTheDocument();
        expect(reader.getByRole('button', { name: 'Start interactive tutorial' })).toBeEnabled();
        // The reader previews the question; grading happens only in the interactive tutorial.
        const check = within(reader.getByRole('region', { name: 'Knowledge check' }));
        expect(check.getByText(lesson.lesson.check.question)).toBeVisible();
        for (const choice of lesson.lesson.check.choices) expect(check.getByText(choice)).toBeVisible();
        expect(reader.queryByRole('radio')).not.toBeInTheDocument();
        expect(reader.queryByRole('button', { name: 'Check answer' })).not.toBeInTheDocument();
        expect(reader.queryByText(lesson.lesson.check.explanation)).not.toBeInTheDocument();
        expect(check.getByText('Answer this knowledge check in the interactive tutorial.')).toBeVisible();
        expect(reader.getByText(/Finish the interactive tutorial to complete this lesson/)).toBeVisible();
        expect(reader.queryByRole('button', { name: 'Save reading progress' })).not.toBeInTheDocument();
        expect(reader.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(reader.getByText(/Open-book reading and practice preview only/)).toBeVisible();
        expect(pb.__collection('tutorial_progress').create).not.toHaveBeenCalled();
        expect(pb.__collection('tutorial_progress').update).not.toHaveBeenCalled();
        expect(pb.send.mock.calls.every(([, request]) => request.method === 'GET')).toBe(true);
        expect(backend.list('user_test').points).toBe(0);
        expect(backend.detail(lesson.id, 'user_test').enrollment.status).toBe('in_progress');
    });

    it('allows reading during catalogue failure and recovers persistent progress only after successful reads', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {}); pb.__setError('tutorials');
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/The lesson catalogue is unavailable/)).toBeVisible();
        const { user, reader } = await read();
        expect(reader.queryByRole('button', { name: 'Save reading progress' })).not.toBeInTheDocument();
        await user.click(reader.getByRole('button', { name: 'Close lesson' }));
        pb.__clearError('tutorials');
        await user.click(screen.getByRole('button', { name: 'Try again' }));
        await waitFor(() => expect(screen.queryByText(/The lesson catalogue is unavailable/)).not.toBeInTheDocument());
        expect(await screen.findByText(`0 of ${publicLessonCount} guided tutorials completed`)).toBeVisible();
    });

    it('keeps guided completion unknown on a failed state read even when historical reading claims completion', async () => {
        transport.failStatePage = 1;
        pb.__setRecords('tutorial_progress', [{ id: 'legacy', owner: 'user_test', tutorial: lesson.id, status: 'completed', progress: 100 }]);
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/Guided progress page unavailable/)).toBeVisible();
        expect(screen.getByRole('button', { name: `Start interactive tutorial: ${lesson.title}` })).toBeEnabled();
        const { reader } = await read();
        expect(reader.getByRole('heading', { name: 'Practice' })).toBeVisible();
        expect(reader.getByRole('button', { name: 'Start interactive tutorial' })).toBeEnabled();
        expect(reader.queryByRole('button', { name: 'Mark lesson complete' })).not.toBeInTheDocument();
        expect(screen.queryByText(/guided tutorials completed/)).not.toBeInTheDocument();
        expect(pb.__collection('tutorial_progress').create).not.toHaveBeenCalled();
    });

    it('opens a public guided lesson from its card and reader while a revoked restricted enrollment denies aggregate progress', async () => {
        installGovernment(backend, ['user_test']);
        backend.seed('tutorials', { ...backend.lessons[1], id: 'restricted00001', slug: 'restricted-fixture',
            title: 'Restricted learning fixture', category: 'Government submissions' });
        backend.command('start', {}, { id: 'restricted00001', actor: 'user_test' });
        backend.data.government_memberships[0].status = 'revoked';
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/Guided completion is unknown/)).toBeVisible();
        expect(screen.queryByText(/guided tutorials completed/)).not.toBeInTheDocument();
        expect(screen.queryByText('Restricted learning fixture')).not.toBeInTheDocument();
        const card = screen.getByRole('button', { name: `Start interactive tutorial: ${lesson.title}` });
        expect(card).toBeEnabled();
        const { user, reader } = await read();
        await user.click(reader.getByRole('button', { name: 'Start interactive tutorial' }));
        await user.click(await screen.findByRole('button', { name: 'Start and save my progress' }));
        const guided = within(screen.getByRole('dialog'));
        await user.click(await guided.findByRole('button', { name: 'Save checkpoint and continue' }));
        expect(await guided.findByRole('heading', { name: lesson.lesson.sections[1].heading })).toBeVisible();
        await user.click(guided.getByRole('button', { name: 'Close and continue later' }));
        expect(await screen.findByText(/Guided completion is unknown/)).toBeVisible();
        expect(screen.queryByText(/guided tutorials completed/)).not.toBeInTheDocument();
        await user.click(card);
        expect(await within(screen.getByRole('dialog')).findByRole('heading', { name: lesson.lesson.sections[1].heading })).toBeVisible();
        expect(backend.data.tutorial_learning.find((row) => row.tutorial === 'restricted00001').next_section).toBe(0);
    });

    it('withholds partial state pages and recovers all completions after retry, including beyond five certificates', async () => {
        for (const item of backend.lessons.slice(0, 6)) backend.finish({ id: item.id, actor: 'user_test' });
        for (const item of backend.lessons.slice(6)) backend.command('start', {}, { id: item.id, actor: 'user_test' });
        transport.failStatePage = 2;
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/Guided progress page unavailable/)).toBeVisible();
        expect(screen.queryByText(/guided tutorials completed/)).not.toBeInTheDocument();
        transport.failStatePage = 0;
        await setupUser().click(screen.getByRole('button', { name: 'Refresh lessons' }));
        expect(await screen.findByText(`6 of ${publicLessonCount} guided tutorials completed`)).toBeVisible();
        for (const item of backend.lessons.slice(0, 6)) expect(screen.getByRole('button', { name: `Review ${item.title}` })).toBeEnabled();
        expect(pb.send.mock.calls.filter(([path]) => path.endsWith('/states')).map(([, request]) => request.query.page)).toEqual([1, 2, 1, 2]);
    });

    it('does not count orphaned progress and keeps completed counts outside a limited preview', async () => {
        backend.finish({ id: curriculum.lessons[1].id, actor: 'user_test' });
        pb.__setRecords('tutorial_progress', [{ id: 'orphan', owner: 'user_test', tutorial: 'missing', status: 'completed' }]);
        renderWithProviders(<TutorialCatalog limit={1} />);
        expect(await screen.findByText(`1 of ${publicLessonCount} guided tutorials completed`)).toBeVisible();
        expect(screen.queryByRole('heading', { name: curriculum.lessons[1].title })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'View all lessons' })).toHaveAttribute('href', '/docs#workspace-lessons');
    });

    it('keeps malformed custom bodies visible as unavailable without enabling completion', async () => {
        pb.__setRecords('tutorials', [{ ...lesson, lesson: { schema_version: 99 } }]);
        renderWithProviders(<TutorialCatalog />);
        const { reader } = await read();
        expect(reader.getByText(/lesson body is unavailable or uses an unsupported format/)).toBeVisible();
        expect(reader.queryByRole('button', { name: 'Save reading progress' })).not.toBeInTheDocument();
    });

    it.each(sourceCases)('opens public source case $version with practice, quiz and a local evidence link, without private reads', async (sourceCase) => {
        const sourceLesson = sourceCase.lessons[0];
        renderWithProviders(<TutorialCatalog initialLesson={sourceLesson.slug} />, { auth: { isAuthed: false, user: null } });
        const reader = within(await screen.findByRole('dialog'));
        expect(reader.getByRole('heading', { name: sourceLesson.title })).toBeVisible();
        expect(reader.getByRole('heading', { name: 'Practice' })).toBeVisible();
        expect(reader.getByRole('region', { name: 'Knowledge check' })).toBeVisible();
        expect(reader.getByRole('heading', { name: 'Check your understanding' })).toBeVisible();
        expect(reader.queryByText(sourceLesson.lesson.check.explanation)).not.toBeInTheDocument();
        expect(reader.getByText(sourceCase.source_evidence.boundary)).toBeVisible();
        expect(reader.getByRole('link', { name: /Open Evidence and its separate Source case studies panel/ })).toHaveAttribute('href', '/app/evidence');
        expect(reader.queryByRole('button', { name: 'Save reading progress' })).not.toBeInTheDocument();
        expect(pb.collection).not.toHaveBeenCalled();
    });

    it.each(sourceCases)('keeps uninstalled source case $version read-only even for a signed-in learner', async (sourceCase) => {
        const sourceLesson = sourceCase.lessons[0];
        renderWithProviders(<TutorialsPage />, { route: `/app/tutorials?lesson=${sourceLesson.slug}` });
        const reader = within(await screen.findByRole('dialog'));
        expect(reader.getByRole('heading', { name: sourceLesson.title })).toBeVisible();
        expect(reader.queryByRole('button', { name: 'Save reading progress' })).not.toBeInTheDocument();
        expect(reader.queryByRole('button', { name: 'Start interactive tutorial' })).not.toBeInTheDocument();
        for (const name of ['tutorial_progress', 'tutorial_learning', 'evidence']) expect(pb.__collection(name).create).not.toHaveBeenCalled();
    });

    it.each(sourceCases)('merges installed source case $version once, honors edits and does not auto-save on its deep link', async (sourceCase) => {
        const sourceLesson = sourceCase.lessons[0];
        const edited = { ...sourceLesson, title: `Operator-reviewed ${sourceLesson.title}`,
            lesson: { ...sourceLesson.lesson, why: 'Keep this operator clarification.' } };
        pb.__setRecords('tutorials', [...curriculum.lessons, edited]);
        renderWithProviders(<TutorialsPage />, { route: `/app/tutorials?lesson=${sourceLesson.slug}` });
        const reader = within(await screen.findByRole('dialog'));
        expect(reader.getByRole('heading', { name: edited.title })).toBeVisible();
        expect(reader.getByText(edited.lesson.why)).toBeVisible();
        expect(reader.queryByRole('button', { name: 'Save reading progress' })).not.toBeInTheDocument();
        for (const name of ['tutorial_progress', 'tutorial_learning', 'evidence']) expect(pb.__collection(name).create).not.toHaveBeenCalled();
        await setupUser().keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(screen.getAllByRole('heading', { name: edited.title })).toHaveLength(1);
        expect(await screen.findByText(`0 of ${publicLessonCount} guided tutorials completed`)).toBeVisible();
    });

    it('keeps the authority-case quiz read-only and source-case search limited to both authored lessons', async () => {
        renderWithProviders(<TutorialCatalog initialCategory="Source case studies" />);
        const user = setupUser();
        expect(await screen.findByRole('heading', { name: authorityLesson.title })).toBeVisible();
        expect(screen.getByRole('heading', { name: broadcastLesson.title })).toBeVisible();
        expect(screen.getAllByRole('button', { name: /^Read / })).toHaveLength(2);
        await user.type(screen.getByLabelText('Search lessons'), 'claim authority');
        expect(screen.getAllByRole('button', { name: /^Read / })).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: `Read ${authorityLesson.title}` }));
        const reader = within(screen.getByRole('dialog'));
        expect(reader.getByRole('heading', { name: 'Guided progress is canonical, not a secure exam' })).toBeVisible();
        const check = within(reader.getByRole('region', { name: 'Knowledge check' }));
        expect(check.getByText(authorityLesson.lesson.check.question)).toBeVisible();
        for (const choice of authorityLesson.lesson.check.choices) expect(check.getByText(choice)).toBeVisible();
        expect(reader.queryByRole('radio')).not.toBeInTheDocument();
        expect(reader.queryByRole('checkbox')).not.toBeInTheDocument();
        expect(reader.queryByRole('button', { name: 'Check answer' })).not.toBeInTheDocument();
        expect(reader.queryByText(authorityLesson.lesson.check.explanation)).not.toBeInTheDocument();
        for (const name of ['tutorial_progress', 'tutorial_learning', 'evidence'])
            for (const method of ['create', 'update', 'delete']) expect(pb.__collection(name)[method]).not.toHaveBeenCalled();
        expect(pb.send.mock.calls.every(([, request]) => request.method === 'GET')).toBe(true);
        expect(backend.list('user_test').points).toBe(0);
    });

    it('discards an open reader and pending canonical read when the account logs out', async () => {
        const auth = createAuthValue();
        let resolveRead;
        transport.wait = new Promise((resolve) => { resolveRead = resolve; });
        const view = renderWithProviders(<AuthContext.Provider value={auth}><TutorialCatalog /></AuthContext.Provider>);
        await read();
        const reads = pb.send.mock.calls.length;
        pb.authStore.clear();
        view.rerender(<AuthContext.Provider value={createAuthValue({ user: null, isAuthed: false })}><TutorialCatalog /></AuthContext.Provider>);
        await act(async () => { resolveRead(); });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText(/guided tutorials completed/)).not.toBeInTheDocument();
        expect(pb.send).toHaveBeenCalledTimes(reads);
    });

    it('shows duplicate historical reading separately without promoting or downgrading canonical learning', async () => {
        backend.command('start', {}, { actor: 'user_test' });
        pb.__setRecords('tutorial_progress', [
            { id: 'old', owner: 'user_test', tutorial: lesson.id, status: 'completed', progress: 100 },
            { id: 'new', owner: 'user_test', tutorial: lesson.id, status: 'in_progress', progress: 50 },
        ]);
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(`0 of ${publicLessonCount} guided tutorials completed`)).toBeVisible();
        expect(screen.getByText(/Historical reading: completed/)).toHaveTextContent('not guided completion');
        expect(screen.getByRole('button', { name: `Continue ${lesson.title}` })).toBeEnabled();
        expect(screen.queryByRole('button', { name: `Review ${lesson.title}` })).not.toBeInTheDocument();
        expect(pb.__collection('tutorial_progress').update).not.toHaveBeenCalled();
    });

    it('a failed historical read cannot hide canonical completion or prevent a guided lesson', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {}); pb.__setError('tutorial_progress');
        backend.finish({ actor: 'user_test' });
        renderWithProviders(<TutorialCatalog />);
        expect(await screen.findByText(/Historical reading records are unavailable/)).toBeVisible();
        expect(await screen.findByText(`1 of ${publicLessonCount} guided tutorials completed`)).toBeVisible();
        expect(screen.getByRole('button', { name: `Start interactive tutorial: ${lesson.title}` })).toBeEnabled();
    });
});
