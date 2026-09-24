// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/InteractiveTutorial.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-TRUST-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-TRUST-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-19
// Depends:     apps/web/src/components/workspace/TutorialCatalog.jsx, apps/web/src/components/workspace/InteractiveTutorial.jsx, apps/web/src/components/workspace/TutorialGrowth.jsx, tests/upgrade/tutorial-learning-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/TutorialCatalog.jsx; VALIDATES apps/web/src/components/workspace/InteractiveTutorial.jsx; VALIDATES apps/web/src/components/workspace/TutorialGrowth.jsx; CONSUMES tests/upgrade/tutorial-learning-fixture.mjs
// DAG Node:    none
// Intent:      Exercise guided learning, recovery, certificate export and account switches through rendered production components.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { act, within } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { learningFixture } from '../../../../../../tests/upgrade/tutorial-learning-fixture.mjs';
import { plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import broadcastCurriculum from '../../../../../pocketbase/pb_migrations/data/broadcast-classroom-lessons.json';
import authorityCurriculum from '../../../../../pocketbase/pb_migrations/data/authority-repairs-lessons.json';
import TutorialCatalog from '@/components/workspace/TutorialCatalog';
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

let backend, lesson, transport;
beforeEach(() => {
    pb.__reset(); setDemoMode(false);
    backend = learningFixture(); lesson = backend.lessons[0];
    backend.seed('users', { id: 'user_test', name: 'Test Owner' });
    pb.__setRecords('tutorials', backend.lessons);
    pb.__collection('tutorial_progress').getFullList.mockImplementation(async () => plain(backend.data.tutorial_progress.filter((row) => row.owner === pb.authStore.record?.id)));
    transport = { loseNext: false, unavailable: false, wait: null, growthWait: null, deniedGrowthPage: 0 };
    pb.send = vi.fn(async (path, request) => {
        if (transport.unavailable) throw { status: 503, response: { message: 'Interactive learning is unavailable.' } };
        const id = path.replace('/api/buildanddo/learning', '').slice(1);
        if (!id && request.query?.page === transport.deniedGrowthPage)
            throw { status: 403, response: { message: 'Certificate page access denied.' } };
        const event = backend.event(pb.authStore.record.id, request.body || {}, { id, query: request.query || {} });
        let result;
        try { result = plain(request.method === 'POST' ? backend.service.command(event) :
            id === 'states' ? backend.service.states(event) : id ? backend.service.detail(event) : backend.service.list(event)); }
        catch (error) { throw error.status ? { status: error.status, response: { message: error.message } } : error; }
        if (transport.loseNext && request.method === 'POST') { transport.loseNext = false; throw new Error('Response lost'); }
        if (transport.wait && request.method === 'POST') await transport.wait;
        if (!id && transport.growthWait) await transport.growthWait;
        return result;
    });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function openTutorial(user) {
    const opener = await screen.findByRole('button', { name: `Start interactive tutorial: ${lesson.title}` });
    await waitFor(() => expect(opener).toBeEnabled());
    await user.click(opener);
    const reader = within(await screen.findByRole('dialog'));
    await reader.findByRole('heading', { name: lesson.title });
    return { opener, reader };
}
async function throughPractice(user, reader) {
    await user.click(await reader.findByRole('button', { name: 'Start and save my progress' }));
    for (const section of lesson.lesson.sections) {
        await reader.findByRole('heading', { name: section.heading });
        await user.click(reader.getByRole('button', { name: 'Save checkpoint and continue' }));
    }
    expect(await reader.findByRole('button', { name: 'Save practice and continue' })).toBeDisabled();
    for (const item of lesson.lesson.exercise.checklist) await user.click(reader.getByRole('checkbox', { name: item }));
    await user.click(reader.getByRole('button', { name: 'Save practice and continue' }));
    await reader.findByRole('button', { name: 'Check answer and finish' });
}

it('saves checkpoints, resumes after remount and returns focus when closed', async () => {
    const user = setupUser();
    const view = renderWithProviders(<TutorialCatalog />);
    let { opener, reader } = await openTutorial(user);
    await user.click(await reader.findByRole('button', { name: 'Start and save my progress' }));
    await user.click(await reader.findByRole('button', { name: 'Save checkpoint and continue' }));
    expect(await reader.findByRole('heading', { name: lesson.lesson.sections[1].heading })).toHaveFocus();
    expect(reader.getByRole('progressbar', { name: 'Saved tutorial progress' })).toHaveAttribute('aria-valuenow', '20');
    await user.click(reader.getByRole('button', { name: 'Close and continue later' }));
    await waitFor(() => expect(opener).toHaveFocus());
    view.unmount(); renderWithProviders(<TutorialCatalog />);
    ({ reader } = await openTutorial(user));
    expect(await reader.findByRole('heading', { name: lesson.lesson.sections[1].heading })).toBeVisible();
    expect(reader.queryByRole('button', { name: 'Start and save my progress' })).not.toBeInTheDocument();
    expect(backend.data.tutorial_learning).toHaveLength(1);
});

it('requires practice and the right answer, then displays a persistent certificate and growth once', async () => {
    const user = setupUser();
    renderWithProviders(<TutorialCatalog />);
    const { reader } = await openTutorial(user);
    await throughPractice(user, reader);
    expect(reader.queryByText(lesson.lesson.check.explanation)).not.toBeInTheDocument();
    expect(reader.getByRole('button', { name: 'Check answer and finish' })).toBeDisabled();
    const wrong = lesson.lesson.check.choices.findIndex((_choice, index) => index !== lesson.lesson.check.answer);
    await user.click(reader.getByRole('radio', { name: lesson.lesson.check.choices[wrong] }));
    await user.click(reader.getByRole('button', { name: 'Check answer and finish' }));
    expect(await reader.findByText('Not quite. Read the feedback and try again.')).toBeVisible();
    expect(reader.getByText('You can answer again in 30 seconds.')).toBeVisible();
    expect(reader.queryByText(lesson.lesson.check.explanation)).not.toBeInTheDocument();
    expect(backend.list('user_test').points).toBe(0);
    await user.click(reader.getByRole('radio', { name: lesson.lesson.check.choices[lesson.lesson.check.answer] }));
    await user.click(reader.getByRole('button', { name: 'Check answer and finish' }));
    expect(await reader.findByRole('alert')).toHaveTextContent(/try the knowledge check again in \d+ seconds/);
    expect(reader.queryByRole('button', { name: 'Reload saved tutorial' })).not.toBeInTheDocument();
    backend.expire();
    await user.click(reader.getByRole('button', { name: 'Check answer and finish' }));
    expect(await reader.findByRole('heading', { name: 'Certificate of completion' })).toBeVisible();
    expect(reader.getByText('Test Owner')).toBeVisible();
    expect(reader.getByText('open-book tutorial completion; practice self-reported. This is not independently verified mastery.')).toBeVisible();
    await user.click(reader.getByRole('button', { name: 'Back to my learning journey' }));
    const growth = within(screen.getByRole('region', { name: 'Your learning journey' }));
    expect(await growth.findByText('Level 2 · Practitioner')).toBeVisible();
    expect(growth.getByText('First finish · earned')).toBeVisible();
    expect(await screen.findByText(`1 of ${backend.lessons.length + broadcastCurriculum.lessons.length + authorityCurriculum.lessons.length} guided tutorials completed`)).toBeVisible();
    expect(backend.data.tutorial_progress).toHaveLength(0);
    const reopened = (await openTutorial(user)).reader;
    expect(await reopened.findByRole('heading', { name: 'Certificate of completion' })).toBeVisible();
    expect(backend.list('user_test').points).toBe(100);
});

it('recovers a saved checkpoint after a lost response without awarding or starting twice', async () => {
    const user = setupUser();
    renderWithProviders(<TutorialCatalog />);
    const { reader } = await openTutorial(user);
    transport.loseNext = true;
    await user.click(await reader.findByRole('button', { name: 'Start and save my progress' }));
    expect(await reader.findByRole('alert')).toHaveTextContent('save could not be confirmed');
    expect(reader.getByRole('button', { name: 'Start and save my progress' })).toBeDisabled();
    await user.click(reader.getByRole('button', { name: 'Retry checkpoint save' }));
    expect(await reader.findByRole('heading', { name: lesson.lesson.sections[0].heading })).toBeVisible();
    expect(backend.data.tutorial_learning).toHaveLength(1);
    expect(backend.list('user_test').points).toBe(0);
});

it('isolates an uncertain save when closing a tutorial and opening another lesson', async () => {
    const user = setupUser();
    renderWithProviders(<TutorialCatalog />);
    let { reader } = await openTutorial(user);
    transport.loseNext = true;
    await user.click(await reader.findByRole('button', { name: 'Start and save my progress' }));
    await reader.findByRole('button', { name: 'Retry checkpoint save' });
    await user.click(reader.getByRole('button', { name: 'Close and continue later' }));
    lesson = backend.lessons[1];
    ({ reader } = await openTutorial(user));
    await user.click(await reader.findByRole('button', { name: 'Start and save my progress' }));
    expect(await reader.findByRole('heading', { name: lesson.lesson.sections[0].heading })).toBeVisible();
    expect(backend.data.tutorial_learning).toHaveLength(2);
    await user.click(reader.getByRole('button', { name: 'Close and continue later' }));
    lesson = backend.lessons[0];
    ({ reader } = await openTutorial(user));
    expect(await reader.findByRole('heading', { name: lesson.lesson.sections[0].heading })).toBeVisible();
    expect(reader.queryByRole('button', { name: 'Start and save my progress' })).not.toBeInTheDocument();
    expect(backend.list('user_test').points).toBe(0);
});

it('keeps unavailable growth unknown and leaves ordinary lesson reading usable', async () => {
    transport.unavailable = true;
    renderWithProviders(<TutorialCatalog />);
    expect(await screen.findByText('Interactive learning is unavailable.')).toBeVisible();
    expect(screen.queryByText('Level 1 · Explorer')).not.toBeInTheDocument();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: `Read ${lesson.title}` }));
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: 'Why this matters' })).toBeVisible();
});

