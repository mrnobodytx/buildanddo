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
    isoMinutesAgo,
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

/**
 * The feed, the missions panel and the quick actions repeat the same titles
 * and button labels, so every list assertion is scoped to its own section via
 * the section heading.
 */
const section = (heading) => {
    const node = screen.getByRole('heading', { name: heading, level: 2 }).closest('section');
    if (!node) throw new Error(`No section headed "${heading}"`);
    return within(node);
};

const seed = ({
    signals = [],
    missions = [],
    workflows = [],
    evidence = [],
    editions = [],
} = {}) => {
    pb.__setRecords('signals', signals);
    pb.__setRecords('missions', missions);
    pb.__setRecords('workflows', workflows);
    pb.__setRecords('evidence', evidence);
    pb.__setRecords('daily_editions', editions);
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
            screen.getByRole('heading', { name: 'Recent activity', level: 2 }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Active missions', level: 2 }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('heading', { name: 'Quick actions', level: 2 }),
        ).toBeInTheDocument();
    });

    it('derives every stat card from the loaded records', async () => {
        seed({
            signals: [
                createMockSignal(),
                createMockSignal({ state: 'new' }),
                createMockSignal({ state: 'acknowledged' }),
            ],
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
            // A signal with no state predates the field and counts as new;
            // an acknowledged one is collected but no longer awaiting triage.
            const signals = within(statCard('Signals awaiting triage'));
            expect(signals.getByText('2')).toBeInTheDocument();
            expect(signals.getByText('3 collected in total')).toBeInTheDocument();
            // approved | running | needs_attention only — proposed and verified
            // are not "active".
            expect(within(statCard('Active missions')).getByText('2')).toBeInTheDocument();
            const workflowsCard = within(statCard('Workflows active'));
            expect(workflowsCard.getByText('1')).toBeInTheDocument();
            expect(workflowsCard.getByText('3 workflows defined')).toBeInTheDocument();
            expect(within(statCard('Verified outcomes')).getByText('3')).toBeInTheDocument();
        });
    });

    it('counts only verified evidence, not every evidence row', async () => {
        seed({
            evidence: [
                createMockEvidence({ type: 'verified' }),
                createMockEvidence({ type: 'observed' }),
                createMockEvidence({ type: 'attempted' }),
            ],
        });
        renderWithProviders(<OverviewPage />);

        await waitFor(() =>
            expect(within(statCard('Verified outcomes')).getByText('1')).toBeInTheDocument(),
        );
        // The whole evidence list is loaded (it also feeds the activity feed);
        // the verified count is derived client-side from `type`.
        expect(pb.__collection('evidence').getFullList).toHaveBeenCalledWith(
            expect.objectContaining({ filter: 'workspace = "ws_test"' }),
        );
    });

    it('shows zero-state hints instead of blank stat cards', async () => {
        seed();
        renderWithProviders(<OverviewPage />);

        await waitFor(() => {
            expect(
                within(statCard('Signals awaiting triage')).getByText('No signals collected yet'),
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

    it('merges collections into one feed of at most eight items, newest first', async () => {
        seed({
            // Nine signals, one created per minute; the eight newest survive.
            signals: Array.from({ length: 9 }, (_, i) =>
                createMockSignal({ title: `Signal ${i + 1}`, created: isoMinutesAgo(i + 1) }),
            ),
            missions: [
                createMockMission({
                    title: 'Mission just now',
                    status: 'proposed',
                    created: isoMinutesAgo(0),
                }),
            ],
        });
        renderWithProviders(<OverviewPage />);

        await waitFor(() => expect(screen.getByText('Mission just now')).toBeInTheDocument());
        const feed = section('Recent activity');
        const items = feed.getAllByRole('listitem');
        expect(items).toHaveLength(8);
        expect(items[0]).toHaveTextContent('Mission just now');
        expect(items[0]).toHaveTextContent('Mission proposed');
        expect(items[1]).toHaveTextContent('Signal 1');
        expect(items[7]).toHaveTextContent('Signal 7');
        expect(feed.queryByText('Signal 8')).not.toBeInTheDocument();
        expect(feed.queryByText('Signal 9')).not.toBeInTheDocument();
    });

    it('lists at most four untriaged signals in the triage panel', async () => {
        seed({
            signals: [
                ...Array.from({ length: 5 }, (_, i) =>
                    createMockSignal({ title: `Open ${i + 1}`, created: isoMinutesAgo(i + 1) }),
                ),
                createMockSignal({
                    title: 'Already seen',
                    state: 'acknowledged',
                    created: isoMinutesAgo(0),
                }),
            ],
        });
        renderWithProviders(<OverviewPage />);

        const triage = within(
            (await screen.findByRole('heading', { name: 'Awaiting triage', level: 2 }))
                .parentElement,
        );
        const items = triage.getAllByRole('listitem');
        expect(items).toHaveLength(4);
        expect(items[0]).toHaveTextContent('Open 1');
        expect(triage.queryByText('Open 5')).not.toBeInTheDocument();
        expect(triage.queryByText('Already seen')).not.toBeInTheDocument();
    });

    it('invites the user to connect a source when nothing has been recorded', async () => {
        const user = setupUser();
        seed();
        renderWithProviders(<OverviewPage />);

        // Scoped to the feed's empty state — the quick actions carry a
        // "Connect a source" button too.
        expect(
            await screen.findByRole('heading', {
                name: 'Nothing has happened here yet',
                level: 3,
            }),
        ).toBeInTheDocument();
        const feed = section('Recent activity');
        await user.click(feed.getByRole('button', { name: 'Connect a source' }));
        expect(navigateMock).toHaveBeenCalledWith('/app/operations');
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

        // All three appear in the activity feed; only the running one belongs
        // in the missions panel.
        await waitFor(() => expect(screen.getAllByText('Running work')).toHaveLength(2));
        const panel = section('Active missions');
        expect(panel.getByText('Running work')).toBeInTheDocument();
        expect(panel.getByText('Running')).toBeInTheDocument();
        expect(panel.queryByText('Proposed work')).not.toBeInTheDocument();
        expect(panel.queryByText('Verified work')).not.toBeInTheDocument();
        expect(section('Recent activity').getByText('Proposed work')).toBeInTheDocument();
    });

    it('routes the quick actions and the section links', async () => {
        const user = setupUser();
        seed();
        renderWithProviders(<OverviewPage />);

        await user.click(
            await screen.findByRole('button', {
                name: /Turn a signal into a bounded, approved task/,
            }),
        );
        expect(navigateMock).toHaveBeenCalledWith('/app/missions');

        await user.click(screen.getByRole('button', { name: 'View the ledger' }));
        expect(navigateMock).toHaveBeenLastCalledWith('/app/evidence');

        await user.click(screen.getByRole('button', { name: 'View all' }));
        expect(navigateMock).toHaveBeenLastCalledWith('/app/missions');
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
                within(statCard('Signals awaiting triage')).getByText('0'),
            ).toBeInTheDocument(),
        );
        // The zero is announced as a lower bound, not passed off as a total.
        expect(screen.getByRole('status')).toHaveTextContent(
            'Could not read signals. Every number below is a lower bound, not a total.',
        );
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
});
