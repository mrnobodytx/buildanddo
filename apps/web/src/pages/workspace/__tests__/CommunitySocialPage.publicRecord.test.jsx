// CGRF: SRS=SRS-BUILDANDDO-PUBLIC-RECORD-001 | CAPS=B | Seat=C-ONE
// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/pages/workspace/__tests__/CommunitySocialPage.publicRecord.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-PUBLIC-RECORD-001
// CAPS:        pending
// CK:          pending
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-11
// Depends:     apps/web/src/pages/workspace/CommunitySocialPage.jsx,
//              apps/web/src/lib/integrationsStatus.js,
//              apps/web/src/test/utils.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/pages/workspace/CommunitySocialPage.jsx;
//              CONSUMES apps/web/src/test/utils.jsx
// Intent:      The Public record tab must show the estate's real counts,
//              link only to published wiki pages, frame Reddit as a human
//              queue, hide HELD texts, and say UNMEASURED when the file is
//              missing - never a placeholder number.
// ───────────────────────────────────────────────────────────────

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/pocketbaseClient', async () => {
    const { createMockPocketBase } = await import('@/test/pocketbaseMock');
    const client = createMockPocketBase();
    return { default: client, pocketbaseClient: client };
});

import pb from '@/lib/pocketbaseClient';
import CommunitySocialPage from '@/pages/workspace/CommunitySocialPage';
import { renderWithProviders, screen, setupUser, within } from '@/test/utils';

const fixture = () => ({
    schema: 'buildanddo.integrations-status/v1',
    generated_at: new Date().toISOString(),
    state: 'MEASURED',
    sections: {
        deliveries: { state: 'MEASURED', reason: null },
        outbox: { state: 'MEASURED', reason: null },
        tutorials: { state: 'MEASURED', reason: null },
        validity: { state: 'MEASURED', reason: null },
    },
    channels: {
        wiki: {
            state: 'MEASURED', published: 10, queued: 8, held: 16,
            last_published_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            latest: [{ change_id: 'BC-171BC5296DDA', url: 'https://wiki.example.test/roadmap/changes/2026-09-11-BC-171BC5296DDA', published_at: new Date().toISOString() }],
            recent: [],
            validity: { id: 'wiki', state: 'PASS', observed_at: new Date().toISOString(), latency_ms: 380, reason: null },
        },
        forum: { state: 'UNMEASURED', reason: 'deliveries=FILE_ABSENT;outbox=DIR_ABSENT', published: null, queued: null, held: null, recent: [] },
        discord: {
            state: 'MEASURED', published: 15, queued: 6, held: 13, last_published_at: null, recent: [],
            validity: { id: 'discord', state: 'PASS', observed_at: null, latency_ms: 517, reason: null },
        },
        reddit: {
            state: 'MEASURED', published: 0, queued: 21, held: 13, last_published_at: null,
            recent: [
                { change_id: 'BC-HELD00000001', state: 'HELD', created_at: new Date().toISOString(), title: null },
                { change_id: 'BC-37F504BD8A3A', state: 'QUEUED', created_at: new Date().toISOString(), title: 'Learning incident: Why LOGIN_OCN_ROUTE fails on staging' },
            ],
            validity: { id: 'reddit', state: 'UNMEASURED', observed_at: null, latency_ms: null, reason: 'SECRET_NAMES_NOT_RESOLVED' },
        },
    },
    tutorials: [],
    validity: [],
});

// The contributor hub also fetches (GitHub, tokenless); route by URL so the
// tab under test gets the projection and everything else degrades to a link.
const mockFetch = (statusResponse) => {
    globalThis.fetch = vi.fn((url) => {
        if (String(url).includes('integrations-status.json')) return Promise.resolve(statusResponse);
        return Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve([]) });
    });
};

const openPublicRecord = async () => {
    const user = setupUser();
    await user.click(await screen.findByRole('tab', { name: 'Public record' }));
    return user;
};

