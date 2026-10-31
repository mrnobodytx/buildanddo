// --- CGRF Header ------------------------------------------------
// File:        apps/web/src/components/workspace/__tests__/GuildPublicationsPanel.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-GUILDMASTER-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-GUILDMASTER-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-10-31
// Depends:     apps/web/src/components/workspace/GuildPublicationsPanel.jsx, apps/web/src/lib/guildPublications.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/GuildPublicationsPanel.jsx; VALIDATES apps/web/src/lib/guildPublications.js
// Intent:      Verify the admin-only publication history, the exact withdrawal command and recovery of an uncertain withdrawal.
// ----------------------------------------------------------------

import React from 'react';
import { expect, it, vi } from 'vitest';
import GuildPublicationsPanel from '@/components/workspace/GuildPublicationsPanel';
import { list, withdraw } from '@/lib/guildPublications';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';

const PATH = '/api/buildanddo/workspaces/ws1/guild-publications';
const row = (values = {}) => ({ id: 'publication001', action: 'published', kind: 'daily_edition', target: 'edition000001', title: 'Weekly entertainment notes',
    persona: 'director-nexus', actor: 'accountdirector', actor_seat: 'director', content_digest: 'a'.repeat(64), note: '', created: '2026-10-31 12:00:00.000Z',
    target_status: 'published', target_revision: 2, withdrawable: true, ...values });
const page = (items, extra = {}) => ({ workspace: 'ws1', page: 1, has_more: false, items, ...extra });
const receipt = (values = {}) => ({ id: 'edition000001', workspace: 'ws1', action: 'publication.withdraw', kind: 'daily_edition', revision: 3,
    status: 'withdrawn', publication: 'publication002', replayed: false, ...values });
const keys = () => { let n = 0; return vi.fn(() => `withdraw_request_${String(++n).padStart(6, '0')}`); };
const expected = (key) => ({ method: 'POST', body: { action: 'publication.withdraw', revision: 2, request_key: key,
    payload: { kind: 'daily_edition', target: 'edition000001', note: 'Withdrawn after owner review.' } }, requestKey: null, cache: 'no-store' });

it('renders nothing and reads nothing for a member who is not an owner or administrator', () => {
    const client = { send: vi.fn() };
    const view = renderWithProviders(<GuildPublicationsPanel workspaceId="ws1" canAdmin={false} client={client} />);
    expect(view.container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Guild publications' })).not.toBeInTheDocument();
    expect(client.send).not.toHaveBeenCalled();
});

it('lists guild publications by persona and withdraws one with the exact command and a required note', async () => {
    const user = setupUser(); const keyFactory = keys();
    const client = { send: vi.fn()
        .mockResolvedValueOnce(page([row(), row({ id: 'publication000', kind: 'wiki_page', target: 'wikipage00001', persona: 'forge', title: 'Guild handbook',
            action: 'withdrawn', note: 'Out of date.', target_status: 'archived', target_revision: 3, withdrawable: false })]))
        .mockResolvedValueOnce(receipt())
        .mockResolvedValueOnce(page([row({ target_status: 'withdrawn', target_revision: 3, withdrawable: false })])) };
    renderWithProviders(<GuildPublicationsPanel workspaceId="ws1" canAdmin client={client} keyFactory={keyFactory} />);
    expect(await screen.findByText('Weekly entertainment notes')).toBeVisible();
    expect(client.send).toHaveBeenCalledWith(PATH, { method: 'GET', query: { page: '1' }, requestKey: null, cache: 'no-store' });
    expect(screen.getByText(/Director Nexus · Daily Edition · Published/)).toBeVisible();
    expect(screen.getByText(/Forge · Wiki page · Withdrawn by an owner or administrator/)).toBeVisible();
    expect(screen.getByText('Note: Out of date.')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    const submit = await screen.findByRole('button', { name: 'Withdraw' });
    expect(screen.getByText(/will be marked withdrawn\. Both audit rows are kept\./)).toBeVisible();
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Reason for withdrawal'), 'Withdrawn after owner review.');
    await user.click(submit);
    expect(await screen.findByText('Daily Edition withdrawn.')).toBeVisible();
    expect(client.send).toHaveBeenNthCalledWith(2, PATH, expected('withdraw_request_000001'));
    await waitFor(() => expect(client.send).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('Current state: Withdrawn')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@|buildanddo\.invalid|accountdirector/);
});

it('keeps an uncertain withdrawal and retries it with the same retry key until the saved result is recovered', async () => {
    const user = setupUser(); const keyFactory = keys();
    const client = { send: vi.fn()
        .mockResolvedValueOnce(page([row()]))
        .mockRejectedValueOnce(Object.assign(new Error('network'), { status: 0 }))
        .mockResolvedValueOnce(receipt({ replayed: true }))
        .mockResolvedValueOnce(page([row({ target_status: 'withdrawn', target_revision: 3, withdrawable: false })])) };
    renderWithProviders(<GuildPublicationsPanel workspaceId="ws1" canAdmin client={client} keyFactory={keyFactory} />);
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }));
    await user.type(screen.getByLabelText('Reason for withdrawal'), 'Withdrawn after owner review.');
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not confirm this withdrawal.*The note is kept/);
    expect(screen.getByLabelText('Reason for withdrawal')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry withdrawal' }));
    expect(await screen.findByText('Daily Edition withdrawn (recovered the saved result).')).toBeVisible();
    expect(client.send.mock.calls[1]).toEqual([PATH, expected('withdraw_request_000001')]);
    expect(client.send.mock.calls[2]).toEqual([PATH, expected('withdraw_request_000001')]);
    expect(keyFactory).toHaveBeenCalledTimes(1);
});

