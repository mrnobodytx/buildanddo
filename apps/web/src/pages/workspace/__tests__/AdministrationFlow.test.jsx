// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/AdministrationFlow.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/pages/workspace/AdminPage.jsx, apps/web/src/components/workspace/IntegrationControls.jsx, apps/web/src/pages/workspace/SettingsPage.jsx, apps/web/src/components/workspace/WorkspaceLayout.jsx, tests/upgrade/admin-fixture.mjs
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/AdminPage.jsx; VALIDATES apps/web/src/components/workspace/IntegrationControls.jsx; VALIDATES apps/web/src/pages/workspace/SettingsPage.jsx; VALIDATES apps/web/src/components/workspace/WorkspaceLayout.jsx; DEPENDS_ON tests/upgrade/admin-fixture.mjs
// DAG Node:    none
// Intent:      Exercise actual administration screens through the browser adapter and server policies including role denial and uncertain-save recovery.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { fixture, plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import AdminPage from '@/pages/workspace/AdminPage';
import IntegrationsPage from '@/pages/workspace/IntegrationsPage';
import SettingsPage from '@/pages/workspace/SettingsPage';
import WorkspaceLayout from '@/components/workspace/WorkspaceLayout';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', () => ({ default: { authStore: { record: { id: 'owner' } }, send: vi.fn() } }));
vi.mock('@/lib/observability/mutations', () => ({ observeMutation: (_name, _verb, operation) => operation() }));
let backend;
function send(path, options) {
    const section = path.split('/').at(-1);
    const e = backend.event(pb.authStore.record.id, options.body || {}, { query: options.query || {} });
    try {
        if (options.method === 'POST') return plain(backend.load('workspace-administration.js').command(e));
        return plain(section === 'admin' ? backend.load('workspace-administration.js').snapshot(e) :
            section === 'access' ? backend.load('workspace-access.js').access(e) : backend.load('workspace-administration.js').integrations(e));
    } catch (error) { throw { status: error.status || 500, response: { message: error.message } }; }
}
function renderPage(element, actor = 'owner') {
    pb.authStore.record = { id: actor };
    return renderWithProviders(element, { auth: { user: { id: actor, email: `${actor}@example.test` }, isAuthed: true },
        workspace: { active: { id: 'ws1', owner: 'owner', name: 'Workspace one' } } });
}
beforeEach(() => {
    backend = fixture(); pb.send.mockReset(); pb.send.mockImplementation(async (...args) => send(...args));
});

