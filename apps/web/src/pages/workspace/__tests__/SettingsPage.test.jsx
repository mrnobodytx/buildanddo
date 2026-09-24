// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/SettingsPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001, SRS-BUILDANDDO-SITE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001, VCC-BUILDANDDO-SITE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-14
// Depends:     apps/web/src/pages/workspace/SettingsPage.jsx, apps/web/src/components/workspace/WebsiteDomainPanel.jsx, tests/upgrade/admin-fixture.mjs
// EnumType:    Test
// EnumEdges:   DEPENDS_ON apps/web/src/pages/workspace/SettingsPage.jsx; VALIDATES apps/web/src/components/workspace/WebsiteDomainPanel.jsx; DEPENDS_ON tests/upgrade/admin-fixture.mjs
// DAG Node:    none
// Intent:      Test appearance, account sign-out and DNS domain verification through the real server commands.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, plain } from '../../../../../../tests/upgrade/admin-fixture.mjs';
import SettingsPage from '@/pages/workspace/SettingsPage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

let backend, dns;
function send(path, options) {
    const e = backend.event(pb.authStore.record.id, options.body || {});
    const service = backend.load('domain-verification.js');
    try {
        const name = options.method === 'GET' ? 'read' : path.endsWith('/challenge') ? 'issue' : path.endsWith('/verify') ? 'verify' : 'save';
        const result = plain(service[name](e));
        if (name !== 'verify') return result;
        if (result.code !== 200) throw { status: result.code, response: result.body };
        return result.body;
    } catch (error) { throw error.response ? error : { status: error.status || 500, response: { message: error.message } }; }
}
function renderAs(actor, options = {}) {
    pb.__setAuth({ record: { id: actor } });
    return renderWithProviders(<SettingsPage />, { auth: { user: { id: actor, email: `${actor}@example.test` } },
        workspace: { active: { id: 'ws1', owner: 'owner', name: 'Workspace one', expand: {} } }, ...options });
}
beforeEach(() => {
    pb.__reset();
    dns = { Status: 3 };
    backend = fixture({ runtime: {
        $os: { getenv: () => '' },
        $http: { send: () => ({ statusCode: 200, raw: JSON.stringify(dns) }) },
        $security: { randomString: (length) => 'T'.repeat(length) },
    } });
    backend.migration('apps/pocketbase/pb_migrations/1791600100_domain_verification.js').up();
    pb.send = vi.fn(async (...args) => send(...args));
});

describe('SettingsPage', () => {
// Settings is tabbed - Appearance, Motion & interaction, Workspace, Account - and opens on
// Appearance. The domain controls live on Workspace and the sign-out on Account.
const openTab = (user, name) => user.click(screen.getByRole('tab', { name }));

    it('updates the shared theme without a backend write', async () => {
        const user = setupUser();
        renderAs('owner');
        await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), 'dark');
        expect(document.documentElement).toHaveClass('dark');
        expect(localStorage.getItem('buildanddo.theme')).toBe('dark');
        expect(pb.send).not.toHaveBeenCalled();
    });

    it('lets an owner add a domain, publish the TXT record and verify it by DNS', async () => {
        const user = setupUser();
        const view = renderAs('owner');
        await openTab(user, 'Workspace');
        expect(await screen.findByText('No website domain yet')).toBeVisible();
        expect(screen.queryByRole('combobox', { name: 'Domain status' })).not.toBeInTheDocument();
        await user.type(screen.getByLabelText('Website domain'), 'Example.com');
        await user.click(screen.getByRole('button', { name: 'Save domain' }));
        expect(await screen.findByText('Saved example.com. Verify ownership next.')).toBeVisible();
        expect(screen.getByText('Ownership is not verified. The domain is context only and unlocks nothing.')).toBeVisible();
        expect(view.workspace.refresh).toHaveBeenCalledTimes(1);

        await user.click(screen.getByRole('button', { name: 'Create verification record' }));
        const value = `buildanddo-verify=${'T'.repeat(32)}`;
        expect(await screen.findByText(value)).toBeVisible();
        expect(screen.getByText('_buildanddo-verify.example.com')).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Copy record value' }));
        expect(await navigator.clipboard.readText()).toBe(value);
        expect(screen.getByText('Copied the record value.')).toBeVisible();

        dns = { Status: 0, Answer: [{ type: 16, data: `"${value}"` }] };
        await user.click(screen.getByRole('button', { name: 'Check now' }));
        expect(await screen.findByText('The TXT record matched. Ownership is verified by DNS.')).toBeVisible();
        await waitFor(() => expect(screen.getByText('Ownership verified by DNS.')).toBeVisible());
        expect(view.workspace.refresh).toHaveBeenCalledTimes(2);
        expect(pb.send.mock.calls.every(([path]) => path.startsWith('/api/buildanddo/workspaces/ws1/domain'))).toBe(true);
    });

    it('explains a missing record in plain words and refuses an immediate second check', async () => {
        const user = setupUser();
        renderAs('admin');
        await openTab(user, 'Workspace');
        await user.type(await screen.findByLabelText('Website domain'), 'example.com');
        await user.click(screen.getByRole('button', { name: 'Save domain' }));
        await user.click(await screen.findByRole('button', { name: 'Create verification record' }));
        await user.click(await screen.findByRole('button', { name: 'Check now' }));
        expect(await screen.findByText(/No TXT record was found at that name yet/)).toBeVisible();
        await user.click(screen.getByRole('button', { name: 'Check now' }));
        expect(await screen.findByText(/Check again in \d+ seconds\./)).toBeVisible();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(backend.data.domains[0].status).toBe('selected');
    });

    it('rejects a URL before sending it', async () => {
        const user = setupUser();
        renderAs('owner');
        await openTab(user, 'Workspace');
        await user.type(await screen.findByLabelText('Website domain'), 'https://example.com/shop');
        await user.click(screen.getByRole('button', { name: 'Save domain' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('without https:// or a path');
        expect(pb.send.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
    });

    it('shows editors the domain status read-only with no challenge', async () => {
        backend.seed('domains', { id: 'd1', domain: 'example.com', status: 'selected', owner: 'owner', verification_token: 'T'.repeat(32) });
        backend.data.workspaces.find((row) => row.id === 'ws1').domain = 'd1';
        const user = setupUser();
        renderAs('editor', { route: '/app/settings#website-domain' });
        expect(await screen.findByText('example.com')).toBeVisible();
        expect(screen.getByText('Only workspace owners and admins can change the domain or verify it.')).toBeVisible();
        expect(screen.queryByLabelText(/website domain/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Check now|verification record/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/buildanddo-verify=/)).not.toBeInTheDocument();
        await openTab(user, 'Account');
        expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();
    });

    it('keeps appearance and account controls available when the domain cannot be read', async () => {
        const user = setupUser();
        pb.send.mockRejectedValueOnce(new Error('offline'));
        const view = renderAs('owner');
        await openTab(user, 'Workspace');
        expect(await screen.findByRole('alert')).toHaveTextContent('The website domain is unavailable');
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByText('No website domain yet')).toBeVisible();
        await openTab(user, 'Account');
        await user.click(screen.getByRole('button', { name: 'Sign out' }));
        expect(view.auth.logout).toHaveBeenCalledTimes(1);
    });
});