describe('CommunitySocialPage - Public record tab', () => {
    beforeEach(() => {
        pb.__reset();
        pb.__setRecords('contributors', []);
    });
    afterEach(() => {
        delete globalThis.fetch;
    });

    it('renders per-channel counts, validity and the wiki links from the projection', async () => {
        mockFetch({ ok: true, json: () => Promise.resolve(fixture()) });
        renderWithProviders(<CommunitySocialPage />);
        await openPublicRecord();

        expect(await screen.findByRole('heading', { name: 'What the community can read and audit', level: 2 })).toBeInTheDocument();

        const wiki = screen.getByRole('heading', { name: 'Wiki', level: 3 }).closest('[aria-labelledby]');
        expect(within(wiki).getByText('Published').nextSibling).toHaveTextContent('10');
        expect(within(wiki).getByText('Queued').nextSibling).toHaveTextContent('8');
        expect(within(wiki).getByText('Held').nextSibling).toHaveTextContent('16');
        expect(within(wiki).getByText('Last published').nextSibling).toHaveTextContent('3h ago');
        expect(within(wiki).getByText('PASS')).toBeInTheDocument();

        const link = within(wiki).getByRole('link', { name: /BC-171BC5296DDA/ });
        expect(link).toHaveAttribute('href', 'https://wiki.example.test/roadmap/changes/2026-09-11-BC-171BC5296DDA');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('frames Reddit as a human queue and never shows HELD entries', async () => {
        mockFetch({ ok: true, json: () => Promise.resolve(fixture()) });
        renderWithProviders(<CommunitySocialPage />);
        await openPublicRecord();

        const reddit = (await screen.findByRole('heading', { name: 'Reddit', level: 3 })).closest('[aria-labelledby]');
        expect(within(reddit).getByText('Queued for a human to post')).toBeInTheDocument();
        const queue = within(reddit).getByRole('list', { name: 'Reddit posts queued for a human' });
        expect(within(queue).getAllByRole('listitem')).toHaveLength(1);
        expect(within(queue).getByText('Learning incident: Why LOGIN_OCN_ROUTE fails on staging')).toBeInTheDocument();
        expect(within(reddit).queryByText(/BC-HELD00000001/)).not.toBeInTheDocument();
        expect(within(reddit).getByText('UNMEASURED')).toBeInTheDocument();
        expect(within(reddit).getByText('Published').nextSibling).toHaveTextContent('0');
    });

    it('marks a channel the projection did not measure as UNMEASURED', async () => {
        mockFetch({ ok: true, json: () => Promise.resolve(fixture()) });
        renderWithProviders(<CommunitySocialPage />);
        await openPublicRecord();

        const forum = (await screen.findByRole('heading', { name: 'Forum', level: 3 })).closest('[aria-labelledby]');
        expect(within(forum).getByText(/UNMEASURED — the estate did not project this channel/)).toBeInTheDocument();
        expect(within(forum).queryByText('Published')).not.toBeInTheDocument();
    });

    it('shows an UNMEASURED empty state when the file is not served', async () => {
        mockFetch({ ok: false, status: 404 });
        renderWithProviders(<CommunitySocialPage />);
        await openPublicRecord();

        expect(await screen.findByRole('heading', { name: 'Public record UNMEASURED', level: 3 })).toBeInTheDocument();
        expect(screen.queryByText('Published')).not.toBeInTheDocument();
    });

    it('shows an UNMEASURED empty state when ship.py wrote the projection_failed marker', async () => {
        mockFetch({ ok: true, json: () => Promise.resolve({ schema: 'buildanddo.integrations-status/v1', state: 'UNMEASURED', error: 'projection_failed', channels: {}, tutorials: [], validity: [] }) });
        renderWithProviders(<CommunitySocialPage />);
        await openPublicRecord();

        expect(await screen.findByRole('heading', { name: 'Public record UNMEASURED', level: 3 })).toBeInTheDocument();
        expect(screen.getByText(/projection_failed/)).toBeInTheDocument();
    });
});
