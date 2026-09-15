// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/OperationsPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/pages/workspace/OperationsPage.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/pages/workspace/OperationsPage.jsx
// DAG Node:    none
// Intent:      Exercise operation creation and preservation of user input across a rejected save.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import OperationsPage from '@/pages/workspace/OperationsPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';
const permissions = vi.hoisted(() => ({ can_write: true, can_admin: true }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => ({ data: permissions }) }));
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
beforeEach(() => { pb.__reset(); permissions.can_write = true; permissions.can_admin = true; });

describe('operations desk', () => {
    it('disables record controls for viewers and provides no browser control for service health', async () => {
        permissions.can_write = false; permissions.can_admin = false;
        const user = setupUser();
        renderWithProviders(<OperationsPage />);
        expect((await screen.findAllByRole('button', { name: 'Add operation' }))[0]).toBeDisabled();
        await user.click(screen.getByRole('tab', { name: 'Recorded service cards' }));
        expect(screen.queryByRole('combobox', { name: /^Status for/ })).not.toBeInTheDocument();
        expect(pb.collection('services').update).not.toHaveBeenCalled();
    });
    it('records an operation only after the backend accepts it', async () => {
        const user = setupUser();
        renderWithProviders(<OperationsPage />);
        await user.click((await screen.findAllByRole('button', { name: 'Add operation' }))[0]);
        const dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Name'), 'Weekly appointment check');
        await user.click(dialog.getByRole('button', { name: 'Save operation' }));
        await waitFor(() =>
            expect(pb.collection('operations').create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Weekly appointment check', workspace: 'ws_test' }),
            ),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(await screen.findByText('Weekly appointment check')).toBeVisible();
    });

    it('retains the draft when a save fails and permits retry', async () => {
        const user = setupUser();
        pb.collection('operations').create.mockRejectedValueOnce(new Error('write failed'));
        renderWithProviders(<OperationsPage />);
        await user.click((await screen.findAllByRole('button', { name: 'Add operation' }))[0]);
        const dialog = within(screen.getByRole('dialog'));
        await user.type(dialog.getByLabelText('Name'), 'Retained draft');
        await user.click(dialog.getByRole('button', { name: 'Save operation' }));
        expect(await screen.findByRole('alert')).toBeVisible();
        expect(dialog.getByLabelText('Name')).toHaveValue('Retained draft');
        await user.click(dialog.getByRole('button', { name: 'Save operation' }));
        await waitFor(() => expect(pb.collection('operations').create).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});
