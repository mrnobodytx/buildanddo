// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/MissionsPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/pages/workspace/MissionsPage.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/MissionsPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Hold the mission lifecycle UI to its promise: nothing runs until
//              a mission is proposed, advanced and shown as such.
// ───────────────────────────────────────────────────────────────

import { MotionProvider } from '@/contexts/MotionContext';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import MissionsPage from '@/pages/workspace/MissionsPage';
import AuthContext from '@/contexts/AuthContext';
import WorkspaceContext from '@/contexts/WorkspaceContext';
import { setDemoMode } from '@/lib/demoWorkspace';
import { PLAN_FIELDS, emptyPlan } from '@/lib/missionLearning';
import {
    act,
    createAuthValue,
    createMockMission,
    createMockWorkspace,
    createWorkspaceValue,
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
    within,
} from '@/test/utils';

const fullPlan = () => ({
    ...emptyPlan(),
    ...Object.fromEntries(PLAN_FIELDS.map(({ id }) => [id, `The saved ${id} method.`])),
});
const missionList = () => screen.getByRole('list', { name: 'Missions' });
const firstStart = () => screen.getAllByRole('button', { name: 'Start a mission' })[0];

beforeEach(() => {
    pb.__reset();
    setDemoMode(false);
    localStorage.removeItem('buildanddo.mission-effects');
});
afterEach(() => {
    setDemoMode(false);
});

