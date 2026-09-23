// ─── CGRF Header ───────────────────────────────────────────────
// File:        apps/web/src/components/editorial/__tests__/ChangelogDesk.test.jsx
// Stage:       08_TEST
// SRS:         SRS-BUILDANDDO-CHANGELOG-001
// CAPS:        pending
// CK:          pending
// Dispatch:    VCC-BUILDANDDO-CHANGELOG-001
// Seat:        C-ONE
// Owner:       Citadel Nexus Inc.
// Created:     2026-09-23
// Depends:     apps/web/src/components/editorial/ChangelogDesk.jsx
// EnumType:    Test
// EnumEdges:   VALIDATES apps/web/src/components/editorial/ChangelogDesk.jsx
// DAG Node:    none
// Intent:      Verify the "What shipped" desk shows the feed's entries, offers the RSS feed, and never shows a
//              missing or broken feed as a quiet week.
// ───────────────────────────────────────────────────────────────

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChangelogDesk, { FEED_PATH, RSS_PATH, readChangelog } from '@/components/editorial/ChangelogDesk';

const entry = (overrides) => ({
    id: 'a'.repeat(40), short: 'aaaaaaa', published: '2026-09-23T10:00:00+00:00', date: '2026-09-23', section: 'Added',
    scope: 'web', title: 'web: one source for community links', srs: ['SRS-BUILDANDDO-COMMUNITY-WEB-001'],
    url: `https://github.com/mrnobodytx/buildanddo/commit/${'a'.repeat(40)}`, ...overrides,
});
const feedDocument = (items) => ({ schema: 'buildanddo.changelog-feed/v1', ref: 'e8a8162', items });
const serve = (response) => { global.fetch = vi.fn(() => Promise.resolve(response)); };
const json = (body) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

afterEach(() => { vi.restoreAllMocks(); delete global.fetch; });

describe('what shipped', () => {
    it('lists the newest entries with their kind, date, SRS code and a link to each change', async () => {
        serve(json(feedDocument([
            entry({ id: '1'.repeat(40), section: 'Fixed', title: 'broadcast: name seats without a login', srs: [] }),
            entry({ id: '2'.repeat(40) }),
        ])));
        render(<ChangelogDesk />);
        const list = await screen.findByRole('list', { name: 'Latest changes' });
        const rows = within(list).getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(within(rows[0]).getByText('Fixed')).toBeVisible();
        expect(within(rows[0]).getByText('broadcast: name seats without a login')).toBeVisible();
        expect(within(rows[1]).getByText('SRS-BUILDANDDO-COMMUNITY-WEB-001')).toBeVisible();
        expect(within(rows[1]).getByRole('link', { name: 'View the change' })).toHaveAttribute('href', entry({}).url);
        expect(screen.getByText(/build e8a8162/)).toBeVisible();
        expect(global.fetch).toHaveBeenCalledWith(FEED_PATH, { cache: 'no-store' });
    });

    it('offers the RSS feed', async () => {
        serve(json(feedDocument([entry({})])));
        render(<ChangelogDesk />);
        await screen.findByRole('list', { name: 'Latest changes' });
        expect(screen.getByRole('link', { name: /Subscribe \(RSS\)/ })).toHaveAttribute('href', RSS_PATH);
    });

    it('shows at most the limit, newest first as the feed orders them', async () => {
        serve(json(feedDocument(Array.from({ length: 9 }, (_, i) => entry({ id: String(i).repeat(40), title: `change ${i}` })))));
        render(<ChangelogDesk limit={3} />);
        const rows = within(await screen.findByRole('list', { name: 'Latest changes' })).getAllByRole('listitem');
        expect(rows.map((row) => row.querySelector('p').textContent)).toEqual(['change 0', 'change 1', 'change 2']);
    });

    it('says the feed is missing when the build has none, and never shows that as a quiet week', async () => {
        serve({ ok: false, status: 404, json: () => Promise.reject(new Error('not json')) });
        render(<ChangelogDesk />);
        const notice = await screen.findByText(/The change feed is not part of this build/);
        expect(notice).toHaveAttribute('role', 'status');
        expect(screen.queryByText(/No feature, fix or content change/)).toBeNull();
    });

    it('treats a document that is not a changelog feed as missing', async () => {
        serve(json({ items: [entry({})] }));
        render(<ChangelogDesk />);
        expect(await screen.findByText(/The change feed is not part of this build/)).toHaveAttribute('role', 'status');
    });

    it('says so when the build carries no reader-facing change', async () => {
        serve(json(feedDocument([])));
        render(<ChangelogDesk />);
        expect(await screen.findByText("No feature, fix or content change is in this build's history yet.")).toHaveAttribute('role', 'status');
    });

    it('drops an entry whose link is not https', () => {
        expect(readChangelog(feedDocument([entry({ url: 'javascript:alert(1)' }), entry({})]))).toHaveLength(1);
    });
});
