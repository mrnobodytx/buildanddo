// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/OverviewPage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-TEST-001
// CAPS:        pending
// CK:          pending
// Seat:        BITS-CODEGEN
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-10
// Depends:     apps/web/src/pages/workspace/OverviewPage.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/OverviewPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Keep the front page honest: counts must come from records, the
//              domain banner must not imply authorisation, and empty means empty.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

vi.mock('react-router-dom', async (importOriginal) => ({
    ...(await importOriginal()),
    useNavigate: () => navigateMock,
}));

import pb from '@/lib/pocketbaseClient';
import OverviewPage from '@/pages/workspace/OverviewPage';
import {
    createMockDomain,
    createMockEvidence,
    createMockMission,
    createMockSignal,
    createMockWorkflow,
    createMockWorkspace,
    renderWithProviders,
    screen,
    setupUser,
    waitFor,
    within,
} from '@/test/utils';

/**
 * A StatCard has no role or accessible name of its own, so its label is the
 * only stable handle: label span -> header row -> card root. The span filter
 * matters because "Active missions" is also a section heading.
 */
const statCard = (label) => {
    const labelNode = screen
        .getAllByText(label)
        .find((node) => node.tagName === 'SPAN');
    if (!labelNode) throw new Error(`No stat card labelled "${label}"`);
    return labelNode.parentElement.parentElement;
};

const seed = ({ signals = [], missions = [], workflows = [], evidence = [] } = {}) => {
    pb.__setRecords('signals', signals);
    pb.__setRecords('missions', missions);
    pb.__setRecords('workflows', workflows);
    pb.__setRecords('evidence', evidence);
};

