// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/SettingsPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/pages/workspace/SettingsPage.jsx
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/pages/workspace/SettingsPage.jsx
// DAG Node:    none
// Intent:      Test appearance, account sign-out and recoverable domain-authorization writes.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/pages/workspace/SettingsPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});
beforeEach(() => pb.__reset());

describe('SettingsPage', () => {
    it('updates the shared theme without a backend write', async () => {
        const user = setupUser();
        renderWithProviders(<SettingsPage />);
        await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'dark');
        expect(document.documentElement).toHaveClass('dark');
        expect(localStorage.getItem('buildanddo.theme')).toBe('dark');
        expect(pb.collection('domains').update).not.toHaveBeenCalled();
    });

    it('refreshes the workspace after a confirmed domain update', async () => {
        const user = setupUser();
        const view = renderWithProviders(<SettingsPage />);
        await user.click(screen.getByRole('combobox', { name: 'Domain status' }));
        await user.click(screen.getByRole('option', { name: 'Verified', exact: true }));
        await waitFor(() => expect(view.workspace.refresh).toHaveBeenCalledTimes(1));
        expect(pb.collection('domains').update).toHaveBeenCalledWith(
            view.workspace.active.expand.domain.id,
            { status: 'verified' },
        );
    });

    it('shows a failed domain update and lets the user retry', async () => {
        const user = setupUser();
        pb.collection('domains').update.mockRejectedValueOnce(new Error('write rejected'));
        const view = renderWithProviders(<SettingsPage />);
        await user.click(screen.getByRole('combobox', { name: 'Domain status' }));
        await user.click(screen.getByRole('option', { name: 'Verified', exact: true }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not update the domain status',
        );
        expect(view.workspace.refresh).not.toHaveBeenCalled();
        await user.click(screen.getByRole('combobox', { name: 'Domain status' }));
        await user.click(screen.getByRole('option', { name: 'Verified', exact: true }));
        await waitFor(() => expect(view.workspace.refresh).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps appearance and account controls available without a domain', async () => {
        const user = setupUser();
        const view = renderWithProviders(<SettingsPage />, {
            workspace: { active: { id: 'workspace', name: 'Workspace', expand: {} } },
        });
        expect(screen.getByText('No website connected')).toBeVisible();
        expect(screen.queryByRole('combobox', { name: 'Domain status' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(view.auth.logout).toHaveBeenCalledTimes(1);
    });
});
