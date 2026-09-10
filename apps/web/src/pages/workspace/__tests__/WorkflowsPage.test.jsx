// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/WorkflowsPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/pages/workspace/WorkflowsPage.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/WorkflowsPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Guard the draft-first rule: a workflow cannot be activated from
//              the UI until it has left draft, and status changes are visible.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import WorkflowsPage from '@/pages/workspace/WorkflowsPage';
import {
    createMockWorkflow,
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
    within,
} from '@/test/utils';

const workflowList = () => screen.getByRole('list');

describe('WorkflowsPage', () => {
    beforeEach(() => {
        pb.__reset();
    });

    it('renders the page header and the execution caveat', async () => {
        pb.__setRecords('workflows', []);
        renderWithProviders(<WorkflowsPage />);

        expect(
            await screen.findByRole('heading', { name: 'Workflows', level: 1 }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/BuildAndDo does not\s+run automations on its own/i),
        ).toBeInTheDocument();
    });

    it('does not flash an empty state while records are still loading', () => {
        pb.__setRecords('workflows', [createMockWorkflow()]);
        renderWithProviders(<WorkflowsPage />);

        expect(screen.queryByText('No workflows connected')).not.toBeInTheDocument();
        expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('shows the empty state when nothing is defined yet', async () => {
        pb.__setRecords('workflows', []);
        renderWithProviders(<WorkflowsPage />);

        expect(await screen.findByText('No workflows connected')).toBeInTheDocument();
    });

    it('lists each workflow with its name, description and status', async () => {
        pb.__setRecords('workflows', [
            createMockWorkflow({
                name: 'Weekly reminders',
                description: 'Text next week\u2019s booked customers.',
                status: 'active',
            }),
            createMockWorkflow({ name: 'Invoice chase', status: 'paused' }),
            createMockWorkflow({ name: 'Draft idea', status: 'draft' }),
        ]);
        renderWithProviders(<WorkflowsPage />);

        const list = within(await waitFor(workflowList));
        expect(list.getAllByRole('listitem')).toHaveLength(3);
        expect(list.getByText('Weekly reminders')).toBeInTheDocument();
        expect(list.getByText('Text next week\u2019s booked customers.')).toBeInTheDocument();
        expect(list.getByText('Active')).toBeInTheDocument();
        expect(list.getByText('Paused')).toBeInTheDocument();
        expect(list.getByText('Draft')).toBeInTheDocument();
    });

    it('cannot activate a workflow that is still a draft', async () => {
        pb.__setRecords('workflows', [createMockWorkflow({ status: 'draft' })]);
        renderWithProviders(<WorkflowsPage />);

        expect(await screen.findByRole('button', { name: 'Activate' })).toBeDisabled();
    });

    it('pauses an active workflow and reflects the new status', async () => {
        const user = setupUser();
        const workflow = createMockWorkflow({ name: 'Weekly reminders', status: 'active' });
        pb.__setRecords('workflows', [workflow]);
        renderWithProviders(<WorkflowsPage />);

        await user.click(await screen.findByRole('button', { name: 'Pause' }));

        await waitFor(() =>
            expect(pb.__collection('workflows').update).toHaveBeenCalledWith(workflow.id, {
                status: 'paused',
            }),
        );
        await waitFor(() =>
            expect(within(workflowList()).getByText('Paused')).toBeInTheDocument(),
        );
        expect(await screen.findByRole('button', { name: 'Activate' })).toBeEnabled();
    });

    it('activates a paused workflow', async () => {
        const user = setupUser();
        const workflow = createMockWorkflow({ status: 'paused' });
        pb.__setRecords('workflows', [workflow]);
        renderWithProviders(<WorkflowsPage />);

        await user.click(await screen.findByRole('button', { name: 'Activate' }));

        await waitFor(() =>
            expect(pb.__collection('workflows').update).toHaveBeenCalledWith(workflow.id, {
                status: 'active',
            }),
        );
        await waitFor(() =>
            expect(within(workflowList()).getByText('Active')).toBeInTheDocument(),
        );
    });

    it('refuses to create a workflow without a name', async () => {
        const user = setupUser();
        pb.__setRecords('workflows', []);
        renderWithProviders(<WorkflowsPage />);

        await user.click(await screen.findByRole('button', { name: 'Create workflow' }));
        const dialog = within(await screen.findByRole('dialog'));
        await user.click(dialog.getByRole('button', { name: 'Create draft' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Name the workflow.');
        expect(pb.__collection('workflows').create).not.toHaveBeenCalled();
    });

    it('creates a new workflow as a draft', async () => {
        const user = setupUser();
        pb.__setRecords('workflows', []);
        renderWithProviders(<WorkflowsPage />);

        await user.click(await screen.findByRole('button', { name: 'Create workflow' }));
        const dialog = within(await screen.findByRole('dialog'));
        await user.type(dialog.getByLabelText('Name'), 'Weekly reminders');
        await user.type(dialog.getByLabelText('What it does'), 'Friday text send.');
        await user.click(dialog.getByRole('button', { name: 'Create draft' }));

        await waitFor(() =>
            expect(pb.__collection('workflows').create).toHaveBeenCalledWith({
                name: 'Weekly reminders',
                description: 'Friday text send.',
                status: 'draft',
                workspace: 'ws_test',
                owner: 'user_test',
            }),
        );
        expect(await screen.findByText('Weekly reminders')).toBeInTheDocument();
    });
});
