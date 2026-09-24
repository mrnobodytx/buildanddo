// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/EvidencePage.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-WORKSPACE-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/pages/workspace/EvidencePage.jsx,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/EvidencePage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      Hold the page to the promise its own header makes - the copy says
//              the reasoning can be replayed, so the route that replays it has to
//              be reachable from here and not only from the sidebar.
// ───────────────────────────────────────────────────────────────

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import EvidencePage from '@/pages/workspace/EvidencePage';
import { renderWithProviders, screen } from '@/test/utils';

// Links are matched by destination rather than by label: a test that matched the
// wording would go green on a link whose href had quietly rotted, which is the
// class of defect this file exists to catch.
const linksTo = (href) =>
    screen.queryAllByRole('link').filter((link) => link.getAttribute('href') === href);

describe('EvidencePage', () => {
    beforeEach(() => {
        pb.__reset();
        pb.__setRecords('evidence', []);
    });

    it('renders the page header', async () => {
        renderWithProviders(<EvidencePage />);

        expect(
            await screen.findByRole('heading', { name: 'Evidence & replay', level: 1 }),
        ).toBeInTheDocument();
    });

    it('links to execution replay, which its own header copy promises', async () => {
        renderWithProviders(<EvidencePage />);
        await screen.findByRole('heading', { name: 'Evidence & replay', level: 1 });

        // The promise under test. If this sentence ever leaves the page, the link
        // below stops being mandatory and this test should be revisited, not muted.
        expect(screen.getByText(/replay the reasoning/)).toBeInTheDocument();

        const replayLinks = linksTo('/app/replay');
        expect(replayLinks).toHaveLength(1);
        expect(replayLinks[0]).toBeVisible();
        expect(replayLinks[0].textContent).toMatch(/replay/i);
    });
});