it('clears private guided content when a pending checkpoint is denied after lesson access is revoked', async () => {
    const user = setupUser(); renderWithProviders(<TutorialCatalog />);
    const { reader } = await openTutorial(user);
    await user.click(await reader.findByRole('button', { name: 'Start and save my progress' }));
    await reader.findByRole('heading', { name: lesson.lesson.sections[0].heading });
    backend.denied.add(lesson.id);
    await user.click(reader.getByRole('button', { name: 'Save checkpoint and continue' }));
    expect(await reader.findByRole('alert')).toBeVisible();
    expect(reader.queryByRole('heading', { name: lesson.title })).not.toBeInTheDocument();
    expect(reader.queryByRole('button', { name: 'Save checkpoint and continue' })).not.toBeInTheDocument();
    expect(reader.queryByText(lesson.lesson.sections[0].paragraphs[0])).not.toBeInTheDocument();
    expect(backend.data.tutorial_learning[0].next_section).toBe(0);
});

it('keeps the knowledge check usable during a server wait but clears it immediately on a subsequent access denial', async () => {
    const user = setupUser(); renderWithProviders(<TutorialCatalog />);
    const { reader } = await openTutorial(user);
    await throughPractice(user, reader);
    const check = lesson.lesson.check;
    await user.click(reader.getByRole('radio', { name: check.choices[(check.answer + 1) % check.choices.length] }));
    await user.click(reader.getByRole('button', { name: 'Check answer and finish' }));
    await reader.findByText('You can answer again in 30 seconds.');
    await user.click(reader.getByRole('radio', { name: check.choices[check.answer] }));
    await user.click(reader.getByRole('button', { name: 'Check answer and finish' }));
    expect(await reader.findByRole('alert')).toHaveTextContent(/try the knowledge check again/);
    expect(reader.getByRole('button', { name: 'Check answer and finish' })).toBeEnabled();
    expect(reader.queryByText(check.explanation)).not.toBeInTheDocument();
    backend.denied.add(lesson.id);
    await user.click(reader.getByRole('button', { name: 'Check answer and finish' }));
    expect(await reader.findByRole('button', { name: 'Reload saved tutorial' })).toBeVisible();
    expect(reader.queryByRole('heading', { name: lesson.title })).not.toBeInTheDocument();
    expect(reader.queryByRole('radio')).not.toBeInTheDocument();
    expect(reader.queryByText(check.question)).not.toBeInTheDocument();
    expect(backend.data.tutorial_learning[0].completed_at).toBeUndefined();
});

