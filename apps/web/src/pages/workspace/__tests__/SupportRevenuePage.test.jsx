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
//              apps/web/src/test/pocketbaseMock.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/SupportRevenuePage.jsx;
//              CONSUMES apps/web/src/test/pocketbaseMock.js
// Intent:      Hold the connect button to what the product can actually do. It
//              writes 'pending' and nothing in this repository ever advances
//              that row, so the card must say the request is on file and needs
//              a person outside the product, not offer a retry that reads as
//              "this failed" and cannot succeed either.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';

import SupportRevenuePage from '@/pages/workspace/SupportRevenuePage';
import pb from '@/lib/pocketbaseClient';
import { renderWithProviders, screen, setupUser, waitFor, within } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

beforeEach(() => pb.__reset());

/** @returns {HTMLElement} The provider card carrying `label`. */
function card(label) {
    // The four cards repeat most of their copy, so an unscoped query would
    // match Ko-fi's sentence while asserting about Patreon's.
    const heading = screen.getByText(label);
    return heading.closest('div.border');
}

describe('support and revenue connections', () => {
    it('does not offer a retry after recording a request that only a person can finish', async () => {
        const user = setupUser();
        renderWithProviders(<SupportRevenuePage />);

        const patreon = await screen.findByText('Patreon');
        await user.click(within(patreon.closest('div.border')).getByRole('button'));
        await waitFor(() =>
            expect(pb.collection('support_sources').create).toHaveBeenCalledWith(
                expect.objectContaining({ provider: 'patreon', status: 'pending' }),
            ),
        );

        // "Re-attempt connection" tells a person the write failed. It did not:
        // the row is on file. Pressing again would rewrite the same 'pending'.
        await waitFor(() =>
            expect(screen.queryByRole('button', { name: /re-attempt/i })).toBeNull(),
        );
        expect(screen.getAllByRole('button', { name: /^connect$/i })).toHaveLength(3);
    });

    it('says a pending request is recorded and needs a step outside the product', async () => {
        pb.__setRecords('support_sources', [
            { id: 'src_kofi', provider: 'kofi', status: 'pending', workspace: 'ws_test' },
        ]);
        renderWithProviders(<SupportRevenuePage />);

        const kofi = await waitFor(() => card('Ko-fi'));
        expect(kofi).toHaveTextContent(/recorded/i);
        expect(kofi).toHaveTextContent(/outside BuildAndDo/i);
        expect(kofi).toHaveTextContent(/no gross, fee, refund or payout figures/i);

        // The old copy promised an automatic completion that no code performs.
        expect(kofi).not.toHaveTextContent(/first successful sync/i);
        expect(kofi).not.toHaveTextContent(/awaiting authorization/i);
    });

    it('still shows the figures once a row has been advanced out of band', async () => {
        pb.__setRecords('support_sources', [
            {
                id: 'src_stripe',
                provider: 'stripe',
                status: 'connected',
                workspace: 'ws_test',
                gross: 1240.5,
                platform_fees: 37.2,
                refunds: 0,
                currency: '$',
                payout_status: 'Paid out',
            },
        ]);
        renderWithProviders(<SupportRevenuePage />);

        const stripe = await waitFor(() => card('Stripe'));
        expect(stripe).toHaveTextContent('$1,240.50');
        expect(stripe).toHaveTextContent('$37.20');
        expect(stripe).toHaveTextContent('Paid out');
    });
});
