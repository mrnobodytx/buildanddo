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
    isoMinutesAgo,
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

// The front page shows the same record in more than one place on purpose: a new signal is both
// the most recent thing that happened and a thing awaiting triage, and a running mission is both
// recent and active. An unscoped getByText therefore finds two nodes and fails on the page working
// as designed. Scope to the panel the assertion is actually about.
const panel = (heading) =>
    screen.getByRole('heading', { name: heading, level: 2 }).closest('section');

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
            screen.getByRole('heading', { name: 'Recent activity', level: 2 }),
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
            expect(within(statCard('Signals awaiting triage')).getByText('2')).toBeInTheDocument();
            // approved | running | needs_attention only — proposed and verified
            // are not "active".
            expect(within(statCard('Active missions')).getByText('2')).toBeInTheDocument();
            expect(within(statCard('Workflows active')).getByText('1')).toBeInTheDocument();
            expect(
                within(statCard('Workflows active')).getByText('3 workflows defined'),
            ).toBeInTheDocument();
            expect(within(statCard('Verified outcomes')).getByText('3')).toBeInTheDocument();
        });
    });

    it('reads evidence scoped to the workspace and counts the verified ones', async () => {
        seed({ evidence: [createMockEvidence()] });
        renderWithProviders(<OverviewPage />);

        // This asked for `type = "verified"` server-side until the activity feed started
        // carrying evidence. The feed needs every kind, so one read now serves both and the
        // verified count is taken from it. The half that mattered is still asserted: the read
        // is scoped to the workspace, so a user with several workspaces cannot be shown another
        // one's records. The dropped half is a scaling cost, not a privacy one, and it is
        // recorded as a finding rather than left implied by a deleted assertion.
        await waitFor(() =>
            expect(pb.__collection('evidence').getFullList).toHaveBeenCalledWith(
                expect.objectContaining({ filter: 'workspace = "ws_test"' }),
            ),
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

    it('caps the activity feed at eight entries, newest first', async () => {
        // Five was the cap when the feed held signals only. It now carries signals, missions,
        // evidence and editions together and keeps the eight most recent of all of them, so the
        // cap has to be exercised with more than eight or it is not being tested at all.
        // Each signal needs its OWN timestamp. createMockSignal defaults every record to
        // isoMinutesAgo(15), so ten of them shared one instant and "the newest eight" was
        // undefined - the test passed or failed on whichever order the loads resolved in,
        // about half the time each. Signal 1 is newest, so 1..8 survive and 9..10 fall off.
        seed({
            signals: Array.from({ length: 10 }, (_, i) =>
                createMockSignal({ title: `Signal ${i + 1}`, created: isoMinutesAgo(i + 1) }),
            ),
        });
        renderWithProviders(<OverviewPage />);

        await screen.findByRole('heading', { name: 'Recent activity', level: 2 });
        const feed = within(panel('Recent activity'));
        expect(await feed.findByText('Signal 1')).toBeInTheDocument();
        expect(feed.getByText('Signal 8')).toBeInTheDocument();
        expect(feed.queryByText('Signal 9')).not.toBeInTheDocument();
        expect(feed.queryByText('Signal 10')).not.toBeInTheDocument();
        // The name of this test claims an ORDER, so assert it. With every record sharing one
        // timestamp the old version could not have caught a reversed feed.
        const shown = feed.getAllByText(/^Signal \d+$/).map((node) => node.textContent);
        expect(shown).toEqual([
            'Signal 1', 'Signal 2', 'Signal 3', 'Signal 4',
            'Signal 5', 'Signal 6', 'Signal 7', 'Signal 8',
        ]);
    });

    it('invites the user to connect a source when no signals exist', async () => {
        seed();
        renderWithProviders(<OverviewPage />);

        // The feed's empty state. It is no longer named after signals because the feed is no
        // longer only signals; 'No signals collected yet' is now the stat card's hint, and the
        // two strings deliberately no longer match.
        expect(
            await screen.findByRole('heading', {
                name: 'Nothing has happened here yet',
                level: 3,
            }),
        ).toBeInTheDocument();
        // Scoped: 'Connect a source' is also a standing quick action, so an unscoped query
        // finds two and cannot tell whether the empty state offered anything at all.
        expect(
            within(panel('Recent activity')).getByRole('button', { name: /Connect a source/ }),
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

        await screen.findByRole('heading', { name: 'Active missions', level: 2 });
        const missions = within(panel('Active missions'));
        expect(missions.getByText('Running work')).toBeInTheDocument();
        expect(missions.queryByText('Proposed work')).not.toBeInTheDocument();
        expect(missions.queryByText('Verified work')).not.toBeInTheDocument();
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

        // The activity feed's "View all" opens evidence, not signals: the feed carries
        // signals, missions, evidence and editions, so there is no single collection to send
        // the reader to and evidence is the one that holds the provenance.
        await user.click(
            within(panel('Recent activity')).getByRole('button', { name: 'View the ledger' }),
        );
        expect(navigateMock).toHaveBeenCalledWith('/app/evidence');
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
    });
});
