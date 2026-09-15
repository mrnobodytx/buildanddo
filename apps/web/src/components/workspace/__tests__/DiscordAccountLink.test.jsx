// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/workspace/__tests__/DiscordAccountLink.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-UPGRADE-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-UPGRADE-001
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-15
// Depends:     apps/web/src/components/workspace/DiscordAccountLink.jsx, apps/web/src/lib/discordAccount.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/workspace/DiscordAccountLink.jsx; CONSUMES apps/web/src/lib/discordAccount.js
// DAG Node:    none
// Intent:      Verify visible native-link outcomes and recovery without switching identities or enabling demonstration writes.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import DiscordAccountLink from '@/components/workspace/DiscordAccountLink';
import { createDiscordAccountLink } from '@/lib/discordAccount';
import { renderWithProviders, screen, setupUser, waitFor } from '@/test/utils';
import { setDemoMode } from '@/lib/demoWorkspace';
vi.mock('@/lib/discordAccount', () => ({ createDiscordAccountLink: vi.fn() }));
const api = { status: vi.fn(), link: vi.fn(), unlink: vi.fn(), dispose: vi.fn() };
beforeEach(() => {
    Object.values(api).forEach((operation) => operation.mockReset());
    api.status.mockResolvedValue({ ok: true, linked: false }); api.link.mockResolvedValue({ ok: true, linked: true }); api.unlink.mockResolvedValue({ ok: true, linked: false });
    createDiscordAccountLink.mockReturnValue(api);
});
afterEach(() => act(() => setDemoMode(false)));

it('shows confirmed linking and unlinking outcomes and disables controls while OAuth is pending', async () => {
    const user = setupUser(); const view = renderWithProviders(<DiscordAccountLink />);
    await user.click(await screen.findByRole('button', { name: 'Link Discord' }));
    expect(await screen.findByText('Discord is linked to this account.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Unlink Discord' }));
    expect(await screen.findByText('Discord is not linked.')).toBeVisible();
    let finish; api.link.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await user.click(screen.getByRole('button', { name: 'Link Discord' }));
    expect(screen.getByRole('button', { name: 'Link Discord' })).toBeDisabled();
    await act(async () => finish({ ok: false, error: 'Provider unavailable.' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable.');
    await user.click(screen.getByRole('button', { name: 'Refresh link status' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    view.unmount(); expect(api.dispose).toHaveBeenCalled();
});

it('keeps account linking unavailable in demonstration mode and cancels pending operations on exit', async () => {
    act(() => setDemoMode(true));
    const view = renderWithProviders(<DiscordAccountLink />);
    expect(await screen.findByText(/disabled in demonstration mode/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Link Discord' })).toBeDisabled();
    view.unmount(); expect(api.dispose).toHaveBeenCalled();
});
