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
// Settings is tabbed - Appearance, Motion & interaction, Workspace, Account - and opens on
// Appearance. The domain controls live on Workspace and the sign-out on Account, so a query that
// does not first open the tab is asking about markup the user has not navigated to yet. These
// tests predate the tabs and reached straight for the controls.
const openTab = (user, name) => user.click(screen.getByRole('tab', { name }));

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
        // The workspace CONTEXT carries the domain, but the PocketBase mock is a separate store
        // and nothing had put the record in it — so update() rejected on a record that did not
        // exist, the page showed "Could not update the domain status", and refresh was never
        // reached. These two tests could not have passed; the Select hang was failing first and
        // hiding it.
        pb.__setRecords('domains', [view.workspace.active.expand.domain]);
        await openTab(user, 'Workspace');
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
        // Seeded so the RETRY can succeed — mockRejectedValueOnce only fails the first call, and
        // without the record the second would fail too, for a different reason than the test means.
        pb.__setRecords('domains', [view.workspace.active.expand.domain]);
        await openTab(user, 'Workspace');
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
        await openTab(user, 'Workspace');
        expect(screen.getByText('No website connected')).toBeVisible();
        expect(screen.queryByRole('combobox', { name: 'Domain status' })).not.toBeInTheDocument();
        await openTab(user, 'Account');
        await user.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(view.auth.logout).toHaveBeenCalledTimes(1);
    });
});