describe('MissionsPage', () => {
    it('opens an operator-linked mission from the scoped list without approving or mutating it', async () => {
        pb.__setRecords('missions', [createMockMission({ id: 'linked_mission', title: 'Linked review', mission_plan: fullPlan() })]);
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>, { route: '/app/missions?mission=linked_mission' });
        const dialog = await screen.findByRole('dialog', { name: 'Linked review' });
        expect(within(dialog).getByText(/Learn, inspect the saved plan/)).toBeVisible();
        expect(pb.__collection('missions').create).not.toHaveBeenCalled();
        expect(pb.__collection('missions').update).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog', { name: 'Approve the saved mission' })).not.toBeInTheDocument();
    });
    it('does not open a mission that is missing from the readable workspace list', async () => {
        pb.__setRecords('missions', [createMockMission({ id: 'visible_mission', title: 'Visible work' })]);
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>, { route: '/app/missions?mission=unreadable_mission' });
        await screen.findByRole('list', { name: 'Missions' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(pb.__collection('missions').getOne).not.toHaveBeenCalled();
    });
    it('teaches the mission stages and differentiates an empty workspace from loading', async () => {
        pb.__setRecords('missions', []);
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        expect(screen.queryByText('No missions yet')).not.toBeInTheDocument();
        expect(
            await screen.findByRole('heading', { name: 'Challenge Desk', level: 1 }),
        ).toBeInTheDocument();
        expect(await screen.findByText('No missions yet')).toBeInTheDocument();
        for (const name of [
            'Proposed',
            'Approved',
            'Running',
            'Needs attention',
            'Verified',
            'Failed',
        ])
            expect(screen.getAllByText(name).length).toBeGreaterThan(0);
        expect(screen.getByText('Turn an intention into a checkable outcome')).toBeInTheDocument();
        expect(screen.queryByRole('list', { name: 'Missions' })).not.toBeInTheDocument();
    });
    it('saves a scoped draft through the existing PocketBase data layer', async () => {
        const user = setupUser();
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        await screen.findByText('No missions yet');
        await user.click(firstStart());
        const dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Goal'), '  Cut no-shows  ');
        await user.type(
            dialog.getByLabelText('Why this mission matters'),
            'Use actual appointment data to establish a baseline.',
        );
        await user.click(dialog.getByRole('button', { name: 'Save draft' }));
        await waitFor(() =>
            expect(pb.__collection('missions').create).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Cut no-shows',
                    status: 'proposed',
                    owner: 'user_test',
                    workspace: 'ws_test',
                    mission_plan: expect.objectContaining({
                        purpose: 'Use actual appointment data to establish a baseline.',
                        target: '',
                    }),
                }),
            ),
        );
        expect(
            await screen.findByRole('heading', { name: 'Mission learning' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Verify with evidence' }),
        ).not.toBeInTheDocument();
    });
    it('retains a rejected draft and retries the same entered plan', async () => {
        const user = setupUser();
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        await screen.findByText('No missions yet');
        await user.click(firstStart());
        const dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Goal'), 'Keep this draft');
        pb.__setError(
            'missions',
            Object.assign(new Error('denied'), { response: { message: 'Write denied.' } }),
        );
        await user.click(dialog.getByRole('button', { name: 'Save draft' }));
        expect(await dialog.findByRole('alert')).toHaveTextContent('Write denied.');
        expect(dialog.getByLabelText('Goal')).toHaveValue('Keep this draft');
        pb.__clearError('missions');
        await user.click(dialog.getByRole('button', { name: 'Save draft' }));
        await waitFor(() => expect(pb.__collection('missions').create).toHaveBeenCalledTimes(2));
        expect(
            await screen.findByRole('heading', { name: 'Mission learning' }),
        ).toBeInTheDocument();
    });
    it('requires a complete plan and explicit approval instead of offering arbitrary stage jumps', async () => {
        const user = setupUser();
        const incomplete = createMockMission({ title: 'Incomplete proposal' });
        const ready = createMockMission({ title: 'Ready proposal', mission_plan: fullPlan() });
        pb.__setRecords('missions', [incomplete, ready]);
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        const list = within(await screen.findByRole('list', { name: 'Missions' }));
        const cards = list.getAllByRole('listitem');
        expect(within(cards[0]).getByRole('button', { name: 'Review approval' })).toBeDisabled();
        await user.click(within(cards[1]).getByRole('button', { name: 'Review approval' }));
        const dialog = within(screen.getByRole('dialog'));
        expect(dialog.getByRole('button', { name: 'Record approval' })).toBeDisabled();
        await user.click(dialog.getByRole('checkbox', { name: /I have authority to approve/ }));
        await user.click(dialog.getByRole('button', { name: 'Record approval' }));
        await waitFor(() =>
            expect(pb.__collection('missions').update).toHaveBeenCalledWith(ready.id, {
                status: 'approved',
            }),
        );
        expect(pb.__collection('missions').update).toHaveBeenCalledTimes(1);
        expect(
            screen.queryByRole('button', { name: 'Advance to next stage' }),
        ).not.toBeInTheDocument();
    });
    it('records work started without invoking an automation and offers pause and review', async () => {
        const user = setupUser();
        const record = createMockMission({
            title: 'Approved experiment',
            status: 'approved',
            mission_plan: fullPlan(),
            mission_approved_by: 'user_test',
            mission_approved_at: '2026-09-15T01:00:00Z',
        });
        pb.__setRecords('missions', [record]);
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        await user.click(await screen.findByRole('button', { name: 'Record work started' }));
        await waitFor(() =>
            expect(pb.__collection('missions').update).toHaveBeenCalledWith(record.id, {
                status: 'running',
            }),
        );
        expect(
            await screen.findByRole('button', { name: 'Pause for attention' }),
        ).toBeInTheDocument();
        await user.click(
            screen.getByRole('button', { name: /Learn and review.*Approved experiment/ }),
        );
        expect(screen.getByRole('heading', { name: 'TEVV review' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Verify with evidence' })).toBeDisabled();
    });
    it('keeps terminal missions closed and requires confirmation before deleting their evidence', async () => {
        const user = setupUser();
        const record = createMockMission({ title: 'Finished work', status: 'failed' });
        pb.__setRecords('missions', [record]);
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        const list = within(await screen.findByRole('list', { name: 'Missions' }));
        expect(list.queryByRole('button', { name: 'Edit plan' })).not.toBeInTheDocument();
        expect(list.queryByRole('button', { name: 'Record work started' })).not.toBeInTheDocument();
        await user.click(list.getByRole('button', { name: /Delete.*Finished work/ }));
        expect(pb.__collection('missions').delete).not.toHaveBeenCalled();
        const dialog = within(screen.getByRole('dialog'));
        expect(dialog.getByText(/evidence linked to it will be deleted/)).toBeInTheDocument();
        await user.click(dialog.getByRole('button', { name: 'Delete mission' }));
        await waitFor(() =>
            expect(pb.__collection('missions').delete).toHaveBeenCalledWith(record.id),
        );
    });
    it('retains search and shows a read error instead of claiming an empty workspace', async () => {
        const user = setupUser();
        pb.__setRecords('missions', [
            createMockMission({ title: 'One mission' }),
            createMockMission({ title: 'Second mission' }),
        ]);
        const rendered = renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        await screen.findByRole('list', { name: 'Missions' });
        await user.type(screen.getByPlaceholderText('Search missions'), 'One mission');
        expect(within(missionList()).queryByText('Second mission')).not.toBeInTheDocument();
        await user.clear(screen.getByPlaceholderText('Search missions'));
        await user.type(screen.getByPlaceholderText('Search missions'), 'No such mission');
        expect(screen.getByText('No mission matches those filters.')).toBeInTheDocument();
        rendered.unmount();
        pb.__setError('missions');
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        expect(await screen.findByText(/This list could not be loaded/i)).toBeInTheDocument();
        expect(screen.queryByText('No missions yet')).not.toBeInTheDocument();
    });
    it('keeps demo missions read-only while allowing a return to real workspace data', async () => {
        const user = setupUser();
        setDemoMode(true);
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        expect(await screen.findByText(/Demonstration mode is read-only/)).toBeInTheDocument();
        expect(firstStart()).toBeDisabled();
        expect(pb.__collection('missions').getFullList).not.toHaveBeenCalled();
        expect(pb.__collection('missions').create).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Show real data' }));
        expect(await screen.findByText('No missions yet')).toBeInTheDocument();
        expect(firstStart()).toBeEnabled();
    });
    it('persists the animation preference without changing any mission state', async () => {
        const user = setupUser();
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>);
        await screen.findByText('No missions yet');
        await user.click(screen.getByRole('checkbox', { name: 'Learning animations' }));
        expect(JSON.parse(localStorage.getItem('buildanddo.motion.v1')).categories.learning).toBe(false);
        expect(screen.getByRole('checkbox', { name: 'Learning animations' })).not.toBeChecked();
        expect(pb.__collection('missions').update).not.toHaveBeenCalled();
    });
    it('does not mount private data hooks for a signed-out visitor', () => {
        renderWithProviders(<MotionProvider><MissionsPage /></MotionProvider>, { auth: { isAuthed: false, user: null } });
        expect(
            screen.getByText('Open an authenticated workspace to save a mission.'),
        ).toBeInTheDocument();
        expect(pb.collection).not.toHaveBeenCalled();
    });
    it('clears a draft and ignores its late save when the account and workspace change', async () => {
        const user = setupUser();
        let finish;
        pb.__collection('missions').create.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finish = resolve;
                }),
        );
        function Scope({ account, workspace }) {
            return (
                <AuthContext.Provider value={createAuthValue({ user: { id: account } })}>
                    <WorkspaceContext.Provider
                        value={createWorkspaceValue({
                            active: createMockWorkspace({ id: workspace }),
                        })}
                    >
                        <MissionsPage />
                    </WorkspaceContext.Provider>
                </AuthContext.Provider>
            );
        }
        const rendered = renderWithProviders(<Scope account="user_test" workspace="ws_test" />);
        await screen.findByText('No missions yet');
        await user.click(firstStart());
        await user.type(screen.getByLabelText('Goal'), 'Account A unfinished draft');
        await user.click(screen.getByRole('button', { name: 'Save draft' }));
        pb.__setAuth({ record: { id: 'user_b' }, isValid: true });
        rendered.rerender(<Scope account="user_b" workspace="workspace_b" />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        await act(async () =>
            finish(createMockMission({ id: 'late_a', title: 'Account A unfinished draft' })),
        );
        expect(screen.queryByText('Account A unfinished draft')).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(pb.__collection('missions').getFullList).toHaveBeenLastCalledWith(
            expect.objectContaining({ filter: 'workspace = "workspace_b"' }),
        );
    });
});
