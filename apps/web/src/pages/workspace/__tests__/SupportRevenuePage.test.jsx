// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/SupportRevenuePage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/workspace/SupportRevenuePage.jsx,
//              apps/web/src/hooks/useWorkspaceControl.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/SupportRevenuePage.jsx
// Intent:      Hold the request button to what the product can actually do. The
//              claims route writes 'pending' and refuses every other status, and
//              nothing in this repository advances the row past it, so a card
//              must say the request is on file and needs a person outside the
//              product - not offer a retry that reads as "this failed".
// ───────────────────────────────────────────────────────────────
//
// WHY THIS FILE MOCKS THE HOOKS AND NOT POCKETBASE. It first drove a raw
// pb.collection('support_sources').create. The converged line then closed raw
// writes on this collection behind POST /claims, so that path is refused and
// the test was asserting a write the product can no longer make. It now uses
// the same harness as WorkspaceClaimsPages.test.jsx, which renders the page
// against the hooks it actually reads.

import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SupportRevenuePage from '@/pages/workspace/SupportRevenuePage';

const state = vi.hoisted(() => ({ control: null, access: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'account1' }, isAuthed: true }) }));
vi.mock('@/contexts/WorkspaceContext', () => ({ useWorkspace: () => ({ active: { id: 'workspace1' } }) }));
vi.mock('@/contexts/WorkspaceAccessContext', () => ({ useWorkspaceAccess: () => state.access }));
vi.mock('@/hooks/useWorkspaceRecords', () => ({ useWorkspaceRecords: () => state.control }));
vi.mock('@/hooks/useDemoMode', () => ({ useDemoMode: () => ({ demo: false }) }));
vi.mock('@/components/motion/MotionPrimitives', () => ({ MotionEntrance: ({ children }) => children,
    MotionList: ({ as: Element = 'div', children }) => <Element>{children}</Element>, MotionValue: ({ value }) => <span>{value}</span>,
    useMotionChange: () => ({ current: null }) }));

const ADMIN = { data: { role: 'admin', can_write: true, can_admin: true }, loading: false, error: '' };
const READ_ONLY = 'Your role in this workspace is read-only, so you cannot change records here.';
const ADMIN_ONLY = 'A current workspace owner or administrator must request a connection.';

beforeEach(() => {
    state.access = ADMIN;
    state.control = {
        records: [], loading: false, degraded: false, saving: false, demo: false, uncertain: false, writeError: '',
        create: vi.fn().mockResolvedValue({ ok: true }), update: vi.fn().mockResolvedValue({ ok: true }),
        retry: vi.fn().mockResolvedValue({ ok: true }), clearWriteError: vi.fn(), refresh: vi.fn(),
    };
});

const page = () => <MemoryRouter><SupportRevenuePage /></MemoryRouter>;

/** @returns {HTMLElement} The provider card carrying `label`. */
function card(label) {
    // The four cards repeat most of their copy, so an unscoped query would
    // match Ko-fi's sentence while asserting about Patreon's.
    return screen.getByText(label).closest('div.border');
}

describe('support and revenue connections', () => {
    it('records a request through the claims route and then offers no retry', async () => {
        const view = render(page());
        await act(async () => fireEvent.click(within(card('Patreon')).getByRole('button', { name: 'Request connection' })));
        expect(state.control.create).toHaveBeenCalledWith({ provider: 'patreon' });

        state.control.records = [{ id: 'src_patreon', provider: 'patreon', status: 'pending',
            requested_at: '2026-09-24 10:00:00.000Z', requested_by: 'account1' }];
        view.rerender(page());

        // "Re-attempt connection" told a person the write had failed. It had not:
        // the request is on file, and a second press could only re-stamp it.
        const requested = within(card('Patreon')).getByRole('button', { name: 'Connection requested' });
        expect(requested).toBeDisabled();
        expect(screen.queryByRole('button', { name: /re-attempt|request again/i })).toBeNull();
        expect(screen.getAllByRole('button', { name: 'Request connection' })).toHaveLength(3);
    });

    it('says a pending request is recorded and needs a step outside the product', () => {
        state.control.records = [{ id: 'src_kofi', provider: 'kofi', status: 'pending' }];
        render(page());

        const kofi = card('Ko-fi');
        expect(kofi).toHaveTextContent(/request is recorded/i);
        expect(kofi).toHaveTextContent(/outside BuildAndDo/i);
        expect(kofi).toHaveTextContent(/no gross, fee, refund or payout figures/i);
        // The old copy promised an automatic completion that no code performs.
        expect(kofi).not.toHaveTextContent(/first successful sync/i);
        expect(kofi).not.toHaveTextContent(/awaiting authorization/i);
    });

    it('shows earlier figures as self-reported history, in the currency they were recorded in', () => {
        state.control.records = [{ id: 'src_stripe', provider: 'stripe', status: 'connected', gross: 1240.5,
            platform_fees: 37.2, refunds: 0, currency: 'USD', payout_status: 'Paid out', last_sync: '2026-09-20 08:00:00.000Z' }];
        render(page());

        const stripe = card('Stripe');
        expect(stripe).toHaveTextContent(/Historical \/ self-reported values/);
        expect(stripe).toHaveTextContent('USD 1,240.50');
        expect(stripe).toHaveTextContent('USD 37.20');
        expect(stripe).toHaveTextContent('Paid out');
    });

    it('tells a viewer both that they are read-only and who can make the request', () => {
        state.access = { data: { role: 'viewer', can_write: false, can_admin: false }, loading: false, error: '' };
        render(page());
        // A viewer once got only "read-only", with no way to find the person to ask.
        expect(screen.getAllByText(new RegExp(READ_ONLY.replace(/[.]/g, '\\.'))).length).toBeGreaterThan(0);
        expect(screen.getAllByText(new RegExp(ADMIN_ONLY.replace(/[.]/g, '\\.'))).length).toBeGreaterThan(0);
        for (const button of screen.getAllByRole('button', { name: 'Request connection' })) expect(button).toBeDisabled();
    });

    it('makes no claim about the reader role while the access check is still out', () => {
        // The control for the case above: with the role unknown, a sentence about
        // who may act would be a guess presented as a fact.
        state.access = { data: null, loading: true, error: '' };
        render(page());
        expect(screen.queryByText(new RegExp(ADMIN_ONLY.replace(/[.]/g, '\\.')))).toBeNull();
        expect(screen.queryByText(new RegExp(READ_ONLY.replace(/[.]/g, '\\.')))).toBeNull();
    });

    it('says the read failed instead of showing every provider as never requested', () => {
        state.control.degraded = true;
        render(page());
        // The notice carries its own generic title too, so match the page's sentence.
        expect(screen.getByText(/Support connection records could not be loaded/)).toBeInTheDocument();
        // A failed read must not borrow the empty state's sentence or its buttons.
        expect(screen.queryByText(/No provider-confirmed payment data is available/i)).toBeNull();
        expect(screen.queryByRole('button', { name: 'Request connection' })).toBeNull();
    });
});