it('does not read or write personal learning in preview or demo mode', async () => {
    const view = renderWithProviders(<TutorialCatalog />, { auth: { isAuthed: false, user: null } });
    expect(screen.queryByRole('region', { name: 'Your learning journey' })).not.toBeInTheDocument();
    expect(pb.send).not.toHaveBeenCalled();
    view.unmount(); setDemoMode(true);
    renderWithProviders(<TutorialCatalog />);
    expect(pb.send).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Start interactive/ })).not.toBeInTheDocument();
});

it('drops a pending save and personal certificate display when the account signs out', async () => {
    const auth = createAuthValue();
    const view = renderWithProviders(<AuthContext.Provider value={auth}><TutorialCatalog /></AuthContext.Provider>);
    const user = setupUser();
    const { reader } = await openTutorial(user);
    let resolve;
    transport.wait = new Promise((done) => { resolve = done; });
    await user.click(await reader.findByRole('button', { name: 'Start and save my progress' }));
    pb.authStore.clear();
    view.rerender(<AuthContext.Provider value={createAuthValue({ isAuthed: false, user: null })}><TutorialCatalog /></AuthContext.Provider>);
    await act(async () => { resolve(); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Checkpoint saved. You can leave and continue later.')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Your learning journey' })).not.toBeInTheDocument();
});

