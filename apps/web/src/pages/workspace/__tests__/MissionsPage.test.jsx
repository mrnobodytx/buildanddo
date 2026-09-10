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

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import MissionsPage from '@/pages/workspace/MissionsPage';
import {
    createMockMission,
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
    within,
} from '@/test/utils';

/** The mission cards live in the only list on the page; the stage legend does not. */
const missionList = () => screen.getByRole('list');

describe('MissionsPage', () => {
    beforeEach(() => {
        pb.__reset();
    });

    it('renders the desk header and the full stage legend', async () => {
        pb.__setRecords('missions', []);
        renderWithProviders(<MissionsPage />);

        expect(
            await screen.findByRole('heading', { name: 'Challenge Desk', level: 1 }),
        ).toBeInTheDocument();

        for (const label of [
            'Proposed',
            'Approved',
            'Running',
            'Needs attention',
            'Verified',
            'Failed',
        ]) {
            expect(screen.getAllByText(label).length).toBeGreaterThan(0);
        }
    });

    it('does not flash an empty state while records are still loading', () => {
        pb.__setRecords('missions', [createMockMission()]);
        renderWithProviders(<MissionsPage />);

        expect(screen.queryByText('No missions yet')).not.toBeInTheDocument();
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('explains the next step when the workspace has no missions', async () => {
        pb.__setRecords('missions', []);
        renderWithProviders(<MissionsPage />);

        expect(await screen.findByText('No missions yet')).toBeInTheDocument();
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('lists each mission with its title, description and status badge', async () => {
        pb.__setRecords('missions', [
            createMockMission({
                title: 'Reduce next-week no-shows',
                description: 'Send reminder texts two days ahead.',
                status: 'running',
            }),
            createMockMission({ title: 'Chase unpaid invoices', status: 'verified' }),
        ]);
        renderWithProviders(<MissionsPage />);

        const list = within(await waitFor(missionList));
        expect(list.getByText('Reduce next-week no-shows')).toBeInTheDocument();
        expect(list.getByText('Send reminder texts two days ahead.')).toBeInTheDocument();
        expect(list.getByText('Running')).toBeInTheDocument();
        expect(list.getByText('Verified')).toBeInTheDocument();
        expect(list.getAllByRole('listitem')).toHaveLength(2);
    });

    it('opens the create dialog from the header action', async () => {
        const user = setupUser();
        pb.__setRecords('missions', []);
        renderWithProviders(<MissionsPage />);

        await user.click(
            (await screen.findAllByRole('button', { name: /start a mission/i }))[0],
        );

        const dialog = within(await screen.findByRole('dialog'));
        expect(dialog.getByLabelText('Goal')).toBeInTheDocument();
        expect(dialog.getByLabelText('Scope & plan')).toBeInTheDocument();
    });

    it('refuses to create a mission without a goal', async () => {
        const user = setupUser();
        pb.__setRecords('missions', []);
        renderWithProviders(<MissionsPage />);

        await user.click(
            (await screen.findAllByRole('button', { name: /start a mission/i }))[0],
        );
        const dialog = within(await screen.findByRole('dialog'));
        await user.click(dialog.getByRole('button', { name: 'Propose mission' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Give the mission a clear goal.',
        );
        expect(pb.__collection('missions').create).not.toHaveBeenCalled();
    });

    it('creates a mission in the proposed stage and shows it in the list', async () => {
        const user = setupUser();
        pb.__setRecords('missions', []);
        renderWithProviders(<MissionsPage />);

        await user.click(
            (await screen.findAllByRole('button', { name: /start a mission/i }))[0],
        );
        const dialog = within(await screen.findByRole('dialog'));
        await user.type(dialog.getByLabelText('Goal'), '  Cut no-shows  ');
        await user.type(dialog.getByLabelText('Scope & plan'), 'Reminder texts only.');
        await user.click(dialog.getByRole('button', { name: 'Propose mission' }));

        await waitFor(() =>
            expect(pb.__collection('missions').create).toHaveBeenCalledWith({
                title: 'Cut no-shows',
                description: 'Reminder texts only.',
                status: 'proposed',
                workspace: 'ws_test',
                owner: 'user_test',
            }),
        );

        expect(await screen.findByText('Cut no-shows')).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('reports the server message when creation is rejected', async () => {
        const user = setupUser();
        pb.__setRecords('missions', []);
        renderWithProviders(<MissionsPage />);

        await user.click(
            (await screen.findAllByRole('button', { name: /start a mission/i }))[0],
        );
        const dialog = within(await screen.findByRole('dialog'));
        await user.type(dialog.getByLabelText('Goal'), 'Cut no-shows');

        pb.__setError('missions', Object.assign(new Error('nope'), {
            response: { message: 'Failed to create record.' },
        }));
        await user.click(dialog.getByRole('button', { name: 'Propose mission' }));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Failed to create record.',
        );
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('advances a proposed mission to approved and re-renders the badge', async () => {
        const user = setupUser();
        const mission = createMockMission({ title: 'Cut no-shows', status: 'proposed' });
        pb.__setRecords('missions', [mission]);
        renderWithProviders(<MissionsPage />);

        await user.click(
            await screen.findByRole('button', { name: 'Advance to next stage' }),
        );

        await waitFor(() =>
            expect(pb.__collection('missions').update).toHaveBeenCalledWith(mission.id, {
                status: 'approved',
            }),
        );
        await waitFor(() =>
            expect(within(missionList()).getByText('Approved')).toBeInTheDocument(),
        );
    });

    it('offers no advance action once a mission is verified or failed', async () => {
        pb.__setRecords('missions', [
            createMockMission({ title: 'Verified work', status: 'verified' }),
            createMockMission({ title: 'Failed work', status: 'failed' }),
        ]);
        renderWithProviders(<MissionsPage />);

        await waitFor(missionList);
        expect(
            screen.queryByRole('button', { name: 'Advance to next stage' }),
        ).not.toBeInTheDocument();
    });
});