it('shows forbidden and unavailable states explicitly instead of an empty history', async () => {
    const forbidden = { send: vi.fn().mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 })) };
    const view = renderWithProviders(<GuildPublicationsPanel workspaceId="ws1" canAdmin client={forbidden} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only a workspace owner or administrator can read guild publications.');
    expect(screen.queryByText('No guild publications on this page.')).not.toBeInTheDocument();
    view.unmount();
    const missing = { send: vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { status: 503 })) };
    renderWithProviders(<GuildPublicationsPanel workspaceId="ws1" canAdmin client={missing} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Guild publishing is not installed on this backend yet.');
});

it('refuses a withdrawal the server forbids and keeps the history honest about it', async () => {
    const user = setupUser();
    const client = { send: vi.fn().mockResolvedValueOnce(page([row()])).mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 })) };
    renderWithProviders(<GuildPublicationsPanel workspaceId="ws1" canAdmin client={client} keyFactory={keys()} />);
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }));
    await user.type(screen.getByLabelText('Reason for withdrawal'), 'Withdrawn after owner review.');
    await user.click(screen.getByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only a workspace owner or administrator can withdraw guild publications.');
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeDisabled();
});

it('the client refuses malformed input, mismatched receipts and histories that are not this workspace', async () => {
    const client = { send: vi.fn() };
    expect((await withdraw(client, 'ws1', { kind: 'account', target: 'edition000001', revision: 2, note: 'x' })).reason).toBe('invalid');
    expect((await withdraw(client, 'ws1', { kind: 'daily_edition', target: 'edition000001', revision: 2, note: ' ' })).reason).toBe('invalid');
    expect((await withdraw(client, 'ws1', { kind: 'daily_edition', target: 'edition000001', revision: 2, note: 'x' }, () => 'short')).reason).toBe('unavailable');
    expect(client.send).not.toHaveBeenCalled();
    client.send.mockResolvedValueOnce(receipt({ revision: 9 }));
    const mismatch = await withdraw(client, 'ws1', { kind: 'daily_edition', target: 'edition000001', revision: 2, note: 'x' }, keys());
    expect([mismatch.ok, mismatch.reason, mismatch.uncertain]).toEqual([false, 'uncertain', true]);
    const blocked = await withdraw(client, 'ws1', { kind: 'wiki_page', target: 'wikipage00001', revision: 1, note: 'y' }, keys());
    expect(blocked.blockedByPending).toBe(true);
    client.send.mockResolvedValueOnce(page([row()], { workspace: 'ws2' }));
    expect((await list(client, 'ws1', 1)).reason).toBe('invalid');
    client.send.mockResolvedValueOnce(page([row({ withdrawable: true, target_revision: null })]));
    expect((await list(client, 'ws1', 1)).reason).toBe('invalid');
});
