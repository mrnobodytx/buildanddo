// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/__tests__/PlatformHealthAccess.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-24
// Depends:     apps/web/src/App.jsx,
//              apps/web/src/pages/workspace/PlatformHealthPage.jsx,
//              apps/web/src/lib/estateAccess.js
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/App.jsx;
//              VALIDATES apps/web/src/pages/workspace/PlatformHealthPage.jsx
// Intent:      Hold the Platform Health surface to the two things that made it a
//              leak: it rendered the operating company's vendor readings to every
//              authenticated workspace user, and it read them from a file served
//              to anyone who typed the URL.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoutes } from '@/App';
import pb from '@/lib/pocketbaseClient';
import PlatformHealthPage from '@/pages/workspace/PlatformHealthPage';
import { createMockUser, renderWithProviders, screen } from '@/test/utils';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const { vi: vitest } = await import('vitest');
    const client = createMockPocketBase();
    // The mock SDK models collections only; the estate reports come back through
    // `send`, so the route assertions need it to exist and to record its calls.
    client.send = vitest.fn();
    return { default: client, pocketbaseClient: client };
});

// The route the backend answers only to a master seat (apps/pocketbase/pb_hooks/estate.pb.js).
const PRIVATE_ROUTE = '/api/buildanddo/estate/platform-health';
// The public file the page used to read. Nothing on this page may ask for it again.
const PUBLIC_FILE = '/platform-health.json';

// The 200-with-no-measurement answer the private route gives when the report is absent.
const UNMEASURED = {
    state: 'UNMEASURED',
    reason: 'The platform assessment has not run since the vendor keys were rotated.',
    expected_path: 'estate/platform-health.json',
    served_to: 'master seat',
};

// These routes are React.lazy, so each assertion waits on a real dynamic import;
// the same generous bound AppRoutes.test.jsx uses, for the same reason.
const LAZY_ROUTE_TIMEOUT = 20000;

const masterSeat = () => ({ user: createMockUser({ cnwb_seat_level: 'master' }) });

/** Calls made to the fetch stub whose URL carries `needle`. */
const fetchedFor = (needle) =>
    globalThis.fetch.mock.calls.filter(([input]) => String(input).includes(needle));

beforeEach(() => {
    pb.__reset();
    pb.send.mockReset();
    pb.send.mockResolvedValue(UNMEASURED);
    // Every fetch fails, so a page still reaching for a published file cannot mistake
    // that file's contents for the route's answer - and the attempt is still recorded.
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    );
});

afterEach(() => vi.unstubAllGlobals());

describe('where the platform reading comes from', () => {
    it('asks the master-seat route and never the published file', async () => {
        renderWithProviders(<PlatformHealthPage />);
        await screen.findByTestId('platform-health-scope');

        expect(pb.send).toHaveBeenCalledWith(
            PRIVATE_ROUTE,
            expect.objectContaining({ method: 'GET' }),
        );
        expect(fetchedFor(PUBLIC_FILE)).toHaveLength(0);
    });

    it('says what the route said when it answers 200 with no measurement', async () => {
        renderWithProviders(<PlatformHealthPage />);

        expect(await screen.findByText(UNMEASURED.reason)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
        expect(screen.queryByText('Platforms connected')).not.toBeInTheDocument();
    });
});

describe('who /app/platforms exists for', () => {
    it(
        'does not render it for an authenticated user who is not a master seat',
        async () => {
            renderWithProviders(<AppRoutes />, { route: '/app/platforms' });

            const heading = await screen.findByRole(
                'heading',
                { level: 1 },
                { timeout: LAZY_ROUTE_TIMEOUT },
            );
            expect(heading).not.toHaveTextContent(/platform health/i);
            expect(screen.queryByTestId('platform-health-scope')).toBeNull();
        },
        LAZY_ROUTE_TIMEOUT,
    );

    it(
        'renders it for a master seat',
        async () => {
            renderWithProviders(<AppRoutes />, { route: '/app/platforms', auth: masterSeat() });

            expect(
                await screen.findByRole(
                    'heading',
                    { level: 1, name: /platform health/i },
                    { timeout: LAZY_ROUTE_TIMEOUT },
                ),
            ).toBeVisible();
        },
        LAZY_ROUTE_TIMEOUT,
    );
});