describe('OverviewPage', () => {
    beforeEach(() => {
        pb.__reset();
        navigateMock.mockReset();
    });

    it('renders the front page header', async () => {
        seed();
        renderWithProviders(<OverviewPage />);

        expect(
            await screen.findByRole('heading', { name: 'Front Page', level: 1 }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'What changed', level: 2 }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Active missions', level: 2 }),
        ).toBeInTheDocument();
    });

    it('derives every stat card from the loaded records', async () => {
        seed({
            signals: [createMockSignal(), createMockSignal()],
            missions: [
                createMockMission({ status: 'running' }),
                createMockMission({ status: 'needs_attention' }),
                createMockMission({ status: 'proposed' }),
                createMockMission({ status: 'verified' }),
            ],
            workflows: [
                createMockWorkflow({ status: 'active' }),
                createMockWorkflow({ status: 'draft' }),
                createMockWorkflow({ status: 'paused' }),
            ],
            evidence: [createMockEvidence(), createMockEvidence(), createMockEvidence()],
        });
        renderWithProviders(<OverviewPage />);

        // One waitFor for all four: the collections resolve independently, so
        // asserting the later cards outside it would race the slowest query.
        await waitFor(() => {
            expect(within(statCard('Business signals')).getByText('2')).toBeInTheDocument();
            // approved | running | needs_attention only — proposed and verified
            // are not "active".
            expect(within(statCard('Active missions')).getByText('2')).toBeInTheDocument();
            expect(within(statCard('Workflow health')).getByText('1')).toBeInTheDocument();
            expect(
                within(statCard('Workflow health')).getByText('3 workflows total'),
            ).toBeInTheDocument();
            expect(within(statCard('Verified outcomes')).getByText('3')).toBeInTheDocument();
        });
    });

    it('counts verified outcomes from evidence filtered server-side', async () => {
        seed({ evidence: [createMockEvidence()] });
        renderWithProviders(<OverviewPage />);

        await waitFor(() =>
            expect(pb.__collection('evidence').getFullList).toHaveBeenCalledWith(
                expect.objectContaining({
                    filter: 'workspace = "ws_test" && type = "verified"',
                }),
            ),
        );
    });

    it('shows zero-state hints instead of blank stat cards', async () => {
        seed();
        renderWithProviders(<OverviewPage />);

        await waitFor(() => {
            expect(
                within(statCard('Business signals')).getByText('No signals collected yet'),
            ).toBeInTheDocument();
            expect(
                within(statCard('Active missions')).getByText('No missions running'),
            ).toBeInTheDocument();
            expect(
                within(statCard('Verified outcomes')).getByText('Nothing verified yet'),
            ).toBeInTheDocument();
        });
    });

    it('warns that a selected domain is not an authorised domain', async () => {
        seed();
        renderWithProviders(<OverviewPage />, {
            workspace: {
                active: createMockWorkspace({
                    expand: { domain: createMockDomain({ status: 'selected' }) },
                }),
            },
        });

        expect(await screen.findByText('example-plumbing.com')).toBeInTheDocument();
        expect(screen.getByText(/Confirm ownership or authorization/i)).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Verify domain/ }),
        ).toBeInTheDocument();
    });

    it('states that deeper analysis is authorised once the domain is verified', async () => {
        seed();
        renderWithProviders(<OverviewPage />, {
            workspace: {
                active: createMockWorkspace({
                    expand: { domain: createMockDomain({ status: 'verified' }) },
                }),
            },
        });

        expect(
            await screen.findByText(/Domain verified — deeper analysis is authorized/),
        ).toBeInTheDocument();
    });

    it('hides the domain banner while the workspace is still loading', () => {
        seed();
        renderWithProviders(<OverviewPage />, { workspace: { loading: true } });

        expect(screen.queryByText('example-plumbing.com')).not.toBeInTheDocument();
    });

    it('lists at most five signals in the activity feed, newest first', async () => {
        seed({
            signals: Array.from({ length: 6 }, (_, i) =>
                createMockSignal({ title: `Signal ${i + 1}` }),
            ),
        });
        renderWithProviders(<OverviewPage />);

        expect(await screen.findByText('Signal 1')).toBeInTheDocument();
        expect(screen.getByText('Signal 5')).toBeInTheDocument();
        expect(screen.queryByText('Signal 6')).not.toBeInTheDocument();
    });

    it('invites the user to connect a source when no signals exist', async () => {
        seed();
        renderWithProviders(<OverviewPage />);

        // Scoped to the feed's empty state — the signals stat card carries the
        // same sentence as its hint.
        expect(
            await screen.findByRole('heading', {
                name: 'No signals collected yet',
                level: 3,
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /Connect a source/ }),
        ).toBeInTheDocument();
    });

    it('shows only in-flight missions in the active missions panel', async () => {
        seed({
            missions: [
                createMockMission({ title: 'Running work', status: 'running' }),
                createMockMission({ title: 'Proposed work', status: 'proposed' }),
                createMockMission({ title: 'Verified work', status: 'verified' }),
            ],
        });
        renderWithProviders(<OverviewPage />);

        expect(await screen.findByText('Running work')).toBeInTheDocument();
        expect(screen.queryByText('Proposed work')).not.toBeInTheDocument();
        expect(screen.queryByText('Verified work')).not.toBeInTheDocument();
    });

    it('routes the quick actions and the feed links', async () => {
        const user = setupUser();
        seed();
        renderWithProviders(<OverviewPage />);

        await user.click(
            await screen.findByRole('button', {
                name: /Turn a signal into a bounded, approved task/,
            }),
        );
        expect(navigateMock).toHaveBeenCalledWith('/app/missions');

        const viewAll = screen.getAllByRole('button', { name: 'View all' });
        await user.click(viewAll[0]);
        expect(navigateMock).toHaveBeenCalledWith('/app/signals');
    });

    it('still renders the page when a collection fails to load', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        seed();
        pb.__setError('signals');
        renderWithProviders(<OverviewPage />);

        expect(
            await screen.findByRole('heading', { name: 'Front Page', level: 1 }),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(
                within(statCard('Business signals')).getByText('0'),
            ).toBeInTheDocument(),
        );
    });
});