describe('workspace administration', () => {
    it('connects Settings and navigation to current server permissions and removes admin links after demotion', async () => {
        pb.authStore.record = { id: 'admin' };
        renderWithProviders(<Routes><Route path="/app" element={<WorkspaceLayout />}><Route path="settings" element={<SettingsPage />} /></Route></Routes>,
            { route: '/app/settings', auth: { user: { id: 'admin' }, isAuthed: true }, workspace: { active: { id: 'ws1', owner: 'owner', name: 'Workspace one' } } });
        // Settings opens on Appearance and Radix renders only the active tab, so the
        // permissions panel this test asserts on is not mounted until Workspace is chosen.
        const user = setupUser();
        await user.click(await screen.findByRole('tab', { name: 'Workspace' }));
        expect(await screen.findByRole('link', { name: 'Open administration' })).toHaveAttribute('href', '/app/admin');
        const nav = within(screen.getByRole('navigation', { name: 'Workspace' }));
        expect(nav.getByRole('link', { name: 'Administration' })).toBeVisible();
        expect(nav.getByRole('link', { name: 'Sinks & extensions' })).toHaveAttribute('href', '/app/integrations');
        expect(nav.getByRole('link', { name: 'Workspace wiki' })).toHaveAttribute('href', '/app/wiki');
        expect(nav.getByRole('link', { name: 'Workspace forum' })).toHaveAttribute('href', '/app/forums');
        backend.command('member.set', { user: 'admin', role: 'viewer' });
        act(() => window.dispatchEvent(new Event('focus')));
        expect(await screen.findByText('Your workspace role: viewer.')).toBeVisible();
        expect(screen.queryByRole('link', { name: 'Open administration' })).not.toBeInTheDocument();
        expect(nav.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
    });

    it('saves the profile and enforced community settings then exposes the account-attributed audit', async () => {
        const user = setupUser(); renderPage(<AdminPage />);
        await user.clear(await screen.findByLabelText('Workspace name')); await user.type(screen.getByLabelText('Workspace name'), 'Review team');
        await user.type(screen.getByLabelText('Description'), 'A shared working space');
        await user.click(screen.getByLabelText('Enable workspace wiki')); await user.click(screen.getByLabelText('Enable workspace forum'));
        await user.click(screen.getByRole('button', { name: 'Save workspace settings' }));
        await waitFor(() => expect(backend.data.workspaces[0].name).toBe('Review team'));
        expect(backend.data.workspace_controls[0].wiki_enabled).toBe(true);
        await user.click(await screen.findByRole('tab', { name: 'Audit history' }));
        expect(await screen.findByText('Settings saved')).toBeVisible();
        expect(screen.getByText(/Account owner/)).toBeVisible();
    });

    it('lets the owner grant an administrator while lower administrators cannot grant or change their own authority', async () => {
        const user = setupUser(); const view = renderPage(<AdminPage />);
        await user.click(await screen.findByRole('tab', { name: 'Members & roles' }));
        await user.type(screen.getByLabelText('Existing account ID'), 'newuser');
        await user.selectOptions(screen.getByLabelText('New member role'), 'admin');
        await user.click(screen.getByRole('button', { name: 'Grant access' }));
        expect(await screen.findByText('newuser', { selector: 'p' })).toBeVisible();
        expect(backend.data.workspace_members.find((row) => row.user === 'newuser').role).toBe('admin');
        view.unmount(); renderPage(<AdminPage />, 'admin');
        await user.click(await screen.findByRole('tab', { name: 'Members & roles' }));
        expect(within(screen.getByLabelText('New member role')).queryByRole('option', { name: /^Administrator/ })).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Role for admin' })).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'Role for newuser' })).toBeDisabled();
    });

    it('updates lower member roles and requires confirmation before removing access', async () => {
        const user = setupUser(); renderPage(<AdminPage />, 'admin');
        await user.click(await screen.findByRole('tab', { name: 'Members & roles' }));
        await user.selectOptions(screen.getByRole('combobox', { name: 'Role for viewer' }), 'editor');
        const member = screen.getByRole('combobox', { name: 'Role for viewer' }).closest('li');
        await user.click(within(member).getByRole('button', { name: 'Save role' }));
        await waitFor(() => expect(backend.data.workspace_members.find((row) => row.user === 'viewer').role).toBe('editor'));
        const updated = (await screen.findByRole('combobox', { name: 'Role for viewer' })).closest('li');
        await user.click(within(updated).getByRole('button', { name: 'Remove' }));
        const dialog = within(screen.getByRole('dialog'));
        expect(backend.data.workspace_members.some((row) => row.user === 'viewer')).toBe(true);
        await user.click(dialog.getByRole('button', { name: 'Cancel' }));
        await user.click(within(updated).getByRole('button', { name: 'Remove' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove access' }));
        await waitFor(() => expect(backend.data.workspace_members.some((row) => row.user === 'viewer')).toBe(false));
    });

    it('retains failed form values, reloads revision conflicts, and denies the admin route to a viewer', async () => {
        const user = setupUser(); const view = renderPage(<AdminPage />);
        await user.type(await screen.findByLabelText('Description'), 'Keep this draft');
        backend.enable();
        await user.click(screen.getByRole('button', { name: 'Save workspace settings' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/Reload/);
        expect(screen.getByLabelText('Description')).toHaveValue('Keep this draft');
        await user.click(screen.getByRole('button', { name: 'Reload current records' }));
        expect(await screen.findByLabelText('Description')).toHaveValue('Team workspace');
        view.unmount(); renderPage(<AdminPage />, 'viewer');
        expect(await screen.findByRole('alert')).toHaveTextContent(/role does not allow/);
        expect(screen.queryByLabelText('Workspace name')).not.toBeInTheDocument();
    });
});

describe('integration controls', () => {
    it('persists a Reddit request without claiming health or publishing a post', async () => {
        const user = setupUser(); renderPage(<IntegrationsPage />);
        await user.click(await screen.findByRole('button', { name: 'Configure Reddit' }));
        const dialog = within(screen.getByRole('dialog'));
        await user.click(dialog.getByLabelText('Request enabled')); await user.type(dialog.getByLabelText('Subreddit name'), 'buildanddo');
        await user.selectOptions(dialog.getByLabelText('Allowed operation'), 'reviewed_publish');
        await user.click(dialog.getByRole('button', { name: 'Save integration request' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        const row = backend.data.workspace_integrations[0]; expect(row.provider).toBe('reddit'); expect(row.desired_enabled).toBe(true); expect(row.observed_state).toBe('unknown');
        expect(await screen.findByText(/Request saved/)).toBeVisible();
        expect(pb.send.mock.calls.every(([path]) => path.startsWith('/api/buildanddo/workspaces/ws1/'))).toBe(true);
        await user.click(screen.getByRole('button', { name: 'Request disable' }));
        await waitFor(() => expect(backend.data.workspace_integrations[0].desired_enabled).toBe(false));
    });

    it('freezes uncertain settings and recovers the same server receipt after a lost response', async () => {
        const user = setupUser(); let lost = false;
        pb.send.mockImplementation(async (path, options) => {
            const result = send(path, options);
            if (options.method === 'POST' && !lost) { lost = true; throw new Error('Lost response after persistence'); }
            return result;
        });
        renderPage(<IntegrationsPage />);
        await user.click(await screen.findByRole('button', { name: 'Configure Datadog' }));
        const dialog = within(screen.getByRole('dialog'));
        await user.click(dialog.getByLabelText('Request enabled')); await user.type(dialog.getByLabelText('Registered connection name'), 'workspace-telemetry');
        await user.click(dialog.getByRole('button', { name: 'Save integration request' }));
        expect(await dialog.findByRole('alert')).toHaveTextContent(/confirm/);
        expect(dialog.getByLabelText('Registered connection name')).toBeDisabled();
        await user.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(screen.getByRole('button', { name: 'Retry previous save' })).toHaveFocus());
        await user.click(screen.getByRole('button', { name: 'Retry previous save' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Configure Datadog' })).toBeEnabled());
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(backend.data.workspace_integrations).toHaveLength(1); expect(backend.data.workspace_admin_events).toHaveLength(1);
        const posts = pb.send.mock.calls.filter(([, options]) => options.method === 'POST');
        expect(posts[0][1].body.request_key).toBe(posts[1][1].body.request_key);
    });

    it('shows read-only state to viewers and permits retry after an unavailable backend', async () => {
        const user = setupUser(); pb.send.mockRejectedValueOnce(new Error('Backend unavailable')); renderPage(<IntegrationsPage />, 'viewer');
        expect(await screen.findByRole('alert')).toHaveTextContent(/unavailable/);
        await user.click(screen.getByRole('button', { name: 'Retry loading' }));
        expect(await screen.findByRole('heading', { name: 'Discord bot' })).toBeVisible();
        expect(screen.queryByRole('button', { name: /^Configure / })).not.toBeInTheDocument();
        expect(screen.getAllByText('Not measured')).toHaveLength(9);
    });
});