it('downloads the stored completion certificate only after an explicit learner action', async () => {
    backend.finish({ actor: 'user_test' });
    const objectURL = vi.fn(() => 'blob:fixture');
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL = objectURL;
        static revokeObjectURL = vi.fn();
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = setupUser();
    renderWithProviders(<TutorialCatalog />);
    const { reader } = await openTutorial(user);
    const button = await reader.findByRole('button', { name: `Download certificate for ${lesson.title}` });
    expect(objectURL).not.toHaveBeenCalled();
    await user.click(button);
    expect(objectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(backend.list('user_test').points).toBe(100);
    vi.unstubAllGlobals();
});

it('keeps the certificate disclosure open and focus stable while a requested page replaces private data', async () => {
    for (const item of backend.lessons.slice(0, 6)) backend.finish({ id: item.id, actor: 'user_test' });
    const first = backend.list('user_test').certificates.items[0].certificate;
    const second = backend.list('user_test', { page: '2' }).certificates.items[0].certificate;
    const user = setupUser(); renderWithProviders(<TutorialCatalog />);
    const growth = within(screen.getByRole('region', { name: 'Your learning journey' }));
    const summary = await growth.findByText('My certificates (6)');
    const heading = growth.getByRole('heading', { name: 'Your learning journey' });
    await user.click(summary);
    expect(growth.getByRole('button', { name: `Download certificate for ${first.title}` })).toBeVisible();
    let resolve;
    transport.growthWait = new Promise((done) => { resolve = done; });
    await user.click(growth.getByRole('button', { name: 'More certificates' }));
    await waitFor(() => expect(growth.getByText('Loading saved learning, page 2...')).toBeVisible());
    expect(heading).toHaveFocus();
    expect(growth.queryByText('My certificates (6)')).not.toBeInTheDocument();
    expect(growth.queryByRole('button', { name: /^Download certificate/ })).not.toBeInTheDocument();
    await act(async () => { resolve(); });
    expect(await growth.findByRole('button', { name: `Download certificate for ${second.title}` })).toBeVisible();
    expect(growth.getByText('My certificates (6)').closest('details')).toHaveAttribute('open');
    expect(heading).toHaveFocus();
    expect(growth.getByText('Page 2')).toBeVisible();
    expect(growth.getByRole('button', { name: 'More certificates' })).toBeDisabled();
});

it('keeps the requested certificate page as the retry target after denial without showing stale private content', async () => {
    for (const item of backend.lessons.slice(0, 6)) backend.finish({ id: item.id, actor: 'user_test' });
    const second = backend.list('user_test', { page: '2' }).certificates.items[0].certificate;
    const user = setupUser(); renderWithProviders(<TutorialCatalog />);
    const growth = within(screen.getByRole('region', { name: 'Your learning journey' }));
    const summary = await growth.findByText('My certificates (6)');
    const heading = growth.getByRole('heading', { name: 'Your learning journey' });
    await user.click(summary);
    transport.deniedGrowthPage = 2;
    await user.click(growth.getByRole('button', { name: 'More certificates' }));
    expect(await growth.findByText('Certificate page access denied.')).toBeVisible();
    expect(heading).toHaveFocus();
    expect(growth.getByText('Requested page 2')).toBeVisible();
    expect(growth.queryByRole('button', { name: /^Download certificate/ })).not.toBeInTheDocument();
    expect(growth.queryByText('My certificates (6)')).not.toBeInTheDocument();
    expect(growth.queryByText(/600/)).not.toBeInTheDocument();
    transport.deniedGrowthPage = 0;
    await user.click(growth.getByRole('button', { name: 'Refresh growth' }));
    expect(await growth.findByRole('button', { name: `Download certificate for ${second.title}` })).toBeVisible();
    expect(growth.getByText('My certificates (6)').closest('details')).toHaveAttribute('open');
    expect(heading).toHaveFocus();
    expect(pb.send.mock.calls.filter(([path]) => path === '/api/buildanddo/learning').map(([, request]) => request.query.page)).toEqual([1, 2, 2]);
});

it('fences a pending certificate page and resets disclosure and requested page when the account remounts', async () => {
    for (const item of backend.lessons.slice(0, 6)) backend.finish({ id: item.id, actor: 'user_test' });
    const auth = createAuthValue(), user = setupUser();
    const view = renderWithProviders(<AuthContext.Provider value={auth}><TutorialCatalog /></AuthContext.Provider>);
    const growth = within(screen.getByRole('region', { name: 'Your learning journey' }));
    await user.click(await growth.findByText('My certificates (6)'));
    let resolve;
    transport.growthWait = new Promise((done) => { resolve = done; });
    await user.click(growth.getByRole('button', { name: 'More certificates' }));
    await waitFor(() => expect(pb.send).toHaveBeenCalledWith('/api/buildanddo/learning', expect.objectContaining({ query: { page: 2 } })));
    pb.authStore.clear();
    view.rerender(<AuthContext.Provider value={createAuthValue({ isAuthed: false, user: null })}><TutorialCatalog /></AuthContext.Provider>);
    await act(async () => { resolve(); });
    expect(screen.queryByRole('region', { name: 'Your learning journey' })).not.toBeInTheDocument();
    transport.growthWait = null;
    pb.authStore.save('test-token', { id: 'otherowner', name: 'Other Owner' });
    view.rerender(<AuthContext.Provider value={createAuthValue({ user: { id: 'otherowner', name: 'Other Owner' }, isAuthed: true })}><TutorialCatalog /></AuthContext.Provider>);
    const next = within(await screen.findByRole('region', { name: 'Your learning journey' }));
    expect(await next.findByText('Level 1 · Explorer')).toBeVisible();
    expect(next.queryByText(/My certificates/)).not.toBeInTheDocument();
    expect(next.queryByRole('button', { name: /^Download certificate/ })).not.toBeInTheDocument();
    expect(pb.send.mock.calls.filter(([path]) => path === '/api/buildanddo/learning').at(-1)[1].query.page).toBe(1);
});
